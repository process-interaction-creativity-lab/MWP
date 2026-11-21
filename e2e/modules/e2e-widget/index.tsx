// Test module: a React widget at the end of the first paragraph, holding a
// text box and a kit popover in green; while the paragraph says "boom", the
// widget's component throws.
import type { ModuleContext } from 'mwps';
import { reactWidget } from 'mwps/react';
import { Button, Popover, PopoverContent, PopoverTrigger } from 'mwps/ui';
import { Plugin } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';
import { useState } from 'react';

function Note() {
  const [text, setText] = useState('');
  return (
    <>
      <input aria-label="Widget note" value={text} onChange={(e) => setText(e.target.value)} />
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" aria-label="Widget more">+</Button>
        </PopoverTrigger>
        <PopoverContent className="e2e-widget-pop">Widget popover</PopoverContent>
      </Popover>
    </>
  );
}

export const styles = /* css */ `
  .e2e-widget-pop { color: rgb(0, 150, 0); }
`;

function Bomb(): never {
  throw new Error('e2e-widget: thrown on purpose');
}

export function setup(ctx: ModuleContext) {
  const widget = new Plugin({
    props: {
      decorations(state) {
        const first = state.doc.firstChild;
        if (!first?.isTextblock) return null;
        const boom = first.textContent.includes('boom');
        const at = first.nodeSize - 1;
        return DecorationSet.create(state.doc, [reactWidget(at, boom ? Bomb : Note, { key: boom ? 'bomb' : 'note' })]);
      },
    },
  });
  ctx.each(ctx.panes, (p) => p.provide(widget));
}
