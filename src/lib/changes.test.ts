import { Schema } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { describe, expect, test } from 'vitest';
import { baseMarks, baseNodes } from '../core/schema.js';
import { commitLog, KEEP, reader, type CommitLog } from './changes.js';

const schema = new Schema({ nodes: { ...baseNodes, doc: { content: 'block+' } }, marks: baseMarks });
const key = new PluginKey<CommitLog<string>>('log');
// Logs the text after each edit; skips transactions that change nothing.
const textAfter = (tr: Transaction) => (tr.docChanged ? tr.doc.textContent : null);
const start = () =>
  EditorState.create({
    doc: schema.node('doc', null, [schema.node('paragraph')]),
    plugins: [new Plugin({ key, state: commitLog(textAfter) })],
  });
const type = (s: EditorState, text: string) => s.apply(s.tr.insertText(text, s.doc.content.size - 1));
const get = (s: EditorState) => key.getState(s)!;

describe('commitLog', () => {
  test('logs what pick returns, skipping null', () => {
    let s = start();
    s = type(s, 'a');
    s = s.apply(s.tr.setMeta('nothing', true));
    s = type(s, 'b');
    expect(get(s).seq).toBe(2);
    expect(get(s).entries.map((e) => e.entry)).toEqual(['a', 'ab']);
  });

  test(`keeps the last ${KEEP} entries`, () => {
    let s = start();
    for (let i = 0; i < KEEP + 10; i++) s = type(s, 'x');
    expect(get(s).seq).toBe(KEEP + 10);
    expect(get(s).entries.length).toBe(KEEP);
    expect(get(s).entries[0]!.seq).toBe(11);
  });
});

describe('reader', () => {
  test('hands over each entry once, however many changes come between reads', () => {
    let s = start();
    const read = reader(get, s);
    s = type(s, 'a');
    s = type(s, 'b');
    expect(read(s)).toEqual(['a', 'ab']);
    expect(read(s)).toEqual([]);
    s = type(s, 'c');
    expect(read(s)).toEqual(['abc']);
  });

  test('starts at the state it is given, so a view made afresh reads nothing old', () => {
    let s = type(start(), 'a');
    const read = reader(get, s);
    expect(read(s)).toEqual([]);
    s = type(s, 'b');
    expect(read(s)).toEqual(['ab']);
  });
});
