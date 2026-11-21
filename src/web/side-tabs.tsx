// The window's side tabs: one tab per `ui.side` view for the last focused
// pane (and module-wide ones), at the right edge. At most two are open,
// stacked top to bottom; the writer sizes the area and each view's share.
// The strip of tabs is always there, empty when no module has a view, so
// the panes don't shift as modules come and go.

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import type { ProvidedUi } from '../core/host.js';
import { host } from './host.js';
import { keepFocus, ModuleItems, useUiItems } from './module-ui.js';
import { lastSide, rememberSide, type SideLayout } from './remember.js';

const MIN_WIDTH = 200;
const MIN_VIEW = 60;
const MAX_OPEN = 2;

const tabOf = ({ moduleId, item }: ProvidedUi) => ('title' in item && item.title ? `${moduleId}: ${item.title}` : moduleId);
const markOpened = (opened: string[], ids: string[]) => [...opened.filter((id) => !ids.includes(id)), ...ids].slice(-50);

export function SideTabs() {
  const pane = useSyncExternalStore(host.lastFocusedPane.subscribe, host.lastFocusedPane.get);
  const items = useUiItems('side', pane);
  const [layout, setLayout] = useState(lastSide);
  const change = (next: SideLayout) => {
    setLayout(next);
    rememberSide(next);
  };

  const tabs = new Map(items.map((item) => [tabOf(item), item]));
  const ids = [...tabs.keys()];
  // The two opened most recently stay open; a tab never opened counts as
  // the newest. The rest are closed, and new ones marked opened.
  const rank = (id: string) => {
    const i = layout.opened.indexOf(id);
    return i < 0 ? Infinity : i;
  };
  const wanted = ids.filter((id) => !layout.closed.includes(id));
  const kept = [...wanted].sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) - rank(b))).slice(-MAX_OPEN);
  const open = ids.filter((id) => kept.includes(id));
  const evicted = wanted.filter((id) => !kept.includes(id));
  const fresh = kept.filter((id) => !layout.opened.includes(id));
  useEffect(() => {
    if (evicted.length === 0 && fresh.length === 0) return;
    change({ ...layout, closed: [...layout.closed, ...evicted], opened: markOpened(layout.opened, fresh) });
  });
  // The caret moving into a data card opens its module's closed tab; moving
  // within the card (typing) doesn't, so a writer can close it and go on.
  const latest = useRef({ layout, open, tabs });
  latest.current = { layout, open, tabs };
  useEffect(() => {
    if (!pane) return;
    const state = host.paneState(pane);
    let last = host.dataCardOwnerAtSelection(pane);
    return state.subscribe(() => {
      const owner = host.dataCardOwnerAtSelection(pane);
      const entered = owner !== last;
      last = owner;
      if (!owner || !entered) return;
      const { layout, open, tabs } = latest.current;
      const shut = [...tabs].filter(([id, u]) => u.moduleId === owner && !open.includes(id)).map(([id]) => id);
      if (shut.length) change({ ...layout, closed: layout.closed.filter((c) => !shut.includes(c)), opened: markOpened(layout.opened, shut) });
    });
  }, [pane]);
  // A module's `p.reveal(item)` opens that view's tab if it is closed.
  useEffect(() => {
    return host.revealed.subscribe(() => {
      const key = host.revealed.get()?.key;
      const { layout, open, tabs } = latest.current;
      const found = [...tabs].find(([, u]) => u.key === key);
      if (found && !open.includes(found[0])) {
        change({ ...layout, closed: layout.closed.filter((c) => c !== found[0]), opened: markOpened(layout.opened, [found[0]]) });
      }
    });
  }, []);
  const share = (id: string) => layout.shares[id] ?? 1;

  const toggle = (id: string) =>
    change(
      open.includes(id)
        ? { ...layout, closed: [...layout.closed, id] }
        : { ...layout, closed: layout.closed.filter((c) => c !== id), opened: markOpened(layout.opened, [id]) },
    );

  // Drag the area's left edge; the panes take what's left.
  const resizeArea = (e: PointerEvent<HTMLDivElement>) => {
    const handle = e.currentTarget;
    const right = handle.parentElement!.getBoundingClientRect().right;
    handle.setPointerCapture(e.pointerId);
    let width = layout.width;
    handle.onpointermove = (ev) => {
      width = Math.max(MIN_WIDTH, Math.min(right - ev.clientX, window.innerWidth - 320));
      setLayout((l) => ({ ...l, width }));
    };
    handle.onpointerup = () => {
      handle.onpointermove = null;
      change({ ...layout, width });
    };
  };

  // Drag between two open views; their shares change, the rest keep theirs.
  const resizeViews = (above: string, below: string) => (e: PointerEvent<HTMLDivElement>) => {
    const handle = e.currentTarget;
    const a = handle.previousElementSibling!.getBoundingClientRect();
    const b = handle.nextElementSibling!.getBoundingClientRect();
    const total = a.height + b.height;
    const sum = share(above) + share(below);
    handle.setPointerCapture(e.pointerId);
    let shares = layout.shares;
    handle.onpointermove = (ev) => {
      const top = Math.max(MIN_VIEW, Math.min(total - MIN_VIEW, ev.clientY - a.top));
      shares = { ...layout.shares, [above]: (sum * top) / total, [below]: sum - (sum * top) / total };
      setLayout((l) => ({ ...l, shares }));
    };
    handle.onpointerup = () => {
      handle.onpointermove = null;
      change({ ...layout, shares });
    };
  };

  return (
    <div className="mwps-side">
      {open.length > 0 && (
        <>
          <div className="mwps-side-edge" role="separator" aria-orientation="vertical" aria-label="Resize side views" onPointerDown={resizeArea} />
          <div className="mwps-side-views" style={{ width: layout.width }} onMouseDown={keepFocus}>
            {open.map((id, i) => (
              <Fragment key={id}>
                {i > 0 && (
                  <div
                    className="mwps-side-divider"
                    role="separator"
                    aria-orientation="horizontal"
                    onPointerDown={resizeViews(open[i - 1]!, id)}
                  />
                )}
                <section className="mwps-side-view" aria-label={id} data-side={id} style={{ flexGrow: share(id) }}>
                  <ModuleItems items={[tabs.get(id)!]} />
                </section>
              </Fragment>
            ))}
          </div>
        </>
      )}
      <div className="mwps-side-tabs" role="toolbar" aria-label="Side views" aria-orientation="vertical">
        {[...tabs.keys()].map((id) => (
          <button
            key={id}
            type="button"
            className="mwps-side-tab"
            aria-pressed={open.includes(id)}
            title={open.includes(id) ? `Close ${id}` : `Open ${id}`}
            onMouseDown={keepFocus}
            onClick={() => toggle(id)}
          >
            {id}
          </button>
        ))}
      </div>
    </div>
  );
}
