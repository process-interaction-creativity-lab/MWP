import type { ModuleContext } from 'mwps';
import { isOrdinary, sentencesOf } from 'mwps/text';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const DELAY = 1000;
const CLASS = 'disappearing-sentences-faded';

/** Where the sentence holding the selection's start begins: everything
 *  that ends at or before it is behind the caret. */
function caretStart(state: EditorState): number {
  const $f = state.selection.$from;
  const pos = $f.pos;
  if (!$f.parent.isTextblock || !isOrdinary($f.parent)) return pos;
  const blockStart = $f.start();
  const blockEnd = $f.end();
  let found = pos;
  for (const s of sentencesOf(state.doc)) {
    if (s.start < blockStart || s.end > blockEnd) continue;
    if (s.start <= pos) found = s.start;
  }
  return found;
}

interface Waiting {
  id: number;
  /** Sentences ending at or before this fade when its second is up. */
  target: number;
}

interface Fade {
  /** Sentences ending at or before this are faded (and behind the caret). */
  limit: number;
  /** The caret's sentence start as last seen, mapped through edits. */
  last: number;
  waiting: Waiting[];
  nextId: number;
}

const key = new PluginKey<Fade>('disappearing-sentences');

const plugin = new Plugin<Fade>({
  key,
  state: {
    init: (_c, state) => {
      const cs = caretStart(state);
      return { limit: cs, last: cs, waiting: [], nextId: 1 };
    },
    apply(tr, value, _old, state) {
      let { limit, last, waiting, nextId } = value;
      if (tr.docChanged) {
        limit = tr.mapping.map(limit, -1);
        last = tr.mapping.map(last, -1);
        waiting = waiting.map((w) => ({ ...w, target: tr.mapping.map(w.target, -1) }));
      }
      const fired = tr.getMeta(key) as number | undefined;
      const cs = caretStart(state);
      if (fired !== undefined) {
        const w = waiting.find((x) => x.id === fired);
        if (w) {
          limit = Math.max(limit, Math.min(w.target, cs));
          waiting = waiting.filter((x) => x !== w);
        }
      }
      if (cs < limit) limit = cs;
      if (cs < last) {
        // Back (or edited back) into earlier text: what is ahead is not waiting to fade.
        waiting = waiting.filter((w) => w.target <= cs);
      } else if (cs > last) {
        waiting = [...waiting, { id: nextId++, target: cs }];
      }
      return { limit, last: cs, waiting, nextId };
    },
  },
  props: {
    decorations(state) {
      const fade = key.getState(state);
      if (!fade) return null;
      const bound = Math.min(fade.limit, caretStart(state));
      const decos: Decoration[] = [];
      for (const s of sentencesOf(state.doc)) {
        if (s.end <= bound && s.to > s.from) decos.push(Decoration.inline(s.from, s.to, { class: CLASS }));
      }
      return decos.length ? DecorationSet.create(state.doc, decos) : null;
    },
  },
  view(view) {
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const sync = () => {
      const fade = key.getState(view.state);
      if (!fade) return;
      for (const w of fade.waiting) {
        if (timers.has(w.id)) continue;
        timers.set(
          w.id,
          setTimeout(() => {
            timers.delete(w.id);
            view.dispatch(view.state.tr.setMeta(key, w.id));
          }, DELAY),
        );
      }
    };
    sync();
    return {
      update: sync,
      destroy() {
        for (const t of timers.values()) clearTimeout(t);
        timers.clear();
      },
    };
  },
});

export const styles = `
.${CLASS} {
  opacity: 0.35;
  animation: disappearing-sentences-fade 0.6s ease-out;
}
@keyframes disappearing-sentences-fade {
  from { opacity: 1; }
  to { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  .${CLASS} { animation: none; }
}
`;

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => p.provide(plugin));
}
