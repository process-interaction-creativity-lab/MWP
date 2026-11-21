import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { ui, useStore } from 'mwps';
import type { ModuleContext } from 'mwps';
import { splitSentences, splitWords, textOf, writing } from 'mwps/text';

interface Sentence {
  from: number;
  to: number;
  words: number;
}

interface Analysis {
  sentences: Sentence[];
  min: number;
  max: number;
  median: number;
  total: number;
}

const cache = new WeakMap<Node, Analysis>();

/** Every sentence of every body textblock (not headings or code), with the
 *  document-wide statistics. Cached per document node. */
function analyze(doc: Node): Analysis {
  const hit = cache.get(doc);
  if (hit) return hit;
  const sentences: Sentence[] = [];
  writing(doc).descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.name === 'heading' || node.type.spec.code) return false;
    const t = textOf(node, pos);
    for (const s of splitSentences(t.text)) {
      const words = splitWords(s.text).length;
      if (words === 0) continue;
      sentences.push({ from: t.pos(s.from), to: t.pos(s.to, -1), words });
    }
    return false;
  });
  const counts = sentences.map((s) => s.words).sort((a, b) => a - b);
  const result: Analysis = {
    sentences,
    min: counts[0] ?? 0,
    max: counts[counts.length - 1] ?? 0,
    median: counts.length ? counts[Math.floor(counts.length / 2)] : 0,
    total: counts.length,
  };
  cache.set(doc, result);
  return result;
}

function colorFor(words: number, min: number, max: number): string {
  const x = max > min ? Math.min(1, Math.max(0, (words - min) / (max - min))) : 0;
  return `hsla(${Math.round(x * 300)}, 65%, 70%, 0.4)`;
}

function build(doc: Node): DecorationSet {
  const a = analyze(doc);
  return DecorationSet.create(
    doc,
    a.sentences
      .filter((s) => s.to > s.from)
      .map((s) =>
        Decoration.inline(s.from, s.to, {
          class: 'sentence-length-tint',
          style: `background-color: ${colorFor(s.words, a.min, a.max)}`,
        }),
      ),
  );
}

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.provide(
      new Plugin({
        props: { decorations: (state) => build(state.doc) },
      }),
    );

    // The legend is always shown inline in the toolbar for the last focused pane.
    const Legend = () => {
      const a = useStore(p.state, (s) => (s ? analyze(s.doc) : null));
      if (!a || a.total === 0) return <span className="sentence-length-legend">Sentences 0</span>;
      const points = [
        { words: a.min, label: 'Shortest' },
        { words: a.median, label: 'Median' },
        { words: a.max, label: 'Longest' },
      ];
      return (
        <span className="sentence-length-legend" role="group" aria-label="Sentence length legend">
          Sentences {a.total} ·
          {points.map(({ words: w, label }, i) => {
            const name = `${label}: ${w} ${w === 1 ? 'word' : 'words'}`;
            return (
              <span key={i} className="sentence-length-point">
                <span
                  className="sentence-length-swatch"
                  role="img"
                  title={name}
                  aria-label={name}
                  style={{ backgroundColor: colorFor(w, a.min, a.max) }}
                />
                {w}
              </span>
            );
          })}
          words
        </span>
      );
    };
    p.provide(ui.toolbar(Legend));
  });
}

export const styles = `
.sentence-length-legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1;
  color: var(--foreground);
}
.sentence-length-point {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.sentence-length-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
`;
