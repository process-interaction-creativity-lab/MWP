// What persists across a reload: the pane layout (persisted children,
// each pane's document and modules) and persisted values, through a
// project vault and a user file, as the web host keeps them.

import fc from 'fast-check';
import type { ChildPanes, Value } from 'mwps';
import { expect, it } from 'vitest';
import { Host, type ModuleDef } from '../src/core/host.js';
import { Project } from '../src/core/project.js';
import { ModuleValues, Saved } from '../src/core/saved.js';
import { valueKey } from '../src/core/scope.js';
import { MemoryVault } from '../src/core/vault/memory.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const ROOT = 'main';

const orientationKey = valueKey('orientation', { default: 'horizontal', persist: true });
const settingKey = valueKey('setting', { default: 0, persist: true });
const countKey = valueKey('count', { default: 0, persist: true });
const noteKey = valueKey('note', { default: '', persist: true });
const scratchKey = valueKey('scratch', { default: 0 });

// What a session's modules hold, by pane or document id.
function modules() {
  const children = new Map<string, ChildPanes>();
  const orientation = new Map<string, Value<string>>();
  const count = new Map<string, Value<number>>();
  const note = new Map<string, Value<string>>();
  const scratch = new Map<string, Value<number>>();
  const setting: { value: Value<number> | null } = { value: null };
  // A layout: writer-owned children it asks to persist, and an orientation.
  const split: ModuleDef = {
    id: 'split',
    exports: {
      moduleType: 'editorReplacement',
      setup(ctx) {
        setting.value = ctx.getValue(settingKey);
        ctx.each(ctx.panes, (p) => {
          const list = p.hostChildPanes({ persist: true });
          if (list.list.get().length === 0) list.create({ owner: 'writer', document: null });
          children.set(p.id, list);
          orientation.set(p.id, p.getValue(orientationKey));
          p.effect(() => () => {
            children.delete(p.id);
            orientation.delete(p.id);
          });
        });
      },
    },
  };
  // An add-on keeping a pane value, a document value and one not persisted.
  const marker: ModuleDef = {
    id: 'marker',
    exports: {
      setup(ctx) {
        ctx.each(ctx.panes, (p) => {
          count.set(p.id, p.getValue(countKey));
          scratch.set(p.id, p.getValue(scratchKey));
          p.effect(() => () => void count.delete(p.id));
        });
        ctx.each(ctx.documents, (d) => void note.set(d.id, d.getValue(noteKey)));
      },
    },
  };
  return { defs: [split, marker], children, orientation, count, note, scratch, setting };
}

// One page's session on a project: the root opened as the web host does.
async function session(vault: MemoryVault, user: MemoryVault) {
  const project = await Project.open(vault);
  const saved = await Saved.open(vault, await ModuleValues.open(user));
  const failures: string[] = [];
  const host: Host = new Host({
    onFailure: (id) => failures.push(id),
    load: (id, schema) => project.load(schema, id),
    save: (id, doc) => void project.save(id, doc),
  });
  const held = modules();
  for (const m of held.defs) host.install(m);
  host.setSaved(saved);
  host.setProjectDocuments(project.documents);
  project.subscribe(() => host.setProjectDocuments(project.documents));
  const root = saved.pane(ROOT);
  host.openPane(ROOT, root ? root.document : (project.documents[0]?.id ?? null));
  await settle();
  return { host, project, vault, failures, ...held };
}

async function reload(vault: MemoryVault, user: MemoryVault) {
  await vault.flush();
  await user.flush();
  return session(vault.reopen(), user.reopen());
}

// Everything a writer would see come back: each pane, and each host's
// children in their order.
function snapshot(s: Awaited<ReturnType<typeof session>>) {
  return s.host.slotIds().sort().map((id) => {
    const info = s.host.paneInfo(id)!;
    return {
      id,
      parent: info.parent,
      owner: info.owner,
      document: info.documentId,
      placed: [...s.host.placed(id)],
      orientation: s.orientation.get(id)?.get(),
      count: s.count.get(id)?.get(),
      children: s.children.get(id)?.list.get().map((c) => c.id),
    };
  });
}

type Op =
  | { op: 'place' | 'unplace'; module: 'split' | 'marker'; pane: number }
  | { op: 'add' | 'close' | 'orient' | 'count'; pane: number; n: number }
  | { op: 'fail' | 'restart' };

const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ op: fc.constantFrom('place', 'unplace'), module: fc.constantFrom('split', 'marker'), pane: fc.nat(4) }),
  fc.record({ op: fc.constantFrom('add', 'close', 'orient', 'count'), pane: fc.nat(4), n: fc.nat(3) }),
  fc.record({ op: fc.constantFrom('add', 'close'), pane: fc.constant(0), n: fc.nat(3) }),
  fc.record({ op: fc.constantFrom('fail', 'restart') }),
) as fc.Arbitrary<Op>;

function apply(s: Awaited<ReturnType<typeof session>>, o: Op): void {
  const panes = s.host.slotIds();
  const pane = 'pane' in o ? panes[o.pane % panes.length]! : '';
  switch (o.op) {
    case 'place':
      return s.host.place(pane, o.module);
    case 'unplace':
      return s.host.unplace(pane, o.module);
    case 'add':
      return void s.children.get(pane)?.create({ owner: 'writer', document: null });
    // Never the last, which the split would make again, as resizable-split does.
    case 'close': {
      const list = s.children.get(pane)?.list.get() ?? [];
      return list.length > 1 ? list[o.n % list.length]!.close() : undefined;
    }
    case 'orient':
      return s.orientation.get(pane)?.set(o.n % 2 ? 'vertical' : 'horizontal');
    case 'count':
      return s.count.get(pane)?.set(o.n);
    case 'fail':
      s.host.fail('split', new Error('test'));
      return s.host.setEnabled('split', true);
    case 'restart':
      return s.host.install(s.defs[0]!);
  }
}

it('a reload brings back every pane the writer arranged, with its document, modules and values', async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(op, { maxLength: 25 }), async (ops) => {
      const vault = new MemoryVault();
      const user = new MemoryVault();
      const before = await session(vault, user);
      // From a split on the root, as a writer would start.
      for (const o of [{ op: 'place', module: 'split', pane: 0 } as const, ...ops]) {
        apply(before, o);
        await settle();
      }
      const after = await reload(vault, user);
      expect(snapshot(after)).toEqual(snapshot(before));
      expect(after.failures).toEqual([]);
    }),
    { numRuns: 60 },
  );
});

it('a module failing, turned off or restarting keeps its children; unplacing it forgets them', async () => {
  const vault = new MemoryVault();
  const s = await session(vault, new MemoryVault());
  s.host.place(ROOT, 'split');
  s.children.get(ROOT)!.create({ owner: 'writer', document: null });
  s.orientation.get(ROOT)!.set('vertical');
  const ids = s.children.get(ROOT)!.list.get().map((c) => c.id);
  expect(ids).toHaveLength(2);
  const kept = () => {
    expect(s.children.get(ROOT)!.list.get().map((c) => c.id)).toEqual(ids);
    expect(s.orientation.get(ROOT)!.get()).toBe('vertical');
  };

  s.host.fail('split', new Error('test'));
  expect(s.children.get(ROOT)).toBeUndefined();
  s.host.setEnabled('split', true);
  kept();
  s.host.setEnabled('split', false);
  s.host.setEnabled('split', true);
  kept();
  s.host.install(s.defs[0]!);
  kept();

  // Closing a child forgets it; a new one takes a new id.
  s.children.get(ROOT)!.list.get()[1]!.close();
  s.children.get(ROOT)!.create({ owner: 'writer', document: null });
  const third = s.children.get(ROOT)!.list.get()[1]!.id;
  expect(ids).not.toContain(third);

  s.host.unplace(ROOT, 'split');
  s.host.place(ROOT, 'split');
  expect(s.children.get(ROOT)!.list.get().map((c) => c.id)).not.toContain(ids[0]);
  expect(s.orientation.get(ROOT)!.get()).toBe('horizontal');
});

it('document values come back with their document and go when it is deleted; module values come back', async () => {
  const vault = new MemoryVault();
  const user = new MemoryVault();
  const first = await Project.open(vault);
  const { id } = await first.createDocument((await session(new MemoryVault(), new MemoryVault())).host.schema, 'One');
  await vault.flush();

  const s = await session(vault, user);
  s.host.place(ROOT, 'marker');
  s.note.get(id)!.set('mine');
  s.scratch.get(ROOT)!.set(5);
  s.host.place(ROOT, 'split');
  s.setting.value!.set(7);

  const again = await reload(vault, user);
  expect(again.host.paneInfo(ROOT)!.documentId).toBe(id);
  again.host.unplace(ROOT, 'split');
  expect(again.note.get(id)!.get()).toBe('mine');
  expect(again.scratch.get(ROOT)!.get()).toBe(0);
  again.host.place(ROOT, 'split');
  expect(again.setting.value!.get()).toBe(7);

  expect(await again.vault.list('doc-values/')).toHaveLength(1);
  await again.project.deleteDocument(id);
  expect(await again.vault.list('doc-values/')).toEqual([]);
});

it('a pane showing another document keeps its writer-owned children and forgets its module-owned ones', async () => {
  const vault = new MemoryVault();
  const user = new MemoryVault();
  const first = await Project.open(vault);
  const schema = (await session(new MemoryVault(), new MemoryVault())).host.schema;
  const a = (await first.createDocument(schema, 'A')).id;
  const b = (await first.createDocument(schema, 'B')).id;
  await vault.flush();

  const s = await session(vault, user);
  s.host.place(ROOT, 'split');
  const writers = s.children.get(ROOT)!.list.get().map((c) => c.id);
  const mine = s.children.get(ROOT)!.create({ owner: 'module' }).id;
  expect(s.host.paneInfo(mine)!.documentId).toBe(a);

  s.host.showDocument(ROOT, b);
  await settle();
  expect(s.children.get(ROOT)!.list.get().map((c) => c.id)).toEqual(writers);
  expect(s.host.slotIds()).not.toContain(mine);

  const again = s.children.get(ROOT)!.create({ owner: 'module' });
  const owners = (t: typeof s) => t.children.get(ROOT)!.list.get().map((c) => [c.id, c.owner]);
  expect(owners(s)).toEqual([...writers.map((id) => [id, 'writer']), [again.id, 'module']]);

  const after = await reload(vault, user);
  expect(snapshot(after)).toEqual(snapshot(s));
  expect(owners(after)).toEqual(owners(s));
});

// A user vault that records which files were written.
class RecordingVault extends MemoryVault {
  readonly written: string[] = [];
  override async write(path: string, content: string): Promise<void> {
    this.written.push(path);
    return super.write(path, content);
  }
}

const moduleValue = { kind: 'module' } as const;

it("setting a module value writes only that value's file, and values round-trip", async () => {
  const user = new RecordingVault();
  const saved = await Saved.open(new MemoryVault(), await ModuleValues.open(user));
  saved.setValue(moduleValue, 'cast', 'people', { big: 'x'.repeat(1000) });
  saved.setValue(moduleValue, 'cast', 'a/b name', [1, 2]);
  saved.setValue(moduleValue, 'graveyard', 'collapsed', true);
  user.written.length = 0;

  saved.setValue(moduleValue, 'graveyard', 'collapsed', false);
  expect(user.written).toEqual(['graveyard/collapsed.json']);
  expect(await user.list('')).toHaveLength(3);

  await user.flush();
  const again = await Saved.open(new MemoryVault(), await ModuleValues.open(user.reopen()));
  expect(again.value(moduleValue, 'cast', 'people')).toEqual({ big: 'x'.repeat(1000) });
  expect(again.value(moduleValue, 'cast', 'a/b name')).toEqual([1, 2]);
  expect(again.value(moduleValue, 'graveyard', 'collapsed')).toBe(false);
  expect(again.value(moduleValue, 'graveyard', 'other')).toBeUndefined();
});

it('an old single module-values file is migrated into files and removed once they are written', async () => {
  const user = new MemoryVault();
  let old: string | null = JSON.stringify({ cast: { people: ['ann'], 'a/b': 1 }, graveyard: { collapsed: true } });
  const file = {
    read: async () => old,
    remove: async () => {
      // Gone only after the new files are durable.
      expect(user.durableContent('graveyard/collapsed.json')).toBe('true');
      old = null;
    },
  };
  const saved = await Saved.open(new MemoryVault(), await ModuleValues.open(user, file));
  expect(old).toBeNull();
  expect(saved.value(moduleValue, 'cast', 'people')).toEqual(['ann']);
  expect(saved.value(moduleValue, 'cast', 'a/b')).toBe(1);
  expect(saved.value(moduleValue, 'graveyard', 'collapsed')).toBe(true);
  expect((await user.list('')).sort()).toEqual(['cast/a%2Fb.json', 'cast/people.json', 'graveyard/collapsed.json']);

  // Nothing left to migrate: the files are what is read.
  const again = await Saved.open(new MemoryVault(), await ModuleValues.open(user.reopen(), file));
  expect(again.value(moduleValue, 'cast', 'people')).toEqual(['ann']);
});
