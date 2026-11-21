import { Circle, CircleDot, Square, SquareCheck } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Button } from '../ui/components/button.js';
import { CommandGroup, CommandItem } from '../ui/components/command.js';
import { host, openProjectNow } from './host.js';

// Placed modules first, otherwise in the host's order.
const placedFirst = (ids: readonly string[], placed: readonly string[]) => [...ids.filter((id) => placed.includes(id)), ...ids.filter((id) => !placed.includes(id))];

// A pane tab's modules: the layout (an editor replacement, one at a time, or
// the text editor) and the add-ons (any number), ticked where placed on this
// pane, with a way back on for a module that failed. A layout whose panes
// all have tabs of their own, or that shows no text, offers no add-ons:
// they would run nowhere. Add-ons placed before it are still listed, so
// the writer sees them and can take them off.
export function PaneModules({ paneId }: { paneId: string }) {
  useSyncExternalStore(host.subscribe, () => host.version);
  if (!host.paneIds().includes(paneId)) return null;
  const placed = host.placed(paneId);
  const ids = host.moduleIds();
  const editors = ids.filter((id) => host.moduleType(id) === 'editorReplacement');
  const extensions = placedFirst(ids.filter((id) => host.moduleType(id) === 'extension'), placed);
  const current = editors.find((id) => placed.includes(id)) ?? null;
  const layoutItem = (id: string) => <ModuleItem key={id} id={id} placed={placed.includes(id)} onToggle={() => toggle(id)} radio />;
  const addOnsRun = host.addOnsRun(paneId);
  // Where add-ons don't run, any children are the writer's, each with a tab.
  const childTabs = !addOnsRun && host.slotIds().some((id) => host.paneInfo(id)?.parent === paneId);

  const toggle = (id: string) => {
    if (placed.includes(id)) host.unplace(paneId, id);
    else host.place(paneId, id);
  };
  const textEditor = () => {
    if (current) host.unplace(paneId, current);
  };

  return (
    <>
      {editors.length > 0 && (
        <CommandGroup heading="Layouts">
          {current && layoutItem(current)}
          <CommandItem value="text editor" data-module="" data-placed={current === null} onSelect={textEditor}>
            <Radio on={current === null} />
            <span>Text editor</span>
          </CommandItem>
          {editors.filter((id) => id !== current).map(layoutItem)}
        </CommandGroup>
      )}
      <CommandGroup heading="Add-ons">
        {addOnsRun ? (
          extensions.map((id) => <ModuleItem key={id} id={id} placed={placed.includes(id)} onToggle={() => toggle(id)} />)
        ) : (
          <>
            <div className="tw:px-2 tw:py-1.5 tw:text-sm tw:text-muted-foreground" data-no-add-ons>
              {childTabs ? 'Add-ons go on each pane of this layout, from its own tab.' : "Add-ons don't run while this layout shows no text."}
            </div>
            {/* Those placed before stay placed, paused: shown, so they can be taken off. */}
            {extensions
              .filter((id) => placed.includes(id))
              .map((id) => (
                <ModuleItem key={id} id={id} placed onToggle={() => toggle(id)} />
              ))}
          </>
        )}
      </CommandGroup>
    </>
  );
}

// The project tab's modules: project modules, ticked while placed, and
// kept in the project.
export function ProjectModules() {
  useSyncExternalStore(host.subscribe, () => host.version);
  const placed = host.placedInProject();
  const ids = placedFirst(host.moduleIds().filter((id) => host.moduleType(id) === 'project'), placed);
  if (ids.length === 0) return null;
  const toggle = (id: string) => {
    if (placed.includes(id)) host.unplaceFromProject(id);
    else host.placeInProject(id);
    void openProjectNow()?.setProjectModules(host.placedInProject());
  };
  return (
    <CommandGroup heading="Project modules">
      {ids.map((id) => (
        <ModuleItem key={id} id={id} placed={placed.includes(id)} onToggle={() => toggle(id)} />
      ))}
    </CommandGroup>
  );
}

// Markers for menu rows: a radio for one of several, a checkbox for any.
export const Radio = ({ on }: { on: boolean }) => (on ? <CircleDot /> : <Circle className="tw:opacity-50" />);
export const Checkbox = ({ on }: { on: boolean }) => (on ? <SquareCheck /> : <Square className="tw:opacity-50" />);

function ModuleItem({ id, placed, onToggle, radio = false }: { id: string; placed: boolean; onToggle(): void; radio?: boolean }) {
  const status = host.status(id);
  return (
    <CommandItem value={id} data-module={id} data-placed={placed} data-status={status} onSelect={onToggle}>
      {radio ? <Radio on={placed} /> : <Checkbox on={placed} />}
      <span className={status === 'failed' ? 'tw:line-through tw:text-muted-foreground' : ''}>{id}</span>
      {status === 'failed' && (
        <Button
          size="sm"
          variant="outline"
          className="tw:ml-auto tw:h-6"
          onClick={(e) => {
            e.stopPropagation();
            host.setEnabled(id, true);
          }}
        >
          Turn on
        </Button>
      )}
    </CommandItem>
  );
}
