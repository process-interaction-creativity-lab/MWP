// Menus the host draws from actions: a pane tab's (`ui.tabMenu`) and the
// project tab's (`ui.projectMenu`, from project modules); and the window's
// modal root (`ui.modal`), where a menu action opens a dialog.

import { type ActionDeclaration, type ChildPanes, type ModuleContext, type ModuleExports, ui, valueKey } from 'mwps';
import { expect, it } from 'vitest';
import type { ModuleDef } from '../src/core/host.js';
import { ui as uiImpl } from '../src/core/ui.js';
import { startDoc } from './edits.js';
import { bootHeadless } from './headless.js';

const make = uiImpl as unknown as typeof ui;
const Nothing = () => null;

// A split: Stacked in its own tab, Close pane in each child's.
function split() {
  const actions = { stacked: { title: 'Stacked' }, closePane: { title: 'Close pane' } };
  const dir = valueKey('dir', { default: 'horizontal' });
  let children: ChildPanes | null = null;
  const def: ModuleDef = {
    id: 'split',
    exports: {
      moduleType: 'editorReplacement',
      actions,
      setup(ctx: ModuleContext) {
        ctx.each(ctx.panes, (p) => {
          const orientation = p.getValue(dir);
          const kids = (children = p.hostChildPanes());
          kids.create({ owner: 'writer' });
          kids.create({ owner: 'writer' });
          p.provide(actions.stacked, {
            procedure: () => (orientation.set((d) => (d === 'vertical' ? 'horizontal' : 'vertical')), true),
            active: () => orientation.get() === 'vertical',
          });
          p.provide(make.tabMenu(actions.stacked));
          p.provide(make.tabMenu(Nothing));
          p.each(kids, (c) => {
            c.provide(actions.closePane, {
              procedure: () => (kids.list.get().find((k) => k.id === c.id)?.close(), true),
            });
            c.provide(make.tabMenu(actions.closePane));
          });
          p.provide(make.editorReplacement(Nothing));
        });
      },
    },
  };
  return { def, children: () => children!.list.get().map((c) => c.id) };
}

it("a pane tab lists the actions provided for it, and runs each as from that pane", () => {
  const s = split();
  const { host, failures } = bootHeadless([s.def]);
  host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('root', 'split');
  const [a, b] = s.children();
  const titles = (pane: string) =>
    host.tabMenu(pane).map((e) => (e.kind === 'action' ? `${e.title}${e.active ? ' ✓' : ''}` : 'component'));
  expect(titles('root')).toEqual(['Stacked', 'component']);
  expect(titles(a!)).toEqual(['Close pane']);

  expect(host.runAction('root', 'split', 'stacked')).toBe(true);
  expect(titles('root')).toEqual(['Stacked ✓', 'component']);
  // Close pane from b's tab closes b, though a has its own copy.
  expect(host.runAction(b!, 'split', 'closePane')).toBe(true);
  expect(s.children()).toEqual([a]);
  expect(failures).toEqual([]);
});

it("a tab menu is a layout's, on a writer-owned pane, with its own actions", () => {
  const actions = { mine: { title: 'Mine' } };
  const foreign: ActionDeclaration = { title: 'Not mine' };
  const cases: [string, ModuleExports][] = [
    ['an add-on', { actions, setup: (ctx) => ctx.each(ctx.panes, (p) => p.provide(make.tabMenu(actions.mine))) }],
    ['a foreign action', { moduleType: 'editorReplacement', setup: (ctx) => ctx.each(ctx.panes, (p) => p.provide(make.tabMenu(foreign))) }],
    [
      'a module-owned child',
      {
        moduleType: 'editorReplacement',
        actions,
        setup: (ctx) =>
          ctx.each(ctx.panes, (p) => {
            const kids = p.hostChildPanes();
            kids.create();
            p.each(kids, (c) => c.provide(make.tabMenu(actions.mine)));
          }),
      },
    ],
  ];
  for (const [name, exports] of cases) {
    const { host, failures } = bootHeadless([{ id: 'm', exports }]);
    host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
    host.place('a', 'm');
    expect(failures, name).toEqual(['m']);
  }
});

// Counts its runs; its UI is one project menu action, or `extra` too.
function exporter(extra?: (ctx: ModuleContext) => void) {
  const actions = { exportAll: { title: 'Export project' } };
  const seen = { runs: 0, exports: 0, panes: 0 };
  const def: ModuleDef = {
    id: 'exporter',
    exports: {
      moduleType: 'project',
      actions,
      setup(ctx) {
        seen.runs++;
        ctx.each(ctx.panes, () => void seen.panes++);
        ctx.provide(actions.exportAll, { procedure: () => (seen.exports++, true) });
        ctx.provide(make.projectMenu(actions.exportAll));
        extra?.(ctx);
      },
    },
  };
  return { def, seen };
}

it('a project module runs while placed in the project, and its menu runs its actions', () => {
  const e = exporter();
  const { host, failures } = bootHeadless([e.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  expect(() => host.place('a', 'exporter')).toThrow(/project module/);
  expect(e.seen.runs).toBe(0);

  host.placeInProject('exporter');
  expect(e.seen.runs).toBe(1);
  expect(host.projectMenu().map((m) => [m.title, m.enabled])).toEqual([['Export project', true]]);
  expect(host.runAction(null, 'exporter', 'exportAll')).toBe(true);
  expect(host.runAction('a', 'exporter', 'exportAll')).toBe(true);
  expect(e.seen).toMatchObject({ exports: 2, panes: 0 });

  host.unplaceFromProject('exporter');
  expect(host.projectMenu()).toEqual([]);
  expect(host.runAction(null, 'exporter', 'exportAll')).toBe(false);
  expect(failures).toEqual([]);
});

it("a project module's only UI is the project menu, of actions, and the modal root; only it has a project menu", () => {
  expect(() => make.projectMenu(Nothing as never)).toThrow(/exported actions$/);

  const e = exporter((ctx) => ctx.provide(make.toolbar(Nothing)));
  const { host, failures } = bootHeadless([e.def]);
  host.placeInProject('exporter');
  expect(failures).toEqual(['exporter']);

  const actions = { go: { title: 'Go' } };
  const extension: ModuleDef = {
    id: 'ext',
    exports: { actions, setup: (ctx) => ctx.provide(make.projectMenu(actions.go)) },
  };
  const other = bootHeadless([extension]);
  other.host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  other.host.place('a', 'ext');
  expect(other.failures).toEqual(['ext']);
  expect(() => other.host.placeInProject('ext')).toThrow(/isn't a project module/);
});

it("a menu action opens a dialog in the window's modal root; a pane's shows whichever pane is focused", () => {
  const actions = { rename: { title: 'Rename across documents…' } };
  const asking = valueKey('asking', { default: false });
  const renamer: ModuleDef = {
    id: 'renamer',
    exports: {
      moduleType: 'project',
      actions,
      setup(ctx) {
        const open = ctx.getValue(asking);
        ctx.provide(actions.rename, { procedure: () => (open.set(true), true) });
        ctx.provide(make.projectMenu(actions.rename));
        // Its dialog reads `open`; drawn always, it shows nothing while closed.
        ctx.provide(make.modal(Nothing));
      },
    },
  };
  const painting = valueKey('painting', { default: false });
  const brushes = new Map<string, { set(v: boolean): void }>();
  const pen: ModuleDef = {
    id: 'pen',
    exports: {
      setup: (ctx) =>
        ctx.each(ctx.panes, (p) => {
          const on = p.getValue(painting);
          brushes.set(p.id, on);
          p.with(on, (s) => s.provide(make.modal(Nothing)));
        }),
    },
  };
  const { host, failures } = bootHeadless([renamer, pen]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.addPane({ id: 'b', documentId: 'd' }, { doc: startDoc(), error: null });
  const modals = () => host.uiItems('modal', null).map((i) => i.moduleId);

  host.placeInProject('renamer');
  expect(modals()).toEqual(['renamer']);
  expect(host.runAction(null, 'renamer', 'rename')).toBe(true);

  host.place('a', 'pen');
  host.place('b', 'pen');
  host.focus('b');
  brushes.get('a')!.set(true);
  expect(modals()).toEqual(['renamer', 'pen']);
  brushes.get('a')!.set(false);
  expect(modals()).toEqual(['renamer']);

  host.unplaceFromProject('renamer');
  expect(modals()).toEqual([]);
  expect(failures).toEqual([]);
});
