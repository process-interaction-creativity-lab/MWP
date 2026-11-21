// A pane outlined over everything: while its tab or the document picker
// that switches it is hovered or open. It follows the pane while shown (a
// window resize, a scroll, a split dragged, the pane redrawn for another
// document), measured once a frame: it shows only briefly, and one
// measurement a frame is cheaper than knowing every way a pane can move.

import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Box = { left: number; top: number; width: number; height: number };

const same = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);

export function PaneOutline({ paneId }: { paneId: string }) {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const r = document.querySelector(`[data-pane="${CSS.escape(paneId)}"]`)?.getBoundingClientRect();
      const next = r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
      setBox((prev) => (same(prev, next) ? prev : next));
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [paneId]);
  if (!box) return null;
  return createPortal(<div className="mwps-pane-outline" data-outline-for={paneId} style={box} />, document.body);
}
