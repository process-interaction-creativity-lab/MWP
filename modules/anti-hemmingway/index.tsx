import type { ModuleContext } from 'mwps';
import { ordinaryBlocks, textOf } from 'mwps/text';
import nlp from 'compromise';
import type { Node } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const WORD = /[\p{L}\p{N}_]+(?:['’-][\p{L}\p{N}_]+)*/gu;

const verdicts = new Map<string, boolean>();

/** A part-of-speech guess on the word alone: adjective or adverb. */
function isModifier(word: string): boolean {
  const clean = word.toLowerCase().replace(/’/g, "'");
  if (!/^[a-z][a-z'-]*$/.test(clean) || clean.length < 2 || clean === 'ly') return false;
  let v = verdicts.get(clean);
  if (v === undefined) {
    const doc = nlp(clean);
    v = doc.has('#Adjective') || doc.has('#Adverb');
    verdicts.set(clean, v);
  }
  return v;
}

/** The grey ranges of a block, in positions relative to the block's start
 *  (as if it were at 0). Cached by node, so an edit redoes only its block. */
const blockGrey = new WeakMap<Node, [number, number][]>();

function greyRanges(block: Node): [number, number][] {
  let out = blockGrey.get(block);
  if (out) return out;
  out = [];
  const t = textOf(block, 0);
  let last = 0;
  const grey = (from: number, to: number) => {
    if (to > from) out!.push([t.pos(from), t.pos(to, -1)]);
  };
  for (const m of t.text.matchAll(WORD)) {
    if (!isModifier(m[0])) continue;
    grey(last, m.index);
    last = m.index + m[0].length;
  }
  grey(last, t.text.length);
  out = out.filter(([a, b]) => b > a);
  blockGrey.set(block, out);
  return out;
}

const decoSets = new WeakMap<Node, DecorationSet>();

function build(doc: Node): DecorationSet {
  let set = decoSets.get(doc);
  if (set) return set;
  const decos: Decoration[] = [];
  for (const { node, pos } of ordinaryBlocks(doc)) {
    for (const [a, b] of greyRanges(node)) {
      decos.push(Decoration.inline(pos + a, pos + b, { class: 'anti-hemmingway-grey' }));
    }
  }
  set = DecorationSet.create(doc, decos);
  decoSets.set(doc, set);
  return set;
}

const plugin = new Plugin({ props: { decorations: (state) => build(state.doc) } });

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => p.provide(plugin));
}

export const styles = `
.anti-hemmingway-grey { color: var(--muted-foreground); }
`;
