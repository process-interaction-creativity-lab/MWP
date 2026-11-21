// Test module: "Suggest" is implemented only while AI is on for this module
// (so it greys otherwise), inserts the model it was handed, and calls the
// writer's endpoint once.
import type { ModuleContext } from 'mwps';

export const actions = {
  suggest: { title: 'Suggest' },
};

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.with(ctx.ai, (s, ai) =>
      s.provide(actions.suggest, {
        command: (state, dispatch) => {
          // A call the writer stops from the tab's menu rejects with an AbortError.
          if (dispatch) ai.fetch('/chat/completions', { method: 'POST', body: '{}' }).catch(() => {});
          dispatch?.(state.tr.insertText(`suggested by ${ai.model}`));
          return true;
        },
      }),
    );
  });
}
