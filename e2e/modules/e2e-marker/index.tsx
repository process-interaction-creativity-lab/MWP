// Test module: shows how many panes it is placed on, in a body attribute.
// A plain counter, not a value: unplacing the last pane stops the module,
// and its values end before the pane cleanups run.
import type { ModuleContext } from 'mwps';

let count = 0;
const show = () => (document.body.dataset.e2eMarker = String(count));

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.effect(() => {
      count++;
      show();
      return () => {
        count--;
        show();
      };
    });
  });
}
