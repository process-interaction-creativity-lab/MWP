import type { AttributeContribution, ModuleContext, PartHandle } from 'mwps';
import { writing } from 'mwps/text';
import { ui, useAction, useStore } from 'mwps';
import { Button, CommitField } from 'mwps/ui';
import { Plus, Link2, X } from 'mwps/icons';
import type { Node as PMNode } from 'prosemirror-model';
import type { Command, Transaction } from 'prosemirror-state';
import { redo, undo } from 'prosemirror-history';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export const moduleType = 'editorReplacement';

// ---- Data ------------------------------------------------------------------
// A card's id, its saved position and the links that start at it all live on
// its block. Only base block types can carry them; another module's blocks
// still get a card, in a grid slot, but can't be positioned or linked.

const CARRIERS = ['paragraph', 'heading', 'blockquote', 'code_block', 'bullet_list', 'ordered_list'];

export const attrs: readonly AttributeContribution[] = [
  { types: CARRIERS, name: 'card_links_id', spec: { default: null } },
  { types: CARRIERS, name: 'card_links_pos', spec: { default: null } },
  { types: CARRIERS, name: 'card_links_links', spec: { default: null } },
];

export const actions = {
  newCard: { title: 'New card' },
  undoCanvas: { title: 'Undo canvas edit' },
  redoCanvas: { title: 'Redo canvas edit' },
};

type Pos = { x: number; y: number };
type Link = { id: string; targets: string[]; label: string };

const carries = (node: PMNode): boolean => !!node.type.spec.attrs && 'card_links_id' in node.type.spec.attrs;

type Block = {
  part: number;
  node: PMNode;
  /** This block's id once copies are resolved (the first block with an id keeps
   *  it; a copy is drawn as if it had none), or null. */
  id: string | null;
};

/** The blocks that get cards, in document order, with copied ids resolved. */
function blocksOf(doc: PMNode): Block[] {
  const seen = new Set<string>();
  const out: Block[] = [];
  writing(doc).forEach((node, part) => {
    if (node.type.name === 'horizontal_rule') return;
    const raw = carries(node) ? (node.attrs.card_links_id as string | null) : null;
    const id = raw && !seen.has(raw) ? raw : null;
    if (id) seen.add(id);
    out.push({ part, node, id });
  });
  return out;
}

const linksOf = (b: Block): Link[] => (b.id ? ((b.node.attrs.card_links_links as Link[] | null) ?? []) : []);
const posOf = (b: Block): Pos | null => (b.id ? ((b.node.attrs.card_links_pos as Pos | null) ?? null) : null);

/** Give the block an id if it has none (or only a copy of another's). */
function ensureId(tr: Transaction, b: Block): string {
  if (b.id) return b.id;
  const id = crypto.randomUUID();
  tr.setNodeAttribute(b.part, 'card_links_id', id);
  return id;
}

// ---- Commands, all on the host pane ---------------------------------------

const insertEmpty: Command = (state, dispatch) => {
  const empty = state.schema.nodes.paragraph?.createAndFill();
  if (!empty) return false;
  dispatch?.(state.tr.insert(writing(state.doc).content.size, empty));
  return true;
};

const setPosition =
  (part: number, pos: Pos): Command =>
  (state, dispatch) => {
    const b = blocksOf(state.doc).find((x) => x.part === part);
    if (!b || !carries(b.node)) return false;
    if (dispatch) {
      const tr = state.tr;
      ensureId(tr, b);
      tr.setNodeAttribute(part, 'card_links_pos', pos);
      dispatch(tr);
    }
    return true;
  };

const addLink =
  (srcPart: number, tgtPart: number): Command =>
  (state, dispatch) => {
    const blocks = blocksOf(state.doc);
    const s = blocks.find((x) => x.part === srcPart);
    const t = blocks.find((x) => x.part === tgtPart);
    if (!s || !t || s === t || !carries(s.node) || !carries(t.node)) return false;
    if (dispatch) {
      const tr = state.tr;
      ensureId(tr, s);
      const target = ensureId(tr, t);
      const link: Link = { id: crypto.randomUUID(), targets: [target], label: '' };
      tr.setNodeAttribute(srcPart, 'card_links_links', [...linksOf(s), link]);
      dispatch(tr);
    }
    return true;
  };

/** Change or remove (null) one link, wherever it is stored. */
const editLink =
  (linkId: string, change: (link: Link) => Link | null): Command =>
  (state, dispatch) => {
    const blocks = blocksOf(state.doc);
    const src = blocks.find((b) => linksOf(b).some((l) => l.id === linkId));
    if (!src) return false;
    const next = linksOf(src).flatMap((l) => (l.id !== linkId ? [l] : (change(l) ?? [])));
    if (dispatch) {
      const tr = state.tr;
      tr.setNodeAttribute(src.part, 'card_links_links', next);
      dispatch(tr);
    }
    return true;
  };

const setLabel = (linkId: string, label: string) => editLink(linkId, (l) => ({ ...l, label }));
const deleteLink = (linkId: string) => editLink(linkId, () => null);
const addTarget =
  (linkId: string, tgtPart: number): Command =>
  (state, dispatch) => {
    const blocks = blocksOf(state.doc);
    const t = blocks.find((x) => x.part === tgtPart);
    const src = blocks.find((b) => linksOf(b).some((l) => l.id === linkId));
    if (!t || !src || t === src || !carries(t.node)) return false;
    if (t.id && linksOf(src).find((l) => l.id === linkId)!.targets.includes(t.id)) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    const target = ensureId(tr, t);
    const live = new Set(blocks.flatMap((b) => (b.id ? [b.id] : [])));
    live.add(target);
    const links = linksOf(src).map((l) =>
      l.id === linkId ? { ...l, targets: [...l.targets.filter((x) => live.has(x) && x !== target), target] } : l,
    );
    tr.setNodeAttribute(src.part, 'card_links_links', links);
    dispatch(tr);
    return true;
  };

// ---- Layout ----------------------------------------------------------------

const CARD_W = 280;
const CARD_H = 220;
const GAP = 24;
const START = 16;
const HEAD_H = 34;

const gridPos = (i: number, cols: number): Pos => ({
  x: START + (i % cols) * (CARD_W + GAP),
  y: 56 + Math.floor(i / cols) * (CARD_H + GAP),
});

const center = (p: Pos): Pos => ({ x: p.x + CARD_W / 2, y: p.y + CARD_H / 2 });
const curve = (a: Pos, b: Pos) => {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
};

type Entry = { id: string | null; carry: boolean; pos: Pos | null; links: Link[] };

/** What the canvas needs from the document, as a string so that typing in a
 *  card doesn't redraw it. */
function signature(doc: PMNode | undefined): string {
  if (!doc) return '[]';
  return JSON.stringify(blocksOf(doc).map((b): Entry => ({ id: b.id, carry: carries(b.node), pos: posOf(b), links: linksOf(b) })));
}

function Card(props: {
  handle: PartHandle;
  index: number;
  pos: Pos;
  linkable: boolean;
  isSource: boolean;
  isTarget: boolean;
  onHeadDown(e: React.PointerEvent<HTMLDivElement>): void;
  onHeadMove(e: React.PointerEvent<HTMLDivElement>): void;
  onHeadEnd(e: React.PointerEvent<HTMLDivElement>): void;
  onLinkDown(e: React.PointerEvent<HTMLButtonElement>): void;
  onLinkMove(e: React.PointerEvent<HTMLButtonElement>): void;
  onLinkUp(e: React.PointerEvent<HTMLButtonElement>): void;
  onPick(): void;
}) {
  const { handle, pos } = props;
  return (
    <div
      className={`card-links-card${props.isSource ? ' card-links-card--source' : ''}${props.isTarget ? ' card-links-card--target' : ''}`}
      data-card={handle.id}
      style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
      onClickCapture={props.onPick}
    >
      <div
        className="card-links-head"
        style={{ height: HEAD_H }}
        onPointerDown={props.onHeadDown}
        onPointerMove={props.onHeadMove}
        onPointerUp={props.onHeadEnd}
        onPointerCancel={props.onHeadEnd}
      >
        <span className="card-links-num">{props.index + 1}</span>
        {props.linkable && (
          <button
            type="button"
            className="card-links-linkbtn"
            title="Drag from here to another card to link them"
            onPointerDown={props.onLinkDown}
            onPointerMove={props.onLinkMove}
            onPointerUp={props.onLinkUp}
            onPointerCancel={props.onLinkUp}
          >
            <Link2 size={14} />
          </button>
        )}
      </div>
      <div className="card-links-body">{handle.element}</div>
    </div>
  );
}

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const cards = p.hostPartPanes((node) => node.type.name !== 'horizontal_rule');

    p.provide(actions.newCard, { procedure: () => p.run(insertEmpty) });
    p.provide(actions.undoCanvas, { command: undo });
    p.provide(actions.redoCanvas, { command: redo });
    p.provide(ui.tabMenu(actions.undoCanvas));
    p.provide(ui.tabMenu(actions.redoCanvas));
    p.provide(ui.tabMenu(actions.newCard));

    const Canvas = () => {
      const handles = useStore(cards.list);
      const sig = useStore(p.state, (s) => signature(s?.doc));
      const entries = useMemo(() => JSON.parse(sig) as Entry[], [sig]);
      const newCard = useAction(p, actions.newCard);

      const box = useRef<HTMLDivElement>(null);
      const sheet = useRef<HTMLDivElement>(null);
      const [width, setWidth] = useState(0);
      const [dragCard, setDragCard] = useState<{ handle: string; x: number; y: number } | null>(null);
      const dragStart = useRef<{ cx: number; cy: number; x: number; y: number; moved: boolean } | null>(null);
      const [linkDrag, setLinkDrag] = useState<{ handle: string; at: Pos } | null>(null);
      const [selected, setSelected] = useState<string | null>(null);
      const [editing, setEditing] = useState<string | null>(null);

      useLayoutEffect(() => {
        const el = box.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setWidth(el.clientWidth));
        ro.observe(el);
        setWidth(el.clientWidth);
        return () => ro.disconnect();
      }, []);

      // Escape cancels a link being drawn.
      useEffect(() => {
        if (!linkDrag) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLinkDrag(null);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [linkDrag !== null]);

      const cols = Math.max(1, Math.floor((width - START + GAP) / (CARD_W + GAP)));
      const n = Math.min(handles.length, entries.length);
      const rects = useMemo(
        () =>
          handles.slice(0, n).map((h, i) => {
            const e = entries[i]!;
            const dragged = dragCard && dragCard.handle === h.id;
            return dragged ? { x: dragCard.x, y: dragCard.y } : (e.pos ?? gridPos(i, cols));
          }),
        [handles, entries, n, cols, dragCard],
      );
      const byId = useMemo(() => {
        const m = new Map<string, number>();
        entries.slice(0, n).forEach((e, i) => e.id && m.set(e.id, i));
        return m;
      }, [entries, n]);

      type Drawn = { id: string; source: number; targets: number[]; label: string; mid: Pos };
      const drawn = useMemo(() => {
        const out: Drawn[] = [];
        entries.slice(0, n).forEach((e, si) => {
          for (const l of e.links) {
            const targets = l.targets.map((t) => byId.get(t)).filter((t): t is number => t !== undefined && t !== si);
            if (!targets.length) continue;
            const cs = [si, ...targets].map((i) => center(rects[i]!));
            out.push({
              id: l.id,
              source: si,
              targets,
              label: l.label,
              mid: { x: cs.reduce((a, c) => a + c.x, 0) / cs.length, y: cs.reduce((a, c) => a + c.y, 0) / cs.length },
            });
          }
        });
        return out;
      }, [entries, n, byId, rects]);

      const partOf = (handleId: string) => cards.list.get().find((h) => h.id === handleId)?.part;
      const selectedLink = drawn.find((d) => d.id === selected) ?? null;

      const toSheet = (e: { clientX: number; clientY: number }): Pos => {
        const r = sheet.current!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      const headDown = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = rects[i]!;
        dragStart.current = { cx: e.clientX, cy: e.clientY, x: r.x, y: r.y, moved: false };
      };
      const headMove = (h: PartHandle) => (e: React.PointerEvent<HTMLDivElement>) => {
        const d = dragStart.current;
        if (!d) return;
        if (!d.moved && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 3) return;
        d.moved = true;
        setDragCard({ handle: h.id, x: Math.max(0, d.x + e.clientX - d.cx), y: Math.max(0, d.y + e.clientY - d.cy) });
      };
      const headEnd = (h: PartHandle) => (e: React.PointerEvent<HTMLDivElement>) => {
        const d = dragStart.current;
        dragStart.current = null;
        if (!d?.moved || e.type === 'pointercancel') return setDragCard(null);
        const to = { x: Math.max(0, Math.round(d.x + e.clientX - d.cx)), y: Math.max(0, Math.round(d.y + e.clientY - d.cy)) };
        const part = partOf(h.id);
        if (part !== undefined) p.run(setPosition(part, to));
        setDragCard(null);
      };

      const linkDown = (h: PartHandle) => (e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setSelected(null);
        setLinkDrag({ handle: h.id, at: toSheet(e) });
      };
      const linkMove = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (linkDrag) setLinkDrag({ ...linkDrag, at: toSheet(e) });
      };
      const linkUp = (e: React.PointerEvent<HTMLButtonElement>) => {
        const drag = linkDrag;
        setLinkDrag(null);
        if (!drag || e.type === 'pointercancel') return;
        const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-card]')?.getAttribute('data-card');
        const src = partOf(drag.handle);
        const tgt = hit ? partOf(hit) : undefined;
        if (src !== undefined && tgt !== undefined && hit !== drag.handle) p.run(addLink(src, tgt));
      };

      const maxX = Math.max(0, ...rects.map((r) => r.x)) + CARD_W + GAP;
      const maxY = Math.max(0, ...rects.map((r) => r.y)) + CARD_H + GAP;
      const sourceHandle = linkDrag ? handles.findIndex((h) => h.id === linkDrag.handle) : -1;

      return (
        <div
          className="card-links-canvas"
          ref={box}
          onKeyDown={(e) => {
            if (!selected || editing || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
            if ((e.target as HTMLElement).closest('.card-links-card, input')) return;
            e.preventDefault();
            p.run(deleteLink(selected));
            setSelected(null);
          }}
        >
          <div className="card-links-bar">
            <Button variant="secondary" size="sm" disabled={!newCard.enabled} onMouseDown={(e) => e.preventDefault()} onClick={() => newCard.run()}>
              <Plus />
              New card
            </Button>
            {(linkDrag || selectedLink) && (
              <span className="card-links-banner">
                {linkDrag
                  ? `Linking from card ${sourceHandle + 1}: release on a card to link, Escape cancels`
                  : 'Link selected: click cards to add targets, Delete removes it'}
              </span>
            )}
          </div>
          <div
            className="card-links-sheet"
            ref={sheet}
            style={{ width: Math.max(maxX, width - 2), height: maxY }}
            onClick={(e) => e.target === e.currentTarget && setSelected(null)}
          >
            <svg className="card-links-svg" aria-hidden>
              {drawn.map((d) =>
                d.targets.map((t) => (
                  <path
                    key={`${d.id}-${t}`}
                    d={curve(center(rects[d.source]!), center(rects[t]!))}
                    className={`card-links-line${d.id === selected ? ' card-links-line--selected' : ''}`}
                  />
                )),
              )}
              {linkDrag && sourceHandle >= 0 && (
                <path d={curve(center(rects[sourceHandle]!), linkDrag.at)} className="card-links-line card-links-line--drawing" />
              )}
            </svg>

            {handles.slice(0, n).map((h, i) => (
              <Card
                key={h.id}
                handle={h}
                index={i}
                pos={rects[i]!}
                linkable={entries[i]!.carry}
                isSource={linkDrag?.handle === h.id || (selectedLink?.source === i)}
                isTarget={!!selectedLink?.targets.includes(i)}
                onHeadDown={headDown(i)}
                onHeadMove={headMove(h)}
                onHeadEnd={headEnd(h)}
                onLinkDown={linkDown(h)}
                onLinkMove={linkMove}
                onLinkUp={linkUp}
                onPick={() => {
                  if (!selectedLink || editing || selectedLink.source === i) return;
                  const part = partOf(h.id);
                  if (part !== undefined) p.run(addTarget(selectedLink.id, part));
                }}
              />
            ))}

            {drawn.map((d) => {
              const sel = d.id === selected;
              const isEditing = editing === d.id;
              return (
                <div key={d.id} className={`card-links-label${sel ? ' card-links-label--selected' : ''}`} style={{ left: d.mid.x, top: d.mid.y }}>
                  {isEditing ? (
                    <CommitField
                      className="card-links-label-input"
                      aria-label="Link label"
                      value={d.label}
                      autoFocus
                      onCommit={(label) => p.run(setLabel(d.id, label))}
                      onDone={() => setEditing(null)}
                      returnFocus={() => p.focus()}
                    />
                  ) : (
                    <span
                      className={`card-links-label-text${d.label ? '' : ' card-links-label-text--empty'}`}
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(d.id);
                        e.currentTarget.focus();
                      }}
                      onDoubleClick={() => setEditing(d.id)}
                    >
                      {d.label || 'label'}
                    </span>
                  )}
                  {sel && !isEditing && (
                    <button
                      type="button"
                      className="card-links-label-delete"
                      title="Delete link"
                      onClick={(e) => {
                        e.stopPropagation();
                        p.run(deleteLink(d.id));
                        setSelected(null);
                      }}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    };
    p.provide(ui.editorReplacement(Canvas));
  });
}

export const styles = `
.card-links-canvas { height: 100%; overflow: auto; position: relative; outline: none; }
.card-links-bar { position: sticky; top: 0; left: 0; z-index: 6; padding: 8px 16px; display: flex; gap: 12px; align-items: center; height: 40px; box-sizing: border-box; }
.card-links-banner { background: #facc15; color: #1b1b1b; padding: 3px 10px; font-size: 12px; }
.card-links-sheet { position: relative; margin-top: -40px; min-width: 100%; }
.card-links-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; z-index: 1; }
.card-links-line { fill: none; stroke: rgba(100,140,220,.75); stroke-width: 2; }
.card-links-line--selected { stroke: rgba(80,180,100,.95); stroke-width: 3; }
.card-links-line--drawing { stroke: rgba(220,180,80,.9); stroke-dasharray: 6 4; }
.card-links-card { position: absolute; z-index: 2; box-sizing: border-box; background: var(--background); border: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.card-links-card--source { outline: 3px solid rgba(250,204,21,.9); }
.card-links-card--target { outline: 3px solid rgba(100,180,220,.8); }
.card-links-head { flex: none; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; border-bottom: 1px solid var(--border); cursor: grab; touch-action: none; user-select: none; }
.card-links-head:active { cursor: grabbing; }
.card-links-num { font-size: 12px; color: var(--muted-foreground); }
.card-links-linkbtn { display: inline-flex; align-items: center; justify-content: center; padding: 2px 4px; border: none; background: transparent; color: var(--foreground); cursor: crosshair; touch-action: none; }
.card-links-body { flex: 1; min-height: 0; overflow: auto; padding: 0 8px; display: flex; flex-direction: column; }
.card-links-label { position: absolute; z-index: 4; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 4px; }
.card-links-label-text { padding: 2px 8px; background: var(--background); border: 1px solid var(--border); font-size: 12px; cursor: pointer; white-space: nowrap; user-select: none; outline: none; }
.card-links-label-text--empty { font-style: italic; color: var(--muted-foreground); }
.card-links-label--selected .card-links-label-text { border-color: rgba(80,180,100,.95); }
.card-links-label-input { padding: 2px 8px; background: var(--background); color: var(--foreground); border: 1px solid var(--ring); font-size: 12px; outline: none; min-width: 60px; width: auto; height: auto; }
.card-links-label-delete { padding: 0 4px; border: none; background: transparent; color: var(--destructive); cursor: pointer; }
`;
