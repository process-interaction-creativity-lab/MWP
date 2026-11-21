// Properties of editor replacements and the child panes they host, through
// the module API and the host's own calls (what the app does).

import fc from 'fast-check';
import type { ChildHandle, ChildPaneOptions, ChildPanes, PaneScope } from 'mwps';
import { Plugin, PluginKey } from 'prosemirror-state';
import { expect, it, vi } from 'vitest';
import { Host, type ModuleDef } from '../src/core/host.js';
import { subscribeTo } from '../src/core/store.js';
import { ui } from '../src/core/ui.js';
import { writing } from '../src/lib/text.js';
import { command, docOf, startDoc } from './edits.js';
import { bootHeadless } from './headless.js';

// Documents are read after a macrotask.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// Hosts children in every pane it is placed on, without replacing the
// editor unless `replace`; the test makes and closes them.
function tree(replace = false) {
  const hosts = new Map<string, ChildPanes>();
  const def: ModuleDef = {
    id: 'tree',
    exports: {
      moduleType: 'editorReplacement',
      setup(ctx) {
        ctx.each(ctx.panes, (p) => {
          const children = p.hostChildPanes();
          hosts.set(p.id, children);
          p.effect(() => () => hosts.delete(p.id));
          p.each(children, (c) => c.provide(new Plugin({ key: new PluginKey('tree-child') })));
          if (replace) p.provide(ui.editorReplacement(() => null));
        });
      },
    },
  };
  const create = (paneId: string, options?: ChildPaneOptions): ChildHandle => hosts.get(paneId)!.create(options);
  const list = (paneId: string) => hosts.get(paneId)?.list.get().map((c) => c.id) ?? [];
  return { def, create, list, hosts };
}

// Records its live pane scopes and the order they end in.
function witness() {
  const live = new Set<string>();
  const ended: string[] = [];
  const def: ModuleDef = {
    id: 'witness',
    exports: {
      setup(ctx) {
        ctx.each(ctx.panes, (p) => {
          p.effect(() => {
            live.add(p.id);
            return () => {
              live.delete(p.id);
              ended.push(p.id);
            };
          });
        });
      },
    },
  };
  return { def, live, ended };
}

function documents(...ids: string[]) {
  return async (id: string) => {
    if (!ids.includes(id)) throw new Error(`no document ${id}`);
    return { doc: startDoc(), error: null };
  };
}

function boot(modules: ModuleDef[], load = documents('d', 'e', 'f')) {
  const failures: string[] = [];
  const host = new Host({ onFailure: (id) => failures.push(id), load });
  for (const m of modules) host.install(m);
  return { host, failures };
}

it('closing any pane ends its scopes and its children\'s', () => {
  // A random tree: each step makes a child in some pane that hosts, some
  // with their own modules (so they host in turn), or closes one.
  const step = fc.record({ at: fc.nat(), own: fc.boolean(), close: fc.boolean() });
  fc.assert(
    fc.property(fc.array(step, { maxLength: 12 }), (plan) => {
      const t = tree();
      const w = witness();
      const { host, failures } = boot([t.def, w.def]);
      host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
      host.place('root', 'witness');
      host.place('root', 'tree');
      for (const s of plan) {
        const hosting = [...t.hosts.keys()];
        const at = hosting[s.at % hosting.length]!;
        const kids = t.hosts.get(at)!.list.get();
        if (s.close && kids.length) kids[s.at % kids.length]!.close();
        else t.create(at, { owner: s.own ? 'writer' : 'module' });
      }
      expect(failures).toEqual([]);
      for (const [id, children] of t.hosts) {
        expect(children.list.get().map((c) => c.id)).toEqual(host.slotIds().filter((s) => host.paneInfo(s)!.parent === id));
      }
      // The witness runs in every pane it is placed on.
      const placed = host.paneIds().filter((id) => host.placed(id).includes('witness'));
      expect([...w.live].sort()).toEqual(placed.sort());

      w.ended.length = 0;
      host.removePane('root');
      expect(host.slotIds()).toEqual([]);
      expect(w.live.size).toBe(0);
      expect(w.ended.sort()).toEqual(placed.sort());
    }),
    { numRuns: 60 },
  );
});

it("an inheriting child shows the host pane's document and runs its modules, not the host's", async () => {
  const t = tree();
  const w = witness();
  const { host, failures } = boot([t.def, w.def]);
  host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('root', 'witness');
  host.place('root', 'tree');
  const a = t.create('root');
  t.create('root', { document: 'e' });
  await settle();
  expect(t.list('root')).toEqual([a.id, 'root/2']);
  expect(host.placed(a.id)).toEqual(['witness']);
  expect([...w.live].sort()).toEqual(['root', 'root/1', 'root/2']);
  // The child shares the open copy of `d` with its host.
  expect(a.run(command({ kind: 'insert', at: 0, text: 'x' }))).toBe(true);
  expect(docOf(host, 'root').textContent).toBe(docOf(host, a.id).textContent);
  expect(a.state.get()!.doc.textContent).toBe('xone twothree');

  // A module placed on the host later reaches its inheriting children.
  host.unplace('root', 'witness');
  expect(w.live.size).toBe(0);
  host.place('root', 'witness');
  expect(w.live.size).toBe(3);

  // Closing one ends its scopes; turning the host module off closes the rest.
  a.close();
  expect(w.ended.at(-1)).toBe('root/1');
  expect(a.run(command({ kind: 'insert', at: 0, text: 'y' }))).toBe(false);
  host.setEnabled('tree', false);
  expect(host.slotIds()).toEqual(['root']);
  expect(failures).toEqual([]);
});

it('a writer-owned child starts with no document and the host pane’s modules, then keeps its own', async () => {
  const t = tree();
  const w = witness();
  const { host } = boot([t.def, w.def]);
  host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('root', 'witness');
  host.place('root', 'tree');
  const a = t.create('root', { owner: 'writer', document: null });
  expect(host.paneInfo(a.id)).toMatchObject({ documentId: null, status: 'ready', owner: 'writer' });
  expect(host.placed(a.id)).toEqual(['witness']);
  host.unplace(a.id, 'witness');
  expect(host.placed('root')).toEqual(['witness', 'tree']);

  // Its document is read, then opened; its state follows the new pane,
  // and focus stays on it throughout.
  host.place(a.id, 'witness');
  host.focus(a.id);
  host.showDocument(a.id, 'e');
  expect(host.paneInfo(a.id)!.status).toBe('loading');
  expect(host.lastFocusedPane.get()).toBe(a.id);
  expect(host.actions(a.id)).toEqual([]);
  await settle();
  expect(host.paneInfo(a.id)!.status).toBe('ready');
  expect(a.state.get()!.doc.textContent).toBe('one twothree');
  expect(w.live.has(a.id)).toBe(true);
  expect(host.lastFocusedPane.get()).toBe(a.id);

  // A document that can't be read leaves the child showing why.
  host.showDocument(a.id, 'missing');
  await settle();
  expect(host.paneInfo(a.id)).toMatchObject({ status: 'error', error: 'no document missing' });

  // A deleted document empties a writer-owned child and closes a
  // module-owned one.
  host.setProjectDocuments([{ id: 'd', name: 'D' }, { id: 'f', name: 'F' }]);
  host.showDocument(a.id, 'f');
  const b = t.create('root', { document: 'f' });
  await settle();
  expect(host.paneInfo(b.id)).toMatchObject({ documentId: 'f', status: 'ready', owner: 'module' });
  host.setProjectDocuments([{ id: 'd', name: 'D' }]);
  expect(host.paneInfo(a.id)!.documentId).toBeNull();
  expect(host.paneInfo(b.id)).toBeNull();
  expect(t.list('root')).toEqual([a.id]);
  expect(() => t.create('root', { document: null })).toThrow(/owner: 'writer'/);
});

it("the hosting module's plugins come after the child's add-ons", () => {
  const t = tree();
  const addOn: ModuleDef = {
    id: 'addon',
    exports: { setup: (ctx) => ctx.each(ctx.panes, (p) => p.provide(new Plugin({ key: new PluginKey('addon') }))) },
  };
  const { host } = boot([t.def, addOn]);
  host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('root', 'addon');
  host.place('root', 'tree');
  const a = t.create('root');
  const order = a.state
    .get()!
    .plugins.map((p) => (p as unknown as { key: string }).key.replace(/\$\d*$/, ''))
    .filter((k) => k === 'addon' || k === 'tree-child');
  expect(order).toEqual(['addon', 'tree-child']);
});

it('while a replacement shows, the pane runs only its module; the others run in its children', () => {
  const t = tree(true);
  const w = witness();
  const { host, failures } = boot([t.def, w.def]);
  host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('root', 'witness');
  expect(w.live.has('root')).toBe(true);
  host.place('root', 'tree');
  expect(host.replacementOf('root')?.moduleId).toBe('tree');
  expect(w.live.has('root')).toBe(false);
  const a = t.create('root');
  expect([...w.live]).toEqual([a.id]);
  // Off again: the editor and the other modules come back.
  host.unplace('root', 'tree');
  expect(host.replacementOf('root')).toBeNull();
  expect([...w.live]).toEqual(['root']);
  expect(failures).toEqual([]);
});

it('focus stays where it lands; a closed child leaves it on its host', async () => {
  const t = tree(true);
  const { host } = boot([t.def]);
  host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('root', 'tree');
  const a = t.create('root', { document: 'e' });
  await settle();
  host.focus('root');
  expect(host.lastFocusedPane.get()).toBe('root');
  a.focus();
  expect(host.lastFocusedPane.get()).toBe(a.id);
  a.close();
  expect(host.lastFocusedPane.get()).toBe('root');
});

it('on the focus path, an action runs the copy found first walking outward; the toolbar is the last focused pane’s', () => {
  const ran: string[] = [];
  const focused = new Map<string, boolean>();
  const actions = { flip: { title: 'Flip' } };
  const named = (name: string) => Object.assign(() => null, { displayName: name });
  const childOf = new Map<string, string>();
  const split: ModuleDef = {
    id: 'split',
    exports: {
      moduleType: 'editorReplacement',
      actions,
      setup(ctx) {
        ctx.provide(ui.toolbar(named('module')));
        ctx.each(ctx.panes, (p) => {
          childOf.set(p.id, p.hostChildPanes().create({ owner: 'writer' }).id);
          p.provide(actions.flip, { procedure: () => ran.push(p.id) > 0 });
          p.provide(ui.toolbar(named(p.id)));
          p.provide(ui.editorReplacement(() => null));
          p.effect(() => {
            const read = () => void focused.set(p.id, p.isLastFocused.get());
            read();
            return subscribeTo(p.isLastFocused, read);
          });
        });
      },
    },
  };
  const { host, failures } = boot([split]);
  host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
  host.addPane({ id: 'other', documentId: 'e' }, { doc: startDoc(), error: null });
  host.place('root', 'split');
  host.place('other', 'split');
  // A split nested in the outer one's pane.
  const middle = childOf.get('root')!;
  host.place(middle, 'split');
  const inner = childOf.get(middle)!;
  host.focus(inner);
  expect(failures).toEqual([]);
  expect(host.focusPath(inner)).toEqual([inner, middle, 'root']);
  expect(host.runAction(inner, 'split', 'flip')).toBe(true);
  expect(ran).toEqual([middle]);
  const toolbar = () => host.uiItems('toolbar', host.lastFocusedPane.get()).map((i) => (i.item as { component: { displayName?: string } }).component.displayName);
  expect(toolbar()).toEqual(['module']);
  expect(Object.fromEntries(focused)).toEqual({ root: true, [middle]: true, other: false });
  // Focus on the outer split itself: only its own copy applies.
  host.focus('root');
  expect(host.runAction('root', 'split', 'flip')).toBe(true);
  expect(ran).toEqual([middle, 'root']);
  expect(toolbar()).toEqual(['module', 'root']);
  expect(focused.get(middle)).toBe(false);
});

it("the hosting module's own actions work from its children, against the host pane; its toolbar items don't show there", () => {
  const ran: string[] = [];
  const actions = { flip: { title: 'Flip', keys: 'Mod-j' } };
  const split: ModuleDef = {
    id: 'split',
    exports: {
      moduleType: 'editorReplacement',
      actions,
      setup(ctx) {
        ctx.each(ctx.panes, (p) => {
          p.hostChildPanes().create();
          p.provide(actions.flip, {
            command: (state, dispatch) => {
              if (dispatch) ran.push(`${p.id}:${writing(state.doc).childCount}`);
              return true;
            },
          });
          p.provide(ui.toolbar(() => null));
          p.provide(ui.editorReplacement(() => null));
        });
      },
    },
  };
  const { host, failures } = boot([split]);
  host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('root', 'split');
  expect(failures).toEqual([]);
  expect(host.actions('root/1').find((a) => a.name === 'flip')!.enabled).toBe(true);
  expect(host.runAction('root/1', 'split', 'flip')).toBe(true);
  expect(ran).toEqual(['root:2']);
  expect(host.uiItems('toolbar', 'root/1')).toEqual([]);
  expect(host.uiItems('toolbar', 'root').map((i) => i.moduleId)).toEqual(['split']);
  // Its key works in the child's own view.
  const press = (mod: 'metaKey' | 'ctrlKey') =>
    ({ key: 'j', keyCode: 74, shiftKey: false, altKey: false, [mod]: true, type: 'keydown' }) as unknown as KeyboardEvent;
  expect(host.actionKey('root/1', press('metaKey')) || host.actionKey('root/1', press('ctrlKey'))).toBe(true);
  expect(ran).toEqual(['root:2', 'root:2']);
});

it('a command action greys out in a child showing no document, and runs once it shows one', async () => {
  const t = tree();
  const actions = { mark: { title: 'Mark' } };
  const marker: ModuleDef = {
    id: 'marker',
    exports: { actions, setup: (ctx) => ctx.each(ctx.panes, (p) => p.provide(actions.mark, { command: () => true })) },
  };
  const { host, failures } = boot([t.def, marker]);
  host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('root', 'marker');
  host.place('root', 'tree');
  const a = t.create('root', { owner: 'writer', document: null });
  const mark = () => host.actions(a.id).find((x) => x.name === 'mark')!;
  expect(failures).toEqual([]);
  expect(host.placed(a.id)).toEqual(['marker']);
  expect(mark().enabled).toBe(false);
  host.showDocument(a.id, 'e');
  await settle();
  expect(mark().enabled).toBe(true);
});

it("each hands a child pane its handle, the one in list, across document switches; a module never sees its own children in ctx.panes", async () => {
  const seen: string[] = [];
  const given: [PaneScope, ChildHandle][] = [];
  let children: ChildPanes | null = null;
  const split: ModuleDef = {
    id: 'split',
    exports: {
      moduleType: 'editorReplacement',
      setup(ctx) {
        ctx.each(ctx.panes, (p) => {
          seen.push(`pane:${p.id}`);
          children = p.hostChildPanes();
          children.create();
          children.create({ owner: 'writer', document: 'd' });
          p.each(children, (c, handle) => void given.push([c, handle]));
        });
      },
    },
  };
  const { host } = boot([split]);
  host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('root', 'split');
  const [first, second] = children!.list.get();
  expect(seen).toEqual(['pane:root']);
  expect(given.map(([c, h]) => [c.id, h])).toEqual([
    [first!.id, first],
    [second!.id, second],
  ]);

  // A new document is a new child pane, with the same handle.
  host.showDocument(second!.id, 'e');
  await settle();
  const [c, handle] = given.at(-1)!;
  expect(given).toHaveLength(3);
  expect(c.documentId).toBe('e');
  expect(handle).toBe(second);
  handle.close();
  expect(children!.list.get()).toEqual([first]);
});

it('hosting twice, hosting from an extension, two replacements, or create inside a dispatch, turn the module off', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const twice: ModuleDef = {
    id: 'twice',
    exports: {
      moduleType: 'editorReplacement',
      setup: (ctx) => ctx.each(ctx.panes, (p) => void (p.hostChildPanes(), p.hostChildPanes())),
    },
  };
  const sneaky: ModuleDef = { id: 'sneaky', exports: { setup: (ctx) => ctx.each(ctx.panes, (p) => void p.hostChildPanes()) } };
  const painter: ModuleDef = { id: 'painter', exports: { setup: (ctx) => ctx.each(ctx.panes, (p) => p.provide(ui.editorReplacement(() => null))) } };
  const double: ModuleDef = {
    id: 'double',
    exports: {
      moduleType: 'editorReplacement',
      setup: (ctx) =>
        ctx.each(ctx.panes, (p) => {
          p.provide(ui.editorReplacement(() => null));
          p.provide(ui.editorReplacement(() => null));
        }),
    },
  };
  let children: ChildPanes | null = null;
  const eager: ModuleDef = {
    id: 'eager',
    exports: {
      moduleType: 'editorReplacement',
      setup: (ctx) =>
        ctx.each(ctx.panes, (p) => {
          const kids = (children = p.hostChildPanes());
          p.provide(new Plugin({ state: { init: () => 0, apply: (tr, v) => (tr.docChanged && kids.create(), v) } }));
        }),
    },
  };
  for (const def of [twice, sneaky, painter, double, eager]) {
    const { host, failures } = bootHeadless([def]);
    host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
    host.place('root', def.id);
    if (def === eager) {
      expect(children).not.toBeNull();
      host.run('root', command({ kind: 'insert', at: 0, text: 'x' }));
    }
    expect(failures).toEqual([def.id]);
    expect(host.replacementOf('root')).toBeNull();
  }
});

it('placing an editor replacement replaces the pane’s other one; moduleType is checked', () => {
  const replacement = (id: string): ModuleDef => ({
    id,
    exports: { moduleType: 'editorReplacement', setup: (ctx) => ctx.each(ctx.panes, (p) => p.provide(ui.editorReplacement(() => null))) },
  });
  const { host, failures } = boot([replacement('one'), replacement('two')]);
  host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('root', 'one');
  host.place('root', 'two');
  expect(host.placed('root')).toEqual(['two']);
  expect(host.replacementOf('root')?.moduleId).toBe('two');
  host.place('root', 'one');
  expect(host.replacementOf('root')?.moduleId).toBe('one');
  expect(failures).toEqual([]);
  expect(host.moduleType('two')).toBe('editorReplacement');
  expect(() => host.install({ id: 'odd', exports: { moduleType: 'layout' as 'extension', setup() {} } })).toThrow(/moduleType/);
});

it('an editor replacement with no children takes focus with p.focus(), and its toolbar items show', () => {
  let paint: PaneScope | null = null;
  const def: ModuleDef = {
    id: 'paint',
    exports: {
      moduleType: 'editorReplacement',
      setup: (ctx) =>
        ctx.each(ctx.panes, (p) => {
          paint = p;
          p.provide(ui.toolbar(() => null));
          p.provide(ui.editorReplacement(() => null));
        }),
    },
  };
  const { host, failures } = boot([def]);
  host.addPane({ id: 'root', documentId: 'd' }, { doc: startDoc(), error: null });
  host.addPane({ id: 'other', documentId: 'e' }, { doc: startDoc(), error: null });
  host.place('root', 'paint');
  host.focus('other');
  expect(host.uiItems('toolbar', host.lastFocusedPane.get())).toEqual([]);
  paint!.focus();
  expect(host.lastFocusedPane.get()).toBe('root');
  expect(host.uiItems('toolbar', host.lastFocusedPane.get()).map((i) => i.moduleId)).toEqual(['paint']);
  expect(failures).toEqual([]);
});
