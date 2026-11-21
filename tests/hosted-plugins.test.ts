// A module that hosts a child pane and provides a plugin into it without
// running in the child itself (what cards-view does for both kinds of child).

import type { ChildPanes, Collection, ModuleContext, PaneHandle, PaneScope, PartPanes } from 'mwps';
import { Plugin, PluginKey } from 'prosemirror-state';
import { expect, it } from 'vitest';
import type { Host, ModuleDef } from '../src/core/host.js';
import { ui } from '../src/core/ui.js';
import { startDoc } from './edits.js';
import { bootHeadless } from './headless.js';

type Kind = 'child' | 'part';
// Cards are not panes (they run no plugins of their own), so only child panes are tested here.
const kinds: Kind[] = ['child'];
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const key = new PluginKey<number>('hosted-probe');
const probe = () => new Plugin({ key, state: { init: () => 1, apply: (_tr, v) => v } });
const has = (host: Host, pane: string) => key.getState(host.paneState(pane).get()!) !== undefined;
const copies = (host: Host, pane: string) =>
  host.paneState(pane).get()!.plugins.filter((p) => (p as unknown as { key: string }).key.startsWith('hosted-probe')).length;

// Hosts children of `kind` on each pane it runs in, and provides the probe
// into them. With `here`, it provides the probe on the host pane as well.
function hoster(kind: Kind, handles: Map<string, ChildPanes | PartPanes>, here = false): ModuleDef {
  return {
    id: 'hoster',
    exports: {
      moduleType: 'editorReplacement',
      setup(ctx: ModuleContext) {
        ctx.each(ctx.panes, (p) => {
          const kids = kind === 'child' ? p.hostChildPanes() : p.hostPartPanes(() => true);
          handles.set(p.id, kids);
          p.effect(() => () => handles.delete(p.id));
          if (kind === 'child') p.each(kids as Collection<PaneScope, PaneHandle>, (c) => c.provide(probe()));
          if (here) p.provide(probe());
          p.provide(ui.editorReplacement(() => null));
        });
      },
    },
  };
}

async function setup(kind: Kind, here = false) {
  const handles = new Map<string, ChildPanes | PartPanes>();
  const { host, failures } = bootHeadless([hoster(kind, handles, here)]);
  host.addPane({ id: 'r', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('r', 'hoster');
  if (kind === 'child') (handles.get('r') as ChildPanes).create();
  await settle();
  const kids = () => handles.get('r')?.list.get().map((c) => c.id) ?? [];
  return { host, failures, kids, handles };
}

for (const kind of kinds) {
  it(`${kind}: the host's plugin is in a child it does not run in, not in its own pane`, async () => {
    const { host, failures, kids } = await setup(kind);
    expect(kids().length).toBeGreaterThan(0);
    for (const id of kids()) {
      expect(has(host, id)).toBe(true);
      expect(copies(host, id)).toBe(1);
      expect(host.placed(id)).not.toContain('hoster');
      expect(host.modulesIn(id)).toEqual([...host.placed(id), 'hoster']);
    }
    expect(has(host, 'r')).toBe(false);
    expect(failures).toEqual([]);
  });

  it(`${kind}: the plugin goes when the host module is turned off, and returns when it is on`, async () => {
    const { host, failures, kids, handles } = await setup(kind);
    host.setEnabled('hoster', false);
    expect(host.slotIds()).toEqual(['r']);
    expect(has(host, 'r')).toBe(false);
    host.setEnabled('hoster', true);
    // The module makes cards itself; the test makes the child.
    if (kind === 'child') (handles.get('r') as ChildPanes).create();
    await settle();
    expect(kids().length).toBeGreaterThan(0);
    expect(has(host, kids()[0]!)).toBe(true);
    expect(failures).toEqual([]);
  });

  it(`${kind}: a host that also provides it on its own pane has it once there, and once in the child`, async () => {
    const { host, failures, kids } = await setup(kind, true);
    expect(copies(host, 'r')).toBe(1);
    for (const id of kids()) expect(copies(host, id)).toBe(1);
    expect(failures).toEqual([]);
  });
}

it('child: closing a child removes its plugin; the others and the host are unaffected', async () => {
  const { host, failures, handles } = await setup('child');
  const h = handles.get('r') as ChildPanes;
  const a = h.list.get()[0]!;
  const b = h.create();
  expect(has(host, b.id)).toBe(true);
  a.close();
  expect(() => host.paneState(a.id)).toThrow();
  expect(has(host, b.id)).toBe(true);
  b.close();
  expect(host.slotIds()).toEqual(['r']);
  expect(has(host, 'r')).toBe(false);
  expect(failures).toEqual([]);
});

// The module is placed in the child as well as hosting it. The child's own
// scope provides one plugin there and the host scope another: both come in
// once, and the module's plugins for the pane are not collected twice (which
// would be a duplicate-key failure). A card's modules are its host's, less the
// host, so only a hosted child can be in this case.
it('child: a module placed in the child it hosts has each plugin in once, no failure', async () => {
  const inner = new PluginKey<number>('inner-probe');
  const handles = new Map<string, ChildPanes>();
  const def: ModuleDef = {
    id: 'hoster',
    exports: {
      moduleType: 'editorReplacement',
      setup(ctx: ModuleContext) {
        ctx.each(ctx.panes, (p) => {
          if (p.id === 'r') {
            const kids = p.hostChildPanes();
            handles.set(p.id, kids);
            p.each(kids, (c) => c.provide(probe()));
            p.provide(ui.editorReplacement(() => null));
          } else {
            p.provide(new Plugin({ key: inner, state: { init: () => 2, apply: (_tr, v) => v } }));
          }
        });
      },
    },
  };
  const { host, failures } = bootHeadless([def]);
  host.addPane({ id: 'r', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('r', 'hoster');
  const id = handles.get('r')!.create({ owner: 'writer' }).id;
  host.place(id, 'hoster');
  await settle();
  expect(host.placed(id)).toContain('hoster');
  expect(host.modulesIn(id)).toEqual(['hoster']);
  const state = host.paneState(id).get()!;
  expect(key.getState(state)).toBe(1);
  expect(inner.getState(state)).toBe(2);
  expect(copies(host, id)).toBe(1);
  expect(failures).toEqual([]);
  // Taking it out of the child leaves the child with the host's plugin only.
  host.unplace(id, 'hoster');
  expect(inner.getState(host.paneState(id).get()!)).toBeUndefined();
  expect(has(host, id)).toBe(true);
  expect(failures).toEqual([]);
});

it("child: modules placed in a child come before the module hosting it, in plugins and modulesIn", async () => {
  const placedKey = new PluginKey<number>('placed-probe');
  const placed: ModuleDef = {
    id: 'placed',
    exports: { setup: (ctx) => ctx.each(ctx.panes, (p) => p.provide(new Plugin({ key: placedKey }))) },
  };
  const handles = new Map<string, ChildPanes | PartPanes>();
  const { host, failures } = bootHeadless([hoster('child', handles), placed]);
  host.addPane({ id: 'r', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('r', 'hoster');
  const id = (handles.get('r') as ChildPanes).create({ owner: 'writer' }).id;
  host.place(id, 'placed');
  await settle();
  expect(host.modulesIn(id)).toEqual(['placed', 'hoster']);
  const keys = host.paneState(id).get()!.plugins.map((p) => (p as unknown as { key: string }).key);
  const at = (prefix: string) => keys.findIndex((k) => k.startsWith(prefix));
  expect(at('placed-probe')).toBeGreaterThanOrEqual(0);
  expect(at('placed-probe')).toBeLessThan(at('hosted-probe'));
  expect(failures).toEqual([]);
});
