// Properties of calls a module makes at the wrong time: through a handle
// that has ended (inert), or to change child panes inside a dispatch (an
// error that turns the module off).

import fc from 'fast-check';
import { documentPlugin, type ChildHandle, type ChildPanes, type DocumentView } from 'mwps';
import type { Command, EditorState } from 'prosemirror-state';
import { expect, it } from 'vitest';
import type { ModuleDef } from '../src/core/host.js';
import { startDoc } from './edits.js';
import { bootHeadless } from './headless.js';

const insert: Command = (state, dispatch) => (dispatch?.(state.tr.insertText('!', 1)), true);

// Keeps every handle it is given, and moves each to `stale` when its end
// signal fires: a pane scope's cleanup, a child's `close`, a view's `destroy`.
function hoarder() {
  const live = { runs: new Map<string, (c: Command) => boolean>(), hosts: new Map<string, ChildPanes>() };
  const stale: { what: string; call(): unknown }[] = [];
  const def: ModuleDef = {
    id: 'hoarder',
    exports: {
      moduleType: 'editorReplacement',
      setup(ctx) {
        ctx.each(ctx.documents, (doc) => doc.provide(
          documentPlugin({
            view(view: DocumentView) {
              const born: EditorState = view.state;
              return { destroy: () => void stale.push({ what: 'view.dispatch', call: () => view.dispatch(born.tr.insertText('!', 1)) }) };
            },
          }),
        ));
        ctx.each(ctx.panes, (p) => {
          const run = (c: Command) => p.run(c);
          live.runs.set(p.id, run);
          if (p.id.includes('/')) {
            p.effect(() => () => {
              live.runs.delete(p.id);
              stale.push({ what: 'p.run', call: () => run(insert) });
            });
            return;
          }
          const children = p.hostChildPanes();
          live.hosts.set(p.id, children);
          p.effect(() => () => {
            live.runs.delete(p.id);
            live.hosts.delete(p.id);
            stale.push({ what: 'p.run', call: () => run(insert) });
          });
        });
      },
    },
  };
  return { def, live, stale };
}

const op = fc.oneof(
  fc.record({ kind: fc.constant('type' as const), at: fc.nat() }),
  fc.record({ kind: fc.constant('create' as const), at: fc.nat() }),
  fc.record({ kind: fc.constant('close' as const), at: fc.nat() }),
  fc.record({ kind: fc.constant('toggle' as const), at: fc.nat() }),
  fc.record({ kind: fc.constant('reopen' as const) }),
);

it('a handle used after its end signal changes nothing: p.run and a child’s run give false, a view’s dispatch does nothing', () => {
  fc.assert(
    fc.property(fc.array(op, { maxLength: 25 }), (ops) => {
      const h = hoarder();
      const { host, failures } = bootHeadless([h.def]);
      host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
      host.addPane({ id: 'b', documentId: 'd' });
      const placed = new Set(['a', 'b']);
      for (const id of placed) host.place(id, 'hoarder');
      const children: ChildHandle[] = [];
      const pick = <T>(xs: readonly T[], at: number): T | undefined => xs[at % Math.max(xs.length, 1)];

      for (const o of ops) {
        if (o.kind === 'type') {
          const run = pick([...h.live.runs.values()], o.at);
          run?.(insert);
        } else if (o.kind === 'create') {
          const hostPanes = [...h.live.hosts.values()];
          const c = pick(hostPanes, o.at)?.create();
          if (c) children.push(c);
        } else if (o.kind === 'close') {
          const c = pick(children, o.at);
          if (c) {
            children.splice(children.indexOf(c), 1);
            c.close();
            h.stale.push({ what: 'child.run', call: () => c.run(insert) });
          }
        } else if (o.kind === 'toggle') {
          const id = pick(['a', 'b'].filter((id) => host.paneIds().includes(id)), o.at)!;
          if (placed.delete(id)) host.unplace(id, 'hoarder');
          else (placed.add(id), host.place(id, 'hoarder'));
        } else if (host.paneIds().includes('b')) {
          // Closing a pane closes its children too.
          for (const c of children.filter((c) => c.id.startsWith('b/'))) {
            children.splice(children.indexOf(c), 1);
            h.stale.push({ what: 'child.run', call: () => c.run(insert) });
          }
          host.removePane('b');
          placed.delete('b');
        } else {
          host.addPane({ id: 'b', documentId: 'd' });
          placed.add('b');
          host.place('b', 'hoarder');
        }

        const before = host.hub('d')!.doc;
        for (const s of h.stale) {
          const result = s.call();
          if (s.what !== 'view.dispatch') expect(result, s.what).toBe(false);
        }
        expect(host.hub('d')!.doc.eq(before)).toBe(true);
        expect(failures).toEqual([]);
      }
    }),
    { numRuns: 200 },
  );
});

it('creating or closing a child pane inside a dispatch turns the module off, and the others keep running', () => {
  for (const what of ['create', 'close'] as const) {
    let children: ChildPanes | null = null;
    let first: ChildHandle | null = null;
    const meddler: ModuleDef = {
      id: 'meddler',
      exports: {
        moduleType: 'editorReplacement',
        setup(ctx) {
          ctx.each(ctx.documents, (doc) => doc.provide(
            documentPlugin({
              state: {
                init: () => null,
                apply(tr) {
                  if (tr.docChanged && children) (what === 'create' ? children.create() : first!.close());
                  return null;
                },
              },
            }),
          ));
          ctx.each(ctx.panes, (p) => {
            if (p.id.includes('/')) return;
            children = p.hostChildPanes();
            first = children.create();
          });
        },
      },
    };
    let run: ((c: Command) => boolean) | null = null;
    const bystander: ModuleDef = { id: 'bystander', exports: { setup: (ctx) => ctx.each(ctx.panes, (p) => void (p.id === 'a' && (run = (c) => p.run(c)))) } };
    const { host, failures } = bootHeadless([meddler, bystander]);
    host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
    host.place('a', 'bystander');
    host.place('a', 'meddler');
    expect(failures).toEqual([]);

    host.run('a', insert);
    expect(failures, what).toEqual(['meddler']);
    const before = host.hub('d')!.doc;
    expect(run!(insert)).toBe(true);
    expect(host.hub('d')!.doc.eq(before)).toBe(false);
  }
});
