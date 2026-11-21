// Test module: one action of each kind. "Stamp" inserts a word at the
// cursor (a pane command, with a shifted key), shown as on while the text
// ends with it; "Never" can never run, so it greys; "Ping" is a module
// procedure that counts in a body attribute; "Loud" is a pane procedure
// toggling a value. A toolbar draws Stamp, Never and Loud with `useAction`.
import type { ModuleContext } from 'mwps';
import { writing } from 'mwps/text';
import { ui, useAction, valueKey } from 'mwps';

export const actions = {
  stamp: { title: 'Stamp', keys: 'Mod-Shift-s' },
  never: { title: 'Never', keys: 'Mod-Shift-e' },
  ping: { title: 'Ping' },
  loud: { title: 'Loud' },
};

const loudKey = valueKey('loud', { default: false });

export function setup(ctx: ModuleContext) {
  let pings = 0;
  ctx.provide(actions.ping, {
    procedure: () => {
      document.body.dataset.e2ePings = String(++pings);
      return true;
    },
  });
  ctx.each(ctx.panes, (p) => {
    p.provide(actions.stamp, {
      command: (state, dispatch) => {
        dispatch?.(state.tr.insertText('stamp'));
        return true;
      },
      active: (state) => writing(state.doc).textContent.endsWith('stamp'),
    });
    p.provide(actions.never, {
      command: (_state, dispatch) => {
        if (dispatch) document.body.dataset.e2eNeverRan = 'yes';
        return false;
      },
    });
    const loud = p.getValue(loudKey);
    p.provide(actions.loud, { procedure: () => (loud.set((v) => !v), true), active: () => loud.get() });

    const Bar = () => {
      const buttons = [
        ['Stamp', useAction(p, actions.stamp)],
        ['Never', useAction(p, actions.never)],
        ['Loud', useAction(p, actions.loud)],
      ] as const;
      return (
        <span>
          {buttons.map(([name, a]) => (
            <button key={name} type="button" aria-pressed={a.active} disabled={!a.enabled} onClick={a.run}>
              {name}
            </button>
          ))}
        </span>
      );
    };
    p.provide(ui.toolbar(Bar));
  });
}
