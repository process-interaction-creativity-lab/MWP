import { type ActionDeclaration, type ModuleContext } from 'mwps';
import { writing } from 'mwps/text';
import { Plus } from 'mwps/icons';
import { reactWidget } from 'mwps/react';
import type { Node, NodeSpec } from 'prosemirror-model';
import { Plugin, PluginKey, Selection, TextSelection } from 'prosemirror-state';
import type { Command, EditorState, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { EditorView } from 'prosemirror-view';

// The notes of a paragraph are a block of their own right after it: an
// isolating region of paragraphs. Isolating is what keeps Backspace, Delete
// and Enter from carrying text across its edges, so ProseMirror's own keys
// do the rest. Drawn in two columns, the notes sit in the grid row of the
// block before them.
const NOTES = 'glas_columns_notes';

export const nodes: { [name: string]: NodeSpec } = {
  [NOTES]: {
    group: 'block',
    content: 'paragraph+',
    isolating: true,
    parseDOM: [{ tag: 'div.glas-columns-notes' }],
    toDOM: () => ['div', { class: 'glas-columns-notes' }, 0],
  },
};

export const actions = {
  addNote: { title: 'Add note to paragraph', keys: 'Mod-Alt-n' } satisfies ActionDeclaration,
};

const isNotes = (n: Node | null | undefined) => n?.type.name === NOTES;

/** The position after the run of notes groups that starts at `pos` (`pos`
 *  itself when there is none). A run reads as one group. */
const runEnd = (doc: Node, pos: number) => {
  for (let n = doc.nodeAt(pos); isNotes(n); n = doc.nodeAt(pos)) pos += n!.nodeSize;
  return pos;
};

/** Add a blank note after the paragraph at `paraPos` (or the one at the
 *  caret; inside a notes block, at its end) and put the caret in it. */
const addNoteAt =
  (paraPos: number | null): Command =>
  (state, dispatch) => {
    const { doc, selection } = state;
    const $f = selection.$from;
    const pos = paraPos ?? ($f.depth >= 1 ? $f.before(1) : -1);
    const node = pos < 0 ? null : doc.nodeAt(pos);
    if (!node || doc.resolve(pos).depth !== 0) return false;
    const blank = state.schema.nodes.paragraph!.createAndFill()!;
    const after = pos + node.nodeSize;
    let tr = state.tr;
    let caret: number;
    if (isNotes(node)) {
      const end = runEnd(doc, pos);
      tr = tr.insert(end - 1, blank);
      caret = end;
    } else if (node.type.name !== 'paragraph') {
      return false;
    } else if (isNotes(doc.nodeAt(after))) {
      const end = runEnd(doc, after);
      tr = tr.insert(end - 1, blank);
      caret = end;
    } else {
      tr = tr.insert(after, state.schema.nodes[NOTES]!.create(null, blank));
      caret = after + 2;
    }
    if (dispatch) dispatch(tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView());
    return true;
  };

/** Down and Up follow the columns: from the last line of a paragraph to the
 *  next paragraph (not into its notes), from a note to the next block of
 *  notes. Anything else is the browser's. */
function arrow(view: EditorView, event: KeyboardEvent): boolean {
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
  const down = event.key === 'ArrowDown';
  if (!down && event.key !== 'ArrowUp') return false;
  const { state } = view;
  const { selection, doc } = state;
  const $f = selection.$from;
  if (!selection.empty || $f.depth < 1 || !view.endOfTextblock(down ? 'down' : 'up')) return false;
  const i = $f.index(0);
  const inNotes = isNotes($f.node(1));
  // In a block of notes only its last (first) paragraph leaves it.
  if (inNotes && $f.index(1) !== (down ? $f.node(1).childCount - 1 : 0)) return false;
  const kids = writing(doc);
  const step = down ? 1 : -1;
  let j = i + step;
  while (j >= 0 && j < kids.childCount && isNotes(kids.child(j)) !== inNotes) j += step;
  if (j < 0 || j >= kids.childCount || j === i + step) return false;
  let at = 0;
  for (let k = 0; k < j; k++) at += kids.child(k).nodeSize;
  const sel = Selection.findFrom(doc.resolve(down ? at + 1 : at + kids.child(j).nodeSize - 1), step, true);
  if (!sel) return false;
  view.dispatch(state.tr.setSelection(sel).scrollIntoView());
  return true;
}

const key = new PluginKey('glas-columns');

/** Notes follow a moved paragraph. A move is a top-level paragraph that
 *  has left the old document's blocks and come back elsewhere with
 *  everything else unchanged (a drag, cards' reorder), and had a group of
 *  notes right after it. The group moves to follow it, in the same
 *  transaction, so one undo restores both. */
function followMoved(trs: readonly Transaction[], oldState: EditorState, newState: EditorState): Transaction | null {
  if (!trs.some((t) => t.docChanged)) return null;
  const a = oldState.doc;
  const b = newState.doc;
  if (a.childCount !== b.childCount) return null;
  const n = a.childCount;
  for (let i = 0; i < n - 1; i++) {
    if (a.child(i).type.name !== 'paragraph' || !isNotes(a.child(i + 1))) continue;
    for (let j = 0; j < n; j++) {
      if (j === i || !b.child(j).eq(a.child(i))) continue;
      // Without the paragraph, both lists are the same blocks in the same order.
      const rest = (d: Node, skip: number) => d.children.filter((_, x) => x !== skip);
      const ra = rest(a, i);
      const rb = rest(b, j);
      const same = ra.every((c, x) => c.eq(rb[x]!));
      if (!same) continue;
      // Where the group is now: its old index, in the list without the paragraph.
      const k = i >= j ? i + 1 : i;
      if (k === j + 1) return null;
      const starts: number[] = [];
      b.forEach((_, off) => starts.push(off));
      const notes = b.child(k);
      const tr = newState.tr.delete(starts[k]!, starts[k]! + notes.nodeSize);
      const at = (k < j ? starts[j]! - notes.nodeSize : starts[j]!) + b.child(j).nodeSize;
      return tr.insert(at, notes);
    }
  }
  return null;
}

const addButton = (p: { run(c: Command): boolean }, pos: number) =>
  reactWidget(
    pos + 1,
    () => (
      <button
        type="button"
        className="glas-columns-add"
        title="Add note"
        aria-label="Add note"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => p.run(addNoteAt(pos))}
      >
        <Plus size={12} />
      </button>
    ),
    { key: `glas-add-${pos}`, side: -1 },
  );

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.provide(actions.addNote, { command: addNoteAt(null) });
    p.provide(
      new Plugin({
        key,
        appendTransaction: followMoved,
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            const kids = writing(state.doc);
            kids.forEach((node, pos, i) => {
              if (node.type.name === 'paragraph') decos.push(addButton(p, pos));
              // A run of groups takes one grid row each; its block spans them all.
              let run = 0;
              if (!isNotes(node)) while (isNotes(i + 1 + run < kids.childCount ? kids.child(i + 1 + run) : null)) run++;
              if (run > 1) decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `grid-row: span ${run}` }));
            });
            return DecorationSet.create(state.doc, decos);
          },
          handleKeyDown: (view, event) => arrow(view, event),
        },
      }),
    );
  });
}

export const styles = `
.glas-columns-notes {
  font-size: 0.9em;
  color: var(--muted-foreground);
  margin-left: 1.25rem;
  padding-left: 0.75rem;
  border-left: 2px solid var(--border);
}
/* A float into the margin, not positioned against its paragraph: a positioned
   paragraph would be the containing block of other modules' overlays. */
.glas-columns-add {
  float: right;
  margin-right: -1.5rem;
  margin-top: 0.25em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  padding: 0;
  line-height: 1;
  color: var(--muted-foreground);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 50%;
  cursor: pointer;
  text-indent: 0;
}
.glas-columns-add:hover { color: var(--foreground); border-color: var(--ring); }
@container mwps-pane (min-width: 960px) {
  :scope { --mwps-text-width: 820px; }
  .ProseMirror {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 3rem;
    align-items: start;
    align-content: start;
    background: linear-gradient(var(--border), var(--border)) 50% 0 / 1px 100% no-repeat;
  }
  /* Automatic placement: a block of notes lands in the row of the block
     before it, and the next block starts a new row. */
  .ProseMirror > :not(.glas-columns-notes) { grid-column: 1; }
  .glas-columns-notes {
    grid-column: 2;
    margin-left: 0;
    border-left: 0;
    padding-left: 0;
  }
}
`;
