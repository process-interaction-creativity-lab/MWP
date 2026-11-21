import { Plugin } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ModuleContext } from 'mwps';
import { Toggle } from 'mwps/ui';
import { splitSentences, textOf } from 'mwps/text';

type Mode = 'sentences' | 'words';

const modeKey = valueKey<Mode>('mode', { default: 'sentences', persist: true });

export const actions = {
  sentences: { title: 'Space sentences' },
  words: { title: 'Space words' },
};

/** Decorations for the paragraphs the selection touches. Only those are
 *  visited, so the cost doesn't grow with the document. */
function build(state: EditorState, mode: Mode): DecorationSet {
  const { from, to } = state.selection;
  const decos: Decoration[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.name !== 'paragraph') return false;
    if (mode === 'words') {
      decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'sentence-spacing-words' }));
      return false;
    }
    const t = textOf(node, pos);
    const sentences = splitSentences(t.text);
    for (let i = 0; i < sentences.length - 1; i++) {
      const a = t.pos(sentences[i].from);
      const b = t.pos(sentences[i].to, -1);
      if (b > a) decos.push(Decoration.inline(a, b, { class: 'sentence-spacing-sentence' }));
    }
    return false;
  });
  return DecorationSet.create(state.doc, decos);
}

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const mode = p.getValue(modeKey);
    p.provide(actions.sentences, { procedure: () => (mode.set('sentences'), true), active: () => mode.get() === 'sentences' });
    p.provide(actions.words, { procedure: () => (mode.set('words'), true), active: () => mode.get() === 'words' });

    p.provide(new Plugin({ props: { decorations: (state) => build(state, mode.get()) } }));

    const Choice = () => {
      const sentences = useAction(p, actions.sentences);
      const words = useAction(p, actions.words);
      useStore(mode);
      return (
        <span className="sentence-spacing-toggle" role="group" aria-label="Spacing">
          <Toggle size="sm" pressed={sentences.active} disabled={!sentences.enabled} onPressedChange={sentences.run}>
            Sentences
          </Toggle>
          <Toggle size="sm" pressed={words.active} disabled={!words.enabled} onPressedChange={words.run}>
            Words
          </Toggle>
        </span>
      );
    };
    p.provide(ui.toolbar(Choice));
  });
}

export const styles = `
.sentence-spacing-toggle { display: inline-flex; gap: 4px; }
.sentence-spacing-sentence {
  margin-right: 1.4em;
  transition: margin-right 0.15s ease;
  @starting-style { margin-right: 0; }
}
.sentence-spacing-words {
  word-spacing: 0.9em;
  transition: word-spacing 0.15s ease;
  @starting-style { word-spacing: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .sentence-spacing-sentence, .sentence-spacing-words { transition: none; }
}
`;
