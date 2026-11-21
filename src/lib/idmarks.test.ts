import { Schema, Slice, type Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, test } from 'vitest';
import { baseMarks, baseNodes } from '../core/schema.js';
import { idMarks } from './idmarks.js';

const schema = new Schema({
  nodes: { ...baseNodes, doc: { content: 'block+' } },
  marks: { ...baseMarks, note: { attrs: { id: {}, body: { default: '' } }, excludes: '' } },
});
const notes = idMarks('note');
const mark = (id: string, body = '') => schema.marks.note.create({ id, body });
const p = (...c: Node[]) => schema.node('paragraph', null, c);
const t = (text: string, id?: string) => schema.text(text, id ? [mark(id)] : []);

describe('idMarks', () => {
  const doc = schema.node('doc', null, [p(t('a '), t('bc', 'n1'), t(' d')), p(t('ef', 'n1'))]);

  test('spans group runs by id', () => {
    const [s] = notes.spans(doc);
    expect(s.runs.map((r) => doc.textBetween(r.from, r.to))).toEqual(['bc', 'ef']);
    expect(notes.find(doc, 'n1')).toBe(s);
    expect(notes.find(doc, 'zz')).toBeNull();
  });

  test('set changes the attributes on every run; remove clears them', () => {
    const tr = EditorState.create({ doc }).tr;
    expect(notes.set(tr, 'n1', { body: 'x' })).toBe(true);
    expect(notes.spans(tr.doc)[0].runs).toHaveLength(2);
    expect(notes.spans(tr.doc)[0].mark.attrs.body).toBe('x');
    expect(notes.set(tr, 'zz', { body: 'x' })).toBe(false);
    notes.remove(tr, 'n1');
    expect(notes.spans(tr.doc)).toHaveLength(0);
  });

  test('a pasted copy gets a fresh id, except at the paste position', () => {
    const viewAt = (pos: number) =>
      ({ state: EditorState.create({ doc, selection: TextSelection.create(doc, pos) }) }) as unknown as EditorView;
    const slice = new Slice(p(t('bc', 'n1')).content, 0, 0);
    const idOf = (s: Slice) => s.content.firstChild!.marks[0].attrs.id;
    expect(idOf(notes.transformPasted(slice, viewAt(1)))).not.toBe('n1');
    expect(idOf(notes.transformPasted(slice, viewAt(4)))).toBe('n1'); // inside the span
    const other = new Slice(p(t('x', 'n9')).content, 0, 0);
    expect(notes.transformPasted(other, viewAt(1))).toBe(other); // not in the document: identity kept
  });
});
