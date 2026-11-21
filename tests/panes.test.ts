// Properties of panes on one document, through the module API and the
// host's own calls (what a view does).

import fc from 'fast-check';
import { valueKey } from 'mwps';
import { closeHistory, undo, undoDepth } from 'prosemirror-history';
import { Plugin, PluginKey, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { expect, it, vi } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import type { ModuleDef } from '../src/core/host.js';
import { documentToJson } from '../src/core/document-json.js';
import { buildSchema } from '../src/core/parts.js';
import { arbitraryDocument, TEST_PARTS } from './arbitraries.js';
import { autocorrect, command, docOf, edit, startDoc } from './edits.js';
import { writing } from '../src/lib/text.js';
import { bootHeadless } from './headless.js';

function readOnlyModule(): ModuleDef {
  return {
    id: 'viewer',
    exports: {
      setup(ctx) {
        ctx.each(ctx.panes, (pane) => pane.provide(new Plugin({ props: { editable: () => false } })));
      },
    },
  };
}

it('panes on one document always agree', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ pane: fc.nat(2), edit }), { maxLength: 40 }),
      fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
      (steps, placed) => {
        const ac = autocorrect();
        const { host, failures } = bootHeadless([ac.def]);
        const panes = ['a', 'b', 'c'];
        for (const [i, id] of panes.entries()) {
          host.addPane({ id, documentId: 'd' }, { doc: startDoc(), error: null });
          if (placed[i]) host.place(id, 'autocorrect');
        }
        for (const s of steps) {
          host.run(panes[s.pane]!, command(s.edit));
          const shared = host.document('d')!.doc;
          for (const id of panes) expect(docOf(host, id).eq(shared)).toBe(true);
        }
        expect(failures).toEqual([]);
        // Received edits never reach a follow-up.
        expect(ac.seen.received).toBe(0);
      },
    ),
  );
});

it("undo in a pane takes back exactly that pane's edits, follow-ups included", () => {
  fc.assert(
    fc.property(
      fc.array(edit.filter((e) => e.kind !== 'undo' && e.kind !== 'redo'), { minLength: 1, maxLength: 15 }),
      (edits) => {
        const ac = autocorrect();
        const { host } = bootHeadless([ac.def]);
        host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
        host.addPane({ id: 'b', documentId: 'd' });
        host.place('a', 'autocorrect');
        const before = docOf(host, 'a');
        // Each edit its own undo event, as if typed seconds apart.
        for (const e of edits) host.run('a', (state, dispatch) => command(e)(state, dispatch && ((tr) => dispatch(closeHistory(tr)))));
        while (undoDepth(host.paneState('a').get()!) > 0) host.run('a', undo);
        expect(docOf(host, 'a').eq(before)).toBe(true);
        expect(docOf(host, 'b').eq(before)).toBe(true);
        // Pane b never had anything to undo.
        expect(host.run('b', undo)).toBe(false);
      },
    ),
  );
});

it('a non-editable pane refuses every local edit but still receives the others', () => {
  fc.assert(
    fc.property(fc.array(fc.record({ inViewer: fc.boolean(), edit }), { maxLength: 30 }), (steps) => {
      const { host, failures } = bootHeadless([readOnlyModule()]);
      host.addPane({ id: 'viewer', documentId: 'd' }, { doc: startDoc(), error: null });
      host.addPane({ id: 'writer', documentId: 'd' });
      host.place('viewer', 'viewer');
      for (const s of steps) {
        const before = host.document('d')!.doc;
        if (s.inViewer) {
          host.run('viewer', command(s.edit));
          expect(host.document('d')!.doc).toBe(before);
        } else {
          host.run('writer', command(s.edit));
        }
        expect(docOf(host, 'viewer').eq(host.document('d')!.doc)).toBe(true);
      }
      expect(failures).toEqual([]);
    }),
  );
});

it('a schema change moves every open document and its panes to the new types', () => {
  const withParts = buildSchema([TEST_PARTS]);
  fc.assert(
    fc.property(arbitraryDocument(withParts), (stored) => {
      const parts: ModuleDef = { id: 'testparts', exports: { setup() {}, ...TEST_PARTS } };
      const { host } = bootHeadless([parts]);
      host.addPane({ id: 'a', documentId: 'd' }, { doc: stored, error: null });
      host.addPane({ id: 'b', documentId: 'd' });

      host.uninstall('testparts');
      for (const id of ['a', 'b']) expect(docOf(host, id).type.schema).toBe(host.schema);
      expect(docOf(host, 'a').eq(docOf(host, 'b'))).toBe(true);

      // Editing still syncs, and reinstalling restores the parts exactly.
      host.run('a', (state, dispatch) => {
        dispatch?.(state.tr.insert(writing(state.doc).content.size, state.schema.nodes.paragraph!.create()));
        return true;
      });
      expect(docOf(host, 'b').eq(docOf(host, 'a'))).toBe(true);
      host.install(parts);
      const back = docOf(host, 'b');
      expect(back.type.schema).toBe(host.schema);
      const json = documentToJson(back) as { content: unknown[] };
      expect({ ...json, content: json.content.filter((_, i) => i !== json.content.length - 2) }).toEqual(documentToJson(stored));
    }),
  );
});

it('a module whose plugin throws is turned off and its plugins leave every pane; the others keep working', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const hooks = ['apply', 'filter', 'append', 'decorations', 'handleKeyDown'] as const;
  fc.assert(
    fc.property(fc.constantFrom(...hooks), fc.array(edit, { minLength: 1, maxLength: 10 }), (hook, edits) => {
      let armed = false;
      const boom = (where: string) => {
        if (armed && where === hook) throw new Error(`boom in ${where}`);
      };
      const bad = new Plugin({
        state: { init: () => 0, apply: (_tr, n: number) => (boom('apply'), n + 1) },
        filterTransaction: () => (boom('filter'), true),
        appendTransaction: () => (boom('append'), null),
        props: { decorations: () => (boom('decorations'), null), handleKeyDown: () => (boom('handleKeyDown'), false) },
      });
      const chaos: ModuleDef = { id: 'chaos', exports: { setup: (ctx) => ctx.each(ctx.panes, (pane) => pane.provide(bad)) } };
      const ac = autocorrect();
      const { host, failures } = bootHeadless([chaos, ac.def]);
      host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
      host.addPane({ id: 'b', documentId: 'd' });
      for (const id of ['a', 'b']) {
        host.place(id, 'chaos');
        host.place(id, 'autocorrect');
      }
      expect(host.paneState('a').get()!.plugins).toContain(bad);
      armed = true;
      for (const e of edits) {
        host.run('a', command(e));
        // Props are the view's to call; call them as a view would.
        const state = host.paneState('a').get()!;
        for (const plugin of state.plugins) plugin.props.decorations?.call(plugin, state);
      }
      if (failures.length) {
        expect(failures).toEqual(['chaos']);
        expect(host.status('chaos')).toBe('failed');
        for (const id of ['a', 'b']) expect(host.paneState(id).get()!.plugins).not.toContain(bad);
      }
      expect(host.status('autocorrect')).toBe('on');
      expect(docOf(host, 'a').eq(docOf(host, 'b'))).toBe(true);
    }),
  );
});

it('follow-ups that never settle are stopped and the module turned off', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // ProseMirror re-asks a plugin only about others' transactions, so a loop
  // takes two plugins answering each other.
  const ping = () => new Plugin({ appendTransaction: (_trs, _old, state) => state.tr.insertText('!', 1) });
  const looper: ModuleDef = {
    id: 'looper',
    exports: {
      setup(ctx) {
        ctx.each(ctx.panes, (pane) => pane.provide(ping()));
        ctx.each(ctx.panes, (pane) => pane.provide(ping()));
      },
    },
  };
  const { host, failures } = bootHeadless([looper]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  const hostOnly = host.paneState('a').get()!.plugins.length;
  host.place('a', 'looper');
  host.run('a', command({ kind: 'insert', at: 0, text: 'a' }));
  expect(failures).toEqual(['looper']);
  expect(host.paneState('a').get()!.plugins.length).toBe(hostOnly);
  expect(docOf(host, 'a').eq(host.document('d')!.doc)).toBe(true);
});

it('setting a value redraws the panes the module is placed on before the set returns; a batch redraws once', () => {
  const seen: Transaction[] = [];
  let set: (n: number) => void = () => {};
  const def: ModuleDef = {
    id: 'counter',
    exports: {
      setup(ctx) {
        const v = ctx.getValue(valueKey('n', { default: 0 }));
        set = (n) => v.set(n);
        ctx.each(ctx.panes, (pane) => pane.provide(new Plugin({ state: { init: () => null, apply: (tr) => void seen.push(tr) } })));
      },
    },
  };
  const { host } = bootHeadless([def]);
  host.addPane({ id: 'a', documentId: 'd' });
  host.addPane({ id: 'b', documentId: 'd' });
  host.place('a', 'counter');
  set(1);
  expect(seen.length).toBe(1);
  expect(seen[0]!.steps.length).toBe(0);
  set(2);
  set(2);
  expect(seen.length).toBe(2);
  host.batch(() => {
    set(3);
    set(4);
    expect(seen.length).toBe(2);
  });
  expect(seen.length).toBe(3);
});

// Values come first in the one order: scopes, plugin lists, redraws, then
// effects.
it('an effect in with(mode) reads plugin state for the mode it was set to', () => {
  const key = new PluginKey<string>('mode-probe');
  const seen: string[] = [];
  let setMode: (mode: string) => void = () => {};
  const def: ModuleDef = {
    id: 'modes',
    exports: {
      setup(ctx) {
        ctx.each(ctx.panes, (p) => {
          const mode = p.getValue(valueKey('mode', { default: 'a' }));
          setMode = (m) => mode.set(m);
          p.provide(new Plugin({ key, state: { init: () => mode.get(), apply: () => mode.get() } }));
          p.with(mode, (s) => s.effect(() => void seen.push(key.getState(p.state.get()!)!)));
        });
      },
    },
  };
  const { host, failures } = bootHeadless([def]);
  host.addPane({ id: 'a', documentId: 'd' });
  host.place('a', 'modes');
  expect(seen).toEqual(['a']);
  setMode('b');
  expect(seen).toEqual(['a', 'b']);
  expect(failures).toEqual([]);
});

it("a value set inside a plugin's apply redraws once the dispatch is done", () => {
  const key = new PluginKey<number>('reader');
  const def: ModuleDef = {
    id: 'counter',
    exports: {
      setup(ctx) {
        const n = ctx.getValue(valueKey('n', { default: 0 }));
        ctx.each(ctx.panes, (p) => {
          // The reader comes first, so the transaction setting it still reads 0.
          p.provide(new Plugin({ key, state: { init: () => n.get(), apply: () => n.get() } }));
          p.provide(new Plugin({ state: { init: () => 0, apply: (tr) => (tr.selectionSet && n.set((m) => m + 1), 0) } }));
        });
      },
    },
  };
  const { host, failures } = bootHeadless([def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'counter');
  // A selection change has no steps, so no later transaction would catch up.
  host.run('a', (state, dispatch) => (dispatch?.(state.tr.setSelection(TextSelection.atEnd(state.doc))), true));
  expect(key.getState(host.paneState('a').get()!)).toBe(1);
  expect(failures).toEqual([]);
});

it('a plugin that sets a value on every redraw is stopped as a runaway loop', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const def: ModuleDef = {
    id: 'looper',
    exports: {
      setup(ctx) {
        const n = ctx.getValue(valueKey('n', { default: 0 }));
        ctx.each(ctx.panes, (p) => p.provide(new Plugin({ state: { init: () => 0, apply: () => (n.set(n.get() + 1), 0) } })));
      },
    },
  };
  const { host, failures } = bootHeadless([def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'looper');
  host.run('a', command({ kind: 'insert', at: 0, text: 'a' }));
  expect(failures).toEqual(['looper']);
  expect(docOf(host, 'a').eq(host.document('d')!.doc)).toBe(true);
});

it('p.run is refused while a scope is being set up, and inside a dispatch', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const insert: Command = (state, dispatch) => (dispatch?.(state.tr.insertText('x', 1)), true);
  const inSetup: ModuleDef = { id: 'early', exports: { setup: (ctx) => ctx.each(ctx.panes, (pane) => pane.run(insert)) } };
  const inApply: ModuleDef = {
    id: 'nested',
    exports: {
      setup: (ctx) =>
        ctx.each(ctx.panes, (pane) =>
          pane.provide(new Plugin({ state: { init: () => 0, apply: (tr, n: number) => (tr.docChanged && pane.run(insert), n) } })),
        ),
    },
  };
  const { host, failures } = bootHeadless([inSetup, inApply]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'early');
  host.place('a', 'nested');
  expect(failures).toEqual(['early']);
  host.run('a', insert);
  expect(failures).toEqual(['early', 'nested']);
  // The writer's edit itself went through.
  expect(docOf(host, 'a').textContent).toBe('xone twothree');
});

it('plugins arrive newest placed module first, after history and before the base keymap', () => {
  const tagged = (id: string) => {
    const plugin = new Plugin({});
    const def: ModuleDef = { id, exports: { setup: (ctx) => ctx.each(ctx.panes, (pane) => pane.provide(plugin)) } };
    return { def, plugin };
  };
  const [x, y] = [tagged('x'), tagged('y')];
  const { host } = bootHeadless([x.def, y.def]);
  host.addPane({ id: 'a', documentId: 'd' });
  host.place('a', 'y');
  host.place('a', 'x');
  const plugins = host.paneState('a').get()!.plugins as Plugin[];
  const at = (pl: Plugin) => plugins.indexOf(pl);
  const keyed = (prefix: string) => plugins.findIndex((pl) => (pl as unknown as { key: string }).key.startsWith(prefix));
  expect(keyed('history$')).toBeLessThan(at(x.plugin));
  expect(at(x.plugin)).toBeLessThan(at(y.plugin));
  expect(at(y.plugin)).toBeLessThan(plugins.length - 3);
  // State is kept across a reconfigure: history survives a placement.
  host.run('a', command({ kind: 'insert', at: 0, text: 'a' }));
  host.unplace('a', 'y');
  expect(undoDepth(host.paneState('a').get() as EditorState)).toBe(1);
});

it('an edit made while a view updates builds on the new state, and the view and pane agree', () => {
  const { host } = bootHeadless([]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.addPane({ id: 'b', documentId: 'd' });
  // A card's view's `updateState` (which may dispatch, as on a DOM flush).
  let shown: EditorState | undefined;
  const view = {
    hasFocus: () => false,
    updateState(state: EditorState) {
      shown = state;
      if (state.doc.textContent.startsWith('A')) host.run('b', command({ kind: 'insert', at: 0, text: 'X' }));
    },
  } as unknown as EditorView;
  const card = host.mainCard('b')!;
  card.attach(view);
  host.run('a', command({ kind: 'insert', at: 0, text: 'A' }));
  expect(docOf(host, 'a').textContent).toBe('XAone twothree');
  expect(docOf(host, 'b').textContent).toBe('XAone twothree');
  expect(shown).toBe(card.state);
  expect(shown!.doc.eq(writing(docOf(host, 'b')))).toBe(true);
});
