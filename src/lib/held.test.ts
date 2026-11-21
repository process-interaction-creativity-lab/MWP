import { Schema } from 'prosemirror-model';
import { EditorState, type Command } from 'prosemirror-state';
import { describe, expect, test } from 'vitest';
import { baseMarks, baseNodes } from '../core/schema.js';
import { heldSpans } from './held.js';

const schema = new Schema({ nodes: { ...baseNodes, doc: { content: 'block+' } }, marks: baseMarks });
const held = heldSpans('test', { class: 'x-held' });
// doc(p("Hello world")): "world" is 7..12.
const start = () =>
  EditorState.create({
    doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello world')])]),
    plugins: [held.plugin],
  });
const run = (s: EditorState, command: Command) => {
  let next = s;
  command(s, (tr) => void (next = s.apply(tr)));
  return next;
};
const insert = (s: EditorState, at: number, text: string) => s.apply(s.tr.insertText(text, at));
const drawn = (s: EditorState) => held.plugin.getState(s)!.decorations.find().map((d) => [d.from, d.to]);

describe('heldSpans', () => {
  test('a span follows edits before it and keeps its text', () => {
    let s = run(start(), held.hold('w', 7, 12));
    s = insert(s, 1, 'Oh, ');
    expect(held.get(s, 'w')).toEqual({ id: 'w', from: 11, to: 16, text: 'world' });
    expect(drawn(s)).toEqual([[11, 16]]);
  });

  test('typing at either edge is outside the span', () => {
    let s = run(start(), held.hold('w', 7, 12));
    s = insert(s, 12, '!');
    s = insert(s, 7, 'big ');
    const r = held.get(s, 'w')!;
    expect(s.doc.textBetween(r.from, r.to)).toBe('world');
  });

  test('typing inside, or deleting the span, drops it and stops drawing it', () => {
    const s = run(start(), held.hold('w', 7, 12));
    const typed = insert(s, 9, 'x');
    expect(held.get(typed, 'w')).toBeNull();
    expect(drawn(typed)).toEqual([]);
    expect(held.get(s.apply(s.tr.delete(6, 12)), 'w')).toBeNull();
  });

  test('splitting the paragraph inside a span changes its text', () => {
    const s = run(start(), held.hold('w', 7, 12));
    expect(held.get(s.apply(s.tr.split(9)), 'w')).toBeNull();
  });

  test('an empty span is dropped once anything is typed at it', () => {
    let s = run(start(), held.hold('end', 12, 12));
    expect(held.get(s, 'end')).toEqual({ id: 'end', from: 12, to: 12, text: '' });
    s = insert(s, 12, '!');
    expect(held.get(s, 'end')).toBeNull();
  });

  test('all lists spans in the order they were held, not document order', () => {
    let s = run(start(), held.hold('b', 7, 12));
    s = run(s, held.hold('a', 1, 6));
    expect(held.all(s).map((r) => r.id)).toEqual(['b', 'a']);
  });

  test('release lets go of one span, or of all', () => {
    let s = run(start(), held.hold('a', 1, 6));
    s = run(s, held.hold('b', 7, 12));
    s = run(s, held.release('a'));
    expect(held.get(s, 'a')).toBeNull();
    expect(held.get(s, 'b')).not.toBeNull();
    s = run(s, held.release());
    expect(held.all(s)).toEqual([]);
  });

  test('holding and releasing put nothing in the document', () => {
    const s = start();
    const after = run(run(s, held.hold('w', 7, 12)), held.release('w'));
    expect(after.doc.eq(s.doc)).toBe(true);
  });
});
