// Test module: marks every "mwps" in any text, module data included, while
// its value is on; its action (Mod-Shift-h) turns it on and off. The value is
// persisted, so a journey can check a module value survives a quick reload.
import type { ModuleContext } from 'mwps';
import { valueKey } from 'mwps';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const actions = { toggle: { title: 'Highlight mwps', keys: 'Mod-Shift-h' } };

const onKey = valueKey('on', { default: true, persist: true });

export function setup(ctx: ModuleContext) {
  const on = ctx.getValue(onKey);
  const highlight = new Plugin({
    props: {
      decorations(state) {
        if (!on.get()) return null;
        const found: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (!node.isText) return;
          for (const m of node.text!.matchAll(/mwps/g)) {
            found.push(Decoration.inline(pos + m.index, pos + m.index + 4, { class: 'e2e-highlight' }));
          }
        });
        return DecorationSet.create(state.doc, found);
      },
    },
  });
  ctx.provide(actions.toggle, { procedure: () => (on.set((v) => !v), true), active: () => on.get() });
  ctx.each(ctx.panes, (p) => {
    p.provide(highlight);
  });
}
