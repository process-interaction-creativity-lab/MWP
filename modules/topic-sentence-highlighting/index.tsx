import type { ModuleContext } from 'mwps';
import { splitSentences, textOf, writing } from 'mwps/text';
import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

// Top-level blocks the lens blurs as a whole (paragraphs are handled by sentence).
const WHOLE = new Set(['heading', 'blockquote', 'code_block', 'bullet_list', 'ordered_list']);

/** A paragraph's topic and rest ranges, relative to the block's start. */
interface Split {
  first: [number, number];
  rest: [number, number] | null;
}

const splitCache = new WeakMap<Node, Split | null>();

function splitOf(block: Node): Split | null {
  if (splitCache.has(block)) return splitCache.get(block)!;
  let out: Split | null = null;
  const t = textOf(block, 0);
  const sentences = splitSentences(t.text);
  if (sentences.length) {
    const first: [number, number] = [t.pos(sentences[0].from), t.pos(sentences[0].to, -1)];
    const last = sentences[sentences.length - 1];
    const restEnd = t.pos(last.to, -1);
    out = {
      first,
      rest: sentences.length > 1 && restEnd > first[1] ? [first[1], restEnd] : null,
    };
  }
  splitCache.set(block, out);
  return out;
}

const decoCache = new WeakMap<Node, DecorationSet>();

function lens(doc: Node): DecorationSet {
  let set = decoCache.get(doc);
  if (set) return set;
  const decos: Decoration[] = [];
  writing(doc).forEach((block, pos) => {
    const end = pos + block.nodeSize;
    if (block.type.name === 'paragraph') {
      const s = splitOf(block);
      if (!s) return;
      decos.push(Decoration.node(pos, end, { class: 'topic-sentence-highlighting-block' }));
      decos.push(Decoration.inline(pos + s.first[0], pos + s.first[1], { class: 'topic-sentence-highlighting-first' }));
      if (s.rest) decos.push(Decoration.inline(pos + s.rest[0], pos + s.rest[1], { class: 'topic-sentence-highlighting-rest' }));
    } else if (WHOLE.has(block.type.name)) {
      decos.push(Decoration.node(pos, end, { class: 'topic-sentence-highlighting-block topic-sentence-highlighting-whole' }));
    }
  });
  set = DecorationSet.create(doc, decos);
  decoCache.set(doc, set);
  return set;
}

const key = new PluginKey('topic-sentence-highlighting');

// Hover is plain CSS (:hover on the block), so each pane answers for itself.
// The blocks holding the selection are marked from the pane's own state.
const plugin = new Plugin({
  key,
  props: {
    decorations(state) {
      const { from, to } = state.selection;
      const clear: Decoration[] = [];
      writing(state.doc).forEach((block, pos) => {
        const end = pos + block.nodeSize;
        if (pos <= to && end >= from && (block.type.name === 'paragraph' || WHOLE.has(block.type.name))) {
          clear.push(Decoration.node(pos, end, { class: 'topic-sentence-highlighting-clear' }));
        }
      });
      return clear.length ? lens(state.doc).add(state.doc, clear) : lens(state.doc);
    },
  },
});

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => p.provide(plugin));
}

export const styles = `
.topic-sentence-highlighting-first { background: rgba(255, 214, 0, 0.35); }
.topic-sentence-highlighting-rest,
.topic-sentence-highlighting-whole { filter: blur(4px); transition: filter 0.25s; }
.topic-sentence-highlighting-block:hover .topic-sentence-highlighting-rest,
.topic-sentence-highlighting-clear .topic-sentence-highlighting-rest { filter: none; }
.topic-sentence-highlighting-whole:hover,
.topic-sentence-highlighting-whole.topic-sentence-highlighting-clear { filter: none; }
@media (prefers-reduced-motion: reduce) {
  .topic-sentence-highlighting-rest, .topic-sentence-highlighting-whole { transition: none; }
}
`;
