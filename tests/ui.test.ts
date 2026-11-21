// Properties of UI items: each root holds exactly what live scopes provide.

import fc from 'fast-check';
import { ui, type ModuleContext, valueKey } from 'mwps';
import { expect, it } from 'vitest';
import type { ModuleDef } from '../src/core/host.js';
import { ui as uiImpl } from '../src/core/ui.js';
import { startDoc } from './edits.js';
import { bootHeadless } from './headless.js';

const make = uiImpl as unknown as typeof ui;
const Nothing = () => null;

// Per pane: a toolbar item, a selection item, and an overlay while `shown`
// is on; module-wide: a toolbar item (shown while placed anywhere).
function panelModule(id: string) {
  let shown: { set(v: boolean): void } | null = null;
  const def: ModuleDef = {
    id,
    exports: {
      setup(ctx: ModuleContext) {
        const v = ctx.getValue(valueKey('shown', { default: false }));
        shown = v;
        ctx.provide(make.toolbar(Nothing));
        ctx.each(ctx.panes, (p) => {
          p.with(v, (s) => s.provide(make.overlay(Nothing)));
          p.provide(make.toolbar(Nothing));
          p.provide(make.selection(Nothing));
        });
      },
    },
  };
  return { def, show: (v: boolean) => shown?.set(v) };
}

it('each root lists exactly the items of live scopes, for the right panes', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.oneof(
          fc.record({ kind: fc.constant('place' as const), pane: fc.constantFrom('a', 'b'), module: fc.constantFrom('m', 'n'), on: fc.boolean() }),
          fc.record({ kind: fc.constant('show' as const), module: fc.constantFrom('m', 'n'), on: fc.boolean() }),
          fc.record({ kind: fc.constant('enable' as const), module: fc.constantFrom('m', 'n'), on: fc.boolean() }),
        ),
        { maxLength: 30 },
      ),
      (steps) => {
        const mods = { m: panelModule('m'), n: panelModule('n') };
        const { host } = bootHeadless([mods.m.def, mods.n.def]);
        host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
        host.addPane({ id: 'b', documentId: 'd' });
        const shown = { m: false, n: false };
        const enabled = { m: true, n: true };
        // A module runs while it is on and placed in some pane.
        const running = (id: 'm' | 'n') => enabled[id] && (host.placed('a').includes(id) || host.placed('b').includes(id));
        for (const step of steps) {
          const before = { m: running('m'), n: running('n') };
          if (step.kind === 'place') step.on ? host.place(step.pane, step.module) : host.unplace(step.pane, step.module);
          if (step.kind === 'show' && running(step.module)) {
            mods[step.module].show(step.on);
            shown[step.module] = step.on;
          }
          if (step.kind === 'enable') {
            host.setEnabled(step.module, step.on);
            enabled[step.module] = step.on;
          }
          // A stopped module's values start again at their defaults.
          for (const id of ['m', 'n'] as const) if (before[id] && !running(id)) shown[id] = false;

          for (const pane of ['a', 'b'] as const) {
            const placed = host.placed(pane).filter((id) => enabled[id as 'm' | 'n']) as ('m' | 'n')[];
            // Module-wide toolbar items: every running module.
            const on = (['m', 'n'] as const).filter(running);
            const ids = (root: 'toolbar' | 'overlay' | 'selection') => host.uiItems(root, pane).map((i) => i.moduleId);
            // Toolbar: module-wide items, plus this pane's placed modules' own.
            expect(ids('toolbar').sort()).toEqual([...on, ...placed].sort());
            expect(ids('selection')).toEqual(placed);
            expect(ids('overlay')).toEqual(placed.filter((id) => shown[id]));
          }
        }
      },
    ),
  );
});

it('a pane root on the module scope turns its module off', () => {
  for (const root of ['overlay', 'selection'] as const) {
    const def: ModuleDef = { id: 'm', exports: { setup: (ctx) => (ctx.provide as Function)(make[root](Nothing)) } };
    const { host, failures } = bootHeadless([def]);
    host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
    host.place('a', 'm');
    expect(failures, root).toEqual(['m']);
  }
});
