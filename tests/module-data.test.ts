// Module data: nodes in the `module_data` group, inside the data node that
// ends the document after its writing. The pane's editor is a card over the writing, so the writer's
// gestures there never reach the data; a module writes its node in the
// pane's own transactions, so the data is on the pane's one history.

import type { ModuleContext, PartPanes } from 'mwps';
import { chainCommands, deleteSelection, joinBackward, joinForward, selectAll, selectNodeBackward, selectNodeForward } from 'prosemirror-commands';
import { closeHistory, undo } from 'prosemirror-history';
import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection, type Command } from 'prosemirror-state';
import { expect, it } from 'vitest';
import type { Host, ModuleDef } from '../src/core/host.js';
import { buildSchema, partsOf } from '../src/core/parts.js';
import { ui } from '../src/core/ui.js';
import { documentFromJson, documentToJson, moveToSchema } from '../src/core/document-json.js';
import { dataEnd, findData, writing } from '../src/lib/text.js';
import { docOf, startDoc } from './edits.js';
import { bootHeadless } from './headless.js';

// Buries each deleted run of the writing's text as an entry in its node,
// in the deleting transaction's own follow-up.
const pending = new PluginKey<string[]>('burier');
const burier: ModuleDef = {
  id: 'burier',
  exports: {
    nodes: {
      burier_data: { group: 'module_data', content: 'burier_entry*', toDOM: () => ['div', 0] },
      burier_entry: { content: 'text*', toDOM: () => ['p', 0] },
    },
    setup(ctx: ModuleContext) {
      ctx.each(ctx.panes, (p) =>
        p.provide(
          new Plugin<string[]>({
            key: pending,
            state: {
              init: () => [],
              apply(tr) {
                if (tr.getMeta(pending) || tr.getMeta('history$')) return [];
                const words: string[] = [];
                tr.steps.forEach((step, i) => {
                  step.getMap().forEach((from, to) => {
                    const doc = tr.docs[i]!;
                    if (to > from && to <= writing(doc).content.size) words.push(doc.textBetween(from, to, ' '));
                  });
                });
                return words.filter((w) => w.trim());
              },
            },
            appendTransaction(_trs, _old, state) {
              const words = pending.getState(state)!;
              if (!words.length) return null;
              const { burier_data, burier_entry } = state.schema.nodes;
              const entries = words.map((w) => burier_entry!.create(null, state.schema.text(w)));
              const found = findData(state.doc, 'burier_data');
              const tr = state.tr.setMeta(pending, true);
              if (!found) tr.insert(dataEnd(state.doc), burier_data!.create(null, entries));
              else tr.insert(found.pos + found.node.nodeSize - 1, entries);
              return tr;
            },
          }),
        ),
      );
    },
  },
};

// Shows its data as a card in the pane, with nothing in it at first.
const cards = new Map<string, PartPanes>();
const shower: ModuleDef = {
  id: 'shower',
  exports: {
    nodes: {
      shower_notes: { group: 'module_data', content: 'paragraph+', toDOM: () => ['div', 0] },
    },
    setup(ctx: ModuleContext) {
      ctx.each(ctx.panes, (p) => {
        cards.set(p.id, p.dataCards('shower_notes'));
        p.effect(() => () => cards.delete(p.id));
      });
    },
  },
};

// A layout: one card per block of the writing, in place of the editor.
const laidOut = new Map<string, PartPanes>();
const layout: ModuleDef = {
  id: 'layout',
  exports: {
    moduleType: 'editorReplacement',
    setup(ctx: ModuleContext) {
      ctx.each(ctx.panes, (p) => {
        laidOut.set(p.id, p.hostPartPanes(() => true));
        p.effect(() => () => laidOut.delete(p.id));
        p.provide(ui.editorReplacement(() => null));
      });
    },
  },
};

const data = (doc: Node, type: string) => findData(doc, type)?.node ?? null;

function boot() {
  const { host, failures } = bootHeadless([burier, shower, layout]);
  host.addPane({ id: 'a', documentId: 'd' }, moveToSchema(startDoc(), host.schema));
  host.addPane({ id: 'b', documentId: 'd' });
  for (const pane of ['a', 'b']) {
    host.place(pane, 'burier');
    host.place(pane, 'shower');
  }
  return { host, failures };
}

const main = (host: Host, pane = 'a') => host.mainCard(pane)!;
// A command as the writer in the main editor, in its positions.
const inMain = (host: Host, command: Command) => main(host).run(command);
// The baseKeymap's Backspace and Delete.
const backspace = chainCommands(deleteSelection, joinBackward, selectNodeBackward);
const del = chainCommands(deleteSelection, joinForward, selectNodeForward);
const caret =
  (pos: number): Command =>
  (state, dispatch) => (dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, pos))), true);

function seedNotes(host: Host) {
  host.run('a', (state, dispatch) => {
    const { shower_notes, paragraph } = state.schema.nodes;
    const notes = shower_notes!.create(null, paragraph!.create(null, state.schema.text('Ada, a pilot')));
    dispatch?.(state.tr.insert(dataEnd(state.doc), notes).setMeta('addToHistory', false));
    return true;
  });
}

it("position 0 is the writing's start, in the document and in the main editor", () => {
  const { host } = boot();
  seedNotes(host);
  const doc = docOf(host, 'a');
  expect(doc.firstChild!.type.name).toBe('paragraph');
  expect(doc.textBetween(1, 4)).toBe('one');
  const shown = main(host).state!.doc;
  expect(shown.type.name).toBe('doc');
  expect(shown.eq(writing(doc))).toBe(true);
  expect(doc.lastChild!.type.name).toBe('mwps_data');
  expect(writing(doc).content.size).toBe(doc.content.size - doc.lastChild!.nodeSize);
});

it('the main editor shows the writing alone; burying writes data in the same undo step', () => {
  const { host, failures } = boot();
  // "two" is deleted in the main editor (its positions are the document's).
  inMain(host, (state, dispatch) => (dispatch?.(state.tr.delete(5, 8)), true));
  const doc = docOf(host, 'a');
  expect(writing(doc).textContent).toBe('one three');
  expect(data(doc, 'burier_data')!.textContent).toBe('two');
  expect(main(host).state!.doc.textContent).toBe('one three');
  // Undo (Mod-z runs on the pane's state, as a card's keys do) restores the
  // word and removes its entry together.
  expect(host.run('a', undo)).toBe(true);
  expect(documentToJson(docOf(host, 'a'))).toEqual(documentToJson(startDoc()));
  expect(docOf(host, 'b').eq(docOf(host, 'a'))).toBe(true);
  expect(failures).toEqual([]);
});

it('Cmd-A then Delete in the main editor leaves module data intact', () => {
  const { host } = boot();
  seedNotes(host);
  const notes = data(docOf(host, 'a'), 'shower_notes')!;
  // The card's own Cmd-A, ProseMirror's selectAll in the card, and
  // selectAll as a key binding on the pane's state: all stay in the writing.
  const everything = [() => main(host).selectContent(), () => inMain(host, selectAll), () => main(host).runAsKey(selectAll)];
  for (const selectEverything of everything) {
    selectEverything();
    main(host).runAsKey(deleteSelection);
    const doc = docOf(host, 'a');
    expect(writing(doc).textContent).toBe('');
    expect(data(doc, 'shower_notes')!.eq(notes)).toBe(true);
    // What was deleted was buried, as any deletion is.
    expect(data(doc, 'burier_data')!.textContent).toContain('three');
    host.run('a', undo);
  }
});

it("Backspace and Delete at the writing's edges stay in the writing", () => {
  const { host } = boot();
  seedNotes(host);
  const before = docOf(host, 'a');
  const key = (command: Command) => main(host).runAsKey(command);
  host.run('a', caret(1));
  key(backspace);
  key(backspace);
  expect(docOf(host, 'a').eq(before)).toBe(true);
  // At the writing's end, Delete would select or join the data after it.
  const end = writing(before).content.size - 1;
  host.run('a', caret(end));
  key(del);
  key(del);
  expect(docOf(host, 'a').eq(before)).toBe(true);
  expect(host.paneState('a').get()!.selection.head).toBe(end);
  // And from inside the data card, at its start.
  const card = host.card('a', cards.get('a')!.list.get()[0]!.id)!;
  host.run('a', caret(card.from + 1));
  card.runAsKey(backspace);
  card.runAsKey(backspace);
  expect(docOf(host, 'a').eq(before)).toBe(true);
  expect(host.paneState('a').get()!.selection.head).toBe(card.from + 1);
});

it("a data card is an input surface of the pane: its edits are on the pane's history and agree everywhere", () => {
  const { host, failures } = boot();
  seedNotes(host);
  const card = cards.get('a')!.list.get()[0]!;
  expect(card.state.get()!.doc.type.name).toBe('shower_notes');
  card.run((state, dispatch) => (dispatch?.(state.tr.insertText('Captain ', 1)), true));
  expect(data(docOf(host, 'b'), 'shower_notes')!.textContent).toBe('Captain Ada, a pilot');
  expect(cards.get('b')!.list.get()[0]!.state.get()!.doc.textContent).toBe('Captain Ada, a pilot');
  // Cmd-A in the card selects the card's content only.
  card.run(selectAll);
  host.run('a', (state, dispatch) => (dispatch?.(closeHistory(state.tr)), true));
  card.run(deleteSelection);
  const doc = docOf(host, 'a');
  expect(writing(doc).textContent).toBe('one twothree');
  expect(data(doc, 'shower_notes')!.textContent).toBe('');
  // Undo from the main editor reaches it: one history.
  host.run('a', undo);
  expect(data(docOf(host, 'a'), 'shower_notes')!.textContent).toBe('Captain Ada, a pilot');
  expect(failures).toEqual([]);
});

it('Cmd-A then Delete in a layout card leaves module data intact', () => {
  const { host, failures } = boot();
  seedNotes(host);
  host.place('a', 'layout');
  const notes = data(docOf(host, 'a'), 'shower_notes')!;
  const layoutCards = laidOut.get('a')!.list.get();
  expect(layoutCards.length).toBe(2);
  const last = host.card('a', layoutCards[1]!.id)!;
  for (const selectEverything of [() => last.selectContent(), () => last.runAsKey(selectAll)]) {
    selectEverything();
    last.runAsKey(deleteSelection);
    const doc = docOf(host, 'a');
    expect(data(doc, 'shower_notes')!.eq(notes)).toBe(true);
    expect(doc.firstChild!.textContent).toBe('one two');
    host.run('a', undo);
  }
  expect(failures).toEqual([]);
});

it('module data survives save and load, and stays (unshown) while its module is off', () => {
  const { host } = boot();
  seedNotes(host);
  inMain(host, (state, dispatch) => (dispatch?.(state.tr.delete(1, 4)), true));
  const saved = documentToJson(docOf(host, 'a'));
  const schema = buildSchema([partsOf('burier', burier.exports), partsOf('shower', shower.exports)]);
  const loaded = documentFromJson(schema, saved);
  expect(loaded.error).toBeNull();
  expect(documentToJson(loaded.doc)).toEqual(saved);
  // Off: the data stays in the document, the main editor still shows the writing only.
  host.setEnabled('shower', false);
  host.setEnabled('burier', false);
  inMain(host, (state, dispatch) => (dispatch?.(state.tr.insertText('x', 1)), true));
  const doc = docOf(host, 'a');
  expect(data(doc, 'shower_notes')!.textContent).toBe('Ada, a pilot');
  expect(data(doc, 'burier_data')!.textContent).toBe('one');
  expect(main(host).state!.doc.textContent).toBe('x twothree');
  expect(cards.has('a')).toBe(false);
  // Uninstalled: kept as placeholders at the end, outside the writing,
  // written back unchanged.
  host.uninstall('shower');
  expect(documentToJson(docOf(host, 'a')).content!.at(-1)).toEqual(saved.content!.at(-1));
  expect(main(host).state!.doc.textContent).toBe('x twothree');
  expect(docOf(host, 'b').eq(docOf(host, 'a'))).toBe(true);
});

it("a plugin view is the pane's: one, living with the pane's element, the same view.dom wherever the caret is", () => {
  const seen: unknown[] = [];
  let made = 0;
  let ended = 0;
  const watcher: ModuleDef = {
    id: 'watcher',
    exports: {
      setup(ctx: ModuleContext) {
        ctx.each(ctx.panes, (p) =>
          p.provide(
            new Plugin({
              view(view) {
                made++;
                seen.push(view.dom);
                return { update: (v) => void seen.push(v.dom), destroy: () => void ended++ };
              },
            }),
          ),
        );
      },
    },
  };
  const { host, failures } = bootHeadless([shower, watcher]);
  host.addPane({ id: 'a', documentId: 'd' }, moveToSchema(startDoc(), host.schema));
  host.place('a', 'shower');
  host.place('a', 'watcher');
  expect(made).toBe(0);
  const element = {} as HTMLElement;
  host.attachPaneElement('a', element);
  expect(made).toBe(1);
  seedNotes(host);
  host.run('a', caret(2));
  const card = host.card('a', cards.get('a')!.list.get()[0]!.id)!;
  host.run('a', caret(card.from + 2));
  host.run('a', caret(3));
  expect(made).toBe(1);
  expect(seen.length).toBeGreaterThan(3);
  expect(seen.every((dom) => dom === element)).toBe(true);
  expect(host.paneView('a')!.dom).toBe(element);
  host.attachPaneElement('a', null);
  expect(ended).toBe(1);
  expect(failures).toEqual([]);
});
