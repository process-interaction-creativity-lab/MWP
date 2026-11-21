import { Plugin } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';
import type { Command, EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { MarkType, Node } from 'prosemirror-model';
import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ModuleContext } from 'mwps';
import { Input } from 'mwps/ui';
import { textOf, writing } from 'mwps/text';

// The query is the pane's own and is never saved.
const queryKey = valueKey('query', { default: '' });

export const actions = {
  highlight: { title: 'Highlight selection', keys: 'Mod-Alt-h' },
  find: { title: 'Find in highlights', keys: 'Mod-Alt-f' },
  next: { title: 'Next highlight match', keys: 'Mod-Alt-n' },
  prev: { title: 'Previous highlight match', keys: 'Mod-Alt-p' },
};

// A highlight is content: a mark, so it is saved, undone, copied and shared
// with the text it covers. Not inclusive: typing at its edge isn't highlighted.
export const marks = {
  highlight: {
    inclusive: false,
    parseDOM: [{ tag: 'mark' }],
    toDOM: () => ['mark', { class: 'highlight-search-mark' }, 0] as const,
  },
};

interface Hit {
  from: number;
  to: number;
}

const cache = new WeakMap<Node, Map<string, Hit[]>>();

/** Case-insensitive matches of `query` inside highlighted text, in document
 *  order. A hit lies in one textblock and never crosses an unhighlighted
 *  character; adjacent highlights are one run. Cached per doc and query. */
function hitsFor(doc: Node, rawQuery: string): Hit[] {
  const needle = rawQuery.trim().toLowerCase();
  if (!needle) return [];
  let perDoc = cache.get(doc);
  if (!perDoc) cache.set(doc, (perDoc = new Map()));
  const hit = perDoc.get(needle);
  if (hit) return hit;

  const type: MarkType | undefined = doc.type.schema.marks.highlight;
  const hits: Hit[] = [];
  if (type) {
    writing(doc).descendants((block, pos) => {
      if (!block.isTextblock) return true;
      if (!block.rangeHasMark(0, block.content.size, type)) return false;
      // Highlighted stretches of this block, in document positions.
      const runs: Hit[] = [];
      block.descendants((n, p) => {
        if (!n.isText || !type.isInSet(n.marks)) return;
        const from = pos + 1 + p;
        const last = runs[runs.length - 1];
        if (last && last.to === from) last.to = from + n.nodeSize;
        else runs.push({ from, to: from + n.nodeSize });
      });
      const t = textOf(block, pos);
      const lower = t.text.toLowerCase();
      if (lower.length !== t.text.length) return false; // a case mapping that changes length: skip
      const lit = Array.from({ length: lower.length }, (_, i) => {
        const p = t.pos(i);
        return runs.some((r) => r.from <= p && p < r.to);
      });
      for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, i + needle.length)) {
        let ok = true;
        for (let k = i; k < i + needle.length; k++) if (!lit[k]) ok = false;
        if (ok) hits.push({ from: t.pos(i), to: t.pos(i + needle.length, -1) });
      }
      return false;
    });
  }
  if (perDoc.size > 20) perDoc.clear();
  perDoc.set(needle, hits);
  return hits;
}

const currentOf = (hits: readonly Hit[], state: EditorState) => {
  const { from, to } = state.selection;
  return hits.findIndex((h) => h.from === from && h.to === to);
};

/** Highlight the selection, or clear highlights from it if it touches one. */
const toggleHighlight: Command = (state, dispatch) => {
  const type = state.schema.marks.highlight;
  const { empty, ranges } = state.selection;
  if (!type || empty) return false;
  if (dispatch) {
    const tr = state.tr;
    const touches = ranges.some((r) => state.doc.rangeHasMark(r.$from.pos, r.$to.pos, type));
    for (const r of ranges) {
      if (touches) tr.removeMark(r.$from.pos, r.$to.pos, type);
      else tr.addMark(r.$from.pos, r.$to.pos, type.create());
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const query = p.getValue(queryKey);
    let input: HTMLInputElement | null = null;

    p.provide(
      new Plugin({
        props: {
          decorations: (state) => {
            const hits = hitsFor(state.doc, query.get());
            if (!hits.length) return null;
            const current = currentOf(hits, state);
            return DecorationSet.create(
              state.doc,
              hits.map((h, i) =>
                Decoration.inline(h.from, h.to, {
                  class: i === current ? 'highlight-search-hit highlight-search-current' : 'highlight-search-hit',
                }),
              ),
            );
          },
        },
      }),
    );

    /** Select the next (or previous) hit and scroll to it; greyed with no hits. */
    const step = (dir: 1 | -1): Command => (state, dispatch) => {
      const hits = hitsFor(state.doc, query.get());
      if (!hits.length) return false;
      const { from, to } = state.selection;
      let i: number;
      if (dir === 1) {
        i = hits.findIndex((h) => h.from >= to);
        if (i === -1) i = 0;
      } else {
        i = hits.length - 1;
        while (i >= 0 && hits[i].to > from) i--;
        if (i < 0) i = hits.length - 1;
      }
      dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, hits[i].from, hits[i].to)).scrollIntoView());
      return true;
    };

    p.provide(actions.highlight, { command: toggleHighlight });
    p.provide(actions.next, { command: step(1) });
    p.provide(actions.prev, { command: step(-1) });
    p.provide(actions.find, {
      procedure: () => {
        if (!input) return false;
        input.focus();
        input.select();
        return true;
      },
    });

    const Box = () => {
      const q = useStore(query);
      const next = useAction(p, actions.next);
      const prev = useAction(p, actions.prev);
      const count = useStore(p.state, (s) => {
        if (!s || !q.trim()) return '';
        const hits = hitsFor(s.doc, q);
        const cur = currentOf(hits, s);
        return `${cur === -1 ? '–' : cur + 1} of ${hits.length}`;
      });
      return (
        <span className="highlight-search-bar">
          <Input
            ref={(el: HTMLInputElement | null) => {
              input = el;
            }}
            value={q}
            placeholder="Find in highlights"
            aria-label="Find in highlights"
            className="highlight-search-input"
            onChange={(e) => query.set(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.shiftKey ? prev : next).run();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                p.focus();
              }
            }}
          />
          <span className="highlight-search-count" aria-live="polite">
            {count}
          </span>
        </span>
      );
    };
    p.provide(ui.toolbar(Box));
  });
}

export const styles = `
.ProseMirror mark.highlight-search-mark {
  background: rgba(253, 224, 71, 0.6);
  color: inherit;
  border-radius: 2px;
}
.ProseMirror .highlight-search-hit {
  outline: 1px solid rgba(202, 138, 4, 0.9);
  border-radius: 2px;
}
.ProseMirror .highlight-search-current {
  background: rgba(249, 115, 22, 0.55);
}
.highlight-search-bar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.highlight-search-input {
  width: 11rem;
}
.highlight-search-count {
  min-width: 4.5em;
  font-variant-numeric: tabular-nums;
}
`;
