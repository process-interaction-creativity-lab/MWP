import { ui, type ModuleContext } from 'mwps';
import { Plugin } from 'prosemirror-state';

// A pane with this module placed on it is read-only. The host treats a pane
// whose plugins say `editable: false` as read-only and refuses every local
// edit there (typing, actions, p.run); selection, copy and scrolling still work.
const readOnly = new Plugin({ props: { editable: () => false } });

// Said in the toolbar while the pane is focused, so typing that does nothing isn't a mystery.
const ReadOnly = () => (
  <span className="document-viewer-label" title="This pane is read-only: select and copy, but no edits">
    Read-only
  </span>
);

export const styles = /* css */ `
.document-viewer-label { display: inline-flex; align-items: center; height: 1.75rem; padding: 0 0.5rem; font-size: 0.8rem; color: var(--muted-foreground); }
.document-viewer-label::before { content: '\\1F512\\FE0E'; margin-right: 0.3rem; font-size: 0.75rem; }
`;

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.provide(readOnly);
    p.provide(ui.toolbar(ReadOnly));
  });
}
