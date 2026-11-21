// A pane's own UI roots: the overlay over its text, and the selection bubble.

import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { host } from './host.js';
import { keepFocus, ModuleItems, useUiItems } from './module-ui.js';

// Unpositioned, so module CSS can anchor to the text (anchor positioning)
// or place itself against the pane frame (`position: absolute`).
export function Overlay({ paneId }: { paneId: string }) {
  const items = useUiItems('overlay', paneId);
  return (
    <div className="mwps-overlay">
      <ModuleItems items={items} />
    </div>
  );
}

// Over a non-empty selection in the last focused pane, above its start (below
// it when there is no room above). Drawn in the page's own layer at the
// selection's screen position, so a card's clipping can't cut it.
// Hidden by CSS when every component renders nothing.
export function SelectionBubble({ paneId }: { paneId: string }) {
  const items = useUiItems('selection', paneId);
  const state = useSyncExternalStore(host.paneState(paneId).subscribe, host.paneState(paneId).get);
  const focused = useSyncExternalStore(host.lastFocusedPane.subscribe, host.lastFocusedPane.get) === paneId;
  const [, move] = useReducer((n: number) => n + 1, 0);
  // Scrolling anywhere (a card's body, the canvas) or resizing moves the selection on screen.
  useEffect(() => {
    window.addEventListener('scroll', move, true);
    window.addEventListener('resize', move);
    return () => {
      window.removeEventListener('scroll', move, true);
      window.removeEventListener('resize', move);
    };
  }, []);
  const view = host.paneView(paneId);
  if (!items.length || !state || state.selection.empty || !focused || !view) return null;

  // An end in text a decoration hides (`display: none`) has no box, and
  // measures as the window's corner: place by the other end, or not at all.
  const shown = (r: { top: number; bottom: number; left: number }) => r.top !== 0 || r.bottom !== 0 || r.left !== 0;
  const from = view.coordsAtPos(state.selection.from);
  const to = view.coordsAtPos(state.selection.to);
  const start = shown(from) ? from : to;
  if (!shown(start)) return null;
  const below = start.top < 56;
  return createPortal(
    <div
      className={`mwps-selection-bubble${below ? ' mwps-selection-bubble-below' : ''}`}
      style={{ left: start.left, top: below && shown(to) ? to.bottom : start.top }}
      onMouseDown={keepFocus}
    >
      <ModuleItems items={items} />
    </div>,
    document.body,
  );
}
