import { type Node, Schema } from 'prosemirror-model';
import { describe, expect, test } from 'vitest';
import { baseMarks, baseNodes } from '../core/schema.js';
import { sections, splitSentences, splitWords, textOf } from './text.js';

const schema = new Schema({
  nodes: {
    ...baseNodes,
    doc: { content: 'block+' },
    note: { group: 'inline inline_aside', inline: true, content: 'text*', toDOM: () => ['span', 0] },
  },
  marks: baseMarks,
});
const s = schema;
const p = (...content: Node[]) => s.node('paragraph', null, content);

describe('textOf', () => {
  test('maps offsets back to positions, around a left-out note', () => {
    // doc(p("One", note("x"), " two")) — the paragraph starts at 0.
    const doc = s.node('doc', null, [p(s.text('One'), s.node('note', null, [s.text('x')]), s.text(' two'))]);
    const t = textOf(doc.child(0), 0);
    expect(t.text).toBe('One two');
    expect(doc.textBetween(t.pos(0), t.pos(3, -1))).toBe('One');
    expect(t.pos(3, -1)).toBe(4); // before the note
    expect(t.pos(3)).toBe(7); // after it (1 + 3 + 3)
    expect(doc.textBetween(t.pos(4), t.pos(7, -1))).toBe('two');
    expect(t.pos(7)).toBe(doc.child(0).nodeSize - 1);
    expect(t.pos(0, -1)).toBe(1);
  });

  test('a hard break reads as a newline; an empty block maps to its start', () => {
    const doc = s.node('doc', null, [p(s.text('a'), s.node('hard_break'), s.text('b')), p()]);
    const t = textOf(doc.child(0), 0);
    expect(t.text).toBe('a\nb');
    expect(t.pos(2)).toBe(3);
    const empty = textOf(doc.child(1), doc.child(0).nodeSize);
    expect(empty.text).toBe('');
    expect(empty.pos(0)).toBe(doc.child(0).nodeSize + 1);
    expect(empty.pos(0, -1)).toBe(doc.child(0).nodeSize + 1);
  });
});

describe('splitSentences', () => {
  test('sentences abut and keep trailing whitespace', () => {
    const text = 'One two. Three?!  Four';
    const parts = splitSentences(text);
    expect(parts.map((x) => x.text)).toEqual(['One two. ', 'Three?!  ', 'Four']);
    expect(parts.map((x) => [x.from, x.to])).toEqual([[0, 9], [9, 18], [18, 22]]);
  });

  test('whitespace-only text has no sentences', () => {
    expect(splitSentences('   ')).toEqual([]);
    expect(splitSentences('')).toEqual([]);
  });
});

test('splitWords: runs of non-whitespace', () => {
  expect(splitWords(' a  bc\nd ')).toEqual([
    { from: 1, to: 2, text: 'a' },
    { from: 4, to: 6, text: 'bc' },
    { from: 7, to: 8, text: 'd' },
  ]);
});

describe('sections', () => {
  const mark = (n: Node) => n.type.name === 'heading';
  const h = (t: string) => s.node('heading', { level: 1 }, [s.text(t)]);
  const para = (t: string) => p(s.text(t));

  test('each start owns the blocks up to the next one; blocks before the first belong to none', () => {
    const doc = s.node('doc', null, [para('intro'), h('A'), para('a1'), para('a2'), h('B'), h('C'), para('c1')]);
    const out = sections(doc, mark);
    expect(out.map((x) => [x.index, x.node.textContent, x.body.map((b) => b.node.textContent)])).toEqual([
      [0, 'A', ['a1', 'a2']],
      [1, 'B', []],
      [2, 'C', ['c1']],
    ]);
    // Positions are the document's, and a section ends where the next begins.
    expect(out[0].pos).toBe(doc.child(0).nodeSize);
    expect(out[0].to).toBe(out[1].pos);
    expect(out[1].to).toBe(out[1].end);
    expect(out[1].to).toBe(out[2].pos);
    expect(out[2].to).toBe(doc.content.size);
    expect(doc.nodeAt(out[0].body[1].pos)?.textContent).toBe('a2');
  });

  test('no starts, no sections', () => {
    expect(sections(s.node('doc', null, [para('x')]), mark)).toEqual([]);
  });
});
