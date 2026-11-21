// Module components in the host's UI roots. Each sits in its own error
// boundary (a throwing component turns its module off) inside an element
// in the module's CSS scope with the `mwps-module-ui` defaults; the kit's
// portaled parts find the module through context.

import { Component, useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ErrorInfo, type MouseEvent, type ReactNode } from 'react';
import type { ProvidedUi } from '../core/host.js';
import type { ComponentRoot } from '../core/ui.js';
import { FocusBack, ModuleScope, SCOPE_ATTR } from '../ui/lib/module-scope.js';
import { host } from './host.js';

export function useUiItems(root: ComponentRoot, paneId: string | null): ProvidedUi[] {
  useSyncExternalStore(host.uiVersion.subscribe, host.uiVersion.get);
  // Placements and module status change the lists too.
  useSyncExternalStore(host.subscribe, () => host.version);
  return host.uiItems(root, paneId);
}

export function ModuleItems({ items }: { items: readonly ProvidedUi[] }) {
  return items.map(({ key, moduleId, item, target }) => {
    const Item = (item as { component: ComponentType }).component;
    return (
      <ModuleRoot key={key} moduleId={moduleId} pane={target.kind === 'pane' ? target.id : null}>
        <Item />
      </ModuleRoot>
    );
  });
}

// Wherever a module's component is drawn: an element in its CSS scope, the
// context its kit portals read, and its error boundary. `span` inside a
// line of text (a widget).
export function ModuleRoot({
  moduleId,
  className = 'mwps-module-ui',
  as: Element = 'div',
  pane = null,
  children,
}: {
  moduleId: string;
  /** The pane the component belongs to, which kit popups return focus to;
   *  none: the last focused pane. */
  pane?: string | null;
  className?: string;
  as?: 'div' | 'span';
  children: ReactNode;
}) {
  const back = useCallback(() => {
    const id = pane ?? host.lastFocusedPane.get();
    if (id !== null && host.paneIds().includes(id)) {
      host.focus(id);
      host.paneView(id)?.focus();
    }
  }, [pane]);
  return (
    <Element className={className} {...{ [SCOPE_ATTR]: moduleId }}>
      <ModuleScope.Provider value={moduleId}>
        <FocusBack.Provider value={back}>
          <ModuleBoundary moduleId={moduleId}>{children}</ModuleBoundary>
        </FocusBack.Provider>
      </ModuleScope.Provider>
    </Element>
  );
}

class ModuleBoundary extends Component<{ moduleId: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    host.fail(this.props.moduleId, error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Clicking a button in the toolbar or the selection bubble leaves focus in
// the text, as in ProseMirror's example menu: the button still gets its
// click. Text boxes, selects and other inputs take focus as usual.
export function keepFocus(e: MouseEvent): void {
  if (e.target instanceof Element && e.target.closest('button')) e.preventDefault();
}

// The window's modal root: every module's `ui.modal` items, over everything.
export function Modals() {
  return (
    <div className="mwps-modals">
      <ModuleItems items={useUiItems('modal', null)} />
    </div>
  );
}

// The window's toolbar: items for the last focused pane, and module-wide ones.
// `start` and `end`: the host's own controls, around the modules' items.
export function Toolbar({ start, end }: { start?: ReactNode; end?: ReactNode }) {
  const pane = useSyncExternalStore(host.lastFocusedPane.subscribe, host.lastFocusedPane.get);
  const items = useUiItems('toolbar', pane);
  // Each module's items in one frame, its name on the frame's top edge.
  const groups: ProvidedUi[][] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.moduleId === it.moduleId) last.push(it);
    else groups.push([it]);
  }
  return (
    <div className="mwps-toolbar" role="toolbar" aria-label="Modules" onMouseDown={keepFocus}>
      {start}
      <ScrollRow>
        {groups.map((g) => (
          <div key={g[0]!.key} className="mwps-toolbar-group" role="group" aria-label={g[0]!.moduleId}>
            <span className="mwps-toolbar-label" aria-hidden="true">{g[0]!.moduleId}</span>
            <div className="mwps-toolbar-items">
              <ModuleItems items={g} />
            </div>
          </div>
        ))}
      </ScrollRow>
      {end}
    </div>
  );
}

// One row that scrolls sideways, with an arrow at each end while there is
// more past that edge. A click moves most of a view; a trackpad scrolls it
// too, and focusing an item scrolls it into view.
function ScrollRow({ children }: { children: ReactNode }) {
  const view = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  useLayoutEffect(() => {
    const el = view.current!;
    const measure = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const sizes = new ResizeObserver(measure);
    sizes.observe(el);
    sizes.observe(row.current!);
    return () => {
      el.removeEventListener('scroll', measure);
      sizes.disconnect();
    };
  }, []);
  // A step that would stop near an end goes to it: an arrow showing or
  // going changes the view's width, so equal steps back don't land where
  // they started.
  const go = (dir: -1 | 1) => {
    const el = view.current!;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const end = el.scrollWidth - el.clientWidth;
    const near = el.clientWidth * 0.25;
    const target = el.scrollLeft + dir * el.clientWidth * 0.8;
    el.scrollTo({ left: target < near ? 0 : target > end - near ? end : target, behavior: still ? 'auto' : 'smooth' });
  };
  return (
    <>
      {more.left && (
        <button type="button" className="mwps-toolbar-arrow" aria-label="Scroll toolbar left" onClick={() => go(-1)}>
          ‹
        </button>
      )}
      <div className="mwps-toolbar-view" ref={view}>
        <div className="mwps-toolbar-row" ref={row}>
          {children}
        </div>
      </div>
      {more.right && (
        <button type="button" className="mwps-toolbar-arrow" aria-label="Scroll toolbar right" onClick={() => go(1)}>
          ›
        </button>
      )}
    </>
  );
}
