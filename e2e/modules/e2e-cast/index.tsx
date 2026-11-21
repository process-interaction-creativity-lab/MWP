// Test module: a cast list kept as the module's data (one paragraph per
// character, in the document's data node after the writing), drawn as a card in a side view.
// The paragraphs are ordinary text, so the pane's other modules (marks,
// highlights) work in it.
import type { NodeSpec } from 'prosemirror-model';
import { Selection, type Command } from 'prosemirror-state';
import type { ModuleContext } from 'mwps';
import { ui, useStore } from 'mwps';
import { dataEnd, findData } from 'mwps/text';
import { Button } from 'mwps/ui';

export const nodes: { [name: string]: NodeSpec } = {
  e2e_cast: { group: 'module_data', content: 'paragraph+', toDOM: () => ['div', { class: 'e2e-cast' }, 0] },
};

export const actions = {
  startCast: { title: 'Start cast list' },
  goToCast: { title: 'Go to cast list' },
};

const start: Command = (state, dispatch) => {
  if (findData(state.doc, 'e2e_cast')) return false;
  const { e2e_cast, paragraph } = state.schema.nodes;
  const first = paragraph!.create(null, state.schema.text('Ada, a pilot who will not land'));
  dispatch?.(state.tr.insert(dataEnd(state.doc), e2e_cast!.create(null, first)));
  return true;
};

const goTo: Command = (state, dispatch) => {
  const cast = findData(state.doc, 'e2e_cast');
  if (!cast) return false;
  dispatch?.(state.tr.setSelection(Selection.near(state.doc.resolve(cast.pos + 2))));
  return true;
};

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const cast = p.dataCards('e2e_cast');
    p.provide(actions.startCast, { command: start });
    p.provide(actions.goToCast, { command: goTo });
    p.provide(ui.overlay(() => <div className="e2e-cast-overlay">cast overlay</div>));
    p.provide(
      ui.side(
        () => {
          const card = useStore(cast.list)[0];
          if (!card) return <Button variant="outline" onClick={() => p.run(start)}>Start a cast list</Button>;
          return <div className="e2e-cast-card">{card.element}</div>;
        },
        { title: 'Cast' },
      ),
    );
  });
}

export const styles = `
.e2e-cast-card { padding: .75em; border: 1px solid var(--border); border-radius: 6px; }
`;
