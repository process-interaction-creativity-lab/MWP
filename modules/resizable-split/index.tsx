import type { ModuleContext } from 'mwps';
import { ui, useStore, valueKey } from 'mwps';
import { Columns2, Rows2 } from 'mwps/icons';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, ToggleGroup, ToggleGroupItem } from 'mwps/ui';

type Orientation = 'horizontal' | 'vertical';

const orientationKey = valueKey<Orientation>('orientation', { default: 'horizontal', persist: true });
// More than two panes, so one may close.
const closableKey = valueKey('closable', { default: false });

export const moduleType = 'editorReplacement';

export const actions = {
  stacked: { title: 'Stacked' },
  addPane: { title: 'Add pane' },
  closePane: { title: 'Close pane' },
};

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const orientation = p.getValue(orientationKey);
    const closable = p.getValue(closableKey);
    // Each child is the writer's: its own document and modules, and a tab.
    const children = p.hostChildPanes({ persist: true });
    const counted = () => closable.set(children.list.get().length > 2);
    const addPane = () => {
      children.create({ owner: 'writer', document: null });
      counted();
    };
    while (children.list.get().length < 2) addPane();
    counted();
    // Placing the split moves focus from the split into its first pane.
    p.effect(() => {
      if (p.isLastFocused.get()) children.list.get()[0]?.focus();
    });

    // The split's controls are in its tab, Close pane in each child's.
    // Stacked is an action for the palette and keys; the tab shows both
    // orientations side by side instead.
    p.provide(actions.stacked, {
      procedure: () => (orientation.set((d) => (d === 'vertical' ? 'horizontal' : 'vertical')), true),
      active: () => orientation.get() === 'vertical',
    });
    p.provide(actions.addPane, { procedure: () => (addPane(), true) });
    const Orientations = () => (
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        className="resizable-split-orientation"
        aria-label="Orientation"
        value={useStore(orientation)}
        onValueChange={(next) => next && orientation.set(next as Orientation)}
      >
        <ToggleGroupItem value="horizontal">
          <Columns2 />
          Side by side
        </ToggleGroupItem>
        <ToggleGroupItem value="vertical">
          <Rows2 />
          Stacked
        </ToggleGroupItem>
      </ToggleGroup>
    );
    p.provide(ui.tabMenu(Orientations));
    p.provide(ui.tabMenu(actions.addPane));
    p.each(children, (c, handle) =>
      c.with(closable, (s) => {
        s.provide(actions.closePane, {
          procedure: () => {
            handle.close();
            counted();
            return true;
          },
        });
        s.provide(ui.tabMenu(actions.closePane));
      }),
    );

    const Split = () => {
      const dir = useStore(orientation);
      const panes = useStore(children.list);
      return (
        <div className="resizable-split-root">
          <ResizablePanelGroup orientation={dir}>
            {panes.flatMap((c, i) => [
              i > 0 ? <ResizableHandle key={`h-${c.id}`} withHandle /> : null,
              <ResizablePanel key={c.id} id={c.id} minSize="10%">
                <div className="resizable-split-child">{c.element}</div>
              </ResizablePanel>,
            ])}
          </ResizablePanelGroup>
        </div>
      );
    };
    p.provide(ui.editorReplacement(Split));
  });
}

export const styles = `
.resizable-split-orientation {
  width: 100%;
}
.resizable-split-root {
  height: 100%;
  min-height: 0;
}
.resizable-split-child {
  position: relative;
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
`;
