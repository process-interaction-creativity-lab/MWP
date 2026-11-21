// The host's in-place wrap of a module's plugin. The plugin keeps its
// identity and key; its hooks are replaced by guarded versions:
//
// - a hook that throws fails the module and gives a harmless result (a
//   handler declines, `decorations` gives none, a follow-up nothing, a filter
//   passes, a plugin state keeps its previous value);
// - once the module is off, its hooks give those results without running;
// - `appendTransaction` and `filterTransaction` see only the pane's local
//   edits, never received or host transactions;
// - follow-ups to one local edit are capped, which stops a runaway loop.

import { DOMSerializer, type Node } from 'prosemirror-model';
import { history, isHistoryTransaction } from 'prosemirror-history';
import { Plugin as PluginClass, type EditorState, type Plugin, type PluginSpec, type StateField, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

// On transactions a pane received from its document's other clients.
export const RECEIVED = 'mwps-received';
// On the host's own transactions (value redraws).
export const HOST = 'mwps-host';
// On a module's edits in the document state: the module's id.
export const AUTHOR = 'mwps-author';
// On a received transaction: the undo or redo its steps came from.
export const KIND = 'mwps-kind';

export type HistoryKind = 'undo' | 'redo' | null;

// How deep we are inside pane plugin views' `update`, where edits fail.
let paneViewUpdates = 0;

export function assertNotInPaneView(what: string): void {
  if (paneViewUpdates > 0) {
    throw new Error(`${what} from a pane plugin view's update; edits that follow a change belong to a document plugin`);
  }
}

// Follow-up transactions one local edit may cause, across all modules.
export const FOLLOW_UP_CAP = 100;

export function rootOf(tr: Transaction): Transaction {
  return (tr.getMeta('appendedTransaction') as Transaction | undefined) ?? tr;
}

export function isLocal(tr: Transaction): boolean {
  const root = rootOf(tr);
  return !root.getMeta(RECEIVED) && !root.getMeta(HOST);
}

// A module's id for its edits in the document state (and their follow-ups); otherwise
// the writer's.
export function authorOf(tr: Transaction): string {
  return (rootOf(tr).getMeta(AUTHOR) as string | undefined) ?? 'user';
}

// Where an edit was made: in this client, or received from another.
export function originOf(tr: Transaction): 'local' | 'received' {
  return isLocal(tr) ? 'local' : 'received';
}

// prosemirror-history's own key, which it doesn't export.
const historyKey = history().spec.key!;

// Whether `tr` is an undo or a redo (not a follow-up to one). A received
// edit is its root's, follow-ups included.
export function historyKind(tr: Transaction): HistoryKind {
  const root = rootOf(tr);
  if (root.getMeta(RECEIVED)) return (root.getMeta(KIND) as HistoryKind | undefined) ?? null;
  if (!isHistoryTransaction(tr)) return null;
  return (tr.getMeta(historyKey) as { redo: boolean }).redo ? 'redo' : 'undo';
}

export interface WrapContext {
  moduleId: string;
  active(): boolean;
  fail(error: unknown): void;
}

type AnyFn = (...args: never[]) => unknown;

interface Original {
  spec: PluginSpec<unknown>;
  props: Record<string, unknown>;
}

const originals = new WeakMap<Plugin, Original>();
const followUps = new WeakMap<Transaction, number>();

// Wrapping again (a plugin provided after a restart) starts from the
// module's own hooks, never from an earlier wrap.
export function wrapPlugin(plugin: Plugin, cx: WrapContext): Plugin {
  let original = originals.get(plugin);
  if (!original) {
    original = { spec: plugin.spec, props: plugin.props as Record<string, unknown> };
    originals.set(plugin, original);
  }
  const { spec, props } = original;
  const guard: Guard = (fn, fallback, always = false) => {
    if (!fn) return undefined;
    return ((...args: Parameters<typeof fn>) => {
      if (!always && !cx.active()) return fallback(...args);
      try {
        return fn(...args);
      } catch (error) {
        cx.fail(error);
        return fallback(...args);
      }
    }) as typeof fn;
  };

  const wrapped: PluginSpec<unknown> = { ...spec };
  if (spec.state) wrapped.state = wrapField(spec.state, guard);
  if (spec.filterTransaction) {
    const filter = guard(spec.filterTransaction.bind(plugin), () => true)!;
    wrapped.filterTransaction = (tr, state) => !isLocal(tr) || filter(tr, state) !== false;
  }
  if (spec.appendTransaction) {
    const append = guard(spec.appendTransaction.bind(plugin), () => null)!;
    wrapped.appendTransaction = (trs, oldState, newState) => {
      if (!isLocal(trs[0]!)) return null;
      const tr = append(trs, oldState, newState);
      if (!tr) return tr;
      const root = rootOf(trs[0]!);
      const count = (followUps.get(root) ?? 0) + 1;
      followUps.set(root, count);
      if (count > FOLLOW_UP_CAP) {
        cx.fail(new Error(`follow-ups to one edit passed ${FOLLOW_UP_CAP}; stopped as a runaway loop`));
        return null;
      }
      return tr;
    };
  }
  if (spec.view) {
    const view = spec.view.bind(plugin);
    const pane = !documentPlugins.has(plugin);
    wrapped.view = (v) => {
      const made = wrapMethods(guard(view, () => ({}))!(v) as object, guard) as ReturnType<typeof view>;
      // A pane view's `update` draws; edits belong to a document plugin.
      const update = made.update;
      if (pane && update) {
        made.update = (...args) => {
          paneViewUpdates++;
          try {
            update(...args);
          } finally {
            paneViewUpdates--;
          }
        };
      }
      return made;
    };
  }

  const wrappedProps: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props)) {
    if (name === 'nodeViews' || name === 'markViews') {
      wrappedProps[name] = wrapViews(value as Record<string, AnyFn>, name === 'markViews', guard);
    } else if (typeof value === 'function') {
      // The paste and copy transforms pass their input through on failure.
      const fallback = name.startsWith('transform') || name === 'clipboardTextParser' ? (x: unknown) => x : () => undefined;
      wrappedProps[name] = guard(value as AnyFn, fallback);
    } else {
      wrappedProps[name] = value;
    }
  }
  if (props.handleDOMEvents) {
    wrappedProps.handleDOMEvents = Object.fromEntries(
      Object.entries(props.handleDOMEvents as Record<string, AnyFn>).map(([k, fn]) => [k, guard(fn, () => false)]),
    );
  }

  const target = plugin as { spec: PluginSpec<unknown>; props: unknown };
  target.spec = wrapped;
  target.props = wrappedProps;
  return plugin;
}

// `always`: run even once the module has stopped (a view's `destroy`, so
// what it set up is let go).
type Guard = <F extends AnyFn>(fn: F | undefined, fallback: (...args: Parameters<F>) => unknown, always?: boolean) => F | undefined;

function wrapField(field: StateField<unknown>, guard: Guard): StateField<unknown> {
  return {
    ...field,
    init: guard(field.init.bind(field), () => undefined)!,
    apply: guard(field.apply.bind(field), (_tr: Transaction, value: unknown) => value)!,
  };
}

// The methods of a plugin view or node view, each guarded.
function wrapMethods(obj: object, guard: Guard): object {
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value === 'function') record[key] = guard((value as AnyFn).bind(obj), () => undefined, key === 'destroy');
  }
  return obj;
}

// A node view that fails to build falls back to its type's own `toDOM`.
function wrapViews(views: Record<string, AnyFn>, marks: boolean, guard: Guard): Record<string, AnyFn> {
  const out: Record<string, AnyFn> = {};
  for (const [name, make] of Object.entries(views)) {
    const fallback = (item: Node, view: EditorView, ...rest: unknown[]) => {
      const toDOM = item.type.spec.toDOM as ((x: unknown, inline?: unknown) => never) | undefined;
      if (!toDOM) return { dom: document.createElement(marks ? 'span' : 'div') };
      return DOMSerializer.renderSpec(view.dom.ownerDocument, marks ? toDOM(item, rest[0]) : toDOM(item));
    };
    const guarded = guard(make, fallback as never)!;
    out[name] = ((...args: never[]) => wrapMethods(guarded(...args) as object, guard)) as AnyFn;
  }
  return out;
}

// Whether any plugin's `editable` prop says no, as ProseMirror's view decides.
export function isEditable(state: EditorState): boolean {
  return !state.plugins.some((p) => {
    const editable = p.props.editable;
    return editable ? editable.call(p, state) === false : false;
  });
}

const documentPlugins = new WeakSet<Plugin>();

// A plugin for a document's one hidden state: plugin state, follow-ups,
// filters and a view with only `state` and `dispatch`. Nothing is drawn.
export function documentPlugin(spec: PluginSpec<unknown>): Plugin {
  if (spec.props) throw new Error('a document plugin has no props: nothing is drawn; give a pane plugin the props');
  const plugin = new PluginClass(spec);
  documentPlugins.add(plugin);
  return plugin;
}

export function isDocumentPlugin(plugin: Plugin): boolean {
  return documentPlugins.has(plugin);
}
