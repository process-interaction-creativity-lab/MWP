// Properties of document plugins: the one state per open document that
// hears every change, and what it can tell about each one.

import fc from 'fast-check';
import { authorOf, documentPlugin, historyKind, type Store } from 'mwps';
import { redo, undo } from 'prosemirror-history';
import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { expect, it, vi } from 'vitest';
import type { ModuleDef } from '../src/core/host.js';
import { autocorrect, command, edit, startDoc } from './edits.js';
import { bootHeadless } from './headless.js';


// Records every transaction with steps in the document states it is
// placed on; edits as a peer when the test says so.
function recorder(id = 'recorder', onChange: (tr: Transaction) => void = () => {}) {
  const trs: Transaction[] = [];
  const edits = new Map<string, (cmd: Command) => boolean>();
  const def: ModuleDef = {
    id,
    exports: {
      setup(c) {
        c.each(c.documents, (doc) => doc.provide(
          documentPlugin({
            state: {
              init: () => null,
              apply(tr) {
                if (tr.docChanged) {
                  trs.push(tr);
                  onChange(tr);
                }
                return null;
              },
            },
          }),
        ));
        c.each(c.documents, (d) => void edits.set(d.id, (cmd) => d.edit(cmd)));
      },
    },
  };
  return { def, trs, edit: (doc: string, cmd: Command) => edits.get(doc)!(cmd) };
}

const replay = (doc: Node, trs: readonly Transaction[]) =>
  trs.flatMap((tr) => tr.steps).reduce((d, step) => step.apply(d).doc!, doc);

it('a document plugin hears every change once, in order, each transaction from one author', () => {
  fc.assert(
    fc.property(fc.array(fc.record({ who: fc.constantFrom('a', 'b', 'recorder'), edit }), { maxLength: 30 }), (steps) => {
      const rec = recorder();
      const ac = autocorrect();
      const { host, failures } = bootHeadless([rec.def, ac.def]);
      const start = startDoc();
      host.addPane({ id: 'a', documentId: 'd' }, { doc: start, error: null });
      host.addPane({ id: 'b', documentId: 'd' });
      host.place('a', 'recorder');
      host.place('a', 'autocorrect');

      for (const s of steps) {
        const before = rec.trs.length;
        if (s.who === 'recorder') rec.edit('d', command(s.edit));
        else host.run(s.who, command(s.edit));
        const author = s.who === 'recorder' ? 'recorder' : 'user';
        expect(rec.trs.slice(before).map(authorOf)).toEqual(rec.trs.slice(before).map(() => author));
      }

      expect(failures).toEqual([]);
      expect(replay(start, rec.trs).eq(host.document('d')!.doc)).toBe(true);
    }),
  );
});

it("a received undo or redo keeps its kind, and the follow-ups to it arrive as part of it", () => {
  const kinds: (string | null)[] = [];
  const rec = recorder('recorder', (tr) => kinds.push(historyKind(tr)));
  const ac = autocorrect();
  const { host } = bootHeadless([rec.def, ac.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'recorder');
  host.run('a', command({ kind: 'insert', at: 0, text: 'x' }));
  host.run('a', undo);
  host.run('a', redo);
  expect(kinds).toEqual([null, 'undo', 'redo']);

  // A "teh" typed before autocorrect is placed gets fixed with the next
  // edit; undoing that edit brings it back, and autocorrect fixes it again
  // in the pane. The document state hears the undo and the fix as one undo.
  host.run('a', command({ kind: 'insert', at: 0, text: 'teh ' }));
  host.place('a', 'autocorrect');
  kinds.length = 0;
  host.run('a', command({ kind: 'insert', at: 100, text: 'x' }));
  expect(kinds).toEqual([null]);
  host.run('a', undo);
  expect(kinds.at(-1)).toEqual('undo');
  expect(host.document('d')!.doc.textContent).not.toContain('teh');
});

it("a document plugin's view may edit: the edit is ordinary, and every view hears both changes in order", () => {
  const insert: Command = (state, dispatch) => (dispatch?.(state.tr.insertText('!', 1)), true);
  const meddler: ModuleDef = {
    id: 'meddler',
    exports: {
      setup: (c) =>
        c.each(c.documents, (doc) => doc.provide(
          documentPlugin({
            view: () => ({ update: (view) => void (view.state.doc.textContent.startsWith('x') && insert(view.state, view.dispatch)) }),
          }),
        )),
    },
  };
  const first = recorder('first');
  const last = recorder('last');
  const { host, failures } = bootHeadless([first.def, meddler, last.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  for (const m of ['first', 'meddler', 'last']) host.place('a', m);
  host.run('a', command({ kind: 'insert', at: 0, text: 'x' }));
  expect(failures).toEqual([]);
  expect(host.document('d')!.doc.textContent).toBe('!xone twothree');
  for (const rec of [first, last]) {
    expect(rec.trs.map((tr) => tr.doc.textContent)).toEqual(['xone twothree', '!xone twothree']);
    expect(rec.trs.map(authorOf)).toEqual(['user', 'meddler']);
  }
});

it('a view that edits on every change is stopped as a runaway loop; every copy still agrees', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const insert: Command = (state, dispatch) => (dispatch?.(state.tr.insertText('!', 1)), true);
  const meddler: ModuleDef = {
    id: 'meddler',
    exports: {
      setup: (c) => c.each(c.documents, (doc) => doc.provide(documentPlugin({ view: () => ({ update: (view) => void insert(view.state, view.dispatch) }) }))),
    },
  };
  const rec = recorder();
  const { host, failures } = bootHeadless([meddler, rec.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'meddler');
  host.place('a', 'recorder');
  host.run('a', command({ kind: 'insert', at: 0, text: 'x' }));
  expect(failures).toEqual(['meddler']);
  expect(host.paneState('a').get()!.doc.eq(host.document('d')!.doc)).toBe(true);
  expect(rec.trs.at(-1)!.doc.eq(host.document('d')!.doc)).toBe(true);
});

it('a module-wide document plugin hears only the documents the module is placed on, while it is', () => {
  const rec = recorder();
  const { host } = bootHeadless([rec.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.addPane({ id: 'b', documentId: 'e' }, { doc: startDoc(), error: null });
  host.place('a', 'recorder');
  host.run('b', command({ kind: 'insert', at: 0, text: 'x' }));
  expect(rec.trs.length).toBe(0);
  host.run('a', command({ kind: 'insert', at: 0, text: 'x' }));
  expect(rec.trs.length).toBe(1);
  host.unplace('a', 'recorder');
  host.run('a', command({ kind: 'insert', at: 0, text: 'y' }));
  expect(rec.trs.length).toBe(1);
});

it('a plain plugin on a document scope, or a document plugin on a pane, turns the module off', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const onDocument: ModuleDef = { id: 'doc-plain', exports: { setup: (c) => c.each(c.documents, (d) => d.provide(new Plugin({}))) } };
  const onPane: ModuleDef = { id: 'pane-doc', exports: { setup: (c) => c.each(c.panes, (p) => p.provide(documentPlugin({}))) } };
  const { host, failures } = bootHeadless([onDocument, onPane]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'doc-plain');
  host.place('a', 'pane-doc');
  expect(failures.sort()).toEqual(['doc-plain', 'pane-doc']);
});

it('a stepless edit in the document state gives every pane on it a new state, read current from d.state', () => {
  const note = new PluginKey<string>('note');
  let edit: (cmd: Command) => boolean = () => false;
  let docState: Store<EditorState> | null = null;
  const def: ModuleDef = {
    id: 'noter',
    exports: {
      setup(c) {
        c.each(c.documents, (doc) => doc.provide(documentPlugin({ key: note, state: { init: () => '', apply: (tr, v) => (tr.getMeta(note) as string | undefined) ?? v } })));
        c.each(c.documents, (d) => {
          edit = (cmd) => d.edit(cmd);
          docState = d.state;
        });
      },
    },
  };
  const { host, failures } = bootHeadless([def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.addPane({ id: 'b', documentId: 'd' });
  host.place('a', 'noter');
  const heard: string[] = [];
  for (const id of ['a', 'b']) host.paneState(id).subscribe(() => heard.push(`${id}:${note.getState(docState!.get())}`));
  const before = ['a', 'b'].map((id) => host.paneState(id).get());
  edit((state, dispatch) => (dispatch?.(state.tr.setMeta(note, 'hello')), true));
  expect(failures).toEqual([]);
  expect(['a', 'b'].map((id) => host.paneState(id).get() !== before[['a', 'b'].indexOf(id)])).toEqual([true, true]);
  expect(heard.sort()).toEqual(['a:hello', 'b:hello']);
});

it("reading d.state inside a pane plugin's apply turns the module off", () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const def: ModuleDef = {
    id: 'early',
    exports: {
      setup: (c) =>
        c.each(c.panes, (p) =>
          p.provide(new Plugin({ state: { init: () => 0, apply: (_tr, v) => (p.document!.state.get(), v) } })),
        ),
    },
  };
  const { host, failures } = bootHeadless([def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'early');
  host.run('a', command({ kind: 'insert', at: 0, text: 'x' }));
  expect(failures).toEqual(['early']);
  expect(host.document('d')!.doc.textContent).toBe('xone twothree');
});
