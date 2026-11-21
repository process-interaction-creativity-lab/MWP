import type { ModuleContext } from 'mwps';

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.effect(() => {
      console.log(`${ctx.id} placed on pane ${p.id}`);
      return () => console.log(`${ctx.id} removed from pane ${p.id}`);
    });
  });
}
