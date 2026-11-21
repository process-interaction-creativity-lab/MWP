// Any pane the core holds: a root or a hosted child. It draws either an
// editor replacement's component or the editor; the pane's document and
// modules are switched from the toolbar and its tab.

import { EditorView } from 'prosemirror-view';
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { SCOPE_ATTR } from '../ui/lib/module-scope.js';
import type { CardSurface } from '../core/card-surface.js';
import { cardViews, childPanes, host } from './host.js';
import { ModuleRoot } from './module-ui.js';
import { Overlay, SelectionBubble } from './pane-ui.js';

const useHostVersion = () => useSyncExternalStore(host.subscribe, () => host.version);

export function PaneView({ paneId }: { paneId: string }) {
  useHostVersion();
  // The pane's own element: `view.dom` for its plugins.
  const attach = useCallback((el: HTMLDivElement | null) => host.attachPaneElement(paneId, el), [paneId]);
  const info = host.paneInfo(paneId);
  if (!info) return null;
  const layout = info.status === 'ready' ? host.replacementOf(paneId) : null;
  const child = info.parent !== null;

  let body;
  if (info.status === 'loading') body = <p className="mwps-empty">Opening…</p>;
  else if (info.status === 'error') body = <p className="mwps-error">Could not open the document: {info.error}</p>;
  else if (layout) body = <ReplacementView paneId={paneId} />;
  else if (info.documentId === null) body = <p className="mwps-empty">No document. Pick one at the toolbar's left.</p>;
  else body = <Editor key={info.generation} paneId={paneId} documentId={info.documentId} />;

  return (
    <div
      ref={attach}
      className={`mwps-slot mwps-pane ${child ? 'mwps-child' : 'mwps-desk'} ${layout ? 'mwps-laid-out' : ''}`}
      data-pane={paneId}
      onPointerDown={(e) => {
        // A click focuses the innermost pane under it, editor or not (an
        // empty pane, a painting), so the toolbar and picker follow it.
        const target = e.target instanceof Element ? e.target.closest('[data-pane]') : null;
        if (target !== e.currentTarget || !host.paneIds().includes(paneId)) return;
        host.focus(paneId);
        // Keys go where the browser's focus is: a press that keeps it (a
        // widget's button cancels mousedown to keep the selection) would
        // leave Cmd-Z with the pane focused before, so this pane's editor
        // takes it. A text box's own mousedown still takes it after this.
        const active = document.activeElement?.closest('[data-pane]');
        if (active && active !== e.currentTarget) host.paneView(paneId)?.focus();
      }}
    >
      {body}
    </div>
  );
}

// The editor replacement's component, in its module's CSS scope and error
// boundary; it draws the pane's children itself.
function ReplacementView({ paneId }: { paneId: string }) {
  const { moduleId, component: Replacement } = host.replacementOf(paneId)!;
  return (
    <ModuleRoot moduleId={moduleId} className="mwps-layout">
      <Replacement />
    </ModuleRoot>
  );
}

childPanes.draw = (id) => <PaneView key={id} paneId={id} />;
childPanes.mount = (id, el) => {
  const root = createRoot(el);
  root.render(<PaneView paneId={id} />);
  return () => queueMicrotask(() => root.unmount());
};

// The pane's editor: a card over the document's writing, so the writer
// never reaches the modules' data after it. The core keeps the state,
// plugins and sync; the card draws it and sends it the writer's edits.
function Editor({ paneId, documentId }: { paneId: string; documentId: string }) {
  useHostVersion();
  // Set when the document doesn't fit the schema; the pane is then read-only.
  const doc = host.document(documentId);
  const problem = useSyncExternalStore(host.subscribeSchema, () => doc?.problem ?? null);
  const card = host.mainCard(paneId);
  return (
    <>
      {problem && (
        <p className="mwps-notice" role="alert">
          This document doesn't fit the installed modules' types, so it is open read-only: {problem}
        </p>
      )}
      {card && <CardEditor key={card.id} card={card} hostPaneId={paneId} page />}
    </>
  );
}

// A card: an editor over one block of its host pane's document, which the
// host pane's state, plugins and history drive; see core/card-surface.ts.
function CardEditor({ card, hostPaneId, page = false }: { card: CardSurface; hostPaneId: string; page?: boolean }) {
  const mount = useRef<HTMLDivElement>(null);
  useHostVersion();
  // The pane's overlay and selection bubble follow the caret's card.
  const caret = useSyncExternalStore(card.subscribeCaret, () => card.holdsCaret());
  const scope = host.paneIds().includes(hostPaneId)
    ? host.modulesIn(hostPaneId).filter((id) => host.status(id) === 'on').join(' ')
    : '';

  // Made before the layout's own effects run, so they can focus the card.
  useLayoutEffect(() => {
    const view = new EditorView(mount.current!, {
      state: card.state!,
      dispatchTransaction: (tr) => card.dispatch(tr),
    });
    card.attach(view);
    // Keys, actions and the toolbar follow the host pane while the writer is in a card.
    view.dom.addEventListener('focus', () => host.focus(hostPaneId));
    // The pane's own editor takes focus as it opens, if the pane has it.
    const focused = host.lastFocusedPane.get();
    if (page && (focused === null || focused === hostPaneId)) {
      view.focus();
      host.focus(hostPaneId);
    }
    return () => {
      if (card.view === view) card.attach(null);
      view.destroy();
    };
  }, [card]);

  return (
    <div className={`${page ? 'mwps-page' : 'mwps-card'} mwps-pane-frame`}{...{ [SCOPE_ATTR]: scope }}>
      <div className="mwps-editor" ref={mount} />
      {caret && <Overlay paneId={hostPaneId} />}
      {caret && <SelectionBubble paneId={hostPaneId} />}
    </div>
  );
}

cardViews.draw = (card, hostPaneId) => <CardEditor key={card.id} card={card} hostPaneId={hostPaneId} />;
cardViews.mount = (card, hostPaneId, el) => {
  const root = createRoot(el);
  root.render(<CardEditor card={card} hostPaneId={hostPaneId} />);
  return () => queueMicrotask(() => root.unmount());
};
