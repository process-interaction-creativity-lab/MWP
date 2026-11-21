import type { Node as PMNode } from 'prosemirror-model';
import { textOf, type BlockText, writing } from 'mwps/text';

/** A word, as offsets into its paragraph's text (see `textOf`). */
export interface WordSpan {
  readonly text: string;
  readonly from: number;
  readonly to: number;
}

export interface Line {
  readonly t: BlockText;
  /** Offsets into the paragraph's text. */
  readonly from: number;
  readonly to: number;
  readonly words: readonly WordSpan[];
}

export interface Stanza {
  /** Position before the stanza's first paragraph: where its meter is kept. */
  readonly pos: number;
  /** Positions of its paragraphs. */
  readonly paragraphs: readonly number[];
  readonly lines: readonly Line[];
}

const WORD_RE = /[^\s—–]+/g;

function paragraphLines(node: PMNode, pos: number): Line[] {
  const t = textOf(node, pos);
  const lines: Line[] = [];
  let start = 0;
  const push = (end: number) => {
    const words: WordSpan[] = [];
    for (const m of t.text.slice(start, end).matchAll(WORD_RE)) {
      words.push({ text: m[0], from: start + m.index, to: start + m.index + m[0].length });
    }
    lines.push({ t, from: start, to: end, words });
  };
  for (let i = 0; i < t.text.length; i++) {
    if (t.text[i] === '\n') {
      push(i);
      start = i + 1;
    }
  }
  push(t.text.length);
  return lines;
}

/** The verse in the document: a stanza is a run of consecutive non-blank
 *  paragraphs, ended by a blank one or any other kind of block; a paragraph
 *  with line breaks of its own is a stanza by itself. */
export function extractStanzas(doc: PMNode): Stanza[] {
  const stanzas: Stanza[] = [];
  let run: { pos: number; paragraphs: number[]; lines: Line[] } | null = null;
  const flush = () => {
    if (run) stanzas.push(run);
    run = null;
  };
  writing(doc).forEach((node, offset) => {
    if (node.type.name !== 'paragraph') return flush();
    const lines = paragraphLines(node, offset);
    if (lines.every((l) => l.words.length === 0)) return flush();
    if (lines.length > 1) {
      flush();
      stanzas.push({ pos: offset, paragraphs: [offset], lines });
      return;
    }
    if (!run) run = { pos: offset, paragraphs: [], lines: [] };
    run.paragraphs.push(offset);
    run.lines.push(...lines);
  });
  flush();
  return stanzas;
}
