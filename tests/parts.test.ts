// Document parts: the schema from installed modules, and nothing lost when a
// module is missing.

import fc from 'fast-check';
import type { ModuleExports } from 'mwps';
import { expect, it } from 'vitest';
import { documentFromJson, documentToJson } from '../src/core/document-json.js';
import { Transform } from 'prosemirror-transform';
import { buildSchema } from '../src/core/parts.js';
import { arbitraryDocument, TEST_PARTS } from './arbitraries.js';
import { bootHeadless } from './headless.js';

const withParts = buildSchema([TEST_PARTS]);
const without = buildSchema([]);
const json = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;

it("a document with parts from a module that isn't installed round-trips unchanged", () => {
  fc.assert(
    fc.property(arbitraryDocument(withParts), (doc) => {
      const stored = json(documentToJson(doc));
      const opened = documentFromJson(without, stored as never);
      expect(opened.error).toBeNull();
      expect(json(documentToJson(opened.doc))).toEqual(stored);

      // Reinstalling the module and reopening restores the real parts.
      const back = documentFromJson(withParts, documentToJson(opened.doc));
      expect(back.error).toBeNull();
      expect(back.doc.eq(doc)).toBe(true);
    }),
  );
});

it("editing elsewhere keeps a missing module's parts", () => {
  fc.assert(
    fc.property(arbitraryDocument(withParts), (doc) => {
      const stored = documentToJson(doc);
      const opened = documentFromJson(without, json(stored) as never).doc;
      const edited = opened.copy(opened.content.addToEnd(without.nodes.paragraph!.create(null, without.text('new'))));
      const saved = json(documentToJson(edited)) as { content: unknown[] };
      expect(saved.content.slice(0, -1)).toEqual((json(stored) as { content: unknown[] }).content);
    }),
  );
});

const partsModule = (id: string, nodes: ModuleExports['nodes'], setup: ModuleExports['setup'] = () => {}) => ({
  id,
  exports: { setup, nodes },
});

it('a module whose type name is taken is refused, and nothing changes', () => {
  let starts = 0;
  const { host } = bootHeadless([
    partsModule('first', { first_note: { group: 'block', isolating: true, content: 'inline*' } }, () => void starts++),
  ]);
  // A module runs while placed somewhere.
  host.addPane({ id: 'p', documentId: null });
  host.place('p', 'first');
  const schema = host.schema;
  expect(() => host.install(partsModule('second', { first_note: { group: 'block' } }))).toThrow(/already used by first/);
  expect(() => host.install(partsModule('third', { paragraph: { group: 'block' } }))).toThrow(/base schema/);
  expect(() => host.install(partsModule('fourth', { 'bad-name': { group: 'block' } }))).toThrow(/word characters/);
  expect(() => host.install(partsModule('fifth', { fifth_x: { content: 'no_such_type' } }))).toThrow(/valid schema/);
  // Attributes go on base types only, never on another module's types.
  expect(() =>
    host.install({
      id: 'sixth',
      exports: { setup() {}, attrs: [{ types: ['first_note'], name: 'sixth_flag', spec: { default: null } }] },
    }),
  ).toThrow(/isn't a base type/);
  expect(host.schema).toBe(schema);
  expect(host.moduleIds()).toEqual(['first']);
  expect(starts).toBe(1);
});

it('a module with a non-isolating block type is refused, and the others keep working', () => {
  const started: string[] = [];
  const { host } = bootHeadless([
    partsModule('good', { good_note: { group: 'block', isolating: true, content: 'inline*' } }, () => void started.push('good')),
  ]);
  host.addPane({ id: 'p', documentId: null });
  host.place('p', 'good');
  const schema = host.schema;
  expect(() => host.install(partsModule('leaky', { leaky_note: { group: 'block', content: 'inline*' } }))).toThrow(
    /leaky_note.*isolating/,
  );
  // Inline nodes, and block-content types outside the group, are not the rule's business.
  host.install(partsModule('fine', { fine_inline: { group: 'inline', inline: true, content: 'text*' } }));
  expect(host.schema).not.toBe(schema);
  expect(host.moduleIds()).toEqual(['good', 'fine']);
  expect(started.length).toBeGreaterThanOrEqual(1);
});

it('a code-only update keeps the schema; a changed spec rebuilds it and restarts every module', () => {
  const starts: string[] = [];
  const spec = { group: 'block', isolating: true, content: 'inline*', toDOM: () => ['div', 0] as const };
  const { host } = bootHeadless([
    partsModule('a', { a_box: spec }, () => void starts.push('a')),
    partsModule('b', undefined, () => void starts.push('b')),
  ]);
  host.addPane({ id: 'p', documentId: null });
  host.place('p', 'a');
  host.place('p', 'b');
  const schema = host.schema;
  expect(schema.nodes.a_box).toBeDefined();

  host.install(partsModule('a', { a_box: { ...spec, toDOM: () => ['div', 0] as const } }, () => void starts.push('a')));
  expect(host.schema).toBe(schema);
  expect(starts).toEqual(['a', 'b', 'a']);

  host.install(partsModule('a', { a_box: { ...spec, content: 'text*' } }, () => void starts.push('a')));
  expect(host.schema).not.toBe(schema);
  expect(starts).toEqual(['a', 'b', 'a', 'a', 'b']);

  host.uninstall('a');
  expect(host.schema.nodes.a_box).toBeUndefined();
});

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

it('a block of a missing module that holds blocks shows its paragraphs and comes back as itself', () => {
  const region = { type: 'gone_region', attrs: { tone: 'loud' }, content: [para('inside')] };
  const stored = { type: 'doc', content: [para('one'), region, { type: 'mwps_data' }] };
  const opened = documentFromJson(without, stored as never);
  expect(opened.error).toBeNull();
  expect(opened.doc.child(1).type.name).toBe('unknown_container');
  expect(opened.doc.child(1).textContent).toBe('inside');
  // The writer types at the end of "inside" (after "one" 5, container 1, paragraph 1, text 6).
  const tr = new Transform(opened.doc).insert(13, without.text('!'));
  const saved = documentToJson(tr.doc) as { content: { content?: { content: { text: string }[] }[] }[] };
  expect(saved.content[1]).toMatchObject({ type: 'gone_region', attrs: { tone: 'loud' } });
  expect(saved.content[1]!.content![0]!.content[0]!.text).toBe('inside!');
});

it("a missing module's data stays opaque in the data node, and old files get one", () => {
  const data = { type: 'gone_data', content: [para('kept')] };
  const legacy = { type: 'doc', content: [para('one'), para('two'), data] };
  const opened = documentFromJson(without, legacy as never);
  expect(opened.error).toBeNull();
  expect(opened.doc.lastChild!.type.name).toBe('mwps_data');
  expect(opened.doc.lastChild!.firstChild!.type.name).toBe('unknown_block');
  expect(opened.doc.childCount).toBe(3);
  expect(documentToJson(opened.doc).content!.at(-1)).toEqual({ type: 'mwps_data', content: [data] });
});
