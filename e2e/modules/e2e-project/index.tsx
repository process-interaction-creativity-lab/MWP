// Test module: a project module whose one action, in the project menu,
// opens a dialog (in the window's modal root) counting the project's documents.
import type { ModuleContext } from 'mwps';
import { ui, useStore, valueKey } from 'mwps';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from 'mwps/ui';

export const moduleType = 'project';

export const actions = {
  count: { title: 'Count documents…' },
};

const counting = valueKey('counting', { default: false });

export function setup(ctx: ModuleContext) {
  const open = ctx.getValue(counting);
  ctx.provide(actions.count, { procedure: () => (open.set(true), true) });
  ctx.provide(ui.projectMenu(actions.count));
  ctx.with(ctx.project, (s, project) => {
    s.provide(
      ui.modal(() => (
        <Dialog open={useStore(open)} onOpenChange={open.set}>
          <DialogContent>
            <DialogTitle>Documents</DialogTitle>
            <DialogDescription>This project has {useStore(project.documents).length} documents.</DialogDescription>
          </DialogContent>
        </Dialog>
      )),
    );
  });
}
