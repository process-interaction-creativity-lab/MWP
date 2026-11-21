import type { Node as PMNode, NodeSpec } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { Plugin, PluginKey } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import type { ModuleContext } from 'mwps';
import { authorOf, historyKind, originOf } from 'mwps';
import { appendData, writing } from 'mwps/text';

// The graveyard is the module's data: a `graveyard` node after the writing,
// one `graveyard_entry` per cut, which no editor shows. Burying is a
// follow-up to the writer's own deletion, so it joins that edit's undo step.

const SECTION = 'graveyard';
const ENTRY = 'graveyard_entry';

export const nodes: { [name: string]: NodeSpec } = {
  [SECTION]: {
    group: 'module_data',
    content: `${ENTRY}*`,
    toDOM: () => ['div', { class: 'graveyard-section' }, 0],
  },
  [ENTRY]: {
    content: 'text*',
    toDOM: () => ['p', { class: 'graveyard-entry' }, 0],
  },
};

// ---- Which deletions bury -------------------------------------------------

type Dir = 'back' | 'forward';

/** A half-built letter-by-letter deletion. */
interface Run {
  dir: Dir;
  /** Where the last character was deleted, in the document after it. */
  locus: number;
  /** Non-space characters deleted so far, in reading order. */
  word: string;
  /** The far edge of the run was a word boundary when it started. */
  anchored: boolean;
}

interface Mine {
  run: Run | null;
  /** Entries this edit buries, waiting for the follow-up that writes them. */
  lines: string[];
}

const mine = new PluginKey<Mine>('graveyard');

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();
const isSpace = (ch: string) => /^\s$/.test(ch);

/** The text of `from..to` in the writing. */
function writingText(doc: PMNode, from: number, to: number, sep: string): string {
  const w = writing(doc);
  to = Math.min(to, w.content.size);
  let text = '';
  let started = false;
  if (from >= to) return text;
  w.nodesBetween(from, to, (node, pos) => {
    if (node.isText) {
      text += node.text!.slice(Math.max(from, pos) - pos, to - pos);
      started = true;
    } else if (node.isTextblock) {
      if (started) text += sep;
      started = true;
    }
    return true;
  });
  return text;
}

function boundaryAt(doc: PMNode, pos: number, side: 'left' | 'right'): boolean {
  if (pos <= 0 || pos >= writing(doc).content.size) return true;
  const $pos = doc.resolve(pos);
  if ($pos.parent.isTextblock) {
    if (side === 'left' && $pos.parentOffset === 0) return true;
    if (side === 'right' && $pos.parentOffset === $pos.parent.content.size) return true;
  }
  const ch = side === 'left' ? doc.textBetween(pos - 1, pos, '', '') : doc.textBetween(pos, pos + 1, '', '');
  return ch === '' || isSpace(ch);
}

/** What one of the writer's edits does to the run, and what it buries. Pure. */
function classify(run: Run | null, tr: Transaction, oldState: EditorState, newState: EditorState): Mine {
  const reset = { run: null, lines: [] };
  let removedChars = 0;
  let removedText = '';
  let insertedText = '';
  let locus = 0;
  let first: { from: number; to: number } | null = null;
  let steps = 0;
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i];
    if (!(step instanceof ReplaceStep)) return reset;
    const { from, to, slice } = step as ReplaceStep & { from: number; to: number };
    steps++;
    insertedText += slice.content.textBetween(0, slice.content.size, ' ');
    if (to > from) {
      const doc = tr.docs[i];
      removedChars += writingText(doc, from, to, '').length;
      removedText += ' ' + writingText(doc, from, to, ' ');
      first ??= { from, to };
      locus = step.getMap().map(from, -1);
    }
  }
  if (removedChars === 0) return reset;
  // Moved text (a dragged block): removed and inserted together.
  if (normalise(removedText) === normalise(insertedText)) return reset;
  // A selection of two or more characters is one entry.
  if (removedChars >= 2) {
    const line = normalise(removedText);
    return { run: null, lines: line ? [line] : [] };
  }
  if (insertedText.length > 0 || steps !== 1 || !first) return reset;

  const sel = oldState.selection;
  const dir: Dir = sel.empty && sel.from === first.from && sel.to !== first.to ? 'forward' : 'back';
  locus = Math.max(0, Math.min(locus, newState.doc.content.size));
  const ch = removedText.trim() === '' ? ' ' : removedText.trim();
  const left = boundaryAt(newState.doc, locus, 'left');
  const right = boundaryAt(newState.doc, locus, 'right');

  const continuing = run !== null && run.dir === dir && (dir === 'back' ? locus === run.locus - 1 : locus === run.locus);
  let word = continuing ? run!.word : '';
  let anchored = continuing ? run!.anchored : dir === 'back' ? right : left;
  let line: string | null = null;
  if (isSpace(ch)) {
    if (word && anchored) line = word;
    word = '';
    anchored = true;
  } else {
    word = dir === 'back' ? ch + word : word + ch;
    if ((dir === 'back' ? left : right) && anchored && word) {
      line = word;
      word = '';
      anchored = false;
    }
  }
  return { run: { dir, locus, word, anchored }, lines: line ? [line] : [] };
}

// ---- The graveyard ---------------------------------------------------------

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.provide(
      new Plugin<Mine>({
        key: mine,
        state: {
          init: () => ({ run: null, lines: [] }),
          apply(tr, value, oldState, newState) {
            const base = tr.getMeta(mine) === 'flush' ? [] : value.lines;
            if (!tr.docChanged) return base === value.lines ? value : { run: value.run, lines: base };
            const eligible =
              originOf(tr) === 'local' && authorOf(tr) === 'user' && !historyKind(tr) && !tr.getMeta('appendedTransaction');
            if (!eligible) return { run: null, lines: base };
            const next = classify(value.run, tr, oldState, newState);
            return { run: next.run, lines: [...base, ...next.lines] };
          },
        },
        appendTransaction(trs, _old, state) {
          if (!trs.some((t) => t.docChanged)) return null;
          const { lines } = mine.getState(state)!;
          if (!lines.length) return null;
          const schema = state.schema;
          const entries = lines.map((l) => schema.nodes[ENTRY].create(null, schema.text(l)));
          const tr = state.tr.setMeta(mine, 'flush');
          appendData(tr, SECTION, entries);
          return tr;
        },
      }),
    );
  });
}
