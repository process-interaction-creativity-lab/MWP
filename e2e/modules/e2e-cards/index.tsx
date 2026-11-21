// Test module: a card per top-level block in place of the editor, so the
// core's part panes are tested without cards-view; a text box in its
// tab's menu that adds a card on Enter; and which card holds the pane's caret.
import { ui, useStore, type ModuleContext } from 'mwps';
import { writing } from 'mwps/text';
import { Input } from 'mwps/ui';

export const moduleType = 'editorReplacement';

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const cards = p.hostPartPanes(() => true);
    const NewCard = () => (
      <Input
        aria-label="New card"
        placeholder="New card…"
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const text = e.currentTarget.value;
          e.currentTarget.value = '';
          p.run((state, dispatch) => {
            const { paragraph } = state.schema.nodes;
            dispatch?.(state.tr.insert(writing(state.doc).content.size, paragraph!.create(null, state.schema.text(text))));
            return true;
          });
        }}
      />
    );
    p.provide(ui.tabMenu(NewCard));
    p.provide(
      ui.editorReplacement(() => (
        // Which card the pane's selection is in, for journeys to read.
        <div className="e2e-cards" data-caret-card={useStore(p.state, (s) => (s ? s.selection.$from.index(0) : -1))}>
          {/* Clipped like a real card, with a header over the first line. */}
          <style>{'.e2e-card { overflow: hidden; border: 1px solid; } .e2e-card::before { content: "header"; display: block; height: 24px; }'}</style>
          {useStore(cards.list).map((c) => (
            <div key={c.id} className="e2e-card">
              {c.element}
            </div>
          ))}
        </div>
      )),
    );
  });
}
