// fast-check generators for documents the base schema allows.

import fc from 'fast-check';
import type { Mark, Node, Schema } from 'prosemirror-model';
import type { ModuleParts } from '../src/core/parts.js';

// A module's parts of every kind: a wrapping block, an inline node with
// content, a mark with an attribute, and attributes on base types.
export const TEST_PARTS: ModuleParts = {
  id: 'testparts',
  nodes: {
    testparts_box: { group: 'block', isolating: true, content: 'block+', attrs: { tone: { default: 'plain' } }, toDOM: () => ['section', 0] },
    testparts_note: { group: 'inline', inline: true, content: 'text*', toDOM: () => ['span', 0] },
  },
  marks: {
    testparts_tag: { attrs: { label: {} }, toDOM: () => ['span', 0] },
  },
  attrs: [{ types: ['paragraph', 'heading'], name: 'testparts_flag', spec: { default: false } }],
};

const hasParts = (schema: Schema) => 'testparts_box' in schema.nodes;

const word = fc.string({ minLength: 1, maxLength: 12, unit: fc.constantFrom(...'abc xyzé—🪶\t'.split('')) });

function marks(schema: Schema): fc.Arbitrary<readonly Mark[]> {
  const m = schema.marks;
  const one = fc.oneof(
    fc.constant(m.strong!.create()),
    fc.constant(m.em!.create()),
    fc.constant(m.code!.create()),
    fc.constant(m.underline!.create()),
    fc.constant(m.strike!.create()),
    fc.webUrl().map((href) => m.link!.create({ href })),
    fc.constantFrom('red', '#0a64d8').map((color) => m.textColor!.create({ color })),
    fc.constantFrom('yellow').map((color) => m.backgroundColor!.create({ color })),
    fc.constantFrom('12px', '2em').map((size) => m.fontSize!.create({ size })),
    fc.constantFrom('serif', 'monospace').map((family) => m.fontFamily!.create({ family })),
    ...(hasParts(schema) ? [fc.constantFrom('a', 'b').map((label) => m.testparts_tag!.create({ label }))] : []),
  );
  return fc.array(one, { maxLength: 3 }).map((ms) => ms.reduce<readonly Mark[]>((set, mk) => mk.addToSet(set), []));
}

function inline(schema: Schema): fc.Arbitrary<Node[]> {
  const n = schema.nodes;
  const item = fc.oneof(
    { weight: 6, arbitrary: fc.tuple(word, marks(schema)).map(([t, ms]) => schema.text(t, ms)) },
    { weight: 1, arbitrary: fc.constant(n.hard_break!.create()) },
    { weight: 1, arbitrary: fc.webUrl().map((src) => n.image!.create({ src, alt: 'an image' })) },
    ...(hasParts(schema)
      ? [{ weight: 1, arbitrary: fc.option(word).map((t) => n.testparts_note!.create(null, t ? schema.text(t) : null)) }]
      : []),
  );
  return fc.array(item, { maxLength: 6 });
}

const baseBlockAttrs = fc.record({
  align: fc.constantFrom(null, 'center', 'right'),
  indent: fc.nat(3),
});

export function arbitraryDocument(schema: Schema): fc.Arbitrary<Node> {
  const n = schema.nodes;
  const blockAttrs = baseBlockAttrs;
  const textblockAttrs = hasParts(schema)
    ? fc.tuple(baseBlockAttrs, fc.boolean()).map(([a, testparts_flag]) => ({ ...a, testparts_flag }))
    : baseBlockAttrs;
  const { block } = fc.letrec<{ block: Node }>((tie) => ({
    block: fc.oneof(
      { depthSize: 'small', withCrossShrink: true },
      fc.tuple(textblockAttrs, inline(schema)).map(([a, c]) => n.paragraph!.create(a, c)),
      fc.tuple(textblockAttrs, fc.integer({ min: 1, max: 6 }), inline(schema)).map(([a, level, c]) =>
        n.heading!.create({ ...a, level }, c),
      ),
      fc.tuple(blockAttrs, fc.option(word)).map(([a, t]) => n.code_block!.create(a, t ? schema.text(t) : null)),
      fc.constant(n.horizontal_rule!.create()),
      fc.tuple(blockAttrs, fc.array(tie('block'), { minLength: 1, maxLength: 3 })).map(([a, c]) =>
        n.blockquote!.create(a, c),
      ),
      fc
        .tuple(
          fc.boolean(),
          fc.integer({ min: 1, max: 9 }),
          fc.array(fc.array(tie('block'), { minLength: 1, maxLength: 2 }), { minLength: 1, maxLength: 3 }),
        )
        .map(([ordered, start, items]) => {
          const children = items.map((c) => n.list_item!.create(null, c));
          return ordered ? n.ordered_list!.create({ start }, children) : n.bullet_list!.create(null, children);
        }),
      ...(hasParts(schema)
        ? [
            fc
              .tuple(fc.constantFrom('plain', 'loud'), fc.array(tie('block'), { minLength: 1, maxLength: 2 }))
              .map(([tone, c]) => n.testparts_box!.create({ tone }, c)),
          ]
        : []),
    ),
  }));
  return fc.array(block, { minLength: 1, maxLength: 6 }).map((blocks) => {
    const doc = n.doc!.create(null, [...blocks, n.mwps_data!.create()]);
    doc.check();
    return doc;
  });
}
