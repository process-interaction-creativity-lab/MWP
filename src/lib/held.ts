// Held spans, exported by `mwps/text`: spans of a pane's document a module
// keeps by id while the writer goes on editing (a range an AI call will
// replace, targets the writer picked), each moved through every edit and
// dropped once its text changes.

import { Plugin, PluginKey, type Command, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/** A held span as it stands now, and its text, unchanged since it was held. */
export interface HeldSpan {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

interface State {
  readonly spans: ReadonlyMap<string, HeldSpan>;
  readonly decorations: DecorationSet;
}

type Meta = { hold: HeldSpan } | { release: string | null };

export interface HeldSpans {
  /** The pane plugin that keeps the spans (and draws them, given a
   *  class). Provide it on each pane that holds spans: `p.provide(x.plugin)`. */
  readonly plugin: Plugin<State>;
  /** Hold `from`..`to` under `id`, with the text it has now. A stepless
   *  edit, on no undo stack: `p.run(x.hold(id, from, to))`. */
  hold(id: string, from: number, to: number): Command;
  /** Let go of `id`, or of every span. Run it once a call is over,
   *  whatever happened. */
  release(id?: string): Command;
  /** Where `id`'s span is now, or `null` if it was released or its text
   *  changed. Typing at either edge is outside the span; typing inside it,
   *  or deleting it, changes it, and so does typing at an empty span (a
   *  place to append). Marks and attributes don't count. */
  get(state: EditorState, id: string): HeldSpan | null;
  /** Every span still held, in the order they were held. */
  all(state: EditorState): readonly HeldSpan[];
}

const textAt = (state: { doc: EditorState['doc'] }, from: number, to: number) => state.doc.textBetween(from, to, '\n', '\n');

/** Held spans under one plugin key, named `name`: one per kind of span.
 *  With `draw`, each non-empty span is drawn with that class. */
export function heldSpans(name: string, draw?: { class: string }): HeldSpans {
  const key = new PluginKey<State>(name);
  const decorate = (doc: EditorState['doc'], spans: ReadonlyMap<string, HeldSpan>) =>
    draw
      ? DecorationSet.create(
          doc,
          [...spans.values()].filter((s) => s.from < s.to).map((s) => Decoration.inline(s.from, s.to, { class: draw.class }, { id: s.id })),
        )
      : DecorationSet.empty;
  const meta = (m: Meta): Command => (s, dispatch) => {
    dispatch?.(s.tr.setMeta(key, m));
    return true;
  };
  return {
    plugin: new Plugin<State>({
      key,
      state: {
        init: () => ({ spans: new Map(), decorations: DecorationSet.empty }),
        apply(tr, prev) {
          let spans = prev.spans;
          if (tr.docChanged) {
            const mapped = new Map<string, HeldSpan>();
            for (const [id, s] of spans) {
              const from = tr.mapping.map(s.from, 1);
              const to = tr.mapping.map(s.to, -1);
              if (from <= to && textAt(tr, from, to) === s.text) mapped.set(id, { id, from, to, text: s.text });
            }
            spans = mapped;
          }
          const m = tr.getMeta(key) as Meta | undefined;
          if (m && 'hold' in m) {
            const next = new Map(spans);
            next.delete(m.hold.id); // held again: it moves to the end of the order
            spans = next.set(m.hold.id, m.hold);
          }
          if (m && 'release' in m) {
            if (m.release === null) spans = new Map();
            else if (spans.has(m.release)) {
              const next = new Map(spans);
              next.delete(m.release);
              spans = next;
            }
          }
          if (spans === prev.spans) return prev;
          return { spans, decorations: decorate(tr.doc, spans) };
        },
      },
      props: { decorations: (s) => key.getState(s)?.decorations },
    }),
    hold: (id, from, to) => (s, dispatch) => meta({ hold: { id, from, to, text: textAt(s, from, to) } })(s, dispatch),
    release: (id) => meta({ release: id ?? null }),
    get: (state, id) => key.getState(state)?.spans.get(id) ?? null,
    all: (state) => [...(key.getState(state)?.spans.values() ?? [])],
  };
}
