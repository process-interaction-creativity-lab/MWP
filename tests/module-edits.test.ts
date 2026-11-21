// Properties of modules editing as peers: `d.edit` through the document's
// one hidden state, `authorOf` and `originOf`.

import fc from 'fast-check';
import { authorOf, documentPlugin, originOf, type DocumentScope } from 'mwps';
import { undo, undoDepth } from 'prosemirror-history';
import { Plugin, type Command } from 'prosemirror-state';
import { expect, it, vi } from 'vitest';
import type { ModuleDef } from '../src/core/host.js';
import { autocorrect, command, docOf, edit, startDoc } from './edits.js';
import { writing } from '../src/lib/text.js';
import { bootHeadless } from './headless.js';

// A module that edits as a peer whenever the test says so.
function peer(id: string) {
  const docs = new Map<string, DocumentScope>();
  const def: ModuleDef = { id, exports: { setup: (c) => c.each(c.documents, (d) => void docs.set(d.id, d)) } };
  return { def, edit: (doc: string, cmd: Command) => docs.get(doc)!.edit(cmd) };
}

// Records who made every edit each pane sees, and where, as a plugin would.
function spy() {
  const seen: { pane: string; author: string; origin: string }[] = [];
  const def: ModuleDef = {
    id: 'spy',
    exports: {
      setup(ctx) {
        ctx.each(ctx.panes, (p) =>
          p.provide(
            new Plugin({
              state: {
                init: () => null,
                apply: (tr) =>
                  void (tr.docChanged && seen.push({ pane: p.id, author: authorOf(tr), origin: originOf(tr) })),
              },
            }),
          ),
        );
      },
    },
  };
  return { def, seen };
}

it('edits by modules and the writer, in any mix, leave every pane agreeing; only the writer’s go on undo stacks', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ who: fc.constantFrom('a', 'b', 'heavy', 'karaoke'), edit }), { maxLength: 30 }),
      (steps) => {
        const heavy = peer('heavy');
        const karaoke = peer('karaoke');
        const s = spy();
        const { host, failures } = bootHeadless([heavy.def, karaoke.def, s.def]);
        host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
        host.addPane({ id: 'b', documentId: 'd' });
        for (const id of ['a', 'b']) for (const m of ['heavy', 'karaoke', 'spy']) host.place(id, m);

        let writerEdits = 0;
        for (const step of steps) {
          const cmd = command(step.edit);
          const from = s.seen.length;
          if (step.who === 'a' || step.who === 'b') {
            if (step.edit.kind !== 'undo' && step.edit.kind !== 'redo') writerEdits++;
            host.run(step.who, cmd);
          } else {
            (step.who === 'heavy' ? heavy : karaoke).edit('d', cmd);
          }
          const shared = host.document('d')!.doc;
          for (const id of ['a', 'b']) expect(docOf(host, id).eq(shared)).toBe(true);
          // The writer's edit is local only in the pane it was made in; a
          // module's arrives in every pane.
          for (const { pane, origin } of s.seen.slice(from)) {
            expect(origin).toBe(step.who === pane ? 'local' : 'received');
          }
        }
        expect(failures).toEqual([]);
        // Module edits are on no stack; panes only undo the writer's.
        for (const id of ['a', 'b']) expect(undoDepth(host.paneState(id).get()!)).toBeLessThanOrEqual(writerEdits);
        // Every pane sees each module edit under the module's name.
        for (const { author } of s.seen) expect(['user', 'heavy', 'karaoke']).toContain(author);
      },
    ),
  );
});

it("a module's edit runs document follow-ups, never panes' follow-ups", () => {
  const ac = autocorrect();
  const typist = peer('typist');
  const { host } = bootHeadless([ac.def, typist.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'autocorrect');
  host.place('a', 'typist');
  // The module types "teh": the pane's autocorrect is the writer's, and
  // doesn't react to a peer's edit.
  typist.edit('d', (state, dispatch) => (dispatch?.(state.tr.insertText('teh ', 1)), true));
  expect(docOf(host, 'a').textContent).toBe('teh one twothree');
  expect(ac.seen.received).toBe(0);

  // Its own follow-up, a module-wide document plugin, runs in the document's state.
  const own: ModuleDef = {
    id: 'selfcorrect',
    exports: {
      setup(ctx) {
        ctx.each(ctx.documents, (doc) => doc.provide(
          documentPlugin({
            // Every "teh" in the first paragraph, which is where it types.
            appendTransaction: (_trs, _old, state) => {
              const text = state.doc.firstChild!.textContent;
              if (!text.includes('teh')) return null;
              return state.tr.insertText(text.replaceAll('teh', 'the'), 1, 1 + text.length);
            },
          }),
        ));
        ctx.each(ctx.documents, (d) =>
          d.effect(() => void d.edit((state, dispatch) => (dispatch?.(state.tr.insertText('teh ', 1)), true))),
        );
      },
    },
  };
  host.install(own);
  host.place('a', 'selfcorrect');
  expect(docOf(host, 'a').textContent).toBe('the the one twothree');
});

it('every pane sees a module edit under its author, and writer edits as the user, local only where made', () => {
  const typist = peer('typist');
  const s = spy();
  const { host } = bootHeadless([typist.def, s.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.addPane({ id: 'b', documentId: 'd' });
  for (const id of ['a', 'b']) {
    host.place(id, 'typist');
    host.place(id, 'spy');
  }
  typist.edit('d', command({ kind: 'insert', at: 0, text: 'x' }));
  host.run('a', command({ kind: 'insert', at: 0, text: 'y' }));
  expect(s.seen).toEqual([
    { pane: 'a', author: 'typist', origin: 'received' },
    { pane: 'b', author: 'typist', origin: 'received' },
    { pane: 'a', author: 'user', origin: 'local' },
    { pane: 'b', author: 'user', origin: 'received' },
  ]);
});

it('an edit while a scope is set up turns the module off; once its scope ends, an edit is false', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const insert: Command = (state, dispatch) => (dispatch?.(state.tr.insertText('x', 1)), true);
  const early: ModuleDef = {
    id: 'early',
    exports: { setup: (ctx) => ctx.each(ctx.panes, (p) => void p.document?.edit(insert)) },
  };
  const later = peer('later');
  const { host, failures } = bootHeadless([early, later.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'early');
  host.place('a', 'later');
  expect(failures).toEqual(['early']);
  expect(docOf(host, 'a').textContent).toBe('one twothree');
  // Once the module is off, an edit through its old scope is false and changes nothing.
  host.setEnabled('later', false);
  expect(later.edit('d', insert)).toBe(false);
  expect(docOf(host, 'a').textContent).toBe('one twothree');
});

it("a document that doesn't fit the schema refuses module edits too", () => {
  const typist = peer('typist');
  const { host } = bootHeadless([typist.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: 'does not fit' });
  host.place('a', 'typist');
  expect(typist.edit('d', command({ kind: 'insert', at: 0, text: 'x' }))).toBe(true);
  expect(docOf(host, 'a').textContent).toBe('one twothree');
});

it("the writer's undo takes back their own edit and keeps a module's later one", () => {
  const mover = peer('mover');
  const { host } = bootHeadless([mover.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'mover');
  host.run('a', (s, dispatch) => (dispatch?.(s.tr.insertText('W', 1)), true));
  mover.edit('d', (s, dispatch) => (dispatch?.(s.tr.insertText('M', writing(s.doc).content.size - 1)), true));
  expect(docOf(host, 'a').textContent).toBe('Wone twothreeM');
  undo(host.paneState('a').get()!, (tr) => host.dispatch('a', tr));
  expect(docOf(host, 'a').textContent).toBe('one twothreeM');
});
