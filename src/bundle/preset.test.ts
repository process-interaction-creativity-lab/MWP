import { describe, expect, it } from 'vitest';
import { markdownToDoc } from './markdown.ts';
import { checkLayout, layoutFile } from './preset.ts';

describe('markdownToDoc', () => {
  it('reads headings, paragraphs joined across lines, and lists', () => {
    expect(markdownToDoc('# Title\n\nOne\ntwo.\n\n- a\n- b\n\n1. c')).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'One two.' }] },
        {
          type: 'bullet_list',
          content: ['a', 'b'].map((t) => ({ type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })),
        },
        { type: 'ordered_list', content: [{ type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c' }] }] }] },
      ],
    });
  });

  it('marks bold, italic and code, leaving snake_case alone', () => {
    expect(markdownToDoc('a **b** *c* _d_ `e` snake_case_name').content![0]!.content).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: 'b', marks: [{ type: 'strong' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'c', marks: [{ type: 'em' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'd', marks: [{ type: 'em' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'e', marks: [{ type: 'code' }] },
      { type: 'text', text: ' snake_case_name' },
    ]);
  });

  it('gives an empty file one empty paragraph', () => {
    expect(markdownToDoc('\n\n')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
});

describe('a preset layout', () => {
  const layout = {
    modules: ['split'],
    values: { split: { orientation: 'horizontal' } },
    children: [{ document: 'b', modules: ['wp'] }, { modules: ['wp', 'cards'], values: { cards: { on: true } } }],
  };

  it('becomes the host’s saved layout, children hosted by the last module', () => {
    expect(layoutFile(layout, 'a')).toEqual({
      childrenMade: 2,
      panes: {
        main: { parent: null, host: null, owner: 'writer', document: 'a', modules: ['split'], values: { split: { orientation: 'horizontal' } } },
        'main/1': { parent: 'main', host: 'split', owner: 'writer', document: 'b', modules: ['wp'], values: {} },
        'main/2': { parent: 'main', host: 'split', owner: 'writer', document: 'a', modules: ['wp', 'cards'], values: { cards: { on: true } } },
      },
    });
  });

  it('is checked against the preset’s modules and documents', () => {
    expect(checkLayout(layout, new Set(['split', 'wp', 'cards']), new Set(['a', 'b']))).toEqual([]);
    expect(checkLayout(layout, new Set(['split', 'wp']), new Set(['a']))).toEqual([
      'layout.children[0] shows "b", which isn\'t a document',
      'layout.children[1] uses "cards", which "modules" leaves out',
    ]);
  });
});
