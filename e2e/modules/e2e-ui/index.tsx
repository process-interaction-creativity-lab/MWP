// Test module: one component in each UI root.
// - toolbar (per pane): a character count, an "Insert" button (p.run) and a
//   text box that inserts its text on Enter, then hands focus back (p.focus);
// - toolbar (module-wide): a "Panel" toggle and a "Crash" button;
// - overlay (while the toggle is on, module-wide): a list;
// - side (module-wide): a list long enough to scroll;
// - selection: "Shout" (uppercase), only for selections of 3+ characters;
// - styles: red paragraphs where placed, a blue panel, a green popover
//   (portaled to body by the kit).
import type { ModuleContext } from 'mwps';
import { writing } from 'mwps/text';
import { ui, useStore, valueKey } from 'mwps';
import { Button, Popover, PopoverContent, PopoverTrigger, Toggle } from 'mwps/ui';

const panelKey = valueKey('panel', { default: false });
const crashKey = valueKey('crash', { default: false });

export const styles = /* css */ `
  .ProseMirror p { color: rgb(200, 0, 0); }
  .e2e-ui-panel li { color: rgb(0, 0, 200); }
  .e2e-ui-pop { color: rgb(0, 150, 0); }
`;

export function setup(ctx: ModuleContext) {
  const panel = ctx.getValue(panelKey);
  const crash = ctx.getValue(crashKey);

  ctx.provide(
    ui.toolbar(() => {
      const on = useStore(panel);
      if (useStore(crash)) throw new Error('e2e-ui crashed on purpose');
      return (
        <>
          <Toggle pressed={on} onPressedChange={(v) => panel.set(v)}>
            Panel
          </Toggle>
          <Button variant="ghost" onClick={() => crash.set(true)}>
            Crash
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost">More</Button>
            </PopoverTrigger>
            <PopoverContent className="e2e-ui-pop">Popover text</PopoverContent>
          </Popover>
        </>
      );
    }),
  );

  ctx.provide(
    ui.side(() => (
      <ul className="e2e-ui-side">
        {Array.from({ length: 60 }, (_, i) => (
          <li key={i}>line {i + 1}</li>
        ))}
      </ul>
    )),
  );

  ctx.each(ctx.panes, (p) => {
    p.with(panel, (s) =>
      s.provide(
        ui.overlay(() => (
          <ul className="e2e-ui-panel">
            <li>first</li>
            <li>second</li>
          </ul>
        )),
      ),
    );
    p.provide(
      ui.toolbar(() => {
        const length = useStore(p.state, (s) => (s ? writing(s.doc).textContent.length : 0));
        return (
          <>
            <span className="e2e-ui-count">{length} characters</span>
            <Button variant="outline" onClick={() => p.run((state, dispatch) => (dispatch?.(state.tr.insertText('hi')), true))}>
              Insert
            </Button>
            <input
              aria-label="Text to insert"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const text = e.currentTarget.value;
                p.run((state, dispatch) => (dispatch?.(state.tr.insertText(text)), true));
                p.focus();
              }}
            />
          </>
        );
      }),
    );
    p.provide(
      ui.selection(() => {
        const size = useStore(p.state, (s) => (s ? s.selection.to - s.selection.from : 0));
        if (size < 3) return null;
        return (
          <Button
            size="sm"
            onClick={() =>
              p.run((state, dispatch) => {
                const { from, to } = state.selection;
                dispatch?.(state.tr.insertText(state.doc.textBetween(from, to).toUpperCase(), from, to));
                return true;
              })
            }
          >
            Shout
          </Button>
        );
      }),
    );
  });
}
