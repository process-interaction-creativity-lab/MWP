// Test module: two actions on Enter and a raw Enter handler, each told
// apart by a word in the text. "Key A" applies while the text holds `+a`,
// "Key B" while it holds `+b`, and each inserts its name in brackets; the
// raw handler takes Enter while the text holds `+raw`, inserting `[raw]`.
import type { ModuleContext } from 'mwps';
import type { Command } from 'prosemirror-state';
import { Plugin } from 'prosemirror-state';

export const actions = {
  a: { title: 'Key A', keys: 'Enter' },
  b: { title: 'Key B', keys: 'Enter' },
};

const insertWhen =
  (word: string, text: string): Command =>
  (state, dispatch) => {
    if (!state.doc.textContent.includes(word)) return false;
    dispatch?.(state.tr.insertText(text));
    return true;
  };

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.provide(actions.a, { command: insertWhen('+a', '[A]') });
    p.provide(actions.b, { command: insertWhen('+b', '[B]') });
    const raw = insertWhen('+raw', '[raw]');
    p.provide(
      new Plugin({
        props: { handleKeyDown: (view, event) => event.key === 'Enter' && raw(view.state, view.dispatch) },
      }),
    );
  });
}
