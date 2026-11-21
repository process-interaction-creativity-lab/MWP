// Test module: three hooks that work in document positions, to check they
// work inside cards as they do in the plain editor. Typing "--" becomes a
// dash (a text-input hook reading view.state); Mod-Shift-m marks the
// selection bold through p.document.edit; "mwps" is underlined by a
// decoration computed on the whole document; a widget marks the document's
// start.
import type { ModuleContext } from 'mwps';
import { writing } from 'mwps/text';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.provide(
      new Plugin({
        props: {
          handleTextInput(view, from, to, text) {
            if (text !== '-' || view.state.doc.textBetween(Math.max(0, from - 1), from) !== '-') return false;
            view.dispatch(view.state.tr.insertText('—', from - 1, to));
            return true;
          },
          decorations(state) {
            const found: Decoration[] = [];
            writing(state.doc).descendants((node, pos) => {
              if (!node.isText) return;
              for (const m of node.text!.matchAll(/mwps/g)) {
                found.push(Decoration.inline(pos + m.index, pos + m.index + 4, { class: 'e2e-surface-deco' }));
              }
            });
            found.push(Decoration.widget(0, () => Object.assign(document.createElement('span'), { className: 'e2e-surface-start' }), { side: -1 }));
            return DecorationSet.create(state.doc, found);
          },
        },
      }),
    );
    // Mod-Shift plus a letter, by the key handler's own event.
    const modShift = (e: KeyboardEvent, letter: string) =>
      (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === letter;
    p.provide(
      new Plugin({
        props: {
          handleKeyDown(view, e) {
            // Where the caret is on screen, by the view the hook was given.
            if (modShift(e, 'c')) {
              const c = view.coordsAtPos(view.state.selection.head);
              document.body.dataset.e2eCoords = `${Math.round(c.left)},${Math.round(c.top)}`;
              document.body.dataset.e2eEnd = String(view.endOfTextblock('down'));
              return true;
            }
            if (modShift(e, 'm')) {
              const sel = p.state.get()?.selection;
              if (!sel || sel.empty) return false;
              const { from, to } = sel;
              return p.document!.edit((state, dispatch) => {
                dispatch?.(state.tr.addMark(from, to, state.schema.marks.strong!.create()));
                return true;
              });
            }
            return false;
          },
        },
      }),
    );
  });
}
