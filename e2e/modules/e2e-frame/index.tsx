// Test module: the pane's editor framed in a module-owned child pane on the
// pane's own document, as a canvas or a side-by-side view shows it.
import { ui, useStore, type ModuleContext } from 'mwps';

export const moduleType = 'editorReplacement';

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const children = p.hostChildPanes();
    children.create({ owner: 'module' });
    p.provide(
      ui.editorReplacement(() => (
        <div className="e2e-frame" style={{ border: '2px solid', padding: 8 }}>
          {useStore(children.list).map((c) => c.element)}
        </div>
      )),
    );
  });
}
