import { authorOf, ui, useAction, valueKey } from 'mwps';
import type { ActionDeclaration, ModuleContext, PaneScope } from 'mwps';
import { Toggle } from 'mwps/ui';
import { isOrdinary, splitWords, textOf, writing } from 'mwps/text';
import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { Command } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { EditorView } from 'prosemirror-view';

const enabledKey = valueKey('enabled', { default: true, persist: true });
const heavyKey = valueKey<Heavy | null>('heavy', { default: null });

export const actions = {
  toggle: { title: 'Toggle heavy words' } satisfies ActionDeclaration,
};

interface Heavy {
  from: number;
  to: number;
  word: string;
  /** Move count: alternates the animation so it replays on every move. */
  n: number;
}

const FIRST_DELAY = 1000;
const STEP_DELAY = 1000;
const REST_DELAY = 5000;
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

/** A random word of two or more characters from the document's first textblock. */
function pickWord(doc: Node): Omit<Heavy, 'n'> | null {
  let found: Omit<Heavy, 'n'> | null = null;
  let seen = false;
  writing(doc).descendants((node, pos) => {
    if (seen) return false;
    if (!node.isTextblock) return true;
    seen = true;
    const t = textOf(node, pos);
    const cands: Omit<Heavy, 'n'>[] = [];
    for (const m of t.text.matchAll(WORD)) {
      if (m[0].length < 2) continue;
      const from = t.pos(m.index);
      const to = t.pos(m.index + m[0].length, -1);
      // Skip words broken up by inline atoms or notes.
      if (doc.textBetween(from, to, '', '￼') !== m[0]) continue;
      cands.push({ from, to, word: m[0] });
    }
    if (cands.length) found = cands[Math.floor(Math.random() * cands.length)];
    return false;
  });
  return found;
}

/** Where the word should land: the start of a word on the next visual line down. */
function findTarget(view: EditorView, h: Heavy): number | null {
  const rect = view.coordsAtPos(h.from);
  const lh = rect.bottom - rect.top;
  if (!(lh > 0)) return null;
  const mid = (rect.top + rect.bottom) / 2;
  for (let k = 0.6; k <= 4.001; k += 0.4) {
    const hit = view.posAtCoords({ left: rect.left, top: mid + lh * k });
    if (!hit) continue;
    if (view.coordsAtPos(hit.pos).top <= rect.top + lh * 0.5) continue;
    const $pos = view.state.doc.resolve(hit.pos);
    if (!$pos.parent.isTextblock || !isOrdinary($pos.parent)) return null;
    const t = textOf($pos.parent, $pos.before());
    let best: number | null = null;
    for (const w of splitWords(t.text)) {
      const p = t.pos(w.from);
      if (best === null || Math.abs(p - hit.pos) < Math.abs(best - hit.pos)) best = p;
    }
    return best;
  }
  return null;
}

/** Lift the word with one neighbouring space and put it, with a space, at `target`. */
function moveWord(h: Heavy, target: number, out: { range?: [number, number] }): Command {
  return (state, dispatch) => {
    const { doc, schema } = state;
    if (h.to > doc.content.size || doc.textBetween(h.from, h.to, '', '￼') !== h.word) return false;
    const space = (a: number, b: number) =>
      a >= 0 && b <= doc.content.size && doc.textBetween(a, b, '', '￼') === ' ';
    let delFrom = h.from;
    let delTo = h.to;
    if (space(h.to, h.to + 1)) delTo++;
    else if (space(h.from - 1, h.from)) delFrom--;
    if (target >= delFrom && target <= delTo) return false;
    if (!doc.resolve(target).parent.inlineContent) return false;
    if (!dispatch) return true;
    const marks = doc.resolve(target).marks();
    const tr = state.tr.delete(delFrom, delTo);
    const at = tr.mapping.map(target, 1);
    if (!tr.doc.resolve(at).parent.inlineContent) return false;
    tr.insert(at, schema.text(h.word + ' ', marks));
    out.range = [at, at + h.word.length];
    dispatch(tr);
    return true;
  };
}

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p: PaneScope) => {
    const enabled = p.getValue(enabledKey);
    const heavy = p.getValue(heavyKey);
    let view: EditorView | null = null;
    // Whether this pane's cycle is running (it is the last focused and on).
    let running = false;
    // Counts edits to the pane's document by anyone but this module: the
    // writer here or in another pane, or another module.
    const outside = new PluginKey<number>('heavy-words-outside');

    const freeze = () => {
      heavy.set(null);
      schedule(pick, REST_DELAY);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    function schedule(fn: () => void, ms: number) {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    }
    function pick() {
      const state = p.state.get();
      const w = state && pickWord(state.doc);
      if (!w) return schedule(pick, REST_DELAY);
      heavy.set({ ...w, n: 0 });
      schedule(tick, STEP_DELAY);
    }
    function tick() {
      const h = heavy.get();
      if (!h || !view || !p.document) return freeze();
      const target = findTarget(view, h);
      if (target === null) return freeze();
      const out: { range?: [number, number] } = {};
      if (!p.document.edit(moveWord(h, target, out)) || !out.range) return freeze();
      heavy.set({ from: out.range[0], to: out.range[1], word: h.word, n: h.n + 1 });
      schedule(tick, STEP_DELAY);
    }

    p.provide(
      new Plugin({
        key: outside,
        state: {
          init: () => 0,
          apply: (tr, n) => (tr.docChanged && authorOf(tr) !== ctx.id ? n + 1 : n),
        },
        view(v) {
          view = v;
          return {
            // Someone else edited: the word stays where it is, as prose.
            update(v, prev) {
              if (running && outside.getState(v.state) !== outside.getState(prev)) freeze();
            },
            destroy() {
              if (view === v) view = null;
            },
          };
        },
        props: {
          handleDOMEvents: {
            // Clicking the heavy word stops it, without moving the caret.
            mousedown: (_v, ev) => {
              if (!heavy.get() || !(ev.target instanceof Element) || !ev.target.closest('.heavy-words-word')) {
                return false;
              }
              ev.preventDefault();
              freeze();
              return true;
            },
          },
          decorations(state) {
            const h = heavy.get();
            if (!h || h.to > state.doc.content.size) return null;
            if (state.doc.textBetween(h.from, h.to, '', '￼') !== h.word) return null;
            return DecorationSet.create(state.doc, [
              Decoration.inline(h.from, h.to, { class: `heavy-words-word heavy-words-${h.n % 2 ? 'b' : 'a'}` }),
            ]);
          },
        },
      }),
    );

    p.provide(actions.toggle, {
      procedure: () => (enabled.set((v) => !v), true),
      active: () => enabled.get(),
    });

    const Button = () => {
      const toggle = useAction(p, actions.toggle);
      return (
        <Toggle size="sm" pressed={toggle.active} onPressedChange={toggle.run} aria-label="Heavy words">
          Heavy
        </Toggle>
      );
    };
    p.provide(ui.toolbar(Button));

    // The cycle runs while this pane is the last focused and enabled.
    p.with(p.isLastFocused, (s) =>
      s.with(enabled, (s) =>
        s.effect(() => {
          running = true;
          heavy.set(null);
          schedule(pick, FIRST_DELAY);
          return () => {
            running = false;
            clearTimeout(timer);
            heavy.set(null);
          };
        }),
      ),
    );
  });
}

export const styles = `
.heavy-words-word {
  color: #dc2626;
  font-weight: bold;
  display: inline-block;
  cursor: pointer;
}
.heavy-words-word:hover { background: rgba(220, 38, 38, 0.12); }
.heavy-words-a { animation: heavy-words-drop-a 0.7s ease-out; }
.heavy-words-b { animation: heavy-words-drop-b 0.7s ease-out; }
@keyframes heavy-words-drop-a {
  from { transform: translateY(-0.9em); opacity: 0.4; }
  to { transform: none; opacity: 1; }
}
@keyframes heavy-words-drop-b {
  from { transform: translateY(-0.9em); opacity: 0.4; }
  to { transform: none; opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .heavy-words-a, .heavy-words-b { animation: none; }
}
`;
