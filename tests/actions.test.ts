// Properties of actions: the palette's greying tells the truth, edits land
// where their scope says, and keys reach the right implementation.

import fc from 'fast-check';
import { valueKey } from 'mwps';
import type { ModuleContext } from 'mwps';
import { closeHistory, undoDepth } from 'prosemirror-history';
import { Plugin } from 'prosemirror-state';
import { expect, it, vi } from 'vitest';
import type { ModuleDef } from '../src/core/host.js';
import { command, edit, startDoc, type Edit } from './edits.js';
import { bootHeadless } from './headless.js';

// One action of each kind: a pane command; a pane procedure that edits
// the whole document as the module; a module procedure that flips a value.
function toolkit(paneEdit: Edit, docEdit: Edit, id = 'toolkit', keys = 'Mod-Shift-s') {
  const actions = {
    pane: { title: 'Pane edit', keys },
    doc: { title: 'Document edit' },
    flip: { title: 'Flip' },
  };
  let flips = 0;
  const def: ModuleDef = {
    id,
    exports: {
      actions,
      setup(ctx: ModuleContext) {
        const on = ctx.getValue(valueKey('on', { default: false }));
        ctx.provide(actions.flip, {
          procedure: () => (flips++, on.set((v) => !v), true),
          active: () => on.get(),
        });
        ctx.each(ctx.panes, (p) => {
          p.provide(actions.pane, { command: command(paneEdit) });
          p.provide(actions.doc, { procedure: () => p.document!.edit(command(docEdit)) });
        });
      },
    },
  };
  return { def, flips: () => flips };
}

const mod = /Mac|iP(hone|[oa]d)/.test(globalThis.navigator?.platform ?? '') ? 'metaKey' : 'ctrlKey';
// What browsers send for Mod-Shift-S: macOS Chromium a lower-case `s`.
const press = (key: string) =>
  ({ key, keyCode: 83, shiftKey: true, [mod]: true, altKey: false, type: 'keydown' }) as unknown as KeyboardEvent;

// Edits that change the document; undo and redo are the host's keys.
const change = edit.filter((e) => e.kind !== 'undo' && e.kind !== 'redo');

it('a command runs exactly when the palette shows it enabled; only the pane command goes on an undo stack', () => {
  fc.assert(
    fc.property(
      change,
      change,
      fc.array(
        fc.record({
          focus: fc.constantFrom('a', 'b', null),
          what: fc.oneof(
            fc.record({ kind: fc.constant('edit' as const), edit }),
            fc.record({ kind: fc.constant('action' as const), name: fc.constantFrom('pane', 'doc', 'flip') }),
          ),
        }),
        { maxLength: 25 },
      ),
      (paneEdit, docEdit, steps) => {
        const kit = toolkit(paneEdit, docEdit);
        const { host, failures } = bootHeadless([kit.def]);
        host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
        host.addPane({ id: 'b', documentId: 'd' });
        host.place('a', 'toolkit');

        for (const step of steps) {
          host.focus(step.focus);
          if (step.what.kind === 'edit') {
            host.run(step.focus ?? 'b', command(step.what.edit));
            continue;
          }
          const name = step.what.name;
          const listed = host.actions(step.focus).find((a) => a.name === name)!;
          // Pane actions need the last focused pane, where the module is placed;
          // the module procedure never greys.
          if (step.focus !== 'a' && name !== 'flip') expect(listed.enabled).toBe(false);
          if (name !== 'pane') expect(listed.enabled).toBe(name === 'flip' || step.focus === 'a');

          // A new undo step starts here, so quick edits don't merge.
          host.run('a', (state, dispatch) => (dispatch?.(closeHistory(state.tr)), true));
          const depth = undoDepth(host.paneState('a').get()!);
          const before = host.paneState('a').get()!.doc;
          const ran = host.runAction(step.focus, 'toolkit', name);
          // A procedure's result is its own; a command runs iff enabled.
          if (name === 'pane') expect(ran).toBe(listed.enabled);
          else if (!listed.enabled) expect(ran).toBe(false);
          const after = host.paneState('a').get()!;
          if (name === 'pane' && ran && !after.doc.eq(before)) expect(undoDepth(after)).toBeGreaterThan(depth);
          if (name !== 'pane') expect(undoDepth(after)).toBe(depth);
          // Both panes agree whoever edited.
          expect(host.paneState('b').get()!.doc.eq(after.doc)).toBe(true);
        }
        expect(failures).toEqual([]);
      },
    ),
  );
});

it('with no last focused pane only module procedures run; `active` follows the toggle', () => {
  const kit = toolkit({ kind: 'insert', at: 0, text: 'a' }, { kind: 'insert', at: 0, text: 'b' });
  const { host } = bootHeadless([kit.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'toolkit');

  expect(host.actions(null).map((a) => [a.name, a.enabled])).toEqual([
    ['pane', false],
    ['doc', false],
    ['flip', true],
  ]);
  expect(host.runAction(null, 'toolkit', 'pane')).toBe(false);
  expect(host.runAction(null, 'toolkit', 'flip')).toBe(true);
  expect(host.actions(null).find((a) => a.name === 'flip')!.active).toBe(true);
  expect(kit.flips()).toBe(1);
});

it('a read-only pane greys command actions and leaves procedures live', () => {
  const kit = toolkit({ kind: 'insert', at: 0, text: 'a' }, { kind: 'insert', at: 0, text: 'b' });
  const viewer: ModuleDef = {
    id: 'viewer',
    exports: { setup: (ctx) => ctx.each(ctx.panes, (pane) => pane.provide(new Plugin({ props: { editable: () => false } }))) },
  };
  const { host } = bootHeadless([kit.def, viewer]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'toolkit');
  host.focus('a');
  expect(host.actions('a').find((a) => a.name === 'pane')!.enabled).toBe(true);

  host.place('a', 'viewer');
  expect(host.actions('a').map((a) => [a.name, a.enabled])).toEqual([
    ['pane', false],
    ['doc', true],
    ['flip', true],
  ]);
  expect(host.runAction('a', 'toolkit', 'pane')).toBe(false);
  host.unplace('a', 'viewer');
  expect(host.actions('a').find((a) => a.name === 'pane')!.enabled).toBe(true);
});

it('an action key runs in either letter case; two that apply leave the choice to the writer', () => {
  const insertA: Edit = { kind: 'insert', at: 0, text: 'A' };
  const insertB: Edit = { kind: 'insert', at: 0, text: 'B' };
  const first = toolkit(insertA, insertA, 'first');
  const second = toolkit(insertB, insertB, 'second');
  const { host, failures } = bootHeadless([second.def, first.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.addPane({ id: 'empty', documentId: 'e' });
  host.place('a', 'first');
  const text = () => host.paneState('a').get()!.doc.textContent;

  expect(host.actionKey('a', press('s'))).toBe(true);
  expect(host.actionKey('a', press('S'))).toBe(true);
  expect(text().startsWith('AA')).toBe(true);
  expect(host.keyChoice.get()).toBe(null);

  // Both apply: the key is taken, nothing runs, and the writer is offered both.
  host.place('a', 'second');
  const before = text();
  expect(host.actionKey('a', press('s'))).toBe(true);
  expect(text()).toBe(before);
  const choice = host.keyChoice.get()!;
  expect(choice.paneId).toBe('a');
  expect(choice.actions.map((e) => [e.moduleId, e.name, e.enabled])).toEqual([
    ['first', 'pane', true],
    ['second', 'pane', true],
  ]);
  // Not placed in this pane: nothing implements the key there.
  expect(host.actionKey('empty', press('s'))).toBe(false);
  expect(failures).toEqual([]);
});

it('an action whose dry run declines leaves its key to the one that applies', () => {
  const first = toolkit({ kind: 'insert', at: 0, text: 'B' }, { kind: 'insert', at: 0, text: 'B' }, 'first');
  // Undo declines while there's nothing to undo.
  const second = toolkit({ kind: 'undo' }, { kind: 'undo' }, 'second');
  const { host, failures } = bootHeadless([first.def, second.def]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'first');
  host.place('a', 'second');
  const text = () => host.paneState('a').get()!.doc.textContent;
  const before = text();

  expect(host.actionKey('a', press('s'))).toBe(true);
  expect(text()).toBe('B' + before);
  expect(host.keyChoice.get()).toBe(null);
  // Now both can run, so the writer chooses.
  expect(host.actionKey('a', press('s'))).toBe(true);
  expect(text()).toBe('B' + before);
  expect(host.keyChoice.get()!.actions.map((e) => e.moduleId)).toEqual(['first', 'second']);
  expect(failures).toEqual([]);
});

it('an action provided in with() runs exactly while its condition holds, and stays listed', () => {
  fc.assert(
    fc.property(fc.array(fc.boolean(), { maxLength: 12 }), (toggles) => {
      const actions = { suggest: { title: 'Suggest' }, wide: { title: 'Module-wide' } };
      let on: { set(v: boolean): void } | null = null;
      const def: ModuleDef = {
        id: 'ai',
        exports: {
          actions,
          setup(ctx) {
            const ai = ctx.getValue(valueKey('ai', { default: false }));
            on = ai;
            ctx.with(ai, (s) => s.provide(actions.wide, { procedure: () => true }));
            ctx.each(ctx.panes, (p) =>
              p.with(ai, (s) =>
                s.provide(actions.suggest, { command: (state, dispatch) => (dispatch?.(state.tr.insertText('!')), true) }),
              ),
            );
          },
        },
      };
      const { host, failures } = bootHeadless([def]);
      host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
      host.place('a', 'ai');
      let current = false;
      for (const next of toggles) {
        on!.set(next);
        current = next;
        const listed = host.actions('a');
        expect(listed.map((a) => a.name)).toEqual(['suggest', 'wide']);
        expect(listed.every((a) => a.enabled === current)).toBe(true);
        expect(host.runAction('a', 'ai', 'suggest')).toBe(current);
      }
      expect(failures).toEqual([]);
    }),
  );
});

it('a broken action implementation turns its module off', () => {
  const actions = { go: { title: 'Go' } };
  const cases: [string, (ctx: ModuleContext) => void][] = [
    ['two implementations for one pane', (ctx) => {
      ctx.provide(actions.go, { procedure: () => true });
      ctx.each(ctx.panes, (p) => p.provide(actions.go, { procedure: () => true }));
    }],
    ['a command on the module scope', (ctx) => ctx.provide(actions.go, { command: () => true })],
    ['an action that was never exported', (ctx) => ctx.provide({ title: 'Go' }, { procedure: () => true })],
    ['both shapes at once', (ctx) => ctx.provide(actions.go, { procedure: () => true, command: () => true } as never)],
    ['an action on a document scope', (ctx) => ctx.each(ctx.documents, (d) => (d.provide as Function)(actions.go, { procedure: () => true }))],
    ['an action in with() on a document scope', (ctx) => {
      const v = ctx.getValue(valueKey('v', { default: true }));
      ctx.each(ctx.documents, (d) => d.with(v, (s) => (s as unknown as { provide: Function }).provide(actions.go, { procedure: () => true })));
    }],
    ['a plugin in with()', (ctx) => {
      const v = ctx.getValue(valueKey('v', { default: true }));
      ctx.with(v, (s) => (s.provide as Function)(new Plugin({})));
    }],
    ['a plugin on the module scope', (ctx) => (ctx.provide as Function)(new Plugin({}))],
    ['a dry run that throws', (ctx) => ctx.each(ctx.panes, (p) => p.provide(actions.go, { command: () => { throw new Error('boom'); } }))],
  ];
  for (const [label, setup] of cases) {
    const { host, failures } = bootHeadless([{ id: 'm', exports: { actions, setup } }]);
    host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
    host.place('a', 'm');
    host.actions('a');
    expect(failures, label).toEqual(['m']);
  }
});

it('in development, an action that said it could run and then did nothing is warned about', () => {
  const actions = { fib: { title: 'Fib', keys: 'Mod-Shift-s' }, idle: { title: 'Idle' }, stamp: { title: 'Stamp' } };
  const { host, failures } = bootHeadless([
    {
      id: 'liar',
      exports: {
        actions,
        setup(ctx: ModuleContext) {
          ctx.each(ctx.panes, (p) => {
            // Yes when asked, no when run.
            p.provide(actions.fib, { command: (_s, dispatch) => !dispatch });
            p.provide(actions.idle, { command: () => true });
            p.provide(actions.stamp, { command: (s, dispatch) => (dispatch?.(s.tr.insertText('!')), true) });
          });
        },
      },
    },
  ]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'liar');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect(host.actionKey('a', press('s'))).toBe(false);
    expect(host.runAction('a', 'liar', 'idle')).toBe(true);
    expect(host.runAction('a', 'liar', 'stamp')).toBe(true);
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      '[mwps] module liar: action "fib" said it could run, then returned false',
      '[mwps] module liar: action "idle" said it could run, then dispatched nothing',
    ]);
  } finally {
    warn.mockRestore();
  }
  expect(failures).toEqual([]);
});

it('an action without a title refuses the install', () => {
  const { host } = bootHeadless([]);
  expect(() => host.install({ id: 'm', exports: { actions: { go: { title: '' } }, setup() {} } })).toThrow(/title/);
});
