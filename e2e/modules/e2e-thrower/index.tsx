// Test module: throws as soon as it is placed on a pane.
import type { ModuleContext } from 'mwps';

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.effect(() => {
      throw new Error('e2e-thrower: thrown on purpose');
    });
  });
}
