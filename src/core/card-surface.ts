// Cards as input surfaces of their host pane. A card is an editor over a
// parent node of the pane's document and a range of its children; it is
// not a pane. Its document is a copy of the parent holding that range: a
// layout's card is `doc(block)`, the pane's main editor `doc(the
// writing's blocks)`, a module's data card the data node with all its
// children. The children are drawn as themselves; the parent isn't (the
// card's frame stands in for it). The writer is in the host pane: the
// card's transactions become transactions on the host pane's
// whole-document state (one history, one selection), and what is made in
// a card stays between its ends. The host pane's state is drawn back into
// each card, and the host pane's plugins' view hooks run with an adapter
// in place of the view.

import { Slice, type Node } from 'prosemirror-model';
import {
  EditorState,
  NodeSelection,
  Plugin,
  Selection,
  TextSelection,
  type Command,
  type Transaction,
} from 'prosemirror-state';
import { isHistoryTransaction } from 'prosemirror-history';
import { dropCursor } from 'prosemirror-dropcursor';
import { Mapping, StepMap, type Mappable, type Step } from 'prosemirror-transform';
import { DecorationSet, type DecorationSource, type EditorProps, type EditorView, type NodeViewConstructor } from 'prosemirror-view';
import type { PartHandle } from '../api/mwps.js';
import type { DocumentHub } from './document-hub.js';
import type { PaneImpl } from './pane.js';
import { createStore, Listeners } from './store.js';

// Every position moved by `n` (card to document), deleting nothing.
function shift(n: number): Mappable {
  return { map: (pos) => pos + n, mapResult: (pos) => StepMap.empty.mapResult(pos + n) };
}

// The first host plugin's value of a prop that `f` accepts.
function someProp<R>(state: EditorState, name: string, f: (value: never) => R | undefined | false): R | undefined {
  for (const plugin of state.plugins) {
    const value = (plugin.props as Record<string, unknown>)[name];
    if (value === undefined) continue;
    const result = f(value as never);
    if (result) return result as R;
  }
  return undefined;
}

// The meta a view puts on its own transactions, which plugins read.
const VIEW_META = ['pointer', 'uiEvent', 'paste', 'cut', 'composition', 'addToHistory'];

// A card's piece of the document: the children of the node at `parent`
// (-1 for the document itself) from `from` to `to`, in document positions.
export interface CardRange {
  readonly parent: number;
  readonly from: number;
  readonly to: number;
}

// What a group's cards are: a layout's, the pane's writing (the host's
// one card), or a module's data cards.
export type CardKind = 'layout' | 'writing' | 'data';

// Which ranges a group of cards shows. A layout's cards follow their block
// when the layout reorders; others are their group's n-th range.
export interface CardGroup {
  readonly moduleId: string;
  readonly kind: CardKind;
  // The ranges, in document order. Throws what a module's test throws.
  where(doc: Node): CardRange[];
  surfaces: CardSurface[];
  readonly handleOf: (card: CardSurface) => PartHandle | null;
  readonly newId: () => string;
  readonly handles: Map<CardSurface, PartHandle>;
  readonly list: ReturnType<typeof createStore<readonly PartHandle[]>>;
  // The document last listed.
  listed: Node | null;
}

export class CardSurface {
  view: EditorView | null = null;
  // The card's own state: a copy of its parent holding its range.
  state: EditorState | undefined;
  // A layout card's block as last shown, to recognise it after a move.
  node: Node | null = null;
  orphan = false;
  readonly listeners = new Listeners();
  // The host pane's document log is followed up to here.
  version: number;
  // Where the decorations were last sliced, and the slice.
  private slicedAt = -1;
  private decorations = DecorationSet.empty;

  constructor(
    readonly id: string,
    private readonly cards: CardsHost,
    readonly group: CardGroup,
    public range: CardRange,
    version: number,
  ) {
    this.version = version;
  }

  // The card's document spans `from`..`to` of the host's: position 0 in the
  // card is `from` in the host.
  get from(): number {
    return this.range.from;
  }

  get to(): number {
    return this.range.to;
  }

  // Where the card's node starts: a data card's node, a layout card's block.
  get part(): number {
    return this.range.parent < 0 ? this.range.from : this.range.parent;
  }

  // Whether the card shows `pos` of the host's document.
  holds(pos: number): boolean {
    return pos >= this.from && pos <= this.to;
  }

  // The card's state from the host pane's, drawn when something it shows
  // changed: its range, its decorations or the selection in it. `scroll`:
  // the host's last transaction scrolled its selection into view.
  derive(host: EditorState, sets: readonly DecorationSet[], setsChanged: boolean, scroll = false): void {
    if (this.orphan) return;
    const { parent, from, to } = this.range;
    const node = parent < 0 ? host.doc : host.doc.nodeAt(parent);
    if (!node) return;
    const start = parent < 0 ? 0 : parent + 1;
    const content = node.content.cut(from - start, to - start);
    const old = this.state;
    const same =
      old &&
      old.doc.sameMarkup(node) &&
      old.doc.childCount === content.childCount &&
      content.content.every((child, i) => child === old.doc.child(i));
    const doc = same ? old.doc : node.copy(content);
    if (this.group.kind === 'layout') this.node = doc.firstChild;
    let decorations = this.decorations;
    if (setsChanged || doc !== old?.doc || this.slicedAt !== this.from) {
      decorations = this.slice(host.doc, doc, sets);
      this.slicedAt = this.from;
    }
    const selection = this.select(doc, host.selection);
    const plugin = this.cards.plugin(host);
    scroll &&= this.holds(host.selection.head);
    const unchanged =
      !scroll &&
      old &&
      doc === old.doc &&
      decorations === this.decorations &&
      selection.eq(old.selection) &&
      old.plugins[0] === plugin &&
      old.storedMarks === host.storedMarks;
    if (unchanged) return;
    this.decorations = decorations;
    let state: EditorState;
    if (!old || old.plugins[0] !== plugin || !old.doc.sameMarkup(doc)) {
      state = EditorState.create({ doc, selection, plugins: [plugin, this.cards.dropCursor], storedMarks: host.storedMarks });
      if (scroll) state = state.apply(state.tr.scrollIntoView());
    } else {
      // A step from the old state, so the view keeps its plugin views (the
      // drop cursor's) and scrolls as it would for an edit.
      const tr = old.tr;
      if (doc !== old.doc) tr.replace(0, old.doc.content.size, new Slice(doc.content, 0, 0));
      tr.setSelection(this.select(tr.doc, host.selection)).setStoredMarks(host.storedMarks);
      if (scroll) tr.scrollIntoView();
      state = old.apply(tr);
    }
    this.state = state;
    this.view?.updateState(state);
    this.listeners.notify();
  }

  get shownDecorations(): DecorationSet {
    return this.decorations;
  }

  // The host's decorations in this card, in its positions: those touching
  // its range, mapped through deleting everything outside it. (Mapping
  // alone would keep a widget at the document's very start or end, on the
  // outer edge of a deleted range, and pin it to the card.) Each map walks the
  // set's top-level entries, so cards × decorated blocks per change;
  // `DecorationSet.forChild` reaches one block directly, if that shows.
  private slice(doc: Node, cardDoc: Node, sets: readonly DecorationSet[]): DecorationSet {
    const a = this.from;
    const b = a + cardDoc.content.size;
    const end = doc.content.size;
    const ranges = [...(a > 0 ? [0, a, 0] : []), ...(end > b ? [b, end - b, 0] : [])];
    const outside = new Mapping([new StepMap(ranges)]);
    const found = sets.flatMap((set) => {
      const near = set.find(a, b);
      return near.length ? DecorationSet.create(doc, near).map(outside, cardDoc).find() : [];
    });
    return found.length ? DecorationSet.create(cardDoc, found) : DecorationSet.empty;
  }

  // The host's selection, in the card: where it lies inside, else the start.
  private select(cardDoc: Node, sel: Selection): Selection {
    const a = this.from;
    const b = this.to;
    try {
      if (sel instanceof NodeSelection && sel.from >= a && sel.to <= b) return NodeSelection.create(cardDoc, sel.from - a);
      if (sel instanceof TextSelection && sel.from > a && sel.to < b) {
        return TextSelection.create(cardDoc, sel.anchor - a, sel.head - a);
      }
    } catch {
      // falls through
    }
    return Selection.atStart(cardDoc);
  }

  // The one edit rule: what is made in the card stays between its ends.
  // The document outside them is as it was (and, for a card inside a
  // node, so are the document's attributes), and the selection ends
  // between them.
  allows(tr: Transaction): boolean {
    if (tr.docChanged) {
      const before = tr.before.content;
      const after = tr.doc.content;
      const start = before.findDiffStart(after);
      if (start !== null && (start < this.from || before.findDiffEnd(after)!.a > this.to)) return false;
      if (this.range.parent >= 0 && !tr.doc.sameMarkup(tr.before)) return false;
    }
    const from = tr.mapping.map(this.from, -1);
    const to = tr.mapping.map(this.to, 1);
    return tr.selection.from >= from && tr.selection.to <= to;
  }

  // Cmd-A selects the card's content.
  selectContent(): boolean {
    const state = this.state!;
    const sel = TextSelection.between(state.doc.resolve(0), state.doc.resolve(state.doc.content.size));
    this.dispatch(state.tr.setSelection(sel));
    return true;
  }

  // The card's own view sent a transaction (a key's default, typing, a
  // paste): it goes to the host pane as one on the whole document. A
  // refused one changes nothing; ProseMirror redraws DOM the browser
  // changed when the dispatch isn't applied.
  dispatch = (tr: Transaction): void => {
    const host = this.cards.pane();
    const state = host?.state.get();
    if (!host || !state || this.orphan) return;
    const htr = state.tr;
    if (tr.docChanged) {
      const map = shift(this.from);
      try {
        for (const step of tr.steps) {
          const moved = (step as Step).map(map);
          if (moved) htr.step(moved);
        }
      } catch {
        return;
      }
    }
    if (tr.selectionSet || tr.docChanged) {
      try {
        const sel = tr.selection;
        htr.setSelection(
          sel instanceof NodeSelection
            ? NodeSelection.create(htr.doc, sel.from + this.from)
            : TextSelection.between(htr.doc.resolve(sel.anchor + this.from), htr.doc.resolve(sel.head + this.from)),
        );
      } catch {
        // keeps the mapped selection
      }
    }
    if (tr.storedMarksSet) htr.setStoredMarks(tr.storedMarks);
    if (tr.scrolledIntoView) htr.scrollIntoView();
    for (const key of VIEW_META) if (tr.getMeta(key) !== undefined) htr.setMeta(key, tr.getMeta(key));
    if (!this.allows(htr)) return;
    host.dispatch(htr);
  };

  // An edit as the card's chrome would make it (in card positions).
  run(command: Command): boolean {
    const state = this.state;
    const host = this.cards.pane();
    if (!state || !host) return false;
    return host.asOwnStep(() => command(state, this.dispatch, this.view ?? undefined));
  }

  // A command on the pane's state (document positions), as a host
  // plugin's key binding runs it for a key pressed in this card.
  runAsKey(command: Command): boolean {
    const view = this.cards.adapter;
    return this.cards.inCard(this, () => command(view.state, view.dispatch, view));
  }

  // The writer goes into the card: the pane's selection moves to its start
  // unless it is already inside, and its editor takes focus.
  focus(): void {
    const host = this.cards.pane();
    const state = host?.state.get();
    if (host && state && !(state.selection.from >= this.from && state.selection.to <= this.to)) {
      host.dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(this.from))));
    }
    this.view?.focus();
  }

  // The pane's selection moves to this card's own, unless it is already inside.
  claimSelection(): void {
    const host = this.cards.pane();
    const state = host?.state.get();
    const own = this.state;
    if (!host || !state || !own || this.orphan) return;
    if (state.selection.from >= this.from && state.selection.to <= this.to) return;
    const at = Math.min(Math.max(this.from + own.selection.from, this.from), this.to);
    host.dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(at))));
  }

  // Whether the pane's overlay and selection bubble are drawn in this card.
  holdsCaret(): boolean {
    return this.cards.overlayCard() === this;
  }

  // Hears when that may have changed.
  subscribeCaret = (listener: () => void): (() => void) => {
    const stopViews = this.cards.viewListeners.subscribe(listener);
    const stopState = this.cards.pane()?.state.subscribe(listener) ?? (() => {});
    return () => {
      stopViews();
      stopState();
    };
  };

  // A view was drawn for the card, or went.
  attach(view: EditorView | null): void {
    const leaving = !view && !!this.view?.hasFocus();
    this.view = view;
    this.cards.viewsChanged(leaving ? this : undefined);
  }
}

// All the cards of one pane, in groups: its main editor over the writing,
// each module's data cards, a layout's cards; and the adapter that stands
// for the pane's view in its plugins' hooks, whose plugin views live while
// the pane has its element.
export class CardsHost {
  groups: CardGroup[] = [];
  // The pane's element, which a host draws: the adapter's `dom`.
  private element: HTMLElement | null = null;
  // The cards' one plugin, for the host plugins it was made from.
  private forwardingFor: readonly Plugin[] | null = null;
  private forwarding: Plugin | null = null;
  // Each card's own drop cursor: it draws in the card's editor.
  readonly dropCursor = dropCursor();
  // The host decoration sets last sliced, and the state last drawn.
  private sets: readonly DecorationSet[] = [];
  private last: EditorState | null = null;
  // The card whose view's event a host plugin's hook is handling.
  private gesture: CardSurface | null = null;
  // The host pane's view, for its plugins' hooks.
  readonly adapter: EditorView;
  // Hear when a card's view is drawn or goes.
  readonly viewListeners = new Listeners();
  private views = new Map<Plugin, { destroy?(): void; update?(view: EditorView, prev: EditorState): void }>();

  constructor(
    readonly pane: () => PaneImpl | undefined,
    private readonly newId: () => string,
  ) {
    this.adapter = this.makeAdapter();
  }

  get surfaces(): CardSurface[] {
    return this.groups.flatMap((g) => g.surfaces);
  }

  hostState(): EditorState | undefined {
    return this.pane()?.state.get();
  }

  // A group of cards until the returned removal; listed at once, so a
  // throw from `where` is the caller's.
  addGroup(
    moduleId: string,
    kind: CardKind,
    where: (doc: Node) => CardRange[],
    handleOf: (card: CardSurface) => PartHandle | null,
    newId: () => string = this.newId,
  ): { group: CardGroup; remove: () => void } {
    const group: CardGroup = { moduleId, kind, where, handleOf, newId, surfaces: [], handles: new Map(), list: createStore<readonly PartHandle[]>([]), listed: null };
    this.groups.push(group);
    const remove = () => {
      const i = this.groups.indexOf(group);
      if (i < 0) return;
      this.groups.splice(i, 1);
      group.surfaces = [];
      group.handles.clear();
      setList(group);
      this.viewsChanged();
    };
    try {
      this.relistGroup(group, this.pane()?.hub ?? undefined);
    } catch (error) {
      remove();
      throw error;
    }
    return { group, remove };
  }

  // At rest, before anything reacts. Returns, with the group's module, what
  // a group's `where` threw.
  relist(hub: DocumentHub | undefined): { moduleId: string; error: unknown } | null {
    for (const group of [...this.groups]) {
      try {
        this.relistGroup(group, hub);
      } catch (error) {
        return { moduleId: group.moduleId, error };
      }
    }
    return null;
  }

  // One card per range `where` finds, in document order. A card of a group
  // that doesn't follow is its n-th range, whatever happened to it. A
  // layout's card follows its block through the document's steps; one
  // whose block went in this commit moves to a block showing exactly what
  // it showed; other cards without a block close.
  private relistGroup(group: CardGroup, hub: DocumentHub | undefined): void {
    const state = this.hostState();
    if (!hub || !state) {
      group.surfaces = [];
      group.handles.clear();
      group.listed = null;
      setList(group);
      return;
    }
    if (hub.doc === group.listed) return;
    const doc = (group.listed = hub.doc);
    const wanted = group.where(doc);
    let sets: DecorationSet[] | undefined;
    const make = (range: CardRange) => {
      const card = new CardSurface(group.newId(), this, group, range, hub.version);
      // As an EditorView is in its constructor: drawn from the pane's
      // state as it is, before the module hears of it.
      card.derive(state, (sets ??= decorationSets(state)), true);
      const handle = group.handleOf(card);
      if (handle) group.handles.set(card, handle);
      return card;
    };
    if (group.kind !== 'layout') {
      const next = wanted.map((range, i) => {
        const card = group.surfaces[i];
        if (!card) return make(range);
        card.range = range;
        card.version = hub.version;
        return card;
      });
      for (const gone of group.surfaces.slice(wanted.length)) group.handles.delete(gone);
      group.surfaces = next;
      setList(group);
      return;
    }
    for (const card of group.surfaces) {
      let part = card.from;
      for (const { step } of hub.stepsSince(card.version)) {
        if (card.orphan) break;
        const at = step.getMap().mapResult(part, 1);
        if (at.deletedAfter) card.orphan = true;
        else part = at.pos;
      }
      card.version = hub.version;
      if (!card.orphan) card.range = { parent: -1, from: part, to: part + (doc.nodeAt(part)?.nodeSize ?? 0) };
    }
    const loose = group.surfaces.filter((c) => c.orphan);
    const at = new Map(group.surfaces.filter((c) => !c.orphan).map((c) => [c.from, c]));
    const next: CardSurface[] = [];
    for (const range of wanted) {
      let card = at.get(range.from);
      at.delete(range.from);
      const same = card ? -1 : loose.findIndex((c) => !!c.node && doc.nodeAt(range.from)!.eq(c.node));
      if (same >= 0) {
        card = loose.splice(same, 1)[0]!;
        card.orphan = false;
      }
      if (card) card.range = range;
      next.push(card ?? make(range));
    }
    for (const gone of [...at.values(), ...loose]) group.handles.delete(gone);
    group.surfaces = next;
    setList(group);
  }

  some<R>(name: string, f: (value: never) => R | undefined | false): R | undefined {
    const state = this.hostState();
    return state ? someProp(state, name, f) : undefined;
  }

  // The card holding the host's caret, else the first with a view.
  caretCard(): CardSurface | undefined {
    const sel = this.hostState()?.selection;
    return (sel && this.surfaces.find((c) => c.view && c.holds(sel.head))) || this.surfaces.find((c) => c.view);
  }

  // The card that draws the pane's overlay and selection bubble: the caret's
  // card among the layout's and the writing's, never a data card.
  overlayCard(): CardSurface | undefined {
    const own = this.groups.filter((g) => g.kind !== 'data').flatMap((g) => g.surfaces);
    const sel = this.hostState()?.selection;
    return (sel && own.find((c) => c.view && c.holds(sel.head))) || own.find((c) => c.view);
  }

  cardAt(pos: number): CardSurface | undefined {
    return this.surfaces.find((c) => c.view && pos >= c.from && pos < c.to) ?? this.surfaces.find((c) => c.view && c.holds(pos));
  }

  // The host pane draws `state`, as it would update an EditorView: each
  // card takes its slice, then the host plugins' views update.
  update(state: EditorState, prev: EditorState | undefined): void {
    // An edit made while the pane drew has drawn a newer state already.
    if (state !== this.hostState()) return;
    const sets = decorationSets(state);
    const setsChanged = sets.length !== this.sets.length || sets.some((s, i) => s !== this.sets[i]);
    this.sets = sets;
    // A state field ProseMirror's view reads, as it is untyped.
    const scrolled = (s: EditorState) => (s as unknown as { scrollToSelection: number }).scrollToSelection;
    const scroll = !!prev && scrolled(state) > scrolled(prev);
    for (const card of this.surfaces) {
      card.derive(state, sets, setsChanged, scroll);
      if (state !== this.hostState()) return;
    }
    this.followCaret();
    this.updatePluginViews(state, prev ?? this.last ?? state);
    this.last = state;
  }

  // The pane's element was drawn, or went as the pane closed: the pane's
  // plugin views start and end with it.
  setElement(element: HTMLElement | null): void {
    if (element === this.element) return;
    this.destroyViews();
    this.element = element;
    const state = this.hostState();
    if (state) this.updatePluginViews(state, this.last ?? state);
  }

  // A card's view was drawn or went; `leaving`: it went holding focus.
  viewsChanged(leaving?: CardSurface): void {
    const state = this.hostState();
    this.followCaret(leaving);
    if (state) this.updatePluginViews(state, this.last ?? state);
    this.viewListeners.notify();
  }

  // Focus follows the caret from card to card, as within one editor (Enter
  // in a layout's card puts it in the new card the second half makes), and
  // leaves a card that goes holding it (an undo joining it to the card
  // before) for the caret's card, rather than for nowhere.
  private followCaret(leaving?: CardSurface): void {
    const sel = this.hostState()?.selection;
    const focused = leaving ?? this.surfaces.find((c) => c.view?.hasFocus());
    const caret = sel && this.surfaces.find((c) => c !== leaving && c.view && c.holds(sel.head));
    if (focused && caret && caret !== focused) caret.view!.focus();
  }

  private updatePluginViews(state: EditorState, prev: EditorState): void {
    if (!this.element) return;
    for (const [plugin, view] of this.views) {
      if (!state.plugins.includes(plugin)) {
        view.destroy?.();
        this.views.delete(plugin);
      }
    }
    for (const plugin of state.plugins) {
      const make = plugin.spec.view;
      if (make && !this.views.has(plugin)) this.views.set(plugin, make(this.adapter));
    }
    for (const view of this.views.values()) view.update?.(this.adapter, prev);
  }

  private destroyViews(): void {
    for (const view of this.views.values()) view.destroy?.();
    this.views.clear();
  }

  close(): void {
    this.destroyViews();
    this.element = null;
    for (const group of this.groups) {
      group.surfaces = [];
      group.handles.clear();
      setList(group);
    }
    this.groups = [];
  }

  // A host-state transaction from a plugin's hook (keys, input rules,
  // paste). One made while a hook handles an event in a card is made in
  // that card, so the card's rule applies.
  dispatchHost(tr: Transaction): void {
    const host = this.pane();
    if (!host) return;
    // Undo and redo replay the pane's one history, which reaches past any
    // card's ends, so they pass whichever card the key was pressed in.
    if (this.gesture && !isHistoryTransaction(tr) && !this.gesture.allows(tr)) return;
    host.dispatch(tr);
  }

  // Runs a host plugin's hook for an event in `card`: what it dispatches
  // is made in the card.
  inCard<R>(card: CardSurface | null, f: () => R): R {
    const outer = this.gesture;
    this.gesture = card;
    try {
      return f();
    } finally {
      this.gesture = outer;
    }
  }

  // The cards' one plugin: the host pane's view hooks, forwarded with the
  // adapter and document positions. Made again only when the host pane's
  // plugins change.
  plugin(host: EditorState): Plugin {
    if (this.forwarding && this.forwardingFor === host.plugins) return this.forwarding;
    this.forwardingFor = host.plugins;
    return (this.forwarding = this.makeForwarding(host.plugins));
  }

  private makeForwarding(plugins: readonly Plugin[]): Plugin {
    const cards = this;
    const adapter = this.adapter;
    // The card holding the event's target, for its positions.
    const cardOf = (view: EditorView) => cards.surfaces.find((c) => c.view === view);
    const at = (view: EditorView, pos: number) => pos + (cardOf(view)?.from ?? 0);
    // The first host plugin's hook that handles an event in `view`'s card.
    const first = <F>(view: EditorView, name: string, call: (f: F) => boolean | undefined) =>
      cards.inCard(cardOf(view) ?? null, () => !!cards.some(name, call as (value: never) => boolean | undefined));
    const props: EditorProps = {
      editable: () => cards.editable(),
      handleKeyDown: (view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'a' && !event.shiftKey && !event.altKey) return !!cardOf(view)?.selectContent();
        return first(view, 'handleKeyDown', (f: (v: EditorView, e: KeyboardEvent) => boolean) => f(adapter, event));
      },
      handleKeyPress: (view, event) => first(view, 'handleKeyPress', (f: (v: EditorView, e: KeyboardEvent) => boolean) => f(adapter, event)),
      handleTextInput: (view, from, to, text) =>
        first(view, 'handleTextInput', (f: (v: EditorView, a: number, b: number, t: string, d: () => Transaction) => boolean) =>
          f(adapter, at(view, from), at(view, to), text, () => cards.hostState()!.tr.insertText(text, at(view, from), at(view, to))),
        ),
      handlePaste: (view, event, slice) => first(view, 'handlePaste', (f: (v: EditorView, e: ClipboardEvent, s: typeof slice) => boolean) => f(adapter, event, slice)),
      handleDrop: (view, event, slice, moved) =>
        first(view, 'handleDrop', (f: (v: EditorView, e: DragEvent, s: typeof slice, m: boolean) => boolean) => f(adapter, event, slice, moved)),
      handleClick: (view, pos, event) => first(view, 'handleClick', (f: (v: EditorView, p: number, e: MouseEvent) => boolean) => f(adapter, at(view, pos), event)),
      handleDoubleClick: (view, pos, event) =>
        first(view, 'handleDoubleClick', (f: (v: EditorView, p: number, e: MouseEvent) => boolean) => f(adapter, at(view, pos), event)),
      handleTripleClick: (view, pos, event) =>
        first(view, 'handleTripleClick', (f: (v: EditorView, p: number, e: MouseEvent) => boolean) => f(adapter, at(view, pos), event)),
      handleClickOn: (view, pos, node, nodePos, event, direct) =>
        first(view, 'handleClickOn', (f: (...a: unknown[]) => boolean) => f(adapter, at(view, pos), node, at(view, nodePos), event, direct)),
      handleDoubleClickOn: (view, pos, node, nodePos, event, direct) =>
        first(view, 'handleDoubleClickOn', (f: (...a: unknown[]) => boolean) => f(adapter, at(view, pos), node, at(view, nodePos), event, direct)),
      handleTripleClickOn: (view, pos, node, nodePos, event, direct) =>
        first(view, 'handleTripleClickOn', (f: (...a: unknown[]) => boolean) => f(adapter, at(view, pos), node, at(view, nodePos), event, direct)),
      transformPasted: (slice) => {
        let out = slice;
        for (const p of cards.hostState()?.plugins ?? []) {
          const f = p.props.transformPasted as undefined | ((s: typeof slice, v: EditorView) => typeof slice);
          if (f) out = f(out, adapter);
        }
        return out;
      },
      // Every host plugin's attributes on each card's element; classes join.
      attributes: () => {
        const state = cards.hostState();
        const out: Record<string, string> = {};
        for (const p of state?.plugins ?? []) {
          const f = p.props.attributes as undefined | Record<string, string> | ((s: EditorState) => Record<string, string> | null | undefined);
          const got = typeof f === 'function' ? f(state!) : f;
          for (const [k, v] of Object.entries(got ?? {})) out[k] = k === 'class' && out[k] ? `${out[k]} ${v}` : v;
        }
        return out;
      },
      decorations: (state) => cards.surfaces.find((c) => c.state === state)?.shownDecorations ?? DecorationSet.empty,
    };
    // Event hooks: one handler per event name any host plugin has.
    const events: Record<string, (view: EditorView, event: Event) => boolean> = {};
    for (const p of plugins) {
      for (const name of Object.keys(p.props.handleDOMEvents ?? {})) {
        events[name] ??= (view, event) =>
          first(view, 'handleDOMEvents', (m: Record<string, (v: EditorView, e: Event) => boolean>) => m[event.type]?.(adapter, event));
      }
    }
    // A card that takes focus takes the pane's selection with it. A click
    // that lands where the card's editor already had its caret (its start,
    // where a card parks it while the selection is elsewhere) changes no
    // selection, so nothing else would tell the pane.
    const hostFocus = events.focus;
    events.focus = (view, event) => {
      cardOf(view)?.claimSelection();
      return hostFocus ? hostFocus(view, event) : false;
    };
    props.handleDOMEvents = events;
    const views: Record<string, NodeViewConstructor> = {};
    for (const p of plugins) {
      for (const name of Object.keys(p.props.nodeViews ?? {})) {
        views[name] ??= (node, view, getPos, deco, inner) => {
          const make = cards.some('nodeViews', (m: Record<string, NodeViewConstructor>) => m[name])!;
          return make(node, adapter, () => {
            const pos = getPos();
            return pos === undefined ? undefined : at(view, pos);
          }, deco, inner);
        };
      }
    }
    props.nodeViews = views;
    return new Plugin({ props });
  }

  // Whether the host plugins let the writer edit.
  editable(): boolean {
    const state = this.hostState();
    return !state || state.plugins.every((p) => (p.props.editable as undefined | ((s: EditorState) => boolean | undefined))?.(state) !== false);
  }

  // The pane's view in its plugins' hooks: the pane's state and dispatch,
  // its element as `dom`, and what asks about positions answered by the
  // card that shows them. Nothing else is answered.
  private makeAdapter(): EditorView {
    const cards = this;
    const outside = () => new RangeError('the position is in none of the pane\'s cards');
    const adapter = {
      get state() {
        return cards.hostState();
      },
      dispatch: (tr: Transaction) => cards.dispatchHost(tr),
      get editable() {
        return cards.editable();
      },
      get dom() {
        return cards.element;
      },
      get root() {
        return (cards.element?.getRootNode() as Document | ShadowRoot | undefined) ?? globalThis.document;
      },
      get composing() {
        return cards.surfaces.some((c) => c.view?.composing);
      },
      get isDestroyed() {
        return !cards.pane();
      },
      someProp: <R>(name: string, f: (v: never) => R) => cards.some(name, f as never),
      coordsAtPos: (pos: number, side?: number) => {
        const card = cards.cardAt(pos);
        return card?.view?.coordsAtPos(pos - card.from, side) ?? { left: 0, right: 0, top: 0, bottom: 0 };
      },
      domAtPos: (pos: number, side?: number) => {
        const card = cards.cardAt(pos);
        if (!card?.view) throw outside();
        return card.view.domAtPos(pos - card.from, side);
      },
      nodeDOM: (pos: number) => {
        const card = cards.cardAt(pos);
        return card?.view?.nodeDOM(pos - card.from) ?? null;
      },
      posAtCoords: (coords: { left: number; top: number }) => {
        for (const card of cards.surfaces) {
          const r = card.view?.dom.getBoundingClientRect();
          if (!r || coords.left < r.left || coords.left > r.right || coords.top < r.top || coords.top > r.bottom) continue;
          const at = card.view!.posAtCoords(coords);
          if (at) return { pos: at.pos + card.from, inside: at.inside < 0 ? at.inside : at.inside + card.from };
        }
        return null;
      },
      posAtDOM: (node: globalThis.Node, offset: number, bias?: number) => {
        const card = cards.surfaces.find((c) => c.view?.dom.contains(node));
        if (!card?.view) throw outside();
        return card.view.posAtDOM(node, offset, bias) + card.from;
      },
      endOfTextblock: (dir: 'up' | 'down' | 'left' | 'right' | 'forward' | 'backward') => {
        const card = cards.caretCard();
        if (card?.view && card.state) return card.view.endOfTextblock(dir, card.state);
        // Drawn nowhere: by the caret's offset, as commands judge without a view.
        const $head = cards.hostState()?.selection.$head;
        if (!$head) return false;
        return dir === 'up' || dir === 'left' || dir === 'backward' ? $head.parentOffset === 0 : $head.parentOffset === $head.parent.content.size;
      },
      hasFocus: () => cards.surfaces.some((c) => c.view?.hasFocus()),
      focus: () => cards.caretCard()?.view?.focus(),
      // As the card the event is in, or the caret's, would serialize it.
      serializeForClipboard: (slice: Slice) => {
        const card = cards.gesture ?? cards.caretCard();
        if (!card?.view) throw outside();
        return card.view.serializeForClipboard(slice);
      },
    };
    return adapter as unknown as EditorView;
  }
}

function setList(group: CardGroup): void {
  const next = group.surfaces.flatMap((c) => group.handles.get(c) ?? []);
  const now = group.list.get();
  if (next.length !== now.length || next.some((c, i) => c !== now[i])) group.list.set(next);
}

// The host pane's decorations for `state`, from every plugin's prop.
function decorationSets(state: EditorState): DecorationSet[] {
  const sets: DecorationSet[] = [];
  for (const p of state.plugins) {
    const f = p.props.decorations as undefined | ((s: EditorState) => DecorationSource | null | undefined);
    f?.call(p, state)?.forEachSet((set) => sets.push(set));
  }
  return sets;
}
