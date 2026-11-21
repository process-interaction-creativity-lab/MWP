// Test module: "Ask with tools" asks `supports(ai, 'tools')` once when AI
// comes on, as a module with a tool-calling feature does, greys while the
// answer is no, and inserts the model's reply.
import type { ModuleContext } from 'mwps';
import { chat, supports } from 'mwps/ai';

export const actions = {
  tools: { title: 'Ask with tools' },
};

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.with(ctx.ai, (s, ai) => {
      let tools: boolean | null = null;
      s.effect(() => {
        void supports(ai, 'tools').then((ok) => !s.signal.aborted && (tools = ok));
      });
      s.provide(actions.tools, {
        command: (_state, dispatch) => {
          if (tools === false) return false;
          if (dispatch) {
            void chat(ai, { messages: [{ role: 'user', content: 'hi' }] }, s.signal)
              .then((reply) => p.run((st, d) => (d?.(st.tr.insertText(reply)), true)))
              .catch(() => {});
          }
          return true;
        },
      });
    });
  });
}
