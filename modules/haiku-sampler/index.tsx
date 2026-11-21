import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ActionDeclaration, ModuleContext } from 'mwps';
import { Button, Dialog, DialogContent, DialogTitle } from 'mwps/ui';
import { textOf, writing } from 'mwps/text';
import type { Command, EditorState } from 'prosemirror-state';
import { capitalise, generateHaiku } from './syllables';

export const actions = {
  haiku: { title: 'Find a haiku in the text' },
} satisfies Record<string, ActionDeclaration>;

/** What the pane's card shows: the text it samples (kept, so Again starts
 *  from the same place) and the result. */
interface Card {
  paragraphs: string[];
  lines: string[] | null;
}
const cardKey = valueKey<Card | null>('card', { default: null });

const ORDINARY = new Set(['paragraph', 'heading']);

/** The text to sample: the selection if there is one, else the caret's block
 *  and every block after it. One string per block; empty ones are skipped. */
function sourceOf(state: EditorState): string[] {
  const { from, to, empty, $from } = state.selection;
  const start = empty && $from.depth > 0 ? $from.before($from.depth) : from;
  const out: string[] = [];
  writing(state.doc).descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const end = pos + node.nodeSize;
    if (end <= start || (!empty && pos >= to)) return false;
    if (ORDINARY.has(node.type.name) || pos === start) {
      const t = textOf(node, pos);
      let s = t.text;
      if (!empty) {
        s = '';
        for (let i = 0; i < t.text.length; i++) {
          if (t.pos(i) >= from && t.pos(i + 1, -1) <= to) s += t.text[i];
        }
      }
      if (s.trim()) out.push(s.trim());
    }
    return false;
  });
  return out;
}

const makeCard = (paragraphs: string[]): Card => {
  const h = generateHaiku(paragraphs);
  return { paragraphs, lines: h ? h.lines.map((l, i) => (i === 0 ? capitalise(l) : l)) : null };
};

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const card = p.getValue(cardKey);

    // The card belongs to the pane the writer is in: leaving closes it.
    p.with(p.isLastFocused, (s) => s.effect(() => () => card.set(null)));

    const ask: Command = (state, dispatch) => {
      if (dispatch) card.set(makeCard(sourceOf(state)));
      return true;
    };
    p.provide(actions.haiku, { command: ask });

    const Control = () => {
      const haiku = useAction(p, actions.haiku);
      return (
        <Button size="sm" variant="outline" disabled={!haiku.enabled} onClick={haiku.run}>
          Haiku
        </Button>
      );
    };
    p.provide(ui.toolbar(Control));

    const close = () => card.set(null);
    const again = () => {
      const cur = card.get();
      if (cur) card.set(makeCard(cur.paragraphs));
    };
    const CardDialog = () => {
      const c = useStore(card);
      return (
        <Dialog open={c !== null} onOpenChange={(o) => !o && close()}>
          <DialogContent
            showCloseButton={false}
            className="haiku-sampler-card"
          >
            <DialogTitle className="haiku-sampler-title">Haiku</DialogTitle>
            {c?.lines ? (
              <div className="haiku-sampler-lines">
                {c.lines.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </div>
            ) : (
              <p className="haiku-sampler-note">
                {c && c.paragraphs.length === 0
                  ? 'Nothing was found to sample.'
                  : 'Not enough text to form a haiku. Try a longer paragraph.'}
              </p>
            )}
            <div className="haiku-sampler-buttons">
              {c?.lines && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void navigator.clipboard.writeText(c.lines!.join('\n')).catch(() => {})}
                >
                  Copy
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={again}>
                Again
              </Button>
              <Button size="sm" variant="outline" onClick={close}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      );
    };
    p.provide(ui.modal(CardDialog));
  });
}

export const styles = `
.haiku-sampler-card {
  max-width: 20rem;
  text-align: center;
}
.haiku-sampler-title {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.haiku-sampler-lines {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.1rem;
  margin-bottom: 0.75rem;
}
.haiku-sampler-lines p {
  margin: 0.2rem 0;
}
.haiku-sampler-note {
  margin: 0 0 0.75rem;
}
.haiku-sampler-buttons {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}
`;
