// Test module: asks for 500px of room in the right margin of its pane, and
// floats a box into it at the end of the first paragraph.
import type { ModuleContext } from 'mwps';
import { reactWidget } from 'mwps/react';
import { Plugin } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';

export const styles = /* css */ `
  :scope { --mwps-margin-right: 500px; }
  .e2e-margin-note {
    float: right;
    width: 400px;
    margin-right: calc(-1 * var(--mwps-margin-right));
  }
`;

const Note = () => <span className="e2e-margin-note">Margin note</span>;

export function setup(ctx: ModuleContext) {
  const widgets = new Plugin({
    props: {
      decorations(state) {
        const first = state.doc.firstChild;
        if (!first?.isTextblock) return null;
        return DecorationSet.create(state.doc, [reactWidget(first.content.size + 1, Note, { key: 'e2e-margin', side: 1 })]);
      },
    },
  });
  ctx.each(ctx.panes, (p) => p.provide(widgets));
}
