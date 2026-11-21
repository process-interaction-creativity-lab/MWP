// A module's sealed block can always be removed by keys: Backspace at the
// start of one that holds nothing turns it into an empty paragraph.

import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { expect, it } from 'vitest';
import { clearEmptyModuleBlock } from '../src/core/base-plugins.js';
import { buildSchema, partsOf } from '../src/core/parts.js';

const schema = buildSchema([
  partsOf('m', {
    setup() {},
    nodes: {
      m_line: { group: 'block', isolating: true, content: 'text*', toDOM: () => ['p', 0] },
      m_field: { content: 'text*', toDOM: () => ['p', 0] },
      m_card: { group: 'block', isolating: true, content: 'm_field m_field', toDOM: () => ['div', 0] },
    },
  }),
]);
const { m_line, m_field, m_card, paragraph } = schema.nodes as Record<string, any>;

function backspace(doc: any, pos: number) {
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
  let out: Transaction | undefined;
  const handled = clearEmptyModuleBlock(state, (tr) => (out = tr));
  return { handled, doc: out?.doc };
}

it('turns an empty module block into an empty paragraph, the only block included', () => {
  const r = backspace(schema.node('doc', null, [m_line.create(), schema.nodes.mwps_data!.create()]), 1);
  expect(r.handled).toBe(true);
  expect(r.doc!.eq(schema.node('doc', null, [paragraph.create(), schema.nodes.mwps_data!.create()]))).toBe(true);
});

it('clears a block of fields only when every field is empty and the caret is in the first', () => {
  const empty = schema.node('doc', null, [m_card.create(null, [m_field.create(), m_field.create()]), paragraph.create(), schema.nodes.mwps_data!.create()]);
  expect(backspace(empty, 2).handled).toBe(true);
  expect(backspace(empty, 4).handled).toBe(false);
  const filled = schema.node('doc', null, [m_card.create(null, [m_field.create(), m_field.create(null, schema.text('x'))]), schema.nodes.mwps_data!.create()]);
  expect(backspace(filled, 2).handled).toBe(false);
});

it('leaves a module block with text, and base blocks, to the usual keys', () => {
  expect(backspace(schema.node('doc', null, [m_line.create(null, schema.text('x')), schema.nodes.mwps_data!.create()]), 1).handled).toBe(false);
  expect(backspace(schema.node('doc', null, [paragraph.create(), paragraph.create(), schema.nodes.mwps_data!.create()]), 3).handled).toBe(false);
});
