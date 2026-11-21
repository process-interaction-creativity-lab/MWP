import { describe, expect, it } from 'vitest';
import { parseHelp, parseInline } from './help.js';

describe('parseHelp', () => {
  it('drops the title and reads headings, paragraphs and lists', () => {
    const blocks = parseHelp(
      [
        '# demo: help',
        '',
        'You are drafting',
        'a scene.',
        '',
        '## Walkthrough',
        '1. Select a sentence.',
        '2. Click **Swap**,',
        '   then pick one.',
        '- a bullet',
      ].join('\n'),
    );
    expect(blocks).toEqual([
      { kind: 'paragraph', text: [{ kind: 'text', text: 'You are drafting a scene.' }] },
      { kind: 'heading', level: 2, text: [{ kind: 'text', text: 'Walkthrough' }] },
      {
        kind: 'list',
        ordered: true,
        items: [
          [{ kind: 'text', text: 'Select a sentence.' }],
          [
            { kind: 'text', text: 'Click ' },
            { kind: 'bold', children: [{ kind: 'text', text: 'Swap' }] },
            { kind: 'text', text: ', then pick one.' },
          ],
        ],
      },
      { kind: 'list', ordered: false, items: [[{ kind: 'text', text: 'a bullet' }]] },
    ]);
  });

  it('ends a list at an unindented line', () => {
    const blocks = parseHelp('- one\nafter');
    expect(blocks.map((b) => b.kind)).toEqual(['list', 'paragraph']);
  });
});

describe('parseInline', () => {
  it('reads italic, code and links, nesting inside bold', () => {
    expect(parseInline('*a* `b` [c](https://x.org) **d *e* f**')).toEqual([
      { kind: 'italic', children: [{ kind: 'text', text: 'a' }] },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'link', href: 'https://x.org', children: [{ kind: 'text', text: 'c' }] },
      { kind: 'text', text: ' ' },
      {
        kind: 'bold',
        children: [
          { kind: 'text', text: 'd ' },
          { kind: 'italic', children: [{ kind: 'text', text: 'e' }] },
          { kind: 'text', text: ' f' },
        ],
      },
    ]);
  });

  it('leaves a lone asterisk as text', () => {
    expect(parseInline('5 * 3')).toEqual([{ kind: 'text', text: '5 * 3' }]);
  });
});
