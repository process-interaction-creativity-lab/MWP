// Test module: a pane plugin view whose `update` edits once the text says
// "edit me", which the host refuses by turning the module off.
import type { ModuleContext } from 'mwps';
import { writing } from 'mwps/text';
import { Plugin } from 'prosemirror-state';

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.provide(
      new Plugin({
        view: () => ({
          update: (view) => {
            if (writing(view.state.doc).textContent.includes('edit me')) p.run((s, d) => (d?.(s.tr.insertText('!')), true));
          },
        }),
      }),
    );
  });
}
