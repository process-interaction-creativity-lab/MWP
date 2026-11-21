import type { ModuleContext, PartHandle } from 'mwps';
import { writing } from 'mwps/text';
import { ui, useAction, useStore, valueKey } from 'mwps';
import { Button } from 'mwps/ui';
import { Plus, X } from 'mwps/icons';
import type { Node as PMNode } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';
import { useLayoutEffect, useReducer, useRef, useState } from 'react';

export const moduleType = 'editorReplacement';

export const actions = {
  toggle: { title: 'Toggle Cards View', keys: 'Mod-Alt-k' },
  newCard: { title: 'New card' },
  deleteCard: { title: 'Delete card' },
};

const onKey = valueKey<boolean>('on', { default: false, persist: true });

const CARD_W = 280;
const CARD_H = 220;
const GAP = 16;
const HEAD_H = 30;
const EDGE = 40; // px from the canvas edge where dragging starts to scroll
const MAX_SCROLL = 18; // px per frame at the very edge

/** On the host pane: move the block at `from` to just before `to` (the end
 *  when null). One delete and one insert of equal content, on no history. */
const moveBlock =
  (from: number, to: number | null): Command =>
  (state, dispatch) => {
    const node = state.doc.nodeAt(from);
    if (!node) return false;
    const end = from + node.nodeSize;
    const target = to ?? writing(state.doc).content.size;
    if (target === from || target === end) return false;
    if (dispatch) {
      const sel = state.selection;
      const tr = state.tr.delete(from, end);
      const at = target > from ? target - node.nodeSize : target;
      tr.insert(at, node);
      if (sel instanceof TextSelection && sel.from >= from && sel.to <= end) {
        const shift = at - from;
        tr.setSelection(TextSelection.between(tr.doc.resolve(sel.anchor + shift), tr.doc.resolve(sel.head + shift)));
      }
      dispatch(tr.setMeta('addToHistory', false));
    }
    return true;
  };

/** On the host pane: delete the block at `at`, as one undo step; the
 *  writing's last block becomes an empty paragraph instead. */
const deleteBlock =
  (at: number): Command =>
  (state, dispatch) => {
    const node = state.doc.nodeAt(at);
    if (!node) return false;
    const end = at + node.nodeSize;
    const last = writing(state.doc).childCount === 1;
    const empty = state.schema.nodes.paragraph?.create();
    if (last && !empty) return false;
    dispatch?.(last ? state.tr.replaceWith(at, end, empty!) : state.tr.delete(at, end));
    return true;
  };

/** On the host pane: an empty paragraph at `at`. */
const insertEmpty =
  (at: (doc: PMNode) => number): Command =>
  (state, dispatch) => {
    const empty = state.schema.nodes.paragraph?.createAndFill();
    if (!empty) return false;
    dispatch?.(state.tr.insert(at(state.doc), empty));
    return true;
  };

type Pos = { x: number; y: number };
type Size = { w: number; h: number };
const DEFAULT_SIZE: Size = { w: CARD_W, h: CARD_H };

/** Reading order: rows top to bottom (a card joins a row when its top is
 *  within half the row's first card's height of that card's top), left to
 *  right within a row. */
function readingOrder(pos: Map<string, Pos>, size: (k: string) => Size, ids: readonly string[]): string[] {
  const cards = ids.filter((k) => pos.has(k)).sort((a, b) => pos.get(a)!.y - pos.get(b)!.y);
  const rows: string[][] = [];
  for (const k of cards) {
    const row = rows.find((r) => Math.abs(pos.get(r[0]!)!.y - pos.get(k)!.y) < size(r[0]!).h / 2);
    if (row) row.push(k);
    else rows.push([k]);
  }
  return rows.flatMap((r) => r.sort((a, b) => pos.get(a)!.x - pos.get(b)!.x));
}

/** Make room around a card that grew: a card it now overlaps moves right
 *  if it sits in the grown card's row, else down, just far enough, and so on
 *  for any card that one then overlaps. Nothing else moves. */
function pushFrom(first: string, pos: Map<string, Pos>, size: (k: string) => Size): void {
  const queue = [first];
  for (let n = 0; queue.length && n < 500; n++) {
    const k = queue.shift()!;
    const p = pos.get(k);
    if (!p) continue;
    const s = size(k);
    for (const [j, q] of pos) {
      if (j === k) continue;
      const t = size(j);
      const overlaps = p.x < q.x + t.w + GAP && q.x < p.x + s.w + GAP && p.y < q.y + t.h + GAP && q.y < p.y + s.h + GAP;
      if (!overlaps) continue;
      const sameRow = q.y < p.y + s.h / 2 && q.x >= p.x;
      pos.set(j, sameRow ? { x: p.x + s.w + GAP, y: q.y } : { x: q.x, y: Math.max(q.y, p.y + s.h + GAP) });
      queue.push(j);
    }
  }
}

/** Cards in document order, packed into rows as wide as the canvas. */
function flowLayout(ids: readonly string[], size: (k: string) => Size, width: number): Map<string, Pos> {
  const out = new Map<string, Pos>();
  let x = GAP;
  let y = GAP;
  let rowH = 0;
  for (const k of ids) {
    const { w, h } = size(k);
    if (x > GAP && x + w + GAP > width) {
      x = GAP;
      y += rowH + GAP;
      rowH = 0;
    }
    out.set(k, { x, y });
    x += w + GAP;
    rowH = Math.max(rowH, h);
  }
  return out;
}

/** The nearest slot beside `prev` that overlaps no card: its right first, then
 *  below, then further out. Slots inside the canvas width are tried before any
 *  past its edge. */
function freeSlotBeside(prev: Pos, pos: Map<string, Pos>, size: (k: string) => Size, width: number): Pos {
  const slots: [number, number][] = [];
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) if (i || j) slots.push([i, j]);
  slots.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[1] - b[1]);
  const free = (x: number, y: number) =>
    [...pos].every(([k, q]) => {
      const s = size(k);
      return q.x + s.w + GAP <= x || x + CARD_W + GAP <= q.x || q.y + s.h + GAP <= y || y + CARD_H + GAP <= q.y;
    });
  for (const inside of [true, false]) {
    for (const [i, j] of slots) {
      const x = prev.x + i * (CARD_W + GAP);
      const y = prev.y + j * (CARD_H + GAP);
      if (inside && x + CARD_W + GAP > width) continue;
      if (free(x, y)) return { x, y };
    }
  }
  return { x: prev.x, y: prev.y + 7 * (CARD_H + GAP) };
}

type HeadHandlers = {
  onPointerDown(e: React.PointerEvent<HTMLDivElement>): void;
  onPointerMove(e: React.PointerEvent<HTMLDivElement>): void;
  onPointerUp(): void;
  onPointerCancel(): void;
};

function Card(props: { handle: PartHandle; index: number; pos: Pos; size: Size; head: HeadHandlers; onFocus(): void; onDelete(): void }) {
  const { handle, index, pos, size, head } = props;
  return (
    <div
      className="cards-view-card"
      data-card={handle.id}
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      onFocusCapture={props.onFocus}
    >
      <div className="cards-view-head" style={{ height: HEAD_H }} {...head}>
        <span className="cards-view-num">{index + 1}</span>
        <button
          type="button"
          className="cards-view-delete"
          aria-label="Delete card"
          title="Delete card"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={props.onDelete}
        >
          <X />
        </button>
      </div>
      <div className="cards-view-body">{handle.element}</div>
    </div>
  );
}

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const on = p.getValue(onKey);
    p.provide(actions.toggle, { procedure: () => (on.set((v) => !v), true), active: () => on.get() });
    p.provide(ui.tabMenu(actions.toggle));

    // The cards show only while the switch is on; off, the pane is the plain editor.
    p.with(on, (s) => {
      const cards = s.hostPartPanes((node) => node.type.name !== 'horizontal_rule');
      let focused: string | null = null; // the card the writer was last in
      let pending: string | null = null; // a new card that should get the caret once drawn

      s.provide(actions.newCard, {
        procedure: () => {
          const handles = cards.list.get();
          const after = handles.find((h) => h.id === focused);
          const before = new Set(handles.map((h) => h.id));
          const ok = p.run(
            insertEmpty((doc) => (after ? after.part + (doc.nodeAt(after.part)?.nodeSize ?? 0) : writing(doc).content.size)),
          );
          if (ok) pending = cards.list.get().find((h) => !before.has(h.id))?.id ?? null;
          return ok;
        },
      });
      s.provide(ui.tabMenu(actions.newCard));
      s.provide(actions.deleteCard, {
        command: (state, dispatch) => {
          const card = cards.list.get().find((h) => h.id === focused);
          return card ? deleteBlock(card.part)(state, dispatch) : false;
        },
      });

      const Canvas = () => {
        const handles = useStore(cards.list);
        const newCard = useAction(p, actions.newCard);
        const deleteCard = useAction(p, actions.deleteCard);
        const box = useRef<HTMLDivElement>(null);
        const [width, setWidth] = useState(0);
        const [, redraw] = useReducer((n: number) => n + 1, 0);
        const positions = useRef(new Map<string, Pos>());
        // Each card's size, as the writer left it with its resize handle.
        const sizes = useRef(new Map<string, Size>());
        const sizeOf = (k: string) => sizes.current.get(k) ?? DEFAULT_SIZE;
        const sheet = useRef<HTMLDivElement>(null);
        const lastCols = useRef(0);
        const lastOrder = useRef('');
        const expectedOrder = useRef('');
        const drag = useRef<{
          id: string;
          cx0: number; cy0: number; // pointer at start
          cx: number; cy: number; // pointer now
          x0: number; y0: number; // card at start
          sx: number; sy: number; // canvas scroll at start
        } | null>(null);
        const frame = useRef(0);

        useLayoutEffect(() => {
          const el = box.current;
          if (!el) return;
          const ro = new ResizeObserver(() => setWidth(el.clientWidth));
          ro.observe(el);
          setWidth(el.clientWidth);
          // A card resized by the writer: remember its size, and make room.
          const cardsRo = new ResizeObserver((entries) => {
            let changed = false;
            for (const e of entries) {
              const card = e.target as HTMLElement;
              const id = card.dataset.card;
              if (!id) continue;
              const w = Math.round(card.offsetWidth);
              const h = Math.round(card.offsetHeight);
              const was = sizeOf(id);
              if (w === was.w && h === was.h) continue;
              sizes.current.set(id, { w, h });
              if (w > was.w || h > was.h) pushFrom(id, positions.current, sizeOf);
              changed = true;
            }
            // The others stay where the writer put them, unless the card now
            // overlaps them: then they are pushed out of its way.
            if (changed) redraw();
          });
          const watch = () => sheet.current?.querySelectorAll<HTMLElement>(':scope > .cards-view-card').forEach((c) => cardsRo.observe(c));
          watch();
          const mo = new MutationObserver(watch);
          if (sheet.current) mo.observe(sheet.current, { childList: true });
          return () => {
            ro.disconnect();
            cardsRo.disconnect();
            mo.disconnect();
            cancelAnimationFrame(frame.current);
            drag.current = null;
          };
        }, []);

        // A new card the action made gets the caret once it is drawn.
        useLayoutEffect(() => {
          if (!pending) return;
          const h = handles.find((c) => c.id === pending);
          if (!h) return;
          pending = null;
          h.focus();
        }, [handles]);

        const ids = handles.map((h) => h.id);
        const pos = positions.current;
        // Laid out afresh when the canvas's width changes by a card's worth.
        const cols = Math.max(1, Math.floor((width - GAP) / (CARD_W + GAP)));
        const joined = ids.join(' ');
        const sameSet = lastOrder.current !== '' && ids.length === lastOrder.current.split(' ').length && ids.every((k) => lastOrder.current.split(' ').includes(k));
        if (lastCols.current !== cols || (sameSet && joined !== lastOrder.current && joined !== expectedOrder.current)) {
          // Another width, or the blocks were reordered from elsewhere: lay out afresh.
          lastCols.current = cols;
          pos.clear();
        }
        lastOrder.current = joined;
        for (const k of [...pos.keys()]) if (!ids.includes(k)) pos.delete(k);
        for (const k of [...sizes.current.keys()]) if (!ids.includes(k)) sizes.current.delete(k);
        if (pos.size === 0) for (const [k, q] of flowLayout(ids, sizeOf, width)) pos.set(k, q);
        ids.forEach((k, i) => {
          if (pos.has(k)) return;
          const prev = i > 0 ? pos.get(ids[i - 1]!) : undefined;
          pos.set(k, prev ? freeSlotBeside(prev, pos, sizeOf, width) : { x: GAP, y: GAP });
        });

        // Document order follows reading order, live, moving only the dragged block.
        const reorder = (id: string) => {
          const list = cards.list.get();
          const order = readingOrder(positions.current, sizeOf, list.map((h) => h.id));
          if (order.every((k, i) => k === list[i]!.id)) return;
          const i = order.indexOf(id);
          const from = list.find((h) => h.id === id);
          const next = i >= 0 && i < order.length - 1 ? list.find((h) => h.id === order[i + 1]) : undefined;
          if (!from) return;
          expectedOrder.current = order.join(' ');
          p.run(moveBlock(from.part, next ? next.part : null));
        };

        // Card position from the pointer and the canvas's scroll, so a drag
        // keeps up while the canvas scrolls under it.
        const follow = () => {
          const d = drag.current;
          const el = box.current;
          if (!d || !el) return;
          positions.current.set(d.id, {
            x: Math.max(0, d.x0 + (d.cx - d.cx0) + (el.scrollLeft - d.sx)),
            y: Math.max(0, d.y0 + (d.cy - d.cy0) + (el.scrollTop - d.sy)),
          });
          redraw();
          reorder(d.id);
        };
        const tick = () => {
          const d = drag.current;
          const el = box.current;
          if (!d || !el) return;
          const r = el.getBoundingClientRect();
          const speed = (dist: number) => Math.ceil((Math.min(EDGE, EDGE - dist) / EDGE) * MAX_SCROLL);
          let dx = 0;
          let dy = 0;
          if (d.cx < r.left + EDGE) dx = -speed(d.cx - r.left);
          else if (d.cx > r.right - EDGE) dx = speed(r.right - d.cx);
          if (d.cy < r.top + EDGE) dy = -speed(d.cy - r.top);
          else if (d.cy > r.bottom - EDGE) dy = speed(r.bottom - d.cy);
          if (dx || dy) {
            el.scrollLeft += dx;
            el.scrollTop += dy;
            follow();
          }
          frame.current = requestAnimationFrame(tick);
        };
        const stop = () => {
          drag.current = null;
          cancelAnimationFrame(frame.current);
        };

        const headFor = (id: string): HeadHandlers => ({
          onPointerDown: (e) => {
            if (e.button !== 0) return;
            const el = box.current;
            const start = positions.current.get(id);
            if (!el || !start) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              id,
              cx0: e.clientX, cy0: e.clientY, cx: e.clientX, cy: e.clientY,
              x0: start.x, y0: start.y, sx: el.scrollLeft, sy: el.scrollTop,
            };
            cancelAnimationFrame(frame.current);
            frame.current = requestAnimationFrame(tick);
          },
          onPointerMove: (e) => {
            const d = drag.current;
            if (!d || d.id !== id) return;
            d.cx = e.clientX;
            d.cy = e.clientY;
            follow();
          },
          onPointerUp: stop,
          onPointerCancel: stop,
        });

        const maxX = Math.max(0, ...[...pos].map(([k, q]) => q.x + sizeOf(k).w)) + GAP;
        const maxY = Math.max(0, ...[...pos].map(([k, q]) => q.y + sizeOf(k).h)) + GAP;

        return (
          <div className="cards-view-canvas" ref={box}>
            <div className="cards-view-bar">
              <Button
                variant="secondary"
                size="sm"
                disabled={!newCard.enabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => newCard.run()}
              >
                <Plus />
                New card
              </Button>
            </div>
            <div className="cards-view-sheet" ref={sheet} style={{ width: Math.max(maxX, width - 2), height: maxY }}>
              {/* Drawn in a fixed order: a reorder that moved a card's DOM node
                  would drop the drag's pointer capture. */}
              {handles
                .map((h, i) => [h, i] as const)
                .sort(([a], [b]) => (a.id < b.id ? -1 : 1))
                .map(([h, i]) => (
                <Card
                  key={h.id}
                  handle={h}
                  index={i}
                  pos={pos.get(h.id)!}
                  size={sizeOf(h.id)}
                  head={headFor(h.id)}
                  onFocus={() => {
                    focused = h.id;
                  }}
                  onDelete={() => {
                    // The caret goes to the card before (the next, for the
                    // first), so the writer's keys, undo included, still land.
                    const list = cards.list.get();
                    const i = list.findIndex((c) => c.id === h.id);
                    const near = list[i - 1] ?? list[i + 1];
                    focused = h.id;
                    if (deleteCard.run() && near) near.focus();
                  }}
                />
                ))}
            </div>
          </div>
        );
      };
      s.provide(ui.editorReplacement(Canvas));
    });
  });
}

export const styles = `
.cards-view-canvas { height: 100%; overflow: auto; position: relative; }
.cards-view-bar { position: sticky; top: 0; left: 0; z-index: 2; padding: 6px 8px; display: flex; gap: 8px; }
.cards-view-sheet { position: relative; }
.cards-view-card { position: absolute; box-sizing: border-box; background: var(--background); border: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; resize: both; min-width: 160px; min-height: 100px; }
.cards-view-head { flex: none; box-sizing: border-box; display: flex; align-items: center; padding: 0 8px; border-bottom: 1px solid var(--border); cursor: grab; touch-action: none; user-select: none; }
.cards-view-head:active { cursor: grabbing; }
.cards-view-num { font-size: 12px; color: var(--muted-foreground); }
.cards-view-delete { margin-left: auto; display: flex; padding: 2px; border: none; background: none; color: var(--muted-foreground); cursor: pointer; border-radius: 4px; }
.cards-view-delete:hover { color: var(--foreground); background: var(--muted); }
.cards-view-delete svg { width: 14px; height: 14px; }
.cards-view-body { flex: 1; min-height: 0; overflow: auto; padding: 0 8px; display: flex; flex-direction: column; }
`;
