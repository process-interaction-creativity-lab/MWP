import type { MarkSpec, Node } from 'prosemirror-model';
import { idMarks } from 'mwps/text';
import { Plugin, type Command, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { ui, useAction, valueKey } from 'mwps';
import type { ModuleContext } from 'mwps';
import { Button, Toggle } from 'mwps/ui';
import { NotebookPen } from 'mwps/icons';

// A note is a mark on its span: `id` ties the pieces of a span that has been
// split, `body` is the note's text. Marks go with the text through undo,
// copies, splits and deletes, so none of that needs code of its own.
export const marks: { [name: string]: MarkSpec } = {
  margin_notes_note: {
    attrs: { id: {}, body: { default: '' } },
    inclusive: false,
    excludes: '', // notes may overlap
    parseDOM: [
      {
        tag: 'span[data-margin-note]',
        getAttrs: (dom) => ({
          id: (dom as HTMLElement).getAttribute('data-margin-note'),
          body: (dom as HTMLElement).getAttribute('data-body') ?? '',
        }),
      },
    ],
    // With the module off, its styles are gone, so the span shows nothing.
    toDOM: (mark) => [
      'span',
      {
        class: 'margin-notes-span',
        'data-margin-note': mark.attrs.id,
        'data-body': mark.attrs.body,
      },
      0,
    ],
  },
};

const visibleKey = valueKey('visible', { default: true, persist: true });
/** The note whose card has the caret: it and its highlight are tinted together. */
const activeKey = valueKey<string | null>('active', { default: null });

export const actions = {
  add: { title: 'Add margin note', keys: 'Mod-Alt-m' },
  toggle: { title: 'Show margin notes' },
};

const MARGIN = 240; // the margin asked of the page
const CARD_WIDTH = 200;

interface Note {
  id: string;
  body: string;
  /** The first piece of the span; the card follows it. */
  from: number;
  to: number;
}

const notes = idMarks('margin_notes_note');
const cache = new WeakMap<Node, readonly Note[]>();

/** Every note of the document, in document order of its first piece. */
function notesOf(doc: Node): readonly Note[] {
  let hit = cache.get(doc);
  if (!hit) {
    hit = notes.spans(doc).map((s) => ({ id: s.id, body: s.mark.attrs.body, from: s.runs[0].from, to: s.runs[0].to }));
    cache.set(doc, hit);
  }
  return hit;
}

const spanOf = (state: EditorState): { from: number; to: number } | null => {
  const { from, to, empty } = state.selection;
  if (empty || !state.doc.textBetween(from, to, ' ', ' ').trim()) return null;
  return { from, to };
};

/** Write bodies into the document: one undo step for the whole edit. */
const setBodies = (bodies: ReadonlyMap<string, string>): Command => (state, dispatch) => {
  const tr = state.tr;
  for (const [id, body] of bodies) notes.set(tr, id, { body });
  if (!tr.docChanged) return false;
  dispatch?.(tr);
  return true;
};

const removeNote = (id: string): Command => (state, dispatch) => {
  const tr = state.tr;
  if (!notes.remove(tr, id)) return false;
  dispatch?.(tr);
  return true;
};

const decoCache = new WeakMap<Node, DecorationSet>();

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const visible = p.getValue(visibleKey);
    const active = p.getValue(activeKey);

    // What the writer has typed in cards and not yet written to the
    // document: a note's text is written once, when focus leaves the cards
    // (writing it changes the note's mark, which redraws the text around
    // the card, and a card that has focus can't survive that).
    const dirty = new Map<string, string>();
    let editor: EditorView | null = null;
    const commit = () => {
      if (!dirty.size) return;
      const bodies = new Map(dirty);
      dirty.clear();
      if (!p.run(setBodies(bodies))) p.document?.edit(setBodies(bodies));
    };
    p.effect(() => commit); // the pane or module goes away

    // One card per note, a float at the end of the note's first piece: the
    // browser puts it level with that line and below the card before it.
    const cardDom = (id: string, body: string) => {
      const card = document.createElement('span');
      card.className = 'margin-notes-card';
      card.contentEditable = 'false';
      const field = document.createElement('textarea');
      field.rows = 1;
      field.placeholder = 'Note';
      field.ariaLabel = 'Margin note';
      field.dataset.note = id;
      field.value = dirty.get(id) ?? body;
      field.addEventListener('input', () => dirty.set(id, field.value));
      field.addEventListener('focusin', () => active.set(id));
      // Leaving for another card keeps the text for later.
      field.addEventListener('focusout', (e) => {
        const to = e.relatedTarget;
        if (!(to instanceof HTMLTextAreaElement && to.dataset.note)) commit();
        active.set((a) => (a === id && !(to instanceof HTMLTextAreaElement && to.dataset.note) ? null : a));
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'margin-notes-delete';
      del.ariaLabel = 'Delete note';
      del.title = 'Delete note';
      del.textContent = '\u00d7';
      // Pressing it keeps the focus where it is, so the card isn't redrawn under the click.
      del.addEventListener('mousedown', (e) => e.preventDefault());
      del.addEventListener('click', () => {
        dirty.delete(id);
        p.run(removeNote(id));
      });
      card.append(field, del);
      return card;
    };

    const cards = (doc: Node) => {
      let set = decoCache.get(doc);
      if (!set) {
        set = DecorationSet.create(
          doc,
          notesOf(doc).map((n) =>
            Decoration.widget(n.to, () => cardDom(n.id, n.body), { key: n.id, side: 1, stopEvent: () => true }),
          ),
        );
        decoCache.set(doc, set);
      }
      return set;
    };

    p.provide(
      new Plugin({
        view: (view) => {
          editor = view;
          return {
            destroy() {
              editor = null;
            },
          };
        },
        props: {
          attributes: () => ({ class: visible.get() ? 'margin-notes-on' : 'margin-notes-hidden' }),
          decorations: (state) => {
            if (!visible.get()) return null;
            const set = cards(state.doc);
            const id = active.get();
            if (id === null) return set;
            const tint = (notes.find(state.doc, id)?.runs ?? []).map((r) => Decoration.inline(r.from, r.to, { class: 'margin-notes-hot' }));
            return set.add(state.doc, tint);
          },
          transformPasted: notes.transformPasted,
        },
      }),
    );

    const addNote: Command = (state, dispatch) => {
      const span = spanOf(state);
      if (!span || !visible.get()) return false;
      const id = crypto.randomUUID();
      const tr = state.tr.addMark(span.from, span.to, state.schema.marks.margin_notes_note.create({ id, body: '' }));
      if (!tr.docChanged) return false;
      if (dispatch) {
        dispatch(tr);
        // After the click that made the note has finished with focus.
        requestAnimationFrame(() => editor?.dom.querySelector<HTMLTextAreaElement>(`textarea[data-note="${id}"]`)?.focus());
      }
      return true;
    };
    p.provide(actions.add, { command: addNote });
    p.provide(actions.toggle, { procedure: () => (commit(), visible.set((v) => !v), true), active: () => visible.get() });

    const Toggler = () => {
      const toggle = useAction(p, actions.toggle);
      return (
        <Toggle size="sm" pressed={toggle.active} disabled={!toggle.enabled} onPressedChange={toggle.run} title="Margin notes">
          <NotebookPen size={16} /> Notes
        </Toggle>
      );
    };
    p.provide(ui.toolbar(Toggler));

    const AddControl = () => {
      const add = useAction(p, actions.add);
      if (!add.enabled) return null;
      return (
        <Button size="sm" variant="ghost" onClick={add.run}>
          <NotebookPen size={16} /> Add note
        </Button>
      );
    };
    p.provide(ui.selection(AddControl));
  });
}

export const styles = `
.ProseMirror.margin-notes-on .margin-notes-span {
  background: color-mix(in srgb, #facc15 35%, transparent);
}
.ProseMirror.margin-notes-on .margin-notes-hot {
  background: color-mix(in srgb, #facc15 70%, transparent);
}
:scope:has(.ProseMirror.margin-notes-on) {
  --mwps-margin-right: ${MARGIN}px;
}
.margin-notes-card {
  display: block;
  float: right;
  clear: right;
  box-sizing: border-box;
  width: ${CARD_WIDTH}px;
  margin-right: calc(-1 * var(--mwps-margin-right));
  padding: 4px 26px 4px 8px;
  position: relative;
  background: var(--background);
  border: 1px solid var(--border);
  font-family: 'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive;
  font-size: 16px;
  line-height: 1.25;
  text-indent: 0;
}
.margin-notes-card:focus-within {
  border-color: var(--ring);
  background: color-mix(in srgb, #facc15 70%, var(--background));
}
.margin-notes-card textarea {
  display: block;
  width: 100%;
  min-height: 1.25em;
  padding: 0;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  field-sizing: content;
}
.margin-notes-delete {
  position: absolute;
  top: 2px;
  right: 4px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  cursor: pointer;
  opacity: 0;
}
.margin-notes-card:hover .margin-notes-delete,
.margin-notes-card:focus-within .margin-notes-delete {
  opacity: 1;
}
`;
