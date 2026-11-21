// The module API: everything a module sees, imported as `mwps`.
//
// A module is a folder `modules/<id>/` whose `index.tsx` exports `setup`.
// Its only imports are `mwps`, React, ProseMirror and its own files; the host
// supplies the one copy of each shared package at load time.

import type { AttributeSpec, MarkSpec, Node, NodeSpec } from 'prosemirror-model';
import type { Command, EditorState, Plugin, PluginSpec, Transaction } from 'prosemirror-state';
import type { ComponentType, ReactElement } from 'react';

/** A readable the host keeps: a value, a condition, a pane's or a
 *  document's state, a host list. Read it with `get()` anywhere, or follow
 *  it in React with `useStore`. Module code can't listen to it: code that
 *  should act on a change is a document plugin's view `update`. */
export interface Store<T> {
  get(): T;
}

declare const conditionBrand: unique symbol;

/** A store `with` accepts. Only the host makes these: values, `nonEmpty`
 *  and `p.isLastFocused`. */
export interface Condition<T> extends Store<T> {
  readonly [conditionBrand]: true;
}

/** A value on a scope. It ends with its scope; setting it after that does
 *  nothing. Setting it redraws the panes of the module that owns it. */
export interface Value<T> extends Condition<T> {
  set(next: T | ((prev: T) => T)): void;
}

export interface ValueOptions<T> {
  default: T;
  /** Keep the value across sessions, as JSON: a module value for the
   *  writer everywhere, a document value with the document's project, a
   *  pane value with the pane (a root, or a child hosted with `persist`;
   *  on any other pane it lasts as long as the pane). Kept while the module
   *  fails, is off or restarts; forgotten when the writer removes what it
   *  belongs to (unplaces the module from the pane, closes the pane,
   *  deletes the document). Allowed on the module, document and pane
   *  scopes only; an error at `getValue` on `with` and `each` children. */
  persist?: boolean;
}

declare const valueKeyBrand: unique symbol;
/** A value's declaration, made once at module top level. */
export interface ValueKey<T> {
  readonly [valueKeyBrand]: T;
  readonly name: string;
}

/** Declare a value, as ProseMirror's `PluginKey` declares a plugin: once,
 *  at module top level, next to `actions`. Each scope that asks for it has
 *  its own instance (every pane its own orientation), made on the first
 *  `getValue` from whichever code gets there first, and ending with that
 *  scope. Every `each` over one pane (or document) reaches the same
 *  instance. Two keys with one name in a module are an error at the
 *  second's first `getValue`:
 *    const orientation = valueKey<Orientation>('orientation', { default: 'horizontal', persist: true });
 *    ctx.each(ctx.panes, (p) => {
 *      const dir = p.getValue(orientation);
 *      const Bar = () => <span>{useStore(dir)}</span>;
 *    });
 *  A document's values are reached from its panes the same way:
 *  `p.document.getValue(versions)`. */
export function valueKey<T>(name: string, options: ValueOptions<T>): ValueKey<T>;

/** A host-maintained set of members; `each` makes a scope per member. A
 *  pane's children also hand `each` the member's handle (`H`), as `with`
 *  hands over its value. */
export interface Collection<S extends Scope, H = undefined> {
  readonly size: Store<number>;
  /** @internal Only for type inference. */
  readonly __member?: S;
  /** @internal Only for type inference. */
  readonly __handle?: H;
}

/** A condition that is present while the collection has members. */
export function nonEmpty(collection: Collection<Scope, unknown>): Condition<true | null>;

/** Present means not `null`, `undefined` or `false`. */
type Present<T> = Exclude<T, null | undefined | false>;

export interface Scope {
  /** Start `fn` once the scope is set up; its returned cleanup runs when the
   *  scope ends. Cleanups run in reverse order of registration. */
  effect(fn: () => (() => void) | void): void;
  /** Aborted when the scope ends: for async work after an `await`. */
  readonly signal: AbortSignal;
  /** A child scope while `condition` is present, restarted when its value's
   *  identity changes. */
  with<T>(condition: Condition<T>, setup: (scope: Scope, value: Present<T>) => void): void;
  /** One child scope per member, kept while the member is. */
  each<S extends Scope, H>(collection: Collection<S, H>, setup: (scope: S, handle: H) => void): void;
  /** This scope's instance of a value. */
  getValue<T>(key: ValueKey<T>): Value<T>;
}

/** A scope that lives as long as one state does (a pane, or a document's
 *  one hidden state), so it may add ProseMirror plugins to that state. The
 *  module scope can't: it is about no one state, so a plugin for every
 *  pane is `ctx.each(ctx.panes, (p) => p.provide(plugin))`. Nor can a
 *  `with` scope: a plugin that is only sometimes active checks a value
 *  instead (`decorations: (s) => on.get() ? build(s) : null`), and setting
 *  the value redraws the pane. */
export interface PlacementScope extends Scope {
  /** Add a plugin to this scope's state, until it ends. Plugins
   *  are plain ProseMirror, with these host rules:
   *  - a hook that throws turns the module off (handlers decline, decorations
   *    give none, a plugin state keeps its last value);
   *  - `appendTransaction` and `filterTransaction` see only edits made in
   *    the state they belong to (a pane's own edits; the document state's
   *    own `d.edit`s and dispatches), never received ones, so a follow-up
   *    checks the state ("is there an orphan note?"), not the event;
   *  - follow-ups to one edit are capped at 100; a loop past the cap is a
   *    failure;
   *  - a pane plugin's view `update` may touch the DOM, timers and values,
   *    but may not edit: a `dispatch` or `p.run` there fails the module.
   *    Edits that follow a change belong to a document plugin;
   *  - the `view` a pane plugin's hooks and view get stands for the pane,
   *    whose text may be drawn in several editors (the main editor, a
   *    layout's cards, module data cards in a side view). A plugin view is
   *    one per pane, starting and ending with the pane. `view.state` and
   *    `view.dispatch` are the pane's; `view.dom` is the pane's own
   *    element: a real element, for measuring and finding the pane's
   *    scroll box, but not editable, holding a layout's chrome, and not
   *    the side view's cards. Listen through `props.handleDOMEvents` and
   *    find a DOM node's position with `view.posAtDOM` (it throws for a
   *    node in no editor); `view.dom.addEventListener` and
   *    `view.dom.contains` miss the editors outside it (`npm run check`
   *    warns). `coordsAtPos`, `posAtCoords`, `domAtPos` and `nodeDOM`
   *    answer from the editor showing the position; `endOfTextblock` and
   *    `focus` use the caret's; `hasFocus`, `composing`, `editable`,
   *    `root`, `someProp` and `serializeForClipboard` are answered too, and
   *    nothing else;
   *  - a plugin reads document-plugin state
   *    (`key.getState(p.document.state.get())`) in props, decorations, views
   *    and commands, never inside a dispatch (`apply`, filters,
   *    follow-ups): `get()` throws there. State that needs it collects in
   *    `apply` and joins it when drawing.
   *  In a pane, module plugins come after history and undo keys and before
   *  the action keys and the base keymap, newest placed module first, each
   *  in the order it provided them. A plugin goes to a state at most once; one instance
   *  may go to many panes, since its state and views are per pane.
   *
   *  A `documentPlugin` goes on a document scope, to that document's one
   *  hidden state; a plain plugin goes on a pane. Either on the other is an
   *  error: a document plugin in each pane on one document would count
   *  twice.
   *
   *  Off means off: when the module is turned off, fails, or is no longer
   *  placed, every hook of its plugins passes at once and the plugins are
   *  removed. Coming back, they start fresh from `init`. Data that must
   *  survive goes in a value or the document. */
  provide(plugin: Plugin): void;
}

/** What a document plugin's view gets: the document's one hidden state,
 *  and an edit there as the module (like `d.edit`). */
export interface DocumentView {
  readonly state: EditorState;
  dispatch(tr: Transaction): void;
}

/** A plugin spec without `props`: nothing is drawn. Its `view(view)`
 *  gets a `DocumentView`, and its `update(view, prevState)` runs once
 *  every copy of the document has caught up with a change from anywhere.
 *  It may edit; an edit there is an ordinary one, and every reaction hears
 *  it next. More than 100 edits from reactions to one change fail the
 *  module whose edit crosses the cap. Follow-ups and filters see only
 *  edits made in the document state (`d.edit`, `dispatch` here), never
 *  edits received from panes.
 *
 *  `prevState` isn't "one change ago": when another reaction edits, a
 *  later `update` may see two changes at once, and a view is made afresh
 *  whenever the plugin set changes. So learn what happened in `apply`
 *  (where the transactions are), keep it in plugin state, and act on it in
 *  `update` with your own counter, never by diffing `prevState`
 *  (`commitLog` and `reader` from `mwps/changes` do this). `dispatch` after `destroy` does
 *  nothing. */
export interface DocumentPluginSpec<T = unknown> {
  key?: PluginSpec<T>['key'];
  state?: PluginSpec<T>['state'];
  filterTransaction?: PluginSpec<T>['filterTransaction'];
  appendTransaction?: PluginSpec<T>['appendTransaction'];
  view?: (view: DocumentView) => { update?(view: DocumentView, prevState: EditorState): void; destroy?(): void };
}

/** A plugin for the document's one hidden state, for data derived from the
 *  whole document (once per document, not once per pane) and reactions to
 *  its changes. Pane plugins read its state with
 *  `key.getState(p.document.state.get())`; it is current before any pane
 *  draws. Its state starts when the document opens (or the module is
 *  placed on it), so it covers the whole time the document is open: counts
 *  and logs live here, not in a value fed by an observer. */
export function documentPlugin<T>(spec: DocumentPluginSpec<T>): Plugin<T>;

/** A scope with controls (actions and UI): the module scope, a pane, and
 *  a `with` inside either. A `with` child's actions and UI belong to the
 *  pane (or the module), as if provided there, and end with it: an action
 *  greys again (the palette lists an action whether or not anything
 *  implements it), a component goes. */
export interface ControlScope extends Scope {
  /** A child scope while `condition` is present, providing actions and UI
   *  while it lives:
   *    p.with(ctx.ai, (s) => s.provide(actions.suggest, { command: suggest }));
   *  greys "Suggest" whenever AI is off. */
  with<T>(condition: Condition<T>, setup: (scope: ControlScope, value: Present<T>) => void): void;
  /** Implement one of the module's exported actions here, until the scope
   *  ends:
   *  - `{ command }` (pane scope) runs a ProseMirror `Command` against the
   *    pane's state as the writer, on the pane's undo stack, like `p.run`.
   *    Called without `dispatch` it only answers "can you run?", and
   *    `false` greys the action: return `false` when you would do nothing,
   *    so its key passes on. In a pane that isn't editable it is
   *    greyed without asking, and so is it in a pane showing no document
   *    (a new split's panes, until the writer picks one). A command may
   *    act outside the document too (focus a box, open a dialog) behind
   *    `if (dispatch)`. Not on the module scope: there is no state.
   *  - `{ procedure }` takes no state: never greyed, for actions that don't
   *    touch a pane's selection (a toggle that flips a value, a rename
   *    across documents through `ctx.project`'s `edit`).
   *  `active` says whether a toggle shows as on (Bold pressed); a dry run
   *  can't tell, since `toggleMark` runs either way.
   *
   *  Not on a document scope: an action the writer runs is an edit they
   *  asked for, so it belongs on their pane's undo stack. An action that
   *  acts on the whole document from wherever it is run is a pane
   *  procedure calling `p.document.edit(…)`, as the module.
   *
   *  With no last focused pane, pane actions grey out and module ones stay live.
   *  An action implemented on several panes of the focus path (see
   *  `isLastFocused`) runs the one found first walking outward.
   *  One implementation of an action may apply to a pane at a time: a
   *  second is an error. */
  provide(action: ActionDeclaration, implementation: ActionImplementation): void;
  /** Show a component in the toolbar or the modal root until the scope
   *  ends (`ui.toolbar(C)`, `ui.modal(C)`), or in a project module an
   *  action in the project menu; a pane also takes the pane roots
   *  (`PaneUiItem`).
   *  A component that throws turns the module off. The module's `styles`
   *  apply to it. */
  provide(item: UiItem): void;
}

declare const uiItemBrand: unique symbol;
declare const paneUiItemBrand: unique symbol;

/** A component for one of the host's UI roots, made by `ui.…`. */
export interface UiItem {
  readonly [uiItemBrand]: true;
}

/** An item for one of a pane's own roots (overlay, selection bubble,
 *  editor replacement, tab menu), made by `ui.…`. Only a pane scope, or a
 *  `with` inside one, takes it: these roots belong to one pane, so their
 *  components read and edit that pane. */
export interface PaneUiItem {
  readonly [paneUiItemBrand]: true;
}

/** The host's UI roots. Most take a React component with no props: define
 *  it inside the scope's setup, so it reaches the scope's values and pane by
 *  closure, reads them with `useStore`, and edits with `p.run`:
 *    ctx.each(ctx.panes, (p) => {
 *      const Count = () => <span>{useStore(p.state, (s) => s?.doc.textContent.length)}</span>;
 *      p.provide(ui.toolbar(Count));
 *    });
 *  Components are drawn inside an element with the class `mwps-module-ui`,
 *  which gives plain lists and headings sensible defaults; the module's
 *  own CSS overrides them. Clicking a button in the toolbar or selection
 *  bubble leaves focus in the text, so the writer types on; inputs and
 *  selects take focus as usual. */
export const ui: {
  /** The window's one toolbar, for the editor the writer is in. An item
   *  provided on a pane (or a `with` inside one) shows while the pane is
   *  the last focused pane (see `isLastFocused`); on the module scope,
   *  whenever the module runs (placed somewhere). Most items belong on the
   *  pane, where they can read and edit its document. A pane hosting child
   *  panes (a split) isn't the last focused pane while the writer is in
   *  one of them, so a layout's controls go in its tab (`ui.tabMenu`) or
   *  its own component; a pane showing cards, or with no children (a
   *  painting), is, and its toolbar items show. */
  toolbar(component: ComponentType): UiItem;
  /** A view in the window's side tabs, at its right edge beside every
   *  pane: an outline, a feedback list, a chat. It shows when the
   *  toolbar would (see `toolbar`). Each view is a tab, named after the
   *  module, and after `title` when given; a module with several views
   *  gives each its own title, and two that can show at once with the
   *  same title is an error. The writer opens and closes tabs; at most
   *  two are open, stacked top to bottom and sized by the writer, and
   *  opening another closes the one opened longest ago. A tab opens the
   *  first time it appears. Clicking inside a view leaves the pane the
   *  writer was in the last focused one, and a button there leaves focus
   *  in the text, as in the toolbar. The view fills its slot, so a long
   *  list scrolls inside it (`height: 100%; overflow: auto`). */
  side(component: ComponentType, options?: { title?: string }): UiItem;
  /** The window's root for anything that takes over input until the
   *  writer dismisses it: a dialog, a brush layer over every pane. The
   *  host gives a place over everything and nothing else: the module
   *  owns opening, closing and Esc, usually with the UI kit's `Dialog`,
   *  controlled by a value:
   *    const open = ctx.getValue(editing);
   *    ctx.provide(actions.editDictionary, { procedure: () => (open.set(true), true) });
   *    ctx.provide(ui.modal(() => (
   *      <Dialog open={useStore(open)} onOpenChange={open.set}>…</Dialog>
   *    )));
   *  Shown while its scope lives, whichever pane is focused. It takes no
   *  room, so a component that draws nothing while closed leaves the
   *  window as it was; a layer of its own is `position: fixed`. */
  modal(component: ComponentType): UiItem;
  /** One root per pane, floating over its text: a corner panel, a
   *  popover. What belongs to some words (a strip, a number, a tint, a
   *  note beside them) is a decoration instead, with `reactWidget` from
   *  `mwps/react` for a React body. It is unpositioned, so CSS anchor positioning and
   *  `position: absolute` against the pane's page (the frame around its
   *  text, which scrolls) both work. Where a layout shows
   *  the document in pieces (cards), it floats over the piece holding the
   *  caret, like the selection bubble; a data card in a side tab never
   *  holds it, so the panel stays on the pane. */
  overlay(component: ComponentType): PaneUiItem;
  /** One bubble per pane, over a non-empty selection, stacking every
   *  module's components; hidden when all of them render nothing. */
  selection(component: ComponentType): PaneUiItem;
  /** Draw `component` in place of the pane's editor: a split, a canvas of
   *  cards, a painting. At most one per pane, and only in
   *  a module whose `moduleType` is `'editorReplacement'`. While it shows,
   *  the pane keeps its document, its selection and its undo history, and
   *  the other modules placed there run where the writer writes: in the
   *  pane while it shows its blocks as cards (`hostPartPanes`), which are
   *  its editor in pieces; in the child panes it hosts; nowhere if it
   *  shows no text (their scopes for the pane end). Ends with the scope,
   *  and the editor and the other modules return. */
  editorReplacement(component: ComponentType): PaneUiItem;
  /** Put one of the module's exported actions, or a component, in the
   *  menu of the pane's tab, until the scope ends, in the order provided.
   *  The host draws an action (title, key, a check while `active`, greyed
   *  when it can't run) and runs it as from that pane, so the
   *  implementation found first walking outward from it runs; a component
   *  draws what an action can't (a slider, a select), as in the toolbar.
   *  A layout's whole UI for a pane, from Close pane to Stacked:
   *    p.provide(actions.stacked, { procedure: flip, active: () => dir.get() === 'vertical' });
   *    p.provide(ui.tabMenu(actions.stacked));
   *  A host module reaches a child's tab through the child's scope:
   *  `p.each(children, (c) => c.provide(ui.tabMenu(actions.closePane)))`.
   *  The tab is the layout's: only an `'editorReplacement'` module provides
   *  it (an add-on's controls go in the toolbar), and only on a
   *  writer-owned pane, since a module-owned one has no tab (see
   *  `ChildPaneOptions.owner`). */
  tabMenu(item: ActionDeclaration | ComponentType): PaneUiItem;
  /** Put one of the module's exported actions in the project tab's menu,
   *  as `tabMenu` does for a pane, but never a component. Only in a
   *  project module, whose only other UI is `ui.modal`. */
  projectMenu(action: ActionDeclaration): UiItem;
};

/** Read a store in React (a value, `p.state`, `ctx.ai`), redrawing when it
 *  changes. With a selector, only when the selected part changes (by
 *  `equals`, default `Object.is`): `useStore(p.state, (s) => s?.selection.empty)`.
 *  The host tells it of a change only once every copy of the document has
 *  caught up, so it never sees a change half-spread. */
export function useStore<T>(store: Store<T>): T;
export function useStore<T, S>(store: Store<T>, selector: (value: T) => S, equals?: (a: S, b: S) => boolean): S;

/** One of the module's exported actions, for a component of its own: what
 *  the palette shows and runs, from `scope`'s pane (the implementation
 *  found first walking outward, as a tab's menu), or from the last focused
 *  pane on the module scope (as the palette). Redraws when `enabled` or
 *  `active` changes. A button that does what an action does runs the
 *  action, so there is one copy of it:
 *    const bold = useAction(p, actions.bold);
 *    <Toggle pressed={bold.active} disabled={!bold.enabled} onPressedChange={bold.run}>B</Toggle>
 *  A free choice (a font size, a colour) has no action; it runs a command
 *  with `p.run`. */
export function useAction(scope: ControlScope, action: ActionDeclaration): ActionState;

export interface ActionState {
  /** Implemented there and not greyed. */
  readonly enabled: boolean;
  /** A toggle that shows as on. */
  readonly active: boolean;
  /** Runs it as the writer would from the palette; `false` when it didn't. */
  run(): boolean;
}

/** One entry of `export const actions`: what the palette lists, greyed or
 *  not, without running module code. */
export interface ActionDeclaration {
  readonly title: string;
  /** ProseMirror key names (`'Mod-Shift-s'`). A key press asks every
   *  action bound to it whether it can run: if none can, the key passes
   *  on; if one can, it runs; if several can, the writer picks one in the
   *  palette, opened at the caret. Modules' own `handleKeyDown` plugins
   *  see the key first. */
  readonly keys?: string | readonly string[];
}

export type ActionImplementation =
  | { command: Command; active?: (state: EditorState) => boolean }
  | { procedure: () => boolean; active?: () => boolean };

/** One pane the module is placed on. */
export interface PaneScope extends ControlScope, PlacementScope {
  /** As on any control scope; inside a pane, the child may also host child
   *  panes, so an editor replacement can switch itself off. */
  with<T>(condition: Condition<T>, setup: (scope: PaneChildScope, value: Present<T>) => void): void;
  /** A plugin (see `PlacementScope`), an action or a toolbar item (see
   *  `ControlScope`), or an item for one of this pane's roots. */
  provide(plugin: Plugin): void;
  provide(action: ActionDeclaration, implementation: ActionImplementation): void;
  provide(item: UiItem | PaneUiItem): void;
  /** The host's name for the pane. For a child pane, the same as its
   *  `ChildHandle.id`. */
  readonly id: string;
  /** The id of the document the pane shows, or `null`. */
  readonly documentId: string | null;
  /** Opens a side view this scope provided, if its tab is closed, beside
   *  the pane, as the writer's click would; focus doesn't move. Does
   *  nothing when it is open, or for any other item. For an action whose
   *  answer appears in the view:
   *  ```
   *  const answers = ui.side(Answers);
   *  p.provide(answers);
   *  p.provide(actions.ask, { procedure: () => (p.reveal(answers), true) });
   *  ``` */
  reveal(item: UiItem): void;
  /** That document, for editing it as the module (`p.document.edit`), or
   *  `null` on a pane showing no document. Its `edit` returns `false` once this
   *  scope has ended. A pane never outlives its document: showing another
   *  document makes a new pane scope (setup runs again), so what setup got
   *  from `document` stays right for the scope's whole life. Not a scope:
   *  per-document lifetimes (a timer that should run once however many
   *  panes show the document) are `ctx.each(ctx.documents, …)`. */
  readonly document: DocumentRef | null;
  /** The pane's state, updated after every transaction in the pane, caret
   *  moves included (in a replaced pane too, from its cards), so read it in
   *  React through a selector; `undefined` on a pane showing no document.
   *  Read it in React with `useStore`:
   *  `get()` in render is a snapshot that goes stale after the next edit.
   *  The host may replace the state without a transaction (a card whose
   *  block changed in a way it can't patch, a pane resynced after an
   *  error); plugin state then starts again from `init`. Keep what must
   *  survive in a document plugin. */
  readonly state: Store<EditorState | undefined>;
  /** Whether this pane is on the focus path: the last focused pane (the
   *  innermost one the writer last clicked or put the caret in, or that
   *  called `focus()`, while it stays open; opening the palette or clicking
   *  a toolbar doesn't change it), then each pane hosting it, outward.
   *  Actions and keys act on that path; the toolbar on its first pane.
   *  Focus stays where it lands: a host whose child closes keeps it, and
   *  a module wanting it in a child calls the child's `focus()`. For work that should run in one pane at a time, nest
   *  `with`s, which reads "this and that":
   *    p.with(p.isLastFocused, (s) => s.with(on, (s) => s.effect(startTimer)));
   *  In React, `useStore(p.isLastFocused)`. */
  readonly isLastFocused: Condition<boolean>;
  /** Run `command` against the pane's state as the writer: the edit lands on
   *  the pane's undo stack as its own step (never joined to the writer's
   *  typing, nor typing to it; a transaction with `composition` set joins the
   *  edits sharing that id, one with `addToHistory: false` is no step). Use it for edits the writer asked
   *  for: a button, a key, dictation, an LLM reply to their click, even
   *  after an `await` (find the target in the current state, since the
   *  writer may have typed meanwhile). Returns the command's result;
   *  `false` once the scope has ended or the pane shows no document. An
   *  error while a scope is being set up (start an effect instead), inside
   *  another dispatch (a plugin's `apply`, filter or follow-up), or in a
   *  pane plugin view's `update`. A pane that isn't editable (any plugin's `editable` prop returns
   *  `false`) refuses every edit made in it, this one included. Edits from
   *  elsewhere (other panes, `d.edit`) still reach it: read-only is a
   *  property of the pane, not of the document. The command's `view` is
   *  the pane's, as plugins see it. */
  run(command: Command): boolean;
  /** Make this the last focused pane, and put the caret back in its
   *  editor where it was, if it has one: after a control that had to take
   *  focus (a select, a colour picker, a text box) is done, or for an
   *  editor replacement taking focus from code (a painting's shortcut).
   *  Buttons in the toolbar and selection bubble don't need it. Nothing
   *  once the scope has ended. */
  focus(): void;
  /** Make this pane a host of child panes the module makes, and return
   *  them. The host mints each child and holds the list, so the module
   *  keeps no keys:
   *    const children = p.hostChildPanes({ persist: true });
   *    if (children.list.get().length === 0) children.create({ owner: 'writer', document: null });
   *    p.provide(ui.editorReplacement(() => <>{useStore(children.list).map((c) => c.element)}</>));
   *    p.each(children, (c) => c.provide(myKeymap));
   *  A pane hosts children once, with this or `hostPartPanes`, and only in
   *  an `'editorReplacement'` module; the children close when this scope
   *  ends. A module's own children aren't in its
   *  `ctx.panes`. With `persist`, the children are saved with the layout,
   *  ids, documents, modules and values included, and are already in
   *  `list` the next time the pane hosts children with this module (after
   *  a reload, a restart, a failure); the module creates only what is
   *  missing. A child is forgotten when it closes, and all of them when
   *  the writer unplaces the module from the pane; a module-owned one also
   *  when the pane shows another document, since the module chose it for
   *  the old one (writer-owned ones are the writer's, and stay). */
  hostChildPanes(options?: { persist?: boolean }): ChildPanes;
  /** Cards: draw this pane's blocks as small editors of the pane. One
   *  card per block of the writing for which `matches` returns `true`, in
   *  document order. The document decides which exist, so there is no
   *  `create` or `close` (to remove a card, delete its block) and nothing
   *  persists. The host keeps the list as it catches up (before
   *  reactions, before `p.run` returns):
   *    const cards = p.hostPartPanes((node) => node.isBlock);
   *  **A card is not a pane.** It is an input surface of this pane: the
   *  writer is in this pane while in a card. Its edits and selection are
   *  this pane's (one history; Cmd-Z in a card undoes this pane's last
   *  step), the other modules placed here keep running here, in document
   *  positions, with this pane's state and `dispatch` in every hook that
   *  takes a view, and their decorations and node views are drawn in the
   *  cards. A card is `doc(block)`, and what the writer makes in it
   *  stays between its ends: an edit or a selection reaching outside
   *  (Backspace joining it to the block before, Select All as a key
   *  binding) is refused. Enter splits the block; the second half is a
   *  new card. A card goes when its block is deleted. One commit that
   *  deletes a part block and inserts equal content (a drag,
   *  ProseMirror's own block drop, an undo of either) moves the block's
   *  card. Cmd-A in it selects the block's content. */
  hostPartPanes(matches: (node: Node) => boolean): PartPanes;
  /** Cards over module data: one per node of `type` (one of the module's
   *  `nodes`, in the `module_data` group) in the document's data node,
   *  after the writing, where no editor of the writing shows them. Each card is an
   *  input surface of this pane, as `hostPartPanes`' are: its document is
   *  the node with all its children, and what the writer makes in it
   *  stays inside the node (Cmd-A and the edge keys included). Any module
   *  may ask, and draws the card where it draws React (a side view), or
   *  not at all. When the pane's selection moves into a card and the
   *  module's side view (`ui.side`) is closed, the host opens it. The
   *  node is the module's to make, with an edit
   *  (`tr.insert(dataEnd(state.doc), …)`, `findData` finds it, both from
   *  `mwps/text`); the list is empty until it exists. */
  dataCards(type: string): PartPanes;
}

/** A `with` scope inside a pane: a `ControlScope` that may also host
 *  child panes, so an editor replacement can switch itself on and off
 *  without leaving the pane (its tab still shows it placed):
 *    const on = valueKey('on', { default: false, persist: true });
 *    p.provide(ui.toolbar(Switch));  // flips `p.getValue(on)`
 *    p.with(p.getValue(on), (s) => { const kids = s.hostChildPanes(); s.provide(ui.editorReplacement(View)); });
 *  When the condition goes, the children close and the editor returns. */
export interface PaneChildScope extends ControlScope {
  with<T>(condition: Condition<T>, setup: (scope: PaneChildScope, value: Present<T>) => void): void;
  provide(action: ActionDeclaration, implementation: ActionImplementation): void;
  provide(item: UiItem | PaneUiItem): void;
  hostChildPanes(options?: { persist?: boolean }): ChildPanes;
  hostPartPanes(matches: (node: Node) => boolean): PartPanes;
}

/** A pane's children, in order. Each child is two things:
 *  - its **handle**, in `list`: drawn, closed, kept from `create` until it
 *    closes;
 *  - its **child pane**, the `PaneScope` `each` gives, where the host module
 *    configures it (plugins, actions, UI; its plugins come after the
 *    child's add-ons). Like any pane it shows one document: there is none
 *    while the handle's document is being read, and a new one each time
 *    the handle shows another document.
 *  `each` hands over both, so the module never matches them up:
 *    p.each(children, (c, handle) => c.provide(actions.closePane, { procedure: () => (handle.close(), true) })); */
export interface ChildPanes extends Collection<PaneScope, ChildHandle> {
  readonly list: Store<readonly ChildHandle[]>;
  /** Mint a child, open it, and append it to `list`. Open until `close()`
   *  or the host scope ends, drawn or not: an undrawn child has a state and
   *  running add-ons, but no view. `create` and `close` aren't edits:
   *  allowed from idle and from reactions (a pane plugin view's `update`
   *  included), an error inside a dispatch. */
  create(options?: ChildPaneOptions): ChildHandle;
}

/** A pane's cards, in document order. */
export interface PartPanes {
  readonly list: Store<readonly PartHandle[]>;
}

export interface ChildPaneOptions {
  /** Who the child belongs to.
   *  - `'module'` (default): the module hosting it. It shows `document`
   *    for as long as it lives, runs the host pane's modules (except the
   *    module hosting it) and follows them, and has no tab. Cards are
   *    module-owned.
   *  - `'writer'`: a pane like any other, with its own tab: the writer
   *    switches its document with the document picker and its modules in
   *    its tab, starting from `document` and the host pane's modules.
   *  A deleted document empties a writer-owned child and closes a
   *  module-owned one (it leaves `list`). */
  owner?: 'writer' | 'module';
  /** The document it starts on. Default: the host pane's. `null`: none
   *  until the writer picks one, so only with `owner: 'writer'`. */
  document?: string | null;
}

/** A child pane's handle: what its host module holds of it from `create`
 *  (or a restore) until it closes, across the child panes that come and go
 *  in it. Its `state`, `run` and `focus` follow whichever child pane it
 *  has now. */
export interface PaneHandle {
  /** Minted by the host; kept while the handle lives. Each of its child
   *  panes has it as `PaneScope.id`. Use it as React's `key`. */
  readonly id: string;
  /** The child's state, as its own `p.state`. */
  readonly state: Store<EditorState | undefined>;
  /** Draw it in React. Place it once. */
  readonly element: ReactElement;
  /** Draw it into a DOM node (a node view, a widget); returns the unmount. */
  mount(el: HTMLElement): () => void;
  /** An edit as the writer, on the child's history; `false` once it has
   *  closed or while it shows no document. */
  run(command: Command): boolean;
  focus(): void;
}

/** The handle of a child the module made. */
export interface ChildHandle extends PaneHandle {
  /** As created (see `ChildPaneOptions.owner`): how a module with both
   *  kinds tells its children apart, since persisted ones come back in no
   *  fixed order. */
  readonly owner: 'writer' | 'module';
  /** Close this child: its scopes end and it leaves `list`. */
  close(): void;
}

/** A card's handle: a piece of the pane's document (a block of the
 *  writing, or a module data node's children), drawn as an editor of the
 *  pane. For the card's chrome (a header, a done box, a badge), not for
 *  editing text: the card's `state` is a copy of the piece's parent
 *  holding the piece (`doc(block)`, or the data node), so its positions
 *  are the pane's less where the piece starts: `part` for a block,
 *  `part + 1` for a data node. */
export interface PartHandle {
  /** Minted by the host; kept while the card lives. Use it as React's `key`. */
  readonly id: string;
  /** Where its block, or its data node, starts now in the pane's document. */
  readonly part: number;
  /** The card's document, with the pane's selection where it lies in the
   *  card. */
  readonly state: Store<EditorState | undefined>;
  /** Draw it in React. Place it once. */
  readonly element: ReactElement;
  /** Draw it into a DOM node; returns the unmount. */
  mount(el: HTMLElement): () => void;
  /** A command in the card's positions, as the writer, on the pane's
   *  history; it stays between the card's ends, as the writer's edits do. */
  run(command: Command): boolean;
  /** The writer goes into the card: the pane's selection moves to its start
   *  (unless already inside) and its editor takes focus. From an effect,
   *  once the card is in `list`. */
  focus(): void;
}

/** An open document: the one a document scope is for, or a pane's
 *  `p.document`. */
export interface DocumentRef {
  readonly id: string;
  /** The document's instance of a value, from a pane as from the document
   *  scope: `p.document.getValue(versions)`. */
  getValue<T>(key: ValueKey<T>): Value<T>;
  /** The document's one hidden state, carrying its document plugins, as a
   *  store exactly like `p.state`: `useStore(d.state, (s) => key.getState(s))`
   *  in React, `d.state.get()` elsewhere; `get()` throws inside a dispatch.
   *  Any document-state transaction, steps or not (an LLM result recorded
   *  as meta), redraws every pane on the document, so decorations reading
   *  document-plugin state stay current. */
  readonly state: Store<EditorState>;
  /** Run `command` as the module itself, a peer editing the document: a
   *  timer, a network reply, a follow-up to someone else's edit. Use it for
   *  edits nobody asked for; an edit the writer asked for goes through the
   *  pane's `p.run`, so it lands on their undo stack.
   *
   *  The command runs against the document's one hidden state (`state`),
   *  made when the document opened, which carries the document plugins
   *  of every module placed on it (their follow-ups run on this edit; pane plugins
   *  don't), with no history and no view. The edit is on no undo stack;
   *  every pane receives it like a collaborator's, and `authorOf` gives the
   *  module's id. Runs at once and returns the command's result, `false`
   *  once the scope it came from has ended; also from a reaction (a plugin
   *  view's `update`, a listener), where everything is current. An error
   *  while a scope is being set up or inside another dispatch, as for
   *  `p.run`. Documents no pane of the module shows: `project.edit`. */
  edit(command: Command): boolean;
}

/** One document shown in a pane the module is placed on, live from the first
 *  such pane showing it to the last. `provide` takes only a
 *  `documentPlugin`, which goes to this document's one state. */
export interface DocumentScope extends PlacementScope, DocumentRef {}

/** The module scope, live while the module is on and placed in at least
 *  one pane (a project module: in the project): ticking it anywhere starts
 *  it, unticking it everywhere stops it (values not persisted start again
 *  at their defaults). It takes
 *  actions and UI but no plugins (see `PlacementScope`). */
export interface ModuleContext extends ControlScope {
  readonly id: string;
  /** Every pane the module is placed on, documents or not: child panes
   *  that inherit their parent's modules count, except the children this
   *  module hosts. */
  readonly panes: Collection<PaneScope>;
  /** The documents those panes show. */
  readonly documents: Collection<DocumentScope>;
  /** The whole project, present while the module has project access (every
   *  module, until the writer takes it back for one). Work inside `with`,
   *  which ends when access does:
   *    ctx.with(ctx.project, (s, project) => {
   *      s.provide(actions.newNote, { procedure: () => (void project.create('Note'), true) });
   *    });
   *  `null` while access is taken back. */
  readonly project: Condition<ProjectAccess | null>;
  /** AI settings, present while the writer has AI on for this module and a
   *  key is set. Work inside `with`, which restarts when any setting
   *  changes (so a key is never stale) and ends when AI is turned off,
   *  aborting `s.signal` and removing actions and UI provided inside:
   *    ctx.with(ctx.ai, (s, ai) => {
   *      s.provide(actions.suggest, { procedure: () => (void suggest(ai, s.signal), true) });
   *    });
   *  Call the writer's endpoint with `ai.fetch`; `mwps/ai` wraps it for
   *  chat. */
  readonly ai: Condition<AiSettings | null>;
}

export interface AiSettings {
  /** `fetch` against the writer's OpenAI-compatible endpoint (theirs for
   *  this module, else their default): `path` is relative to it, such as
   *  `'/chat/completions'` or `'/audio/speech'`, and the host adds the
   *  address and the key, so a module never sees either. A string body
   *  is sent as JSON unless `init` says otherwise. Once these settings
   *  are replaced or AI is turned off, it rejects. The writer can stop a
   *  tab's calls from its menu: the call then ends as if `init.signal`
   *  had aborted (an `AbortError`), so handle it as the module's own. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  /** A suggestion: the writer's choice for this module, else their
   *  default. The module may ignore it. */
  readonly model: string;
  /** The model for `/audio/transcriptions` and `/images/generations`,
   *  chosen the same way (else `whisper-1` and `dall-e-3`). `mwps/ai`'s
   *  `transcribe` and `generateImage` send them. */
  readonly transcriptionModel: string;
  readonly imageModel: string;
}

/** What project access allows. Every call is `false` or `null` once access
 *  has ended, and changes nothing. */
export interface ProjectAccess {
  /** Every document in the project, open or not, in the document picker's order. */
  readonly documents: Store<readonly ProjectDocument[]>;
  /** Make an empty document at the end of the list; its id, or `null`. */
  create(name: string): Promise<string | null>;
  /** Rename a document; `false` if there's no such document. */
  rename(documentId: string, name: string): Promise<boolean>;
  /** Run `command` as the module on any document of the project, open or
   *  not, and resolve to its result. An open document is edited at once,
   *  as `d.edit` does. A closed one is read, edited and saved: the command
   *  gets a plain state of it, with no plugins (no module's follow-ups
   *  run) and no history, and the edit is on no undo stack. A document that
   *  doesn't fit the schema, or is missing, gives `false`. Edits to one
   *  closed document run one after another. Errors as for `d.edit` when
   *  called while a scope is set up or inside another dispatch. */
  edit(documentId: string, command: Command): Promise<boolean>;
  /** Any document of the project, open or not, as it is now (after this
   *  module's earlier `edit` calls to it, awaited or not); `null` if
   *  there's no such document or it doesn't fit the schema. Reading never
   *  edits or saves, and works anywhere. */
  read(documentId: string): Promise<Node | null>;
}

export interface ProjectDocument {
  readonly id: string;
  readonly name: string;
}

/** Who made an edit: a module's id for edits through `d.edit` (and the
 *  follow-ups to them), else `'user'`, the writer, which includes edits a
 *  module made in a pane on the writer's behalf (`p.run`, key handlers).
 *  It works on received edits too: a received edit never mixes authors or
 *  history kinds (consecutive steps with the same ones may arrive as
 *  one), so a document plugin tells the writer's deletion from an undo or
 *  a module's edit with no extra API. */
export function authorOf(tr: Transaction): string;

/** Where an edit was made, as a pane's plugin sees it: `'local'` for one
 *  made in this pane (the writer typing, `p.run`, an action, and the
 *  follow-ups to them), `'received'` for one that arrived from elsewhere
 *  (another pane on the same document, a module's `d.edit`; also the
 *  host's own stepless redraws). `authorOf` says who; this says where: the
 *  writer typing in a second pane is `'user'` and `'received'`. For a
 *  plugin that reacts to what the writer just did here:
 *    apply: (tr, value) => (originOf(tr) === 'local' && tr.docChanged ? note(tr, value) : value)
 *  (`appendTransaction` and filters already see only local edits.) */
export function originOf(tr: Transaction): 'local' | 'received';

/** `'undo'` or `'redo'` for a transaction prosemirror-history made, else
 *  `null`; this is for telling them apart (counting undos). Where the
 *  edit was made, it describes the transaction itself: a follow-up that
 *  runs on an undo is `null`, since it is a new change, so to skip a whole
 *  commit an undo caused, test its first transaction, the root:
 *  `if (historyKind(trs[0])) return;`. A received edit's kind is its
 *  root's: the follow-ups to an undo arrive with it, as `'undo'`. */
export function historyKind(tr: Transaction): 'undo' | 'redo' | null;

/** An attribute added to base types (`doc`, `paragraph`, `strong`, …).
 *  Only base types: another module's types are its own to shape. */
export interface AttributeContribution {
  types: readonly string[];
  name: string;
  spec: AttributeSpec;
}

/** What `modules/<id>/index.tsx` exports. The type exports are plain
 *  ProseMirror specs, read before `setup` runs; the schema is the base types
 *  plus every installed module's. Type and attribute names are word
 *  characters, prefixed with the module's name by convention, and unique
 *  across installed modules: a clashing module isn't installed. */
export interface ModuleExports {
  setup(ctx: ModuleContext): void;
  /** What kind of module this is (default `'extension'`). An
   *  `'editorReplacement'` may provide `ui.editorReplacement`; a pane has at
   *  most one, and choosing another replaces it. An `'extension'` adds to
   *  the panes it is placed on, any number together. A `'project'` module
   *  is placed in the project tab rather than on a pane, and runs while it
   *  is placed there: it has the module scope only (`ctx.panes` stays
   *  empty), works through `ctx.project`, and its UI is `ui.projectMenu`
   *  and `ui.modal` (export the whole project; rename across documents,
   *  asking for the words in a dialog). */
  moduleType?: 'editorReplacement' | 'extension' | 'project';
  /** Node types, as passed to `new Schema({ nodes })`. A document is
   *  `block+ mwps_data`: the writing, which the pane's editor shows and
   *  which starts at position 0, then one data node the host keeps at the
   *  end, holding the modules' data, which no editor of the writing shows.
   *  A node in the `module_data` group is the module's own data (made by
   *  the module's first edit to it, inserted at `dataEnd(doc)` and found
   *  with `findData(doc, type)`, both from `mwps/text`); show it with
   *  `p.dataCards`. It is isolating. `writing(doc)` from `mwps/text` is
   *  the writing alone. A node in the
   *  `block` group must be `isolating: true`, or the install is refused. */
  nodes?: { [name: string]: NodeSpec };
  /** Mark types, as passed to `new Schema({ marks })`. */
  marks?: { [name: string]: MarkSpec };
  /** Attributes added to base types, for data that travels with the file
   *  (a paragraph's meter, a document setting). Naming another module's
   *  type, or an attribute another module already added, refuses the
   *  install. */
  attrs?: readonly AttributeContribution[];
  /** The module's actions, implemented in `setup` with
   *  `s.provide(actions.name, …)`, passing the exported object itself:
   *    export const actions = { bold: { title: 'Bold', keys: 'Mod-b' } };
   *    p.provide(actions.bold, { command: toggleBold, active: isBold }); */
  actions?: { readonly [name: string]: ActionDeclaration };
  /** The module's CSS, as a string. It applies only where the module is
   *  placed: the panes it is placed on (their text, `.ProseMirror …`) and
   *  its own components, including kit dialogs and popovers portaled out;
   *  never another module's components, or a pane it isn't placed on.
   *  Order against other modules' CSS is unspecified. Plain CSS only: no
   *  Tailwind classes (`flex`, `gap-2` do nothing). Names that are
   *  page-wide whatever the scope, `@keyframes` and anchor names, start
   *  with the module id: `@keyframes margin-notes-fade`. */
  styles?: string;
}
