import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DOMSerializer, Fragment, type Mark, type MarkSpec, type MarkType, type Node } from 'prosemirror-model';
import { Plugin, TextSelection, type Command, type EditorState } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';
import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ModuleContext } from 'mwps';
import { reactWidget } from 'mwps/react';
import { idMarks } from 'mwps/text';
import { Button } from 'mwps/ui';
import { Shuffle } from 'mwps/icons';

// A marked span is one mark on its live text. `alts` holds the other
// versions as Fragment JSON (formatting included), so they travel with the
// text through undo, copy, paste and save, and need no code of their own.
export const marks: { [name: string]: MarkSpec } = {
  alt_takes_span: {
    attrs: { id: {}, alts: { default: [] } },
    // Typing at the span's end continues the live text, so retyping all of it
    // stays in the span.
    inclusive: true,
    parseDOM: [
      {
        tag: 'span[data-alt-takes]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          let alts: unknown = [];
          try {
            alts = JSON.parse(el.getAttribute('data-alts') ?? '[]');
          } catch {
            // an unreadable list is no alternatives
          }
          return { id: el.getAttribute('data-alt-takes'), alts: Array.isArray(alts) ? alts : [] };
        },
      },
    ],
    // With the module off its styles are gone: plain text, data kept.
    toDOM: (mark) => [
      'span',
      {
        class: mark.attrs.alts.length ? 'alt-takes-span alt-takes-has' : 'alt-takes-span',
        'data-alt-takes': mark.attrs.id,
        'data-alts': JSON.stringify(mark.attrs.alts),
      },
      0,
    ],
  },
};

export const actions = {
  mark: { title: 'Mark alternatives' },
  removeMark: { title: 'Remove alternatives mark' },
};

const swapsKey = valueKey('swaps', { default: 0 });

const MARK = 'alt_takes_span';
const MARGIN = 260;
const CARD_WIDTH = 150;

interface Run {
  id: string;
  mark: Mark;
  from: number;
  to: number;
  /** The textblock's content end. */
  blockEnd: number;
  /** The live text, without the mark. */
  live: Fragment;
  /** The alternatives shown: every other version. */
  cards: Fragment[];
}

const stripMark = (frag: Fragment, type: MarkType): Fragment => {
  const out: Node[] = [];
  frag.forEach((n) => out.push(n.mark(type.removeFromSet(n.marks))));
  return Fragment.fromArray(out);
};

const parsed = new WeakMap<Mark, (Fragment | null)[]>();
const altsOf = (mark: Mark): (Fragment | null)[] => {
  let list = parsed.get(mark);
  if (!list) {
    list = (mark.attrs.alts as unknown[]).map((json) => {
      try {
        const f = Fragment.fromJSON(mark.type.schema, json);
        return f.size ? f : null;
      } catch {
        return null; // made with a node type this schema doesn't have
      }
    });
    parsed.set(mark, list);
  }
  return list;
};

const takes = idMarks(MARK);

/** The marked span the caret is in or touches, with its versions. */
function runAt(state: EditorState): Run | null {
  const type = state.schema.marks[MARK];
  const head = state.selection.head;
  if (!type || !state.doc.resolve(head).parent.isTextblock) return null;
  for (const span of takes.spans(state.doc)) {
    for (const { from, to } of span.runs) {
      // A caret just before the span's first letter is outside it, as typing there is.
      if (head < from || head > to || (head === from && state.selection.empty)) continue;
      const live = stripMark(state.doc.slice(from, to).content, type);
      const cards = altsOf(span.mark).filter((f): f is Fragment => !!f && !f.eq(live));
      return { id: span.id, mark: span.mark, from, to, blockEnd: state.doc.resolve(from).end(), live, cards };
    }
  }
  return null;
}

const sameRun = (a: Run | null, b: Run | null) =>
  a === b || (!!a && !!b && a.from === b.from && a.to === b.to && a.mark.eq(b.mark) && a.live.eq(b.live));

/** Write the span's next state as one step: its live text (when it changes)
 *  and its alternatives. The mark's attributes can't change in place, so the
 *  mark is taken off and put on again. */
function rewrite(state: EditorState, run: Run, live: Fragment | null, alts: Fragment[]) {
  const tr = state.tr;
  const attrs = { alts: alts.map((a) => a.toJSON()) };
  if (live) {
    const nodes: Node[] = [];
    const mark = run.mark.type.create({ ...run.mark.attrs, ...attrs });
    live.forEach((n) => nodes.push(n.mark(mark.addToSet(n.marks))));
    const offset = Math.max(0, Math.min(state.selection.head - run.from, run.to - run.from));
    tr.replaceWith(run.from, run.to, Fragment.fromArray(nodes));
    tr.setSelection(TextSelection.create(tr.doc, run.from + Math.min(offset, live.size)));
  } else {
    takes.set(tr, run.id, attrs);
  }
  return tr;
}

const withRun = (id: string, fn: (state: EditorState, run: Run, dispatch?: (tr: ReturnType<typeof rewrite>) => void) => boolean): Command =>
  (state, dispatch) => {
    const run = runAt(state);
    return !!run && run.id === id && fn(state, run, dispatch);
  };

/** Make card `i` the live text; the old live text takes its place. */
const swap = (id: string, i: number, onDone: () => void): Command =>
  withRun(id, (state, run, dispatch) => {
    const picked = run.cards[i];
    if (!picked) return false;
    if (dispatch) {
      const alts = run.cards.slice();
      alts[i] = run.live;
      dispatch(rewrite(state, run, picked, alts));
      onDone();
    }
    return true;
  });

const deleteCard = (id: string, i: number): Command =>
  withRun(id, (state, run, dispatch) => {
    if (!run.cards[i]) return false;
    dispatch?.(rewrite(state, run, null, run.cards.filter((_, j) => j !== i)));
    return true;
  });

const textFragment = (state: EditorState, text: string): Fragment | null => {
  const { hard_break: br } = state.schema.nodes;
  const nodes: Node[] = [];
  text.split('\n').forEach((line, i) => {
    if (i && br) nodes.push(br.create());
    else if (i) nodes.push(state.schema.text(' '));
    if (line) nodes.push(state.schema.text(line));
  });
  const frag = Fragment.fromArray(nodes);
  return frag.textBetween(0, frag.size, '\n', '\n').trim() ? frag : null;
};

const addCard = (id: string, text: string): Command =>
  withRun(id, (state, run, dispatch) => {
    const frag = textFragment(state, text);
    if (!frag || frag.eq(run.live) || run.cards.some((c) => c.eq(frag))) return false;
    dispatch?.(rewrite(state, run, null, [...run.cards, frag]));
    return true;
  });

const removeMark: Command = (state, dispatch) => {
  const run = runAt(state);
  if (!run) return false;
  if (dispatch) {
    const tr = state.tr;
    takes.remove(tr, run.id);
    dispatch(tr);
  }
  return true;
};

const markSelection: Command = (state, dispatch) => {
  const type = state.schema.marks[MARK];
  const { $from, $to, from, to, empty } = state.selection;
  if (!type || empty || !$from.sameParent($to) || !$from.parent.isTextblock) return false;
  if (!$from.parent.type.allowsMarkType(type) || state.doc.rangeHasMark(from, to, type)) return false;
  if (!state.doc.textBetween(from, to, ' ', ' ').trim()) return false;
  if (dispatch) dispatch(state.tr.addMark(from, to, type.create({ id: crypto.randomUUID(), alts: [] })));
  return true;
};

const keepFocus = (e: { preventDefault(): void }) => e.preventDefault();

function Version({ fragment }: { fragment: Fragment }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.replaceChildren(DOMSerializer.fromSchema(fragment.firstChild!.type.schema).serializeFragment(fragment));
  }, [fragment]);
  return <div className="alt-takes-text" ref={ref} />;
}

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const swaps = p.getValue(swapsKey);

    // One row for the span the caret is in: floated into the margin level
    // with the span (the pane scrolls sideways when the margin doesn't fit).
    const Row = () => {
      const run = useStore(p.state, (s) => (s ? runAt(s) : null), sameRun);
      const tick = useStore(swaps);
      // The caret is in one pane at a time; another pane keeps its selection.
      const focused = useStore(p.isLastFocused);
      const scroller = useRef<HTMLDivElement>(null);
      const [adding, setAdding] = useState(false);
      const present = run !== null && focused;

      useLayoutEffect(() => {
        if (scroller.current) scroller.current.scrollLeft = 0;
      }, [tick]);

      // The wheel scrolls the row, not the page.
      useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
          if (el.scrollWidth <= el.clientWidth) return;
          el.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          e.preventDefault();
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
      }, [present]);

      if (!run || !focused) return null;
      const finishAdding = () => {
        setAdding(false);
        p.focus();
      };
      return (
        <div className="alt-takes-row alt-takes-wide" data-alt-takes-row="wide">
          <div className="alt-takes-cards" ref={scroller}>
            {run.cards.map((card, i) => (
              <div className="alt-takes-card" key={i}>
                <button
                  type="button"
                  className="alt-takes-pick"
                  title="Use this version"
                  onMouseDown={keepFocus}
                  onClick={() => p.run(swap(run.id, i, () => swaps.set((n) => n + 1)))}
                >
                  <Version fragment={card} />
                </button>
                <button
                  type="button"
                  className="alt-takes-delete"
                  aria-label="Delete alternative"
                  title="Delete alternative"
                  onMouseDown={keepFocus}
                  onClick={() => p.run(deleteCard(run.id, i))}
                >
                  {'×'}
                </button>
              </div>
            ))}
            {adding ? (
              <div className="alt-takes-card alt-takes-new">
                <textarea
                  autoFocus
                  rows={2}
                  aria-label="New alternative"
                  placeholder="Another way"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      finishAdding();
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      p.run(addCard(run.id, e.currentTarget.value));
                      finishAdding();
                    }
                  }}
                  onBlur={(e) => {
                    if (!e.currentTarget.value.trim()) setAdding(false);
                  }}
                />
              </div>
            ) : (
              <button type="button" className="alt-takes-card alt-takes-plus" aria-label="Add alternative" title="Add alternative" onClick={() => setAdding(true)}>
                +
              </button>
            )}
          </div>
          <Button size="sm" variant="ghost" onMouseDown={keepFocus} onClick={() => p.run(removeMark)}>
            Remove mark
          </Button>
        </div>
      );
    };

    p.provide(
      new Plugin({
        props: {
          decorations: (state) => {
            const run = runAt(state);
            if (!run) return null;
            return DecorationSet.create(state.doc, [
              reactWidget(run.to, Row, { key: `alt-takes-wide-${run.id}`, side: 1 }),
            ]);
          },
          transformPasted: takes.transformPasted,
        },
      }),
    );

    p.provide(actions.mark, { command: markSelection });
    p.provide(actions.removeMark, { command: removeMark });

    const MarkControl = () => {
      const mark = useAction(p, actions.mark);
      if (!mark.enabled) return null;
      return (
        <Button size="sm" variant="ghost" onClick={mark.run}>
          <Shuffle size={16} /> Mark alternatives
        </Button>
      );
    };
    p.provide(ui.selection(MarkControl));
  });
}

export const styles = `
.alt-takes-span {
  border-bottom: 1px dotted var(--muted-foreground);
}
.alt-takes-span.alt-takes-has {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  border-bottom: 1px solid var(--primary);
}
.alt-takes-row {
  box-sizing: border-box;
  text-indent: 0;
  text-align: left;
  white-space: normal;
}
:scope:has(.alt-takes-span) {
  --mwps-margin-right: ${MARGIN}px;
}
.alt-takes-wide {
  display: block;
  float: right;
  clear: right;
  width: ${MARGIN - 20}px;
  margin-right: calc(-1 * var(--mwps-margin-right));
}
.alt-takes-cards {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  overscroll-behavior: contain;
  padding-bottom: 4px;
}
.alt-takes-card {
  position: relative;
  flex: 0 0 ${CARD_WIDTH}px;
  box-sizing: border-box;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 0.85em;
  line-height: 1.3;
}
.alt-takes-pick {
  display: block;
  width: 100%;
  padding: 4px 22px 4px 6px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.alt-takes-pick:hover { background: var(--muted); }
.alt-takes-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
  white-space: pre-wrap;
}
.alt-takes-delete {
  position: absolute;
  top: 2px;
  right: 3px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  cursor: pointer;
}
.alt-takes-plus {
  min-height: 2.2em;
  cursor: pointer;
}
.alt-takes-plus:hover { background: var(--muted); }
.alt-takes-new:focus-within { border-color: var(--ring); }
.alt-takes-new textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  padding: 4px 6px;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: inherit;
  font: inherit;
}
`;
