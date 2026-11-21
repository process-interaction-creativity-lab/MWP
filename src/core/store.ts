// Hand-written stores: a Set of listeners plus the current snapshot.
// Module code gets only `get`; the host keeps each store's subscription
// to itself (`subscribeTo`), for `with`, `useStore` and its own app.

import type { Collection, Condition, Scope, Store, Value } from 'mwps';

const conditions = new WeakSet<object>();
type Subscribe = (listener: () => void) => () => void;
// A store the host and its app listen to.
export interface Readable<T> {
  get(): T;
  subscribe: Subscribe;
}
const subscriptions = new WeakMap<object, Subscribe>();

// A store for module code, listened to only through `subscribeTo`.
export function hostStore<T, S extends object = Store<T>>(store: S & { get(): T }, subscribe: Subscribe): S {
  subscriptions.set(store, subscribe);
  return store;
}

export function subscribeTo(store: Store<unknown>, listener: () => void): () => void {
  const subscribe = subscriptions.get(store);
  if (!subscribe) throw new Error('expected a store the host made (a value, p.state, d.state, a host list)');
  return subscribe(listener);
}

export function isCondition(x: unknown): x is Condition<unknown> {
  return typeof x === 'object' && x !== null && conditions.has(x);
}

export class Listeners {
  private readonly set = new Set<() => void>();
  subscribe = (listener: () => void): (() => void) => {
    this.set.add(listener);
    return () => this.set.delete(listener);
  };
  notify(): void {
    for (const l of [...this.set]) l();
  }
}

// The host's own store. `set`'s `beforeNotify` runs once `get` returns the
// new value, before any listener hears of it.
export function createStore<T>(initial: T): { get(): T; subscribe: Subscribe; set(next: T, beforeNotify?: () => void): void } {
  let current = initial;
  const listeners = new Listeners();
  return {
    get: () => current,
    subscribe: listeners.subscribe,
    set(next, beforeNotify) {
      if (Object.is(next, current)) return;
      current = next;
      beforeNotify?.();
      listeners.notify();
    },
  };
}

// `live()` turns sets into no-ops once the value's scope has ended;
// `changed()` runs after each set that changes the value; `batch` wraps
// the set and its listeners.
export function createValue<T>(
  initial: T,
  live: () => boolean,
  changed: () => void = () => {},
  batch: (fn: () => void) => void = (fn) => fn(),
): Value<T> {
  const store = createStore(initial);
  const value = {
    get: store.get,
    set(next: T | ((prev: T) => T)) {
      if (!live()) return;
      batch(() => {
        const before = store.get();
        store.set(typeof next === 'function' ? (next as (prev: T) => T)(before) : next);
        if (!Object.is(before, store.get())) changed();
      });
    },
  } as Value<T>;
  conditions.add(value);
  return hostStore<T, Value<T>>(value, store.subscribe);
}

// A condition read from host state, for `with`.
export function createCondition<T>(get: () => T, subscribe: Subscribe): Condition<T> {
  const c = { get } as Condition<T>;
  conditions.add(c);
  return hostStore<T, Condition<T>>(c, subscribe);
}

const presence = new WeakMap<object, Condition<true | null>>();

export function nonEmpty(collection: Collection<Scope, unknown>): Condition<true | null> {
  let condition = presence.get(collection);
  if (!condition) {
    const { size } = collection;
    condition = createCondition(() => (size.get() > 0 ? true : null), (l) => subscribeTo(size, l));
    presence.set(collection, condition);
  }
  return condition;
}
