import type { Mark, Node as PMNode } from 'prosemirror-model';
import { writing } from 'mwps/text';
import { DOMSerializer, Fragment } from 'prosemirror-model';
import { chainCommands, splitBlock } from 'prosemirror-commands';
import { splitListItem } from 'prosemirror-schema-list';
import type { Command, EditorState, Transaction } from 'prosemirror-state';
import { NodeSelection, Plugin, Selection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { StepMap } from 'prosemirror-transform';
import type { ModuleContext } from 'mwps';
import { authorOf, historyKind, ui, useAction, useStore, valueKey } from 'mwps';
import { Button, ToggleGroup, ToggleGroupItem } from 'mwps/ui';

// Pink is a mark on the text; text without it is green. The mode (which colour
// the writer is typing in, and whether green is hidden) is a per-pane value.

type Mode = 'green' | 'pink';

const modeKey = valueKey<Mode>('mode', { default: 'green' });

export const actions = {
  green: { title: 'Two-tone: green mode (draft)', keys: 'Mod-Alt-g' },
  pink: { title: 'Two-tone: pink mode (keepers)', keys: 'Mod-Alt-y' },
  recolour: { title: 'Two-tone: recolour selection', keys: 'Mod-Alt-t' },
  makeGreen: { title: 'Two-tone: make selection green' },
  makePink: { title: 'Two-tone: make selection pink' },
};

const PINK = 'two_color_pink';

export const marks = {
  [PINK]: {
    inclusive: false,
    parseDOM: [{ tag: 'span[data-two-color]' }],
    toDOM: () => ['span', { 'data-two-color': 'pink' }, 0],
  },
};

// ---- Reading colours ------------------------------------------------------

const isAside = (n: PMNode) => (n.type.spec.group ?? '').split(' ').includes('inline_aside');
const isPink = (n: PMNode) => n.marks.some((m: Mark) => m.type.name === PINK);

/** Maximal runs of unmarked inline content in a textblock. */
function greenRuns(block: PMNode, pos: number): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = [];
  let open: { from: number; to: number } | null = null;
  block.forEach((child, offset) => {
    const from = pos + 1 + offset;
    if (isPink(child)) {
      open = null;
    } else if (open) {
      open.to = from + child.nodeSize;
    } else {
      open = { from, to: from + child.nodeSize };
      runs.push(open);
    }
  });
  return runs;
}

/** The green run holding `pos` strictly inside, if any. */
function runAround(doc: PMNode, pos: number): { from: number; to: number } | null {
  const $pos = doc.resolve(pos);
  if (!$pos.parent.isTextblock) return null;
  return greenRuns($pos.parent, $pos.start() - 1).find((r) => r.from < pos && pos < r.to) ?? null;
}

/** Ranges of pink inline content within `from..to`. */
function pinkRanges(doc: PMNode, from: number, to: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isInline && isPink(node)) {
      const a = Math.max(from, pos);
      const b = Math.min(to, pos + node.nodeSize);
      if (a < b) out.push({ from: a, to: b });
    }
    return true;
  });
  return out;
}

function deleteRanges(tr: Transaction, ranges: { from: number; to: number }[]): Transaction {
  for (let i = ranges.length - 1; i >= 0; i--) tr.delete(ranges[i].from, ranges[i].to);
  return tr;
}

// ---- Drawing --------------------------------------------------------------

const decoCache = new WeakMap<PMNode, { green?: DecorationSet; pink?: DecorationSet }>();

function marker(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'two-tone-marker';
  el.contentEditable = 'false';
  el.textContent = '···';
  return el;
}

function anchorWidget(): HTMLElement {
  const el = document.createElement('span');
  el.contentEditable = 'false';
  return el;
}

function buildDecorations(doc: PMNode, mode: Mode): DecorationSet {
  const cached = decoCache.get(doc) ?? {};
  decoCache.set(doc, cached);
  if (cached[mode]) return cached[mode]!;
  const decos: Decoration[] = [];
  writing(doc).descendants((node, pos) => {
    if (!node.isTextblock) return true;
    for (const run of greenRuns(node, pos)) {
      if (mode === 'green') {
        decos.push(Decoration.inline(run.from, run.to, { class: 'two-tone-green' }));
      } else {
        decos.push(Decoration.inline(run.from, run.to, { class: 'two-tone-hidden' }));
        // Widgets on the outer side of the hidden text keep the caret's DOM
        // position out of it: the marker after it, and at a paragraph's
        // start an empty one before it.
        decos.push(Decoration.widget(run.to, marker, { side: -1, key: `tc-${run.from}-${run.to}` }));
        if (run.from === pos + 1) decos.push(Decoration.widget(run.from, anchorWidget, { side: -1, key: `tc-a-${run.from}` }));
      }
    }
    return false;
  });
  return (cached[mode] = DecorationSet.create(doc, decos));
}

// ---- Word count -----------------------------------------------------------

const countCache = new WeakMap<PMNode, string>();

/** "total green pink", words over the whole document. A word that straddles
 *  a colour boundary counts once in total and once on each side. */
function countWords(doc: PMNode): string {
  const hit = countCache.get(doc);
  if (hit) return hit;
  let total = 0, green = 0, pink = 0;
  writing(doc).descendants((node) => {
    if (!node.isTextblock) return true;
    let text = '';
    const colour: boolean[] = []; // true = pink
    node.forEach((child) => {
      if (isAside(child)) return;
      const s = child.isText ? child.text! : ' ';
      for (let i = 0; i < s.length; i++) colour.push(isPink(child));
      text += s;
    });
    for (const m of text.matchAll(/\S+/g)) {
      total++;
      let g = false, p = false;
      for (let i = m.index; i < m.index + m[0].length; i++) (colour[i] ? (p = true) : (g = true));
      if (g) green++;
      if (p) pink++;
    }
    return false;
  });
  const result = `${total} ${green} ${pink}`;
  countCache.set(doc, result);
  return result;
}

// ---- Editing --------------------------------------------------------------

/** The ranges the writer's own transactions inserted, in the final document. */
function insertedRanges(trs: readonly Transaction[]): { from: number; to: number }[] {
  const maps: { map: StepMap; mine: boolean }[] = [];
  for (const tr of trs) {
    const mine = authorOf(tr) === 'user' && !historyKind(tr) && !tr.getMeta('appendedTransaction');
    for (const m of tr.mapping.maps) maps.push({ map: m as StepMap, mine });
  }
  const out: { from: number; to: number }[] = [];
  maps.forEach(({ map, mine }, k) => {
    if (!mine) return;
    map.forEach((_a, _b, newStart, newEnd) => {
      let from = newStart;
      let to = newEnd;
      for (let j = k + 1; j < maps.length; j++) {
        from = maps[j].map.map(from, 1);
        to = maps[j].map.map(to, -1);
      }
      if (from < to) out.push({ from, to });
    });
  });
  return out;
}

/** Hidden text never holds the caret: hop over it in the direction of travel. */
function snapSelection(state: EditorState, oldState: EditorState): Transaction | null {
  const sel = state.selection;
  if (!(sel instanceof TextSelection)) return null;
  const headRun = runAround(state.doc, sel.head);
  const anchorRun = sel.empty ? null : runAround(state.doc, sel.anchor);
  if (!headRun && !anchorRun) return null;
  const forward = sel.head > oldState.selection.head;
  let head = sel.head;
  let anchor = sel.anchor;
  if (headRun) head = forward ? headRun.to : headRun.from;
  if (sel.empty) anchor = head;
  else if (anchorRun) anchor = sel.anchor < sel.head ? anchorRun.from : anchorRun.to;
  return state.tr.setSelection(TextSelection.create(state.doc, anchor, head));
}

const recolour = (mode: () => Mode): Command => (state, dispatch) => {
  const sel = state.selection;
  if (sel.empty || sel.ranges.length === 0) return false;
  const type = state.schema.marks[PINK];
  let anyGreen = false;
  for (const r of sel.ranges) {
    state.doc.nodesBetween(r.$from.pos, r.$to.pos, (n) => {
      if (n.isInline && !isPink(n)) anyGreen = true;
      return true;
    });
  }
  const toPink = mode() === 'green' && anyGreen;
  if (dispatch) {
    const tr = state.tr;
    for (const r of sel.ranges) {
      if (toPink) tr.addMark(r.$from.pos, r.$to.pos, type.create());
      else tr.removeMark(r.$from.pos, r.$to.pos, type);
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Colours the selection one way, whatever it holds. Pink is offered only in
 *  green mode: in pink mode everything visible is already pink. */
const paint = (toPink: boolean, mode: () => Mode): Command => (state, dispatch) => {
  const sel = state.selection;
  if (sel.empty || (toPink && mode() !== 'green')) return false;
  if (dispatch) {
    const type = state.schema.marks[PINK];
    const tr = state.tr;
    for (const r of sel.ranges) {
      if (toPink) tr.addMark(r.$from.pos, r.$to.pos, type.create());
      else tr.removeMark(r.$from.pos, r.$to.pos, type);
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** One arrow press next to a hidden run steps over the whole run (and its
 *  marker), no further. */
function hop(view: EditorView, dir: 1 | -1, extend: boolean): boolean {
  const sel = view.state.selection;
  if (!(sel instanceof TextSelection)) return false;
  const $head = sel.$head;
  if (!$head.parent.isTextblock) return false;
  const runs = greenRuns($head.parent, $head.start() - 1);
  const run = runs.find((r) => (dir === 1 ? r.from : r.to) === sel.head);
  if (!run) return false;
  const head = dir === 1 ? run.to : run.from;
  const anchor = extend ? sel.anchor : head;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)).scrollIntoView());
  return true;
}

/** Pink mode: remove the pink text in the selection, keeping hidden green and
 *  the paragraph breaks. */
function deleteSelectionPink(view: EditorView): boolean {
  const { from, to, empty } = view.state.selection;
  if (empty || view.state.selection instanceof NodeSelection) return false;
  const tr = view.state.tr;
  deleteRanges(tr, pinkRanges(view.state.doc, from, to));
  const at = tr.mapping.map(from, -1);
  view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(at), 1)).scrollIntoView());
  return true;
}

/** Backspace or Delete with a caret in pink mode: one character (or word) of
 *  pink text, nothing at the edge of a hidden run. */
function deleteNearCaret(view: EditorView, back: boolean, word: boolean): boolean {
  const sel = view.state.selection;
  if (!sel.empty || !(sel instanceof TextSelection)) return false;
  const $pos = sel.$from;
  const node = back ? $pos.nodeBefore : $pos.nodeAfter;
  if (!node) return false; // at a paragraph edge: join as usual
  if (!isPink(node)) return true; // hidden green: nothing to delete
  let n = 1;
  if (node.isText) {
    const s = node.text!;
    if (word) {
      const m = (back ? /(\s*\S+|\s+)$/ : /^(\s*\S+|\s+)/).exec(s);
      n = m ? m[0].length : 1;
    } else if (back) {
      n = /[\uDC00-\uDFFF]$/.test(s) && s.length > 1 ? 2 : 1;
    } else {
      n = /^[\uD800-\uDBFF]/.test(s) && s.length > 1 ? 2 : 1;
    }
  } else {
    n = node.nodeSize;
  }
  const from = back ? sel.from - n : sel.from;
  view.dispatch(view.state.tr.delete(from, from + n).scrollIntoView());
  return true;
}

/** The pink-only content of a range, for the clipboard. */
function pinkFragment(frag: Fragment): Fragment {
  const out: PMNode[] = [];
  frag.forEach((node) => {
    if (node.isText || node.isInline) {
      if (isPink(node)) out.push(node);
    } else if (node.isTextblock) {
      const inner = pinkFragment(node.content);
      if (inner.size > 0 || node.content.size === 0) out.push(node.copy(inner));
    } else {
      const inner = pinkFragment(node.content);
      if (inner.size > 0 || node.isLeaf) out.push(node.copy(inner));
    }
  });
  return Fragment.fromArray(out);
}

function writeClipboard(view: EditorView, e: ClipboardEvent): boolean {
  const sel = view.state.selection;
  const pink = pinkFragment(sel.content().content);
  e.preventDefault();
  if (pink.size === 0 || !e.clipboardData) return false;
  const div = document.createElement('div');
  div.appendChild(DOMSerializer.fromSchema(view.state.schema).serializeFragment(pink));
  e.clipboardData.clearData();
  e.clipboardData.setData('text/html', div.innerHTML);
  e.clipboardData.setData('text/plain', pink.textBetween(0, pink.size, '\n', ' '));
  return true;
}

function editingPlugin(mode: () => Mode): Plugin {
  const pinkMode = () => mode() === 'pink';
  return new Plugin({
    props: {
      decorations: (state) => buildDecorations(state.doc, mode()),
      handleKeyDown(view, e) {
        if (!pinkMode()) return false;
        if (e.key === 'Backspace' || e.key === 'Delete') {
          if (e.shiftKey && e.key === 'Delete') return false;
          if (!view.state.selection.empty) return deleteSelectionPink(view);
          return deleteNearCaret(view, e.key === 'Backspace', e.altKey || e.ctrlKey || e.metaKey);
        }
        // Over a selection, the pink text goes and Enter splits where it was.
        if (e.key === 'Enter' && deleteSelectionPink(view)) {
          const item = view.state.schema.nodes.list_item;
          chainCommands(...(item ? [splitListItem(item)] : []), splitBlock)(view.state, view.dispatch, view);
          return true;
        }
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey) {
          return hop(view, e.key === 'ArrowRight' ? 1 : -1, e.shiftKey);
        }
        return false;
      },
      handleTextInput(view, from, to, text) {
        if (!pinkMode() || from === to) return false;
        const tr = view.state.tr;
        deleteRanges(tr, pinkRanges(view.state.doc, from, to));
        const at = tr.mapping.map(from, -1);
        view.dispatch(tr.insertText(text, at).scrollIntoView());
        return true;
      },
      handlePaste(view) {
        if (pinkMode()) deleteSelectionPink(view);
        return false;
      },
      handleDOMEvents: {
        copy(view, e) {
          if (!pinkMode() || view.state.selection.empty) return false;
          writeClipboard(view, e as ClipboardEvent);
          return true;
        },
        cut(view, e) {
          if (!pinkMode() || view.state.selection.empty) return false;
          if (writeClipboard(view, e as ClipboardEvent)) deleteSelectionPink(view);
          return true;
        },
      },
    },
    appendTransaction(trs, oldState, state) {
      // The writer's new text takes the colour of the mode.
      const pinkType = state.schema.marks[PINK];
      let tr: Transaction | null = null;
      if (trs.some((t) => t.docChanged)) {
        for (const r of insertedRanges(trs)) {
          const from = Math.max(0, r.from);
          const to = Math.min(state.doc.content.size, r.to);
          tr ??= state.tr;
          if (mode() === 'pink') tr.addMark(from, to, pinkType.create());
          else tr.removeMark(from, to, pinkType);
        }
        if (tr && !tr.docChanged) tr = null;
      }
      if (!pinkMode()) return tr;
      // Hidden text never holds the caret.
      const next = tr ? state.apply(tr) : state;
      const snap = snapSelection(next, oldState);
      if (!snap) return tr;
      return tr ? tr.setSelection(snap.selection) : snap;
    },
  });
}

// ---- The module -----------------------------------------------------------

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const mode = p.getValue(modeKey);

    p.provide(editingPlugin(() => mode.get()));

    p.provide(actions.green, { procedure: () => (mode.set('green'), true), active: () => mode.get() === 'green' });
    p.provide(actions.pink, { procedure: () => (mode.set('pink'), true), active: () => mode.get() === 'pink' });
    p.provide(actions.recolour, { command: recolour(() => mode.get()) });
    p.provide(actions.makeGreen, { command: paint(false, () => mode.get()) });
    p.provide(actions.makePink, { command: paint(true, () => mode.get()) });

    const Paint = () => {
      const green = useAction(p, actions.makeGreen);
      const pink = useAction(p, actions.makePink);
      return (
        <>
          {green.enabled && (
            <Button size="sm" variant="ghost" aria-label="Make green" title="Make green" onClick={green.run}>
              <span className="two-tone-dot two-tone-dot-green" />
            </Button>
          )}
          {pink.enabled && (
            <Button size="sm" variant="ghost" aria-label="Make pink" title="Make pink" onClick={pink.run}>
              <span className="two-tone-dot two-tone-dot-pink" />
            </Button>
          )}
        </>
      );
    };
    p.provide(ui.selection(Paint));

    const Controls = () => {
      const current = useStore(mode);
      const green = useAction(p, actions.green);
      const pink = useAction(p, actions.pink);
      const [total, g, k] = useStore(p.state, (s) => (s ? countWords(s.doc) : '0 0 0')).split(' ');
      return (
        <span className="two-tone-controls">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label="Two-tone mode"
            value={current}
            onValueChange={(next) => {
              if (next === 'green') green.run();
              else if (next === 'pink') pink.run();
            }}
          >
            <ToggleGroupItem className="two-tone-mode-green" value="green">Green</ToggleGroupItem>
            <ToggleGroupItem className="two-tone-mode-pink" value="pink">Pink</ToggleGroupItem>
          </ToggleGroup>
          <span className="two-tone-count" aria-label="Word count">
            {total} words, <span className="two-tone-green">{g} green</span>, <span className="two-tone-pink">{k} pink</span>
          </span>
        </span>
      );
    };
    p.provide(ui.toolbar(Controls));
  });
}

export const styles = `
.two-tone-green { color: #16a34a; }
.two-tone-pink, [data-two-color="pink"] { color: #db2777; }
.two-tone-hidden { display: none; }
.two-tone-marker { color: var(--muted-foreground); }
.two-tone-controls { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.two-tone-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; }
.two-tone-dot-green { background-color: #16a34a; }
.two-tone-dot-pink { background-color: #db2777; }
/* The mode in use is filled with its colour, so the writer sees which ink they type in. */
.two-tone-mode-green[data-state="on"] { background-color: #16a34a; color: #fff; }
.two-tone-mode-pink[data-state="on"] { background-color: #db2777; color: #fff; }
.two-tone-count { font-size: 12px; }
`;
