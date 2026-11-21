// Test module: throws from a timer once placed, outside any host call.
import type { ModuleContext } from 'mwps';

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.effect(() => {
      const timer = setTimeout(() => {
        throw new Error('e2e-async-thrower: thrown on purpose');
      }, 50);
      return () => clearTimeout(timer);
    });
  });
}
