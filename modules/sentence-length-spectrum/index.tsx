import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ActionDeclaration, ModuleContext } from 'mwps';
import { Button, Toggle } from 'mwps/ui';
import { X } from 'mwps/icons';
import { splitSentences, splitWords, textOf, writing } from 'mwps/text';

const legendKey = valueKey('legend', { default: false, persist: true });

export const actions = {
  legend: { title: 'Toggle sentence length spectrum legend' } satisfies ActionDeclaration,
};

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

/** Every sentence of every body textblock (paragraphs only: not headings or
 *  code), with the statistics of those sentences. Cached per document node. */
function analyze(doc: Node): Analysis {
  const hit = cache.get(doc);
  if (hit) return hit;
  const sentences: Sentence[] = [];
  writing(doc).descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.name !== 'paragraph') return false;
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

const MAX_ALPHA = 0.5;
const BLUE = '210 90% 55%';
const RED = '0 85% 55%';

/** Signed strength in [-1, 1]: each side of the median runs to its own end. */
function strength(words: number, a: Analysis): number {
  if (words < a.median) return a.median > a.min ? -(a.median - words) / (a.median - a.min) : 0;
  if (words > a.median) return a.max > a.median ? (words - a.median) / (a.max - a.median) : 0;
  return 0;
}

function tint(x: number): string | null {
  if (x === 0) return null;
  return `hsl(${x < 0 ? BLUE : RED} / ${(Math.abs(x) * MAX_ALPHA).toFixed(3)})`;
}

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const open = p.getValue(legendKey);
    p.provide(actions.legend, { procedure: () => (open.set((v) => !v), true), active: () => open.get() });

    // The scale is the whole document's, even in a pane showing part of it.
    const scale = (): Analysis | null => p.document?.state.get().doc ? analyze(p.document.state.get().doc) : null;

    p.provide(
      new Plugin({
        props: {
          decorations: (state) => {
            const a = scale();
            if (!a || a.total === 0) return null;
            const mine = analyze(state.doc);
            const decos: Decoration[] = [];
            for (const s of mine.sentences) {
              const color = tint(strength(s.words, a));
              if (color && s.to > s.from) {
                decos.push(
                  Decoration.inline(s.from, s.to, {
                    class: 'sentence-length-spectrum-tint',
                    style: `background-color: ${color}`,
                  }),
                );
              }
            }
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    );

    const Control = () => {
      const legend = useAction(p, actions.legend);
      return (
        <Toggle size="sm" pressed={legend.active} disabled={!legend.enabled} onPressedChange={legend.run}>
          Spectrum
        </Toggle>
      );
    };
    p.provide(ui.toolbar(Control));

    const Legend = () => {
      const isOpen = useStore(open);
      const a = useStore(p.document ? p.document.state : p.state, (s) => (s ? analyze(s.doc) : null));
      if (!isOpen) return null;
      const t = a ?? { min: 0, median: 0, max: 0, total: 0 };
      return (
        <div className="sentence-length-spectrum-legend" role="group" aria-label="Sentence length spectrum legend">
          <div className="sentence-length-spectrum-head">
            <span>Sentence length</span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Close legend"
              onClick={() => open.set(false)}
              onMouseDown={(e) => e.preventDefault()}
            >
              <X size={14} />
            </Button>
          </div>
          <div className="sentence-length-spectrum-bar" />
          <div className="sentence-length-spectrum-counts">
            <span>{t.min}</span>
            <span>{t.median}</span>
            <span>{t.max}</span>
          </div>
          <div className="sentence-length-spectrum-labels">
            <span>shorter</span>
            <span>typical</span>
            <span>longer</span>
          </div>
          <div className="sentence-length-spectrum-total">
            {t.total} sentences, median {t.median} words
          </div>
        </div>
      );
    };
    p.provide(ui.overlay(Legend));
  });
}

export const styles = `
.sentence-length-spectrum-legend {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 200px;
  padding: 6px 8px;
  font-size: 12px;
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.sentence-length-spectrum-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sentence-length-spectrum-head button { width: 20px; height: 20px; }
.sentence-length-spectrum-bar {
  height: 10px;
  margin: 4px 0;
  border-radius: 2px;
  background: linear-gradient(to right, hsl(${BLUE} / ${MAX_ALPHA}), transparent, hsl(${RED} / ${MAX_ALPHA}));
  border: 1px solid var(--border);
}
.sentence-length-spectrum-counts,
.sentence-length-spectrum-labels {
  display: flex;
  justify-content: space-between;
}
.sentence-length-spectrum-labels { color: var(--muted-foreground); }
.sentence-length-spectrum-total { margin-top: 4px; color: var(--muted-foreground); }
`;
