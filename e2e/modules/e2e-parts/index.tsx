// Test module: declares a node type, so installing or removing it at run
// time rebuilds the schema, and an attribute on paragraphs.
import type { NodeSpec } from 'prosemirror-model';

export const nodes: Record<string, NodeSpec> = {
  e2e_parts_region: {
    group: 'block',
    isolating: true,
    content: 'paragraph+',
    attrs: { tone: { default: 'plain' } },
    toDOM: () => ['section', { class: 'e2e-region' }, 0],
  },
  e2e_parts_stamp: { group: 'block', isolating: true, content: 'text*', toDOM: () => ['p', { class: 'e2e-stamp' }, 0] },
};

export const attrs = [{ name: 'e2e_parts_flag', types: ['paragraph'], spec: { default: false } }];

export function setup() {}
