// Scopes: lifetimes for module code. A scope ends its children and runs its
// cleanups in reverse order of registration, then aborts its signal.

import type {
  ActionDeclaration,
  ActionImplementation,
  Collection,
  Condition,
  ControlScope,
  Scope,
  Store,
  PaneUiItem,
  UiItem,
  Value,
  ValueKey,
  ValueOptions,
} from 'mwps';
import { Plugin } from 'prosemirror-state';
import { createStore, createValue, hostStore, isCondition, subscribeTo, type Listeners } from './store.js';

// What a scope needs from the module it belongs to.
export interface ModuleRuntime {
  readonly id: string;
  // Runs module code; a throw fails the module and gives undefined.
  guard<R>(fn: () => R): R | undefined;
  // Runs `fn` with effects deferred until the outermost batch ends.
  batch(fn: () => void): void;
  // Runs `fn` when the current batch ends. Only inside a batch.
  defer(fn: () => void): void;
  // Runs a scope's setup: like `guard`, and `settingUp` is true meanwhile.
  setup(fn: () => void): void;
  readonly settingUp: boolean;
  // A value of this module changed: its panes redraw when the batch ends.
  redraw(): void;
  // Refuses a second key with a name the module already declared.
  claimKey(key: ValueKey<unknown>): void;
}

const keys = new WeakSet<object>();

export function valueKey<T>(name: string, options: ValueOptions<T>): ValueKey<T> {
  if (typeof name !== 'string' || !options || !('default' in options)) {
    throw new Error('valueKey(name, { default }) takes a name and options with a default');
  }
  const key = Object.freeze({ name, options });
  keys.add(key);
  return key as unknown as ValueKey<T>;
}

// Persisted values of one module in one place, by name; `load` gives
// undefined when nothing is saved.
export interface ValueStore {
  load(name: string): unknown;
  save(name: string, value: unknown): void;
}

// One scope's instances of a module's values, made on first `getValue`.
// Pane and document scopes share theirs per pane or document, so every
// `each` over one pane reads the same instance.
export class ValueTable {
  private readonly values = new Map<object, Value<unknown>>();
  private ended = false;

  constructor(
    private readonly rt: ModuleRuntime,
    // Whether values here may persist: the module, document and pane scopes.
    private readonly durable: boolean,
    // Where persisted values here are kept between sessions, if anywhere.
    private readonly saved: ValueStore | null = null,
  ) {}

  get<T>(key: ValueKey<T>): Value<T> {
    if (!keys.has(key)) throw new Error(`module ${this.rt.id}: getValue() takes a key made by valueKey()`);
    const { name, options } = key as unknown as { name: string; options: ValueOptions<T> };
    let value = this.values.get(key);
    if (!value) {
      this.rt.claimKey(key as ValueKey<unknown>);
      if (options.persist && !this.durable) {
        throw new Error(`module ${this.rt.id}: value "${name}" can't persist on a with() or each() child scope`);
      }
      const saved = options.persist ? this.saved : null;
      const stored = saved?.load(name);
      const created = createValue(
        stored === undefined ? options.default : (stored as T),
        () => !this.ended,
        () => {
          saved?.save(name, created.get());
          this.rt.redraw();
        },
        (fn) => this.rt.batch(fn),
      );
      value = created as Value<unknown>;
      this.values.set(key, value);
    }
    return value as Value<T>;
  }

  end(): void {
    this.ended = true;
  }
}

// Provides a control (an action or a UI item) for the pane or module a
// scope belongs to; returns the removal.
export type ControlProvider = (thing: ActionDeclaration | UiItem | PaneUiItem, implementation?: ActionImplementation) => () => void;

export class ScopeImpl implements Scope {
  // Each entry is a child scope's end or an effect's cleanup.
  private readonly disposers: (() => void)[] = [];
  private table: ValueTable | null = null;
  private readonly controller = new AbortController();
  private ended = false;

  constructor(
    protected readonly rt: ModuleRuntime,
    // Whether values here may persist: the module, document and pane scopes.
    private readonly durable: boolean,
    // Where this scope's controls go: its pane's or module's, inherited by
    // `with` children; `null` on document scopes and their children.
    protected readonly controlProvider: ControlProvider | null = null,
  ) {}

  get controls(): ControlProvider | null {
    return this.controlProvider;
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get live(): boolean {
    return !this.ended;
  }

  effect(fn: () => (() => void) | void): void {
    this.assertLive('effect');
    // The slot is taken now, so cleanup order follows registration order.
    const slot = this.disposers.push(() => {}) - 1;
    this.rt.batch(() =>
      this.rt.defer(() => {
        if (this.ended) return;
        const cleanup = this.rt.guard(fn);
        if (typeof cleanup === 'function') this.disposers[slot] = () => this.rt.guard(cleanup);
      }),
    );
  }

  // Children are `ControlScope`s; whether they may provide controls is
  // checked when they do (a document scope's children may not).
  with<T>(condition: Condition<T>, setup: (scope: ControlScope, value: Exclude<T, null | undefined | false>) => void): void {
    this.assertLive('with');
    if (!isCondition(condition)) {
      throw new Error(
        `module ${this.rt.id}: with() takes a condition (a value, p.isLastFocused or nonEmpty(…)), not a hand-built store`,
      );
    }
    let child: ScopeImpl | null = null;
    let current: unknown = NOT_YET;
    const update = (): void => {
      const next = condition.get();
      if (Object.is(next, current)) return;
      current = next;
      child?.end();
      child = null;
      if (next === null || next === undefined || next === false) return;
      const scope = this.withChild();
      child = scope;
      this.rt.setup(() => setup(scope, next as Exclude<T, null | undefined | false>));
    };
    const unsubscribe = subscribeTo(condition, () => {
      if (!this.ended) this.rt.batch(update);
    });
    this.disposers.push(() => {
      unsubscribe();
      child?.end();
    });
    this.rt.batch(update);
  }

  // The scope a `with` here makes; a pane's adds `layout`.
  protected withChild(): ScopeImpl {
    return new ScopeImpl(this.rt, false, this.controlProvider);
  }

  each<S extends Scope, H>(collection: Collection<S, H>, setup: (scope: S, handle: H) => void): void {
    this.assertLive('each');
    const impl = collection as unknown as CollectionImpl<unknown, S & ScopeImpl>;
    const children = new Map<unknown, S & ScopeImpl>();
    const update = (): void => {
      const members = impl.members();
      const keep = new Set(members);
      for (const [member, child] of [...children].reverse()) {
        if (!keep.has(member)) {
          children.delete(member);
          child.end();
        }
      }
      for (const member of members) {
        if (children.has(member)) continue;
        const scope = impl.makeScope(this.rt, member);
        children.set(member, scope);
        const handle = impl.handleOf(member) as H;
        this.rt.setup(() => setup(scope, handle));
      }
    };
    const unsubscribe = impl.listeners.subscribe(() => {
      if (!this.ended) this.rt.batch(update);
    });
    this.disposers.push(() => {
      unsubscribe();
      for (const child of [...children.values()].reverse()) child.end();
    });
    this.rt.batch(update);
  }

  getValue<T>(key: ValueKey<T>): Value<T> {
    this.assertLive('getValue');
    return this.values().get(key);
  }

  // Where this scope's values live; its own, unless shared.
  protected values(): ValueTable {
    if (!this.table) {
      const table = (this.table = new ValueTable(this.rt, this.durable, this.savedValues()));
      this.disposers.push(() => table.end());
    }
    return this.table;
  }

  // Where persisted values of this scope's own table are kept.
  protected savedValues(): ValueStore | null {
    return null;
  }

  // Controls (actions, UI). Placement scopes override this to take plugins.
  provide(thing: Plugin | ActionDeclaration | UiItem | PaneUiItem, implementation?: ActionImplementation): void {
    this.assertLive('provide');
    if (thing instanceof Plugin) {
      throw new Error(
        `module ${this.rt.id}: plugins can be provided only on pane and document scopes (ctx.each(ctx.panes, (p) => p.provide(plugin))), not on the module scope or in with()`,
      );
    }
    if (!this.controlProvider) {
      throw new Error(`module ${this.rt.id}: actions and UI can't be provided on a document scope; provide them on the pane`);
    }
    this.onEnd(this.controlProvider(thing, implementation));
  }

  // Runs when the scope ends, in reverse order with its cleanups.
  protected onEnd(fn: () => void): void {
    this.assertLive('provide');
    this.disposers.push(fn);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    for (let i = this.disposers.length - 1; i >= 0; i--) this.disposers[i]!();
    this.disposers.length = 0;
    this.controller.abort();
  }

  protected assertLive(op: string): void {
    if (this.ended) throw new Error(`module ${this.rt.id}: ${op}() on a scope that has ended`);
  }
}

// Where a scope's controls go, for `useAction`; `with` children share their
// parent's.
export function controlsOf(scope: unknown): ControlProvider | null {
  return scope instanceof ScopeImpl ? scope.controls : null;
}

const NOT_YET = Symbol('not yet');

// A host-maintained, ordered set of members. Members are compared by identity.
export class CollectionImpl<M, S extends ScopeImpl> {
  private current: readonly M[] = [];
  private readonly sizeStore = createStore(0);

  constructor(
    readonly listeners: Listeners,
    readonly makeScope: (rt: ModuleRuntime, member: M) => S,
  ) {}

  readonly size: Store<number> = hostStore({ get: this.sizeStore.get }, this.sizeStore.subscribe);

  members(): readonly M[] {
    return this.current;
  }

  // What `each` hands over beside a member's scope: nothing, except for a
  // pane's children.
  handleOf(_member: M): unknown {
    return undefined;
  }

  // Notifies only when the members changed.
  setMembers(next: readonly M[]): void {
    if (next.length === this.current.length && next.every((m, i) => m === this.current[i])) return;
    this.current = next;
    this.listeners.notify();
    this.sizeStore.set(next.length);
  }
}
