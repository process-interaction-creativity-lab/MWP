import type { ModuleContext } from 'mwps';
import { ui, useStore } from 'mwps';
import { useLayoutEffect, useRef } from 'react';

export const moduleType = 'editorReplacement';

const BUBBLE_W = 220;
const MAX_H = 160; // a bubble grows with its text up to this, then scrolls
const SPEED = 40; // px per second, at most, on each axis

type Bubble = { x: number; y: number; vx: number; vy: number };

type Box = { x: number; y: number; w: number; h: number };

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** A starting place over the whole field: the first of 60 random tries that
 *  overlaps no bubble, else the try overlapping them least. */
function startingPlace(w: number, h: number, fw: number, fh: number, others: Box[]): Bubble {
  h = h || 60;
  let best = { x: 0, y: 0 };
  let least = Infinity;
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * Math.max(0, fw - w);
    const y = Math.random() * Math.max(0, fh - h);
    const cost = others.reduce((sum, o) => sum + overlap({ x, y, w, h }, o), 0);
    if (cost < least) {
      least = cost;
      best = { x, y };
      if (cost === 0) break;
    }
  }
  return { ...best, vx: slow(), vy: slow() };
}

const slow = () => (Math.random() < 0.5 ? -1 : 1) * (SPEED / 4 + Math.random() * (SPEED * 3 / 4));

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    // One bubble per top-level block. Every block gets one.
    const bubbles = p.hostPartPanes(() => true);

    const Field = () => {
      const handles = useStore(bubbles.list);
      const field = useRef<HTMLDivElement>(null);
      const els = useRef(new Map<string, HTMLDivElement>());
      const state = useRef(new Map<string, Bubble>()); // view state only: never saved
      const focused = useRef<string | null>(null);
      const ids = useRef<string[]>([]);
      ids.current = handles.map((h) => h.id);

      useLayoutEffect(() => {
        const box = field.current;
        if (!box) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
        let raf = 0;
        let last = 0;

        // Read every size first, then write every position: no layout thrash.
        const frame = (dt: number) => {
          const fw = box.clientWidth;
          const fh = box.clientHeight;
          for (const k of [...state.current.keys()]) if (!ids.current.includes(k)) state.current.delete(k);
          const sizes = ids.current.map((k) => {
            const el = els.current.get(k);
            return { k, w: el?.offsetWidth ?? BUBBLE_W, h: el?.offsetHeight ?? 0 };
          });
          for (const { k, w, h } of sizes) {
            let b = state.current.get(k);
            if (!b) {
              const others = sizes.flatMap((o) => {
                const ob = state.current.get(o.k);
                return ob ? [{ x: ob.x, y: ob.y, w: o.w, h: o.h }] : [];
              });
              b = startingPlace(w, h, fw, fh, others);
              state.current.set(k, b);
            }
            if (dt > 0 && k !== focused.current) {
              b.x += b.vx * dt;
              b.y += b.vy * dt;
            }
            // Keep it inside the field; a bounce reverses the velocity.
            const maxX = Math.max(0, fw - w);
            const maxY = Math.max(0, fh - h);
            if (b.x <= 0) { b.x = 0; b.vx = Math.abs(b.vx); }
            else if (b.x >= maxX) { b.x = maxX; b.vx = -Math.abs(b.vx); }
            if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy); }
            else if (b.y >= maxY) { b.y = maxY; b.vy = -Math.abs(b.vy); }
          }
          for (const { k } of sizes) {
            const b = state.current.get(k)!;
            const el = els.current.get(k);
            if (el) el.style.transform = `translate(${b.x}px, ${b.y}px)`;
          }
        };
        const loop = (t: number) => {
          frame(last ? Math.min((t - last) / 1000, 0.1) : 0);
          last = t;
          raf = requestAnimationFrame(loop);
        };
        const sync = () => {
          cancelAnimationFrame(raf);
          last = 0;
          if (reduce.matches) frame(0);
          else raf = requestAnimationFrame(loop);
        };
        sync();
        reduce.addEventListener('change', sync);
        const ro = new ResizeObserver(() => frame(0));
        ro.observe(box);
        return () => {
          cancelAnimationFrame(raf);
          reduce.removeEventListener('change', sync);
          ro.disconnect();
        };
      }, []);

      // A new bubble is placed at once, before it is first painted.
      const joined = handles.map((h) => h.id).join(' ');
      useLayoutEffect(() => {
        const box = field.current;
        if (!box) return;
        for (const k of ids.current) {
          if (state.current.has(k)) continue;
          const el = els.current.get(k);
          const others = [...state.current].flatMap(([o, ob]) => {
            const oe = els.current.get(o);
            return oe ? [{ x: ob.x, y: ob.y, w: oe.offsetWidth, h: oe.offsetHeight }] : [];
          });
          const b = startingPlace(el?.offsetWidth ?? BUBBLE_W, el?.offsetHeight ?? 0, box.clientWidth, box.clientHeight, others);
          state.current.set(k, b);
          if (el) el.style.transform = `translate(${b.x}px, ${b.y}px)`;
        }
      }, [joined]);

      return (
        <div className="bubbles-view-field" ref={field}>
          {handles.map((h) => (
            <div
              key={h.id}
              className="bubbles-view-bubble"
              ref={(el) => {
                if (el) els.current.set(h.id, el);
                else els.current.delete(h.id);
              }}
              onFocus={() => {
                focused.current = h.id;
              }}
              onBlur={(e) => {
                if (focused.current === h.id && !e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  focused.current = null;
                }
              }}
            >
              {h.element}
            </div>
          ))}
        </div>
      );
    };
    p.provide(ui.editorReplacement(Field));
  });
}

export const styles = `
.bubbles-view-field { position: relative; height: 100%; overflow: hidden; }
.bubbles-view-bubble { position: absolute; left: 0; top: 0; box-sizing: border-box; width: ${BUBBLE_W}px; max-height: ${MAX_H}px; overflow: auto; padding: 4px 10px; background: var(--background); border: 1px solid var(--border); border-radius: 18px; will-change: transform; }
.bubbles-view-bubble:focus-within { border-color: var(--ring); z-index: 1; }
@media (prefers-reduced-motion: reduce) { .bubbles-view-bubble { will-change: auto; } }
`;
