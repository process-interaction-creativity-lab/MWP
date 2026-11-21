// Test module: a side view per pane, showing the pane's text, with a
// button that edits it (focus stays in the text) and a text box; and a
// second, titled view for the whole module. "Reveal side view" opens the
// pane's view when its tab is closed.
import type { ModuleContext } from 'mwps';
import { writing } from 'mwps/text';
import { ui, useStore } from 'mwps';
import { Button } from 'mwps/ui';

export const actions = { reveal: { title: 'Reveal side view' } };

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const view = ui.side(() => {
      const text = useStore(p.state, (s) => (s ? writing(s.doc).textContent : ''));
      return (
        <div>
          <p className="e2e-side-text">Text: {text}</p>
          <Button variant="outline" onClick={() => p.run((state, dispatch) => (dispatch?.(state.tr.insertText('!')), true))}>
            Bang
          </Button>
          <input aria-label="Side note" />
        </div>
      );
    });
    p.provide(view);
    p.provide(actions.reveal, { procedure: () => (p.reveal(view), true) });
  });
  ctx.provide(ui.side(() => <p className="e2e-side-notes">Notes</p>, { title: 'Notes' }));
}
