// UI items for the host's roots, and `useStore` for reading stores in React.

import type { ActionDeclaration, ActionState, ControlScope, PaneUiItem, Store, UiItem } from 'mwps';
import type { ComponentType } from 'react';
import { useCallback, useMemo } from 'react';
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector';
import { controlsOf, type ControlProvider } from './scope.js';
import { subscribeTo } from './store.js';

export type ComponentRoot = 'toolbar' | 'side' | 'modal' | 'overlay' | 'selection' | 'editorReplacement';
export type MenuRoot = 'tabMenu' | 'projectMenu';
export type UiRoot = ComponentRoot | MenuRoot;

// A component for a root, or an action for a menu, which the host draws.
// A tab's menu takes either.
export type UiItemImpl =
  | { readonly root: ComponentRoot | 'tabMenu'; readonly component: ComponentType; readonly title?: string }
  | { readonly root: MenuRoot; readonly action: ActionDeclaration };

const items = new WeakSet<object>();

export function isUiItem(x: unknown): x is UiItemImpl {
  return typeof x === 'object' && x !== null && items.has(x);
}

function item<I extends UiItem | PaneUiItem>(root: ComponentRoot) {
  return (component: ComponentType, options?: { title?: string }): I => {
    if (typeof component !== 'function' && (typeof component !== 'object' || component === null)) {
      throw new Error(`ui.${root}() takes a React component`);
    }
    const title = options?.title;
    if (title !== undefined && (typeof title !== 'string' || title === '')) throw new Error(`ui.${root}(): title is a non-empty string`);
    const made = title === undefined ? { root, component } : { root, component, title };
    items.add(made);
    return made as unknown as I;
  };
}

// React components are functions, or objects (memo, forwardRef) marked
// with `$$typeof`; an action is a plain object with a title.
const isComponent = (x: unknown) => typeof x === 'function' || (typeof x === 'object' && x !== null && '$$typeof' in x);

function menu<I extends UiItem | PaneUiItem>(root: MenuRoot, components: boolean) {
  return (thing: ActionDeclaration | ComponentType): I => {
    let made: UiItemImpl;
    if (components && isComponent(thing)) made = { root: 'tabMenu', component: thing as ComponentType };
    else if (typeof thing === 'object' && thing !== null && typeof (thing as ActionDeclaration).title === 'string') {
      made = { root, action: thing as ActionDeclaration };
    } else {
      throw new Error(`ui.${root}() takes one of the module's exported actions${components ? ' or a React component' : ''}`);
    }
    items.add(made);
    return made as unknown as I;
  };
}

export const ui = {
  toolbar: item<UiItem>('toolbar'),
  side: item<UiItem>('side'),
  modal: item<UiItem>('modal'),
  overlay: item<PaneUiItem>('overlay'),
  selection: item<PaneUiItem>('selection'),
  editorReplacement: item<PaneUiItem>('editorReplacement'),
  tabMenu: menu<PaneUiItem>('tabMenu', true),
  projectMenu: menu<UiItem>('projectMenu', false),
};

const identity = <T,>(x: T) => x;

export function useStore<T, S = T>(
  store: Store<T>,
  selector: (value: T) => S = identity as (value: T) => S,
  equals?: (a: S, b: S) => boolean,
): S {
  const subscribe = useCallback((listener: () => void) => subscribeTo(store, listener), [store]);
  return useSyncExternalStoreWithSelector(subscribe, store.get, store.get, selector, equals);
}

// An action as a module's component reads it: the host's answer from the
// scope's pane, and a counter that moves whenever that answer may change.
export interface ActionSource {
  subscribe(listener: () => void): () => void;
  version(): number;
  get(): { enabled: boolean; active: boolean };
  run(): boolean;
}

// The host's way to an action from each pane or module scope, by where the
// scope's controls go.
export const actionSources = new WeakMap<ControlProvider, (decl: ActionDeclaration) => ActionSource>();

const sameState = (a: { enabled: boolean; active: boolean }, b: { enabled: boolean; active: boolean }) =>
  a.enabled === b.enabled && a.active === b.active;

export function useAction(scope: ControlScope, action: ActionDeclaration): ActionState {
  const controls = controlsOf(scope);
  const make = controls && actionSources.get(controls);
  if (!make) throw new Error('useAction() takes a pane scope, the module scope, or a with() inside either');
  const source = useMemo(() => make(action), [make, action]);
  const state = useSyncExternalStoreWithSelector(source.subscribe, source.version, source.version, source.get, sameState);
  return useMemo(() => ({ ...state, run: source.run }), [state, source]);
}
