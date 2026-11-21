// Marks that carry an id, imported by modules as part of `mwps/text`: the
// reading, editing and pasting of anchored items (a note, a take, a comment).

import { Fragment, Slice, type Mark, type Node } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { writing } from './text.js';

/** One item: every inline run that carries its id, in document order. */
export interface IdSpan {
  readonly id: string;
  /** The mark on the first run (every run should hold the same attributes). */
  readonly mark: Mark;
  /** Contiguous inline content with the mark; a block boundary ends a run. */
  readonly runs: readonly { readonly from: number; readonly to: number }[];
  /** The first run's start and the last run's end. */
  readonly from: number;
  readonly to: number;
}

/** The items of one kind of mark that has an `id` attribute.
 *  - `spans(doc)`: every item of the writing in document order (cached per
 *    document); `find(doc, id)` one of them.
 *  - `set(tr, id, attrs)` merges `attrs` into the item's mark on every run
 *    (a mark's attributes can't change in place, so the mark is removed and
 *    put on again); `remove(tr, id)` takes it off. Both edit `tr` and say
 *    whether the item exists.
 *  - `transformPasted`: a pasted copy of an item still in the document gets a
 *    fresh id, except the items at the paste position (text pasted inside an
 *    item joins it, as typed text does); a cut and pasted item keeps its id.
 *    Set it as the plugin's `props.transformPasted`. */
export function idMarks(markName: string) {
  const cache = new WeakMap<Node, readonly IdSpan[]>();

  const spans = (doc: Node): readonly IdSpan[] => {
    const hit = cache.get(doc);
    if (hit) return hit;
    const found = new Map<string, { id: string; mark: Mark; runs: { from: number; to: number }[] }>();
    writing(doc).descendants((node, pos) => {
      if (!node.isInline) return true;
      const mark = node.marks.find((m) => m.type.name === markName);
      if (!mark) return false;
      const id = mark.attrs.id as string;
      let s = found.get(id);
      if (!s) found.set(id, (s = { id, mark, runs: [] }));
      const last = s.runs[s.runs.length - 1];
      if (last && last.to === pos) last.to = pos + node.nodeSize;
      else s.runs.push({ from: pos, to: pos + node.nodeSize });
      return false;
    });
    const out = [...found.values()].map((s) => ({ ...s, from: s.runs[0].from, to: s.runs[s.runs.length - 1].to }));
    cache.set(doc, out);
    return out;
  };

  const find = (doc: Node, id: string) => spans(doc).find((s) => s.id === id) ?? null;

  const set = (tr: Transaction, id: string, attrs: Record<string, unknown>): boolean => {
    const s = find(tr.doc, id);
    if (!s) return false;
    const next = s.mark.type.create({ ...s.mark.attrs, ...attrs });
    if (next.eq(s.mark)) return true;
    for (const r of s.runs) tr.removeMark(r.from, r.to, s.mark.type).addMark(r.from, r.to, next);
    return true;
  };

  const remove = (tr: Transaction, id: string): boolean => {
    const s = find(tr.doc, id);
    if (!s) return false;
    for (const r of s.runs) tr.removeMark(r.from, r.to, s.mark.type);
    return true;
  };

  const transformPasted = (slice: Slice, view: EditorView): Slice => {
    const state: EditorState = view.state;
    const taken = new Set(spans(state.doc).map((s) => s.id));
    if (!taken.size) return slice;
    for (const m of state.selection.$from.marks()) if (m.type.name === markName) taken.delete(m.attrs.id);
    const renamed = new Map<string, string>();
    const rename = (m: Mark) => {
      const id = m.attrs.id as string;
      if (m.type.name !== markName || !taken.has(id)) return m;
      if (!renamed.has(id)) renamed.set(id, crypto.randomUUID());
      return m.type.create({ ...m.attrs, id: renamed.get(id) });
    };
    const walk = (f: Fragment): Fragment => {
      const out: Node[] = [];
      f.forEach((n) => {
        const c = n.isLeaf ? n : n.copy(walk(n.content));
        out.push(c.mark(c.marks.map(rename)));
      });
      return Fragment.fromArray(out);
    };
    const content = walk(slice.content);
    return renamed.size ? new Slice(content, slice.openStart, slice.openEnd) : slice;
  };

  return { spans, find, set, remove, transformPasted };
}
