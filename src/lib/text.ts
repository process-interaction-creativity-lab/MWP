// The text library, imported by modules as `mwps/text`: reading a textblock's
// text as a writer reads it, splitting it into sentences and words, and
// holding spans of it while the writer edits (held.ts).

import type { Node } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';

export { idMarks, type IdSpan } from './idmarks.js';
export { heldSpans, type HeldSpan, type HeldSpans } from './held.js';

/** A textblock's text, with a way back to document positions. */
export interface BlockText {
  readonly text: string;
  /** The document position of text offset `offset`. Where left-out content
   *  (an inline aside) sits at that offset, `assoc` picks the side, as in
   *  ProseMirror's mapping: 1 (the default) is after it, just before the
   *  character at `offset`; -1 is before it, just after the character
   *  before. A span maps to `pos(from)`..`pos(to, -1)`. */
  pos(offset: number, assoc?: number): number;
}

/** A piece of a string: `text.slice(from, to)`. */
export interface Span {
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

const OBJECT = '￼';

/** The text of `block`, a textblock at document position `pos` (as
 *  `doc.descendants` gives it). Inline asides (nodes in the `inline_aside`
 *  group: footnotes, margin notes) are left out, so a sentence that holds a
 *  footnote reads as one sentence. Other inline leaves read as their spec's
 *  `leafText` (a hard break is a newline), or as U+FFFC. */
export function textOf(block: Node, pos: number): BlockText {
  let text = '';
  // Each character's start and end position.
  const start: number[] = [];
  const end: number[] = [];
  const walk = (node: Node, contentStart: number) => {
    node.forEach((child, offset) => {
      const p = contentStart + offset;
      if (child.isText) {
        const s = child.text!;
        for (let i = 0; i < s.length; i++) start.push(p + i), end.push(p + i + 1);
        text += s;
      } else if (inGroup(child, 'inline_aside')) {
        // left out
      } else if (child.isLeaf) {
        const leaf = child.type.spec.leafText;
        const s = leaf ? leaf(child) : OBJECT;
        for (let i = 0; i < s.length; i++) start.push(p), end.push(p + child.nodeSize);
        text += s;
      } else {
        walk(child, p + 1);
      }
    });
  };
  walk(block, pos + 1);
  const first = pos + 1;
  const last = pos + block.nodeSize - 1;
  return {
    text,
    pos: (offset, assoc = 1) =>
      assoc < 0
        ? offset <= 0 ? first : end[Math.min(offset, end.length) - 1]
        : offset >= start.length ? last : start[Math.max(0, offset)],
  };
}

const writings = new WeakMap<Node, Node>();

/** The writing of `doc`, the document: its blocks without the data node
 *  that ends every document (where modules keep their data, which no editor
 *  of the writing shows). Positions are the document's, since the writing
 *  starts at 0, and `writing(doc).content.size` is where it ends. Read over
 *  the whole writing with it (a count, an analysis, a search, "at the end"):
 *  `writing(doc).descendants(…)`, `tr.insert(writing(doc).content.size, …)`. */
export function writing(doc: Node): Node {
  const last = doc.lastChild;
  if (!last || last.type.name !== DATA_NODE) return doc;
  let out = writings.get(doc);
  if (!out) writings.set(doc, (out = doc.copy(doc.content.cut(0, doc.content.size - last.nodeSize))));
  return out;
}

const DATA_NODE = 'mwps_data';

function inGroup(node: Node, group: string): boolean {
  return (node.type.spec.group ?? '').split(' ').includes(group);
}

/** A block of the writing, with where it sits. */
export interface Block {
  readonly node: Node;
  readonly pos: number;
  readonly end: number;
}

/** A section start and the writing it owns. */
export interface Section extends Block {
  /** Its place among the starts, from 0. */
  readonly index: number;
  /** Where the section's writing ends: the end of its last block, or the
   *  start's own end when it owns none. The next start begins there. */
  readonly to: number;
  /** The blocks after the start, up to the next one. */
  readonly body: readonly Block[];
}

/** The sections of the writing: each top-level block for which `isStart`
 *  holds starts one, and owns the blocks after it up to the next start.
 *  Blocks before the first start belong to none. Several kinds of start
 *  (a scene and the beats in it) are one call with an `isStart` that
 *  accepts both; each ends where the next of either begins. */
export function sections(doc: Node, isStart: (node: Node) => boolean): Section[] {
  const out: { index: number; node: Node; pos: number; end: number; to: number; body: Block[] }[] = [];
  writing(doc).forEach((node, pos) => {
    const end = pos + node.nodeSize;
    if (isStart(node)) {
      out.push({ index: out.length, node, pos, end, to: end, body: [] });
    } else if (out.length) {
      const cur = out[out.length - 1];
      cur.body.push({ node, pos, end });
      cur.to = end;
    }
  });
  return out;
}

/** A module's data node of `type` in `doc`, with the position it starts
 *  at, or null while the module has made none. */
export function findData(doc: Node, type: string): { node: Node; pos: number } | null {
  const data = doc.lastChild;
  if (!data || data.type.name !== DATA_NODE) return null;
  let found: { node: Node; pos: number } | null = null;
  data.forEach((node, offset) => {
    if (!found && node.type.name === type) found = { node, pos: doc.content.size - data.nodeSize + 1 + offset };
  });
  return found;
}

/** Where a module inserts a data node of its own: the end of the document's
 *  data node, `tr.insert(dataEnd(state.doc), type.create(null, …))`. */
export function dataEnd(doc: Node): number {
  return doc.content.size - 1;
}

/** Sentences in `text`. Crude: a run of `.`, `!` or `?` followed by
 *  whitespace or the end ends a sentence, so abbreviations and quoted
 *  dialogue split wrongly. Each sentence keeps its trailing whitespace, so
 *  sentences abut; whitespace-only pieces are dropped (leading whitespace
 *  goes with the first sentence). */
export function splitSentences(text: string): Span[] {
  const re = /([.!?]+)(\s+|$)/g;
  const out: Span[] = [];
  let last = 0;
  const push = (to: number) => {
    const piece = text.slice(last, to);
    if (piece.trim() !== '') out.push({ from: last, to, text: piece });
    last = to;
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    push(m.index + m[0].length);
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) push(text.length);
  return out;
}

/** Words in `text`: runs of non-whitespace. */
export function splitWords(text: string): Span[] {
  return [...text.matchAll(/\S+/g)].map((m) => ({ from: m.index, to: m.index + m[0].length, text: m[0] }));
}

const ORDINARY = new Set(['paragraph', 'heading']);

/** Whether `node` is ordinary text: a paragraph or a heading. Every other
 *  textblock (code, a module's own blocks) is not. */
export function isOrdinary(node: Node): boolean {
  return ORDINARY.has(node.type.name);
}

/** The ordinary text blocks of the writing in order, each with where it sits.
 *  `textOf(node, pos)` reads one. */
export function ordinaryBlocks(doc: Node): Block[] {
  const out: Block[] = [];
  writing(doc).descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (isOrdinary(node)) out.push({ node, pos, end: pos + node.nodeSize });
    return false;
  });
  return out;
}

/** A sentence of the ordinary text, in document positions. */
export interface DocSentence {
  /** The sentence without surrounding whitespace, and where it sits. */
  readonly text: string;
  readonly from: number;
  readonly to: number;
  /** The sentence with its trailing whitespace (`splitSentences` pieces abut). */
  readonly start: number;
  readonly end: number;
  /** The position of its block. */
  readonly block: number;
}

const sentenceLists = new WeakMap<Node, readonly DocSentence[]>();

/** The sentences of the ordinary text of `doc` (`splitSentences` over each
 *  block, inline asides left out), cached by document. */
export function sentencesOf(doc: Node): readonly DocSentence[] {
  let out = sentenceLists.get(doc);
  if (out) return out;
  const list: DocSentence[] = [];
  for (const { node, pos } of ordinaryBlocks(doc)) {
    const t = textOf(node, pos);
    for (const s of splitSentences(t.text)) {
      const lead = s.text.length - s.text.trimStart().length;
      const trail = s.text.length - s.text.trimEnd().length;
      list.push({
        text: s.text.trim(),
        from: t.pos(s.from + lead),
        to: t.pos(s.to - trail, -1),
        start: t.pos(s.from),
        end: t.pos(s.to, -1),
        block: pos,
      });
    }
  }
  sentenceLists.set(doc, (out = list));
  return out;
}

/** The children of a module's data node of `type`, each with its document
 *  position; none while the module has made no data node. */
export function dataChildren(doc: Node, type: string): { node: Node; pos: number }[] {
  const data = findData(doc, type);
  const out: { node: Node; pos: number }[] = [];
  data?.node.forEach((node, offset) => out.push({ node, pos: data.pos + 1 + offset }));
  return out;
}

/** Add `nodes` at the end of a module's data node of `type`, making the data
 *  node first when the document has none (with any child its content
 *  requires first, made from its defaults). */
export function appendData(tr: Transaction, type: string, nodes: Node | readonly Node[]): void {
  const found = findData(tr.doc, type);
  if (found) tr.insert(found.pos + found.node.nodeSize - 1, nodes as Node | Node[]);
  else tr.insert(dataEnd(tr.doc), tr.doc.type.schema.nodes[type].createAndFill(null, nodes as Node | Node[])!);
}
