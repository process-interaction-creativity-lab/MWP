// Properties of project access: `ctx.project`, taken back per module, and
// editing documents whether open or not.

import fc from 'fast-check';
import { documentPlugin, type ProjectAccess } from 'mwps';
import { EditorState, type Command, type Transaction } from 'prosemirror-state';
import { expect, it } from 'vitest';
import { Host, type ModuleDef } from '../src/core/host.js';
import { Project } from '../src/core/project.js';
import { MemoryVault } from '../src/core/vault/memory.js';
import { command, startDoc, type Edit } from './edits.js';

// A host over an in-memory project, kept in step with its list as the app does.
async function boot(modules: readonly ModuleDef[]) {
  const project = await Project.open(new MemoryVault());
  const failures: string[] = [];
  const host: Host = new Host({
    onFailure: (id) => failures.push(id),
    load: (id, schema) => project.load(schema, id),
    save: (id, doc) => void project.save(id, doc),
    create: async (name) => (await project.createDocument(host.schema, name)).id,
    rename: (id, name) => project.renameDocument(id, name),
  });
  project.subscribe(() => host.setProjectDocuments(project.documents));
  for (const m of modules) host.install(m);
  return { host, project, failures };
}

// `access` is what the module's `with(ctx.project, …)` scope was handed.
function keeper() {
  const seen = { access: null as ProjectAccess | null, scopes: 0, ended: 0 };
  const def: ModuleDef = {
    id: 'keeper',
    exports: {
      setup(ctx) {
        ctx.with(ctx.project, (s, project) => {
          seen.access = project;
          seen.scopes++;
          s.effect(() => () => void seen.ended++);
        });
      },
    },
  };
  return { def, seen };
}

const inserts = fc.array(
  fc.record({ kind: fc.constant('insert' as const), at: fc.nat(), text: fc.constantFrom('a', 'teh ', 'x y') }),
  { minLength: 1, maxLength: 8 },
);

const applyAll = (doc: ReturnType<typeof startDoc>, edits: readonly Edit[]) =>
  edits.reduce((d, e) => {
    let state = EditorState.create({ doc: d });
    command(e)(state, (tr) => void (state = state.apply(tr)));
    return state.doc;
  }, doc);

it('edits and reads of a document, made without waiting, land in call order whether it is open, closed, or opened meanwhile', async () => {
  await fc.assert(
    fc.asyncProperty(inserts, fc.nat({ max: 9 }), async (edits, openAfter) => {
      const k = keeper();
      const { host, project } = await boot([k.def]);
      const { id } = await project.createDocument(host.schema, 'Notes');
      await project.save(id, startDoc());
      // The module runs while placed somewhere: a pane on another document.
      const other = await project.createDocument(host.schema, 'Other');
      host.addPane({ id: 'a', documentId: other.id }, await project.load(host.schema, other.id));
      host.place('a', 'keeper');
      const access = k.seen.access!;

      // Fire every edit at once; part-way through, the app opens the
      // document as it does, while the edits already queued are still saving.
      const results: Promise<boolean>[] = [];
      const reads: Promise<unknown>[] = [];
      edits.forEach((e, i) => {
        if (i === openAfter) host.openPane('b', id);
        results.push(access.edit(id, command(e)));
        reads.push(access.read(id).then((doc) => doc?.toJSON()));
      });
      expect(await Promise.all(results)).toEqual(edits.map(() => true));
      if (openAfter < edits.length) expect(host.hub(id)).not.toBeNull();
      // Each read sees exactly the edits called before it.
      expect(await Promise.all(reads)).toEqual(edits.map((_, i) => applyAll(startDoc(), edits.slice(0, i + 1)).toJSON()));

      const want = applyAll(startDoc(), edits);
      const got = host.hub(id)?.doc ?? (await project.load(host.schema, id)).doc;
      expect(got.toJSON()).toEqual(want.toJSON());
      // And the file agrees once saved.
      expect((await project.load(host.schema, id)).doc.toJSON()).toEqual(want.toJSON());
    }),
    { numRuns: 60 },
  );
});

it('every module has project access until it is taken back, which ends the scope and refuses calls', async () => {
  const k = keeper();
  const { host, project } = await boot([k.def]);
  host.addPane({ id: 'a', documentId: 'x' });
  host.place('a', 'keeper');
  expect(k.seen.scopes).toBe(1);
  const access = k.seen.access!;

  const id = await access.create('Fresh');
  expect(id).not.toBeNull();
  expect(access.documents.get()).toEqual([{ id, name: 'Fresh' }]);
  expect(await access.rename(id!, 'Renamed')).toBe(true);
  expect(project.documents).toEqual([{ id, name: 'Renamed' }]);
  expect(await access.rename('nope', 'X')).toBe(false);

  host.setGrants((id) => ({ project: id !== 'keeper', ai: null }));
  expect(k.seen.ended).toBe(1);
  const insert: Command = (state, dispatch) => (dispatch?.(state.tr.insertText('!', 1)), true);
  expect(await access.edit(id!, insert)).toBe(false);
  expect(await access.create('Another')).toBeNull();
  expect(await access.read(id!)).toBeNull();
  expect(await access.rename(id!, 'Again')).toBe(false);
  expect(project.documents).toEqual([{ id, name: 'Renamed' }]);

  // Given back: a new scope, with a new handle.
  host.setGrants(() => ({ project: true, ai: null }));
  expect(k.seen.scopes).toBe(2);
  expect(k.seen.access).not.toBe(access);
});

it('an edit to a missing document, or a command that refuses, is false and saves nothing; reading a missing one is null', async () => {
  const k = keeper();
  const { host, project } = await boot([k.def]);
  host.addPane({ id: 'a', documentId: 'x' });
  host.place('a', 'keeper');
  const { id } = await project.createDocument(host.schema, 'Notes');
  const before = (await project.load(host.schema, id)).doc;
  expect(await k.seen.access!.edit('missing', () => true)).toBe(false);
  expect(await k.seen.access!.read('missing')).toBeNull();
  expect(await k.seen.access!.edit(id, () => false)).toBe(false);
  expect((await project.load(host.schema, id)).doc.eq(before)).toBe(true);
});

it("a closed document's edit is exactly the command: no module's follow-ups run there", async () => {
  await fc.assert(
    fc.asyncProperty(inserts, async (edits) => {
      // A document follow-up on every document the module is on: every "teh" becomes "the".
      let access: ProjectAccess | null = null;
      const fixer: ModuleDef = {
        id: 'fixer',
        exports: {
          setup(ctx) {
            ctx.each(ctx.documents, (doc) =>
              doc.provide(
                documentPlugin({
                  appendTransaction: (_trs, _old, state) => {
                    let tr: Transaction | null = null;
                    state.doc.descendants((node, pos) => {
                      if (!node.isText) return;
                      for (const m of node.text!.matchAll(/teh/g)) {
                        tr ??= state.tr;
                        const from = tr.mapping.map(pos + m.index);
                        tr.insertText('the', from, from + 3);
                      }
                    });
                    return tr;
                  },
                }),
              ),
            );
            ctx.with(ctx.project, (_s, project) => void (access = project));
          },
        },
      };
      const { host, project } = await boot([fixer]);
      const open = await project.createDocument(host.schema, 'Open');
      const closed = await project.createDocument(host.schema, 'Closed');
      for (const id of [open.id, closed.id]) await project.save(id, startDoc());
      host.addPane({ id: 'a', documentId: open.id }, await project.load(host.schema, open.id));
      host.place('a', 'fixer');
      for (const e of edits) {
        expect(await access!.edit(open.id, command(e))).toBe(true);
        expect(await access!.edit(closed.id, command(e))).toBe(true);
      }
      const closedDoc = (await project.load(host.schema, closed.id)).doc;
      expect(closedDoc.toJSON()).toEqual(applyAll(startDoc(), edits).toJSON());
      expect(host.hub(open.id)!.doc.textContent).not.toContain('teh');
    }),
    { numRuns: 40 },
  );
});
