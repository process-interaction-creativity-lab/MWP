// Properties of cards: input surfaces of their host pane, one per top-level
// block (`hostPartPanes`). A card is not a pane: its edits are the host
// pane's, on its one history, and the host pane's changes show in the card.

import fc from 'fast-check';
import type { ModuleContext, PartHandle, PartPanes } from 'mwps';
import { redo, undo } from 'prosemirror-history';
import type { Node } from 'prosemirror-model';
import { joinBackward, selectAll } from 'prosemirror-commands';
import { TextSelection, type Command } from 'prosemirror-state';
import { expect, it } from 'vitest';
import type { Host, ModuleDef } from '../src/core/host.js';
import { ui } from '../src/core/ui.js';
import { writing } from '../src/lib/text.js';
import { autocorrect, command, docOf, edit, startDoc } from './edits.js';
import { bootHeadless } from './headless.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// Each host pane's cards, while it has them.
const hosted = new Map<string, PartPanes>();

// One card per top-level block, in place of the editor.
const cards: ModuleDef = {
  id: 'cards',
  exports: {
    moduleType: 'editorReplacement',
    setup(ctx: ModuleContext) {
      ctx.each(ctx.panes, (p) => {
        hosted.set(p.id, p.hostPartPanes(() => true));
        p.effect(() => () => hosted.delete(p.id));
        p.provide(ui.editorReplacement(() => null));
      });
    },
  },
};

const handles = (): readonly PartHandle[] => hosted.get('r')?.list.get() ?? [];

// Every copy agrees with the document, and each card shows its block.
function agree(host: Host) {
  const doc = host.document('d')!.doc;
  expect(docOf(host, 'r').eq(doc)).toBe(true);
  expect(docOf(host, 'plain').eq(doc)).toBe(true);
  const list = handles();
  expect(list.length).toBe(writing(doc).childCount);
  writing(doc).forEach((node, pos, i) => {
    expect(list[i]!.part).toBe(pos);
    const card = list[i]!.state.get()!.doc;
    expect(card.childCount).toBe(1);
    expect(card.firstChild!.eq(node)).toBe(true);
  });
}

function boot(start: Node = startDoc()) {
  hosted.clear();
  const ac = autocorrect();
  const { host, failures } = bootHeadless([cards, ac.def]);
  host.addPane({ id: 'r', documentId: 'd' }, { doc: start, error: null });
  host.addPane({ id: 'plain', documentId: 'd' });
  host.place('r', 'autocorrect');
  host.place('r', 'cards');
  host.place('plain', 'autocorrect');
  return { host, failures };
}

it('editing through the host pane, a card or another pane leaves every view agreeing', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({ where: fc.nat(), edit: edit.map((e) => command(e)) }), { maxLength: 25 }),
      async (steps) => {
        const { host, failures } = boot();
        await settle();
        agree(host);
        for (const s of steps) {
          const n = handles().length;
          const at = s.where % (n + 2);
          // The host pane, another pane, or a card (in the card's positions).
          if (at === n) host.run('plain', s.edit);
          else if (at === n + 1) host.run('r', s.edit);
          else handles()[at]!.run(s.edit);
          agree(host);
        }
        await settle();
        agree(host);
        expect(failures).toEqual([]);
      },
    ),
    { numRuns: 200 },
  );
});

it("a card's edits are the host pane's, on its one history", async () => {
  const { host } = boot();
  await settle();
  const [c0, c1] = handles();
  c0!.run(command({ kind: 'insert', at: 0, text: 'x' }));
  c1!.run(command({ kind: 'insert', at: 0, text: 'y' }));
  expect(docOf(host, 'plain').textContent).toBe('xone twoythree');
  // Undo from the host pane takes back the last step, whichever card made it.
  expect(host.run('r', undo)).toBe(true);
  expect(docOf(host, 'r').textContent).toBe('xone twothree');
  expect(host.run('r', undo)).toBe(true);
  expect(docOf(host, 'r').textContent).toBe('one twothree');
  host.run('r', redo);
  expect(docOf(host, 'r').textContent).toBe('xone twothree');
  agree(host);
});

it("focusing a card puts the pane's selection in it", async () => {
  const { host } = boot();
  await settle();
  const [, c1] = handles();
  c1!.focus();
  const sel = host.paneState('r').get()!.selection;
  expect(sel.from).toBeGreaterThan(c1!.part);
  expect(sel.to).toBeLessThan(c1!.part + docOf(host, 'r').nodeAt(c1!.part)!.nodeSize);
  // Inside already, it stays where it is.
  c1!.run(command({ kind: 'insert', at: 1, text: 'z' }));
  const before = host.paneState('r').get()!.selection;
  c1!.focus();
  expect(host.paneState('r').get()!.selection.eq(before)).toBe(true);
});

it('a split in a card stays between its ends: the second half is a new card', async () => {
  const { host } = boot();
  await settle();
  const [c0, c1] = handles();
  const split: Command = (state, dispatch) => (dispatch?.(state.tr.split(4)), true);
  c0!.run(split);
  expect(writing(docOf(host, 'r')).childCount).toBe(3);
  const after = handles();
  expect(after.length).toBe(3);
  expect(after[0]!.id).toBe(c0!.id);
  expect(after[2]!.id).toBe(c1!.id);
  agree(host);
});

it('a card refuses what a key would make outside its ends', async () => {
  const { host } = boot();
  await settle();
  const second = host.card('r', handles()[1]!.id)!;
  // Backspace at the second card's start would join it to the first.
  host.run('r', (state, dispatch) => (dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, second.from + 1))), true));
  expect(second.runAsKey(joinBackward)).toBe(true);
  // A selection made outside it is refused too.
  second.runAsKey(selectAll);
  expect(host.document('d')!.doc.eq(startDoc())).toBe(true);
  expect(host.paneState('r').get()!.selection.head).toBe(second.from + 1);
  agree(host);
});

it('a block moved in one commit keeps its card', async () => {
  const { host, failures } = boot();
  await settle();
  const before = handles().map((h) => h.id);
  // Drag "three" above "one two": one delete and one insert of equal content.
  host.run('plain', (state, dispatch) => {
    const node = state.doc.child(1);
    const at = state.doc.child(0).nodeSize;
    dispatch?.(state.tr.delete(at, at + node.nodeSize).insert(0, node).setMeta('addToHistory', false));
    return true;
  });
  expect(handles().map((h) => h.id)).toEqual([before[1], before[0]]);
  agree(host);
  expect(failures).toEqual([]);
});

it('a join made from another pane closes the card; the survivor shows the joined block', async () => {
  const { host } = boot();
  await settle();
  const [c0] = handles();
  host.run('plain', (state, dispatch) => (dispatch?.(state.tr.join(state.doc.child(0).nodeSize)), true));
  expect(handles().map((h) => h.id)).toEqual([c0!.id]);
  agree(host);
});

it('a matches function that throws turns its module off', async () => {
  hosted.clear();
  const bad: ModuleDef = {
    id: 'bad',
    exports: {
      moduleType: 'editorReplacement',
      setup(ctx: ModuleContext) {
        ctx.each(ctx.panes, (p) => {
          void p.hostPartPanes(() => {
            throw new Error('nope');
          });
          p.provide(ui.editorReplacement(() => null));
        });
      },
    },
  };
  const { host, failures } = bootHeadless([bad]);
  host.addPane({ id: 'r', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('r', 'bad');
  await settle();
  expect(failures).toEqual(['bad']);
});
