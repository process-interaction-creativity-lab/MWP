import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ActionDeclaration, ModuleContext, PaneScope } from 'mwps';
import { Toggle } from 'mwps/ui';
import { isOrdinary, textOf } from 'mwps/text';
import nlp from 'compromise';
import { closeHistory } from 'prosemirror-history';
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useRef } from 'react';

const onKey = valueKey('on', { default: false });

export const actions = {
  pen: { title: 'Toggle Hemingway pen' } satisfies ActionDeclaration,
  off: { title: 'Put the Hemingway pen away', keys: 'Escape' } satisfies ActionDeclaration,
};

const WORD = /[\p{L}\p{N}_]+(?:['’-][\p{L}\p{N}_]+)*/gu;
const AFTER = /[,;:)\]}"'”’»]/;

const verdicts = new Map<string, boolean>();

/** A part-of-speech guess on the word alone: adjective or adverb. */
function isModifier(word: string): boolean {
  const clean = word.toLowerCase().replace(/’/g, "'");
  if (!/^[a-z][a-z'-]*$/.test(clean) || clean.length < 2 || clean === 'ly') return false;
  let v = verdicts.get(clean);
  if (v === undefined) {
    try {
      const doc = nlp(clean);
      v = doc.has('#Adjective') || doc.has('#Adverb');
    } catch {
      v = false;
    }
    verdicts.set(clean, v);
  }
  return v;
}

/** The range to delete if the point is over a modifier word, else null. */
function strikeAt(view: EditorView, x: number, y: number): { from: number; to: number; word: string } | null {
  const hit = view.posAtCoords({ left: x, top: y });
  if (!hit) return null;
  const doc = view.state.doc;
  const $pos = doc.resolve(hit.pos);
  const block = $pos.parent;
  if (!block.isTextblock || !isOrdinary(block)) return null;
  const t = textOf(block, $pos.before());
  const text = t.text;
  for (const m of text.matchAll(WORD)) {
    const a = t.pos(m.index);
    const b = t.pos(m.index + m[0].length, -1);
    if (hit.pos < a || hit.pos > b) continue;
    if (!isModifier(m[0])) return null;
    if (doc.textBetween(a, b, '', '￼') !== m[0]) return null;
    // The pointer must really be on the word, not just nearest to it.
    const ra = view.coordsAtPos(a, 1);
    const rb = view.coordsAtPos(b, -1);
    const sameLine = Math.abs(ra.top - rb.top) < 4;
    const inY = (r: { top: number; bottom: number }) => y >= r.top - 3 && y <= r.bottom + 3;
    if (sameLine ? !(inY(ra) && x >= ra.left - 4 && x <= rb.right + 4) : !(inY(ra) || inY(rb))) return null;
    let end = m.index + m[0].length;
    let start = m.index;
    let e = end;
    while (e < text.length && AFTER.test(text[e])) e++;
    const punct = e > end;
    let w = e;
    while (w < text.length && /\s/.test(text[w])) w++;
    if (w > e) e = w;
    else if (!punct && (e >= text.length || /[.!?]/.test(text[e])) || (punct && e >= text.length)) {
      // Nothing follows but the sentence's end: take the space before instead.
      while (start > 0 && /\s/.test(text[start - 1])) start--;
    }
    end = e;
    return { from: t.pos(start), to: t.pos(end, -1), word: m[0] };
  }
  return null;
}

export function setup(ctx: ModuleContext) {
  const on = ctx.getValue(onKey);
  const views = new Map<EditorView, PaneScope>();
  let down = false;

  ctx.provide(actions.pen, { procedure: () => (on.set((v) => !v), true), active: () => on.get() });
  ctx.with(on, (s) => s.provide(actions.off, { procedure: () => (on.set(false), true) }));

  const Switch = () => {
    const pen = useAction(ctx, actions.pen);
    return (
      <Toggle size="sm" pressed={pen.active} onPressedChange={pen.run}>
        Pen
      </Toggle>
    );
  };
  ctx.provide(ui.toolbar(Switch));

  ctx.each(ctx.panes, (p) => {
    p.provide(
      new Plugin({
        view: (v) => {
          views.set(v, p);
          return { destroy: () => void views.delete(v) };
        },
      }),
    );
  });

  const Layer = () => {
    const active = useStore(on);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const el = ref.current;
      if (!active || !el) return;
      const wheel = (e: Event) => e.preventDefault();
      const up = () => void (down = false);
      el.addEventListener('wheel', wheel, { passive: false });
      window.addEventListener('mouseup', up);
      return () => {
        el.removeEventListener('wheel', wheel);
        window.removeEventListener('mouseup', up);
        down = false;
      };
    }, [active]);

    if (!active) return null;

    const mark = (cls: string, x: number, y: number, size: number, color?: string) => {
      const el = ref.current;
      if (!el) return;
      const d = document.createElement('div');
      d.className = cls;
      Object.assign(d.style, { left: x - size / 2 + 'px', top: y - size / 2 + 'px', width: size + 'px', height: size + 'px' });
      if (color) d.style.background = color;
      el.appendChild(d);
      setTimeout(() => d.remove(), 2200);
    };

    const brush = (x: number, y: number) => {
      mark('hemingway-pen-splash', x, y, 8 + Math.random() * 14, Math.random() > 0.45 ? 'rgba(200,40,40,0.6)' : 'rgba(140,60,180,0.55)');
      const el = ref.current;
      if (!el) return;
      // Look through the layer at what is beneath it.
      el.style.pointerEvents = 'none';
      let view: EditorView | undefined;
      let hit: ReturnType<typeof strikeAt> = null;
      try {
        const under = document.elementFromPoint(x, y);
        // The pane whose editor holds it: posAtDOM throws for any other.
        const holds = (v: EditorView) => {
          try {
            v.posAtDOM(under!, 0);
            return true;
          } catch {
            return false;
          }
        };
        view = under ? [...views.keys()].find(holds) : undefined;
        if (view) hit = strikeAt(view, x, y);
      } finally {
        el.style.pointerEvents = '';
      }
      if (!view || !hit) return;
      const { from, to } = hit;
      if (to > view.state.doc.content.size) return;
      // As the writer's edit on that pane: its history, and the pane the writer's keys go to next.
      const pane = views.get(view)!;
      pane.focus();
      pane.run((state, dispatch) => {
        if (to > state.doc.content.size) return false;
        dispatch?.(closeHistory(state.tr.delete(from, to)));
        return true;
      });
      mark('hemingway-pen-flash', x, y, 14);
    };

    let last: [number, number] | null = null;
    const move = (e: React.MouseEvent) => {
      if (!down) return;
      const [x0, y0] = last ?? [e.clientX, e.clientY];
      const n = Math.max(1, Math.ceil(Math.hypot(e.clientX - x0, e.clientY - y0) / 6));
      for (let i = 1; i <= n; i++) brush(x0 + ((e.clientX - x0) * i) / n, y0 + ((e.clientY - y0) * i) / n);
      last = [e.clientX, e.clientY];
    };

    return (
      <div
        ref={ref}
        className="hemingway-pen-layer"
        onMouseDown={(e) => {
          e.preventDefault();
          down = true;
          last = [e.clientX, e.clientY];
          brush(e.clientX, e.clientY);
        }}
        onMouseMove={move}
        onMouseUp={() => void (down = false)}
        onMouseLeave={() => {
          down = false;
          last = null;
        }}
      />
    );
  };
  ctx.provide(ui.modal(Layer));
}

export const styles = `
.hemingway-pen-layer { position: fixed; inset: 0; z-index: 1000; cursor: crosshair; overflow: hidden; overscroll-behavior: contain; }
.hemingway-pen-splash, .hemingway-pen-flash { position: absolute; border-radius: 50%; pointer-events: none; }
.hemingway-pen-splash { animation: hemingway-pen-fade 2s ease-out forwards; }
.hemingway-pen-flash { background: rgba(220, 30, 30, 0.7); animation: hemingway-pen-pop 0.5s ease-out forwards; }
@keyframes hemingway-pen-fade { from { opacity: 0.8; transform: scale(1); } to { opacity: 0; transform: scale(0.5); } }
@keyframes hemingway-pen-pop { from { opacity: 1; transform: scale(0.6); } to { opacity: 0; transform: scale(2.4); } }
@media (prefers-reduced-motion: reduce) { .hemingway-pen-splash, .hemingway-pen-flash { animation-duration: 0.01s; } }
`;
