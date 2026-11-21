import type { ActionDeclaration, ModuleContext } from 'mwps';
import { Button } from 'mwps/ui';
import { RotateCw } from 'mwps/icons';
import { reactWidget } from 'mwps/react';
import { splitSentences, textOf } from 'mwps/text';
import { Fragment } from 'prosemirror-model';
import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { Command, EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/** How many times the paragraph has been rotated, mod its sentence count:
 *  sentence i of the current text started as sentence (i + rot) mod n, and
 *  its colour is that original index's. */
const ROT = 'sentence_cycler_rot';

// On heading too: restyling a cycled paragraph as a heading and back must not
// reset the rotation, or the colours stop matching the sentences' order.
export const attrs = [{ types: ['paragraph', 'heading'], name: ROT, spec: { default: 0 } }];

export const actions = {
  cycle: { title: 'Cycle sentences in paragraph', keys: 'Mod-Alt-ArrowDown' } satisfies ActionDeclaration,
};

interface Sentence {
  /** Content range of the sentence, without surrounding whitespace. */
  from: number;
  to: number;
}

/** The sentences of the paragraph `node` at `pos`, as document ranges. A
 *  trailing inline aside (a footnote) goes with the sentence before it. */
function sentencesOf(node: Node, pos: number): Sentence[] {
  const t = textOf(node, pos);
  const spans = splitSentences(t.text);
  return spans.map((s, i) => {
    const lead = s.text.length - s.text.trimStart().length;
    const trailing = s.text.length - s.text.trimEnd().length;
    const a = s.from + lead;
    return {
      from: i === 0 ? t.pos(a) : t.pos(a, -1),
      to: t.pos(s.to - trailing),
    };
  });
}

function paragraphAt(doc: Node, pos: number | null): Node | null {
  if (pos === null || pos < 0 || pos >= doc.content.size) return null;
  const n = doc.nodeAt(pos);
  return n && n.type.name === 'paragraph' ? n : null;
}

/** Rotate the paragraph at `pos` (or the one holding the caret) by one sentence. */
function cycle(at: number | null): Command {
  return (state, dispatch) => {
    let pos = at;
    if (pos === null) {
      const $f = state.selection.$from;
      for (let d = $f.depth; d > 0; d--) {
        if ($f.node(d).type.name === 'paragraph') {
          pos = $f.before(d);
          break;
        }
      }
    }
    const node = paragraphAt(state.doc, pos);
    if (!node || pos === null) return false;
    const sents = sentencesOf(node, pos);
    if (sents.length < 2) return false;
    if (!dispatch) return true;

    const start = pos + 1;
    const end = pos + node.nodeSize - 1;
    const slices = sents.map((s) => state.doc.slice(s.from, s.to).content);
    const space = state.schema.text(' ');
    // New order: sentences 1..n-1, then 0.
    const order = [...sents.keys()].slice(1).concat(0);
    const parts: Fragment[] = [];
    const newStart: number[] = [];
    let offset = start;
    for (const k of order) {
      newStart[k] = offset;
      parts.push(slices[k]);
      offset += slices[k].size + 1;
      parts.push(Fragment.from(space));
    }
    parts.pop();
    const content = parts.reduce((a, b) => a.append(b), Fragment.empty);

    const tr = state.tr;
    const rot = ((node.attrs[ROT] as number) + 1) % sents.length;
    tr.setNodeAttribute(pos, ROT, rot);
    tr.replaceWith(start, end, content);

    // Keep a caret inside the paragraph on the text it was on.
    const sel = state.selection;
    if (sel.empty && sel.from >= start && sel.from <= end) {
      let k = -1;
      sents.forEach((x, i) => { if (x.from <= sel.from) k = i; });
      if (k >= 0) {
        const within = Math.min(Math.max(sel.from - sents[k].from, 0), slices[k].size);
        tr.setSelection(TextSelection.create(tr.doc, newStart[k] + within));
      }
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

interface Hover {
  pos: number | null;
}

const hoverKey = new PluginKey<Hover>('sentence-cycler-hover');

function tint(index: number, n: number) {
  return `background-color: hsl(${Math.round((360 * index) / n)} 70% 60% / 0.28)`;
}

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const Button_ = ({ pos }: { pos: number }) => {
      return (
        <Button
          variant="outline"
          size="icon-xs"
          className="sentence-cycler-button"
          title="Move first sentence to the end"
          aria-label="Cycle sentences"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => p.run(cycle(pos))}
        >
          <RotateCw />
        </Button>
      );
    };

    p.provide(actions.cycle, { command: cycle(null) });

    p.provide(
      new Plugin<Hover>({
        key: hoverKey,
        state: {
          init: () => ({ pos: null }),
          apply(tr, value) {
            const meta = tr.getMeta(hoverKey) as Hover | undefined;
            if (meta) return meta;
            if (tr.docChanged && value.pos !== null) return { pos: tr.mapping.map(value.pos, 1) };
            return value;
          },
        },
        props: {
          handleDOMEvents: {
            mouseover(view, event) {
              const target = event.target as HTMLElement | null;
              if (!target || target.closest('.sentence-cycler-button')) return false;
              const el = target.closest('p');
              if (!el) return false;
              let at: number;
              try {
                at = view.posAtDOM(el, 0);
              } catch {
                return false; // a paragraph outside the editor
              }
              const $p = view.state.doc.resolve(at);
              for (let d = $p.depth; d > 0; d--) {
                if ($p.node(d).type.name !== 'paragraph') continue;
                const pos = $p.before(d);
                if (hoverKey.getState(view.state)?.pos !== pos) view.dispatch(view.state.tr.setMeta(hoverKey, { pos }));
                break;
              }
              return false;
            },
            mouseleave(view) {
              if (hoverKey.getState(view.state)?.pos !== null) view.dispatch(view.state.tr.setMeta(hoverKey, { pos: null }));
              return false;
            },
          },
          decorations(state: EditorState) {
            const pos = hoverKey.getState(state)?.pos ?? null;
            const node = paragraphAt(state.doc, pos);
            if (!node || pos === null) return null;
            const sents = sentencesOf(node, pos);
            const n = sents.length;
            if (n < 2) return null;
            const rot = (node.attrs[ROT] as number) % n;
            const decos = sents.map((s, i) =>
              Decoration.inline(s.from, s.to, { style: tint((i + rot) % n, n) }),
            );
            decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'sentence-cycler-hover' }));
            decos.push(reactWidget(pos + 1, () => <Button_ pos={pos} />, { key: `sentence-cycler-${pos}`, side: -1 }));
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    );
  });
}

export const styles = `
/* A float into the margin, not positioned against its paragraph: a positioned
   paragraph would be the containing block of other modules' overlays. */
.sentence-cycler-button { position: relative; float: inline-end; margin-inline-end: -2rem; }
/* Covers the gap to the paragraph, so the pointer never leaves the editor on its way. */
.sentence-cycler-button::before { content: ''; position: absolute; inset-block: 0; inset-inline-end: 100%; width: 0.5rem; }
`;
