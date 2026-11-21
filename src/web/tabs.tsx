// The tab row: the project's tab first, then one tab per writer-owned pane,
// outer panes before the panes they host. Every tab opens one menu: its
// actions, then its modules; beside it, the highlighted module's summary.
// Hovering a pane's tab outlines the pane.

import { Check, ChevronDown, ChevronsUpDown, FolderOpen, Plus, Settings, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import type { ActionEntry, TabMenuItem } from '../core/host.js';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '../ui/components/command.js';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/components/popover.js';
import { barHeight, TRACE_BARS, TRACE_BUCKET_MS, traceBars, type TraceBar } from './ai-trace.js';
import { host } from './host.js';
import { PaneModules, ProjectModules, Radio } from './module-picker.js';
import { PaneOutline } from './pane-outline.js';
import { ModuleItems } from './module-ui.js';
import { showKey } from './palette.js';
import { listProjects } from './projects.js';
import { openSettings } from './settings-dialog.js';

// The writer-owned panes, outer panes before the panes they host.
function writerPanes(): string[] {
  const ids = host.slotIds();
  const out: string[] = [];
  const walk = (parent: string | null) => {
    for (const id of ids) {
      const info = host.paneInfo(id)!;
      if (info.parent !== parent) continue;
      if (info.owner === 'writer') out.push(id);
      walk(id);
    }
  };
  walk(null);
  return out;
}

// The innermost writer-owned pane on the focus path from `focused`: a card
// defers to its cards pane, a split's child is its own.
export function writerTarget(focused: string | null): string | null {
  return host.focusPath(focused).find((id) => host.paneInfo(id)?.owner === 'writer') ?? null;
}

// A pane hosting only writer-owned children (a split) shows no document of
// its own: the writer's panes cover it, so there's no picker for it.
export function showsNoDocument(paneId: string): boolean {
  const children = host.slotIds().filter((id) => host.paneInfo(id)?.parent === paneId);
  return children.length > 0 && children.every((id) => host.paneInfo(id)!.owner === 'writer');
}

export function TabRow({ project, onPickProject }: { project: string; onPickProject(name: string): void }) {
  useSyncExternalStore(host.subscribe, () => host.version);
  const focused = useSyncExternalStore(host.lastFocusedPane.subscribe, host.lastFocusedPane.get);
  const [hovered, setHovered] = useState<string | null>(null);
  const path = host.focusPath(focused);
  const active = writerTarget(focused);

  // A tab is named by what draws its pane, never by its document (the
  // picker shows that): the editor replacement's module, or the editor.
  const name = (id: string) => {
    const replacement = host.paneInfo(id)!.status === 'ready' ? host.replacementOf(id) : null;
    return replacement?.moduleId ?? 'Text Editor';
  };
  // Hovering a tab outlines its pane and marks the tabs of the panes inside it.
  const hover = (id: string | null) => setHovered(id);

  return (
    <div className="mwps-tabs" role="tablist" aria-label="Panes">
      <ProjectTab project={project} onPick={onPickProject} />
      {writerPanes().map((id) => (
        <PaneTab
          key={id}
          paneId={id}
          name={name(id)}
          state={id === active ? 'active' : path.includes(id) ? 'contains' : undefined}
          inside={hovered !== null && hovered !== id && host.focusPath(id).includes(hovered)}
          onHover={hover}
        />
      ))}
      {hovered !== null && <PaneOutline paneId={hovered} />}
    </div>
  );
}

// A menu over a tab: the modules' items (a group per module, actions and
// components in the order provided), above the search box or, `listed`,
// in the list after what `lead` adds; then what `children` adds (each given
// the search text and a way to close the menu). Above the box nothing is
// filtered and the list's keys don't reach. A chosen action runs once the menu has closed and
// focus is back in the pane, as from the palette.
// The summary's width and its gap from the menu (see .mwps-module-summary).
const SUMMARY_ROOM = 16 * 16 + 8;

function TabMenu({
  trigger,
  items,
  paneId,
  placeholder,
  listed = false,
  lead,
  top,
  children,
}: {
  trigger: ReactNode;
  items: () => TabMenuItem[];
  paneId: string | null;
  placeholder: string;
  listed?: boolean;
  lead?: (query: string, close: () => void) => ReactNode;
  // Above the search box: what the tab's modules are doing.
  top?: ReactNode;
  children: (query: string, close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // The list's highlighted row (a module row's value is its id).
  const [highlighted, setHighlighted] = useState('');
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);
  const summary = open && host.moduleIds().includes(highlighted) ? host.summary(highlighted) : null;
  // The summary goes on the side of the menu with room for it.
  const menu = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<'right' | 'left'>('right');
  useLayoutEffect(() => {
    const box = menu.current?.getBoundingClientRect();
    if (box) setSide(box.right + SUMMARY_ROOM > window.innerWidth ? 'left' : 'right');
  }, [summary]);
  const chosen = useRef<ActionEntry | null>(null);
  const afterClose = (e: Event) => {
    e.preventDefault();
    const focused = host.lastFocusedPane.get();
    if (focused) host.paneView(focused)?.focus();
    const action = chosen.current;
    chosen.current = null;
    if (action && (paneId === null || host.paneIds().includes(paneId))) host.runAction(paneId, action.moduleId, action.name);
  };
  // A character typed anywhere in the menu goes to the search box, unless
  // it is typed into a field of a module's own.
  const typeToSearch = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    const box = menu.current?.querySelector<HTMLInputElement>('[cmdk-input]');
    if (!box) return;
    e.preventDefault();
    box.focus();
    setQuery((q) => q + e.key);
  };
  const groups = new Map<string, TabMenuItem[]>();
  for (const item of open ? items() : []) groups.set(item.moduleId, [...(groups.get(item.moduleId) ?? []), item]);
  const choose = (a: ActionEntry) => {
    chosen.current = a;
    setOpen(false);
  };
  const above = !listed && groups.size > 0 && (
    <div className="tw:border-b">
      {[...groups].map(([moduleId, group]) => (
        <div key={moduleId} className="tw:p-1">
          <div className="tw:px-2 tw:py-1.5 tw:text-xs tw:font-medium tw:text-muted-foreground">{moduleId}</div>
          {group.map((a) =>
            a.kind === 'component' ? (
              <div key={a.key} className="tw:px-2 tw:py-1">
                <ModuleItems items={[a]} />
              </div>
            ) : (
              <button
                key={`${a.moduleId}/${a.name}`}
                type="button"
                className="tw:flex tw:w-full tw:items-center tw:gap-2 tw:rounded-sm tw:px-2 tw:py-1.5 tw:text-left tw:text-sm tw:outline-hidden tw:hover:bg-accent tw:focus-visible:bg-accent tw:disabled:pointer-events-none tw:disabled:opacity-50 tw:[&_svg]:size-4 tw:[&_svg]:shrink-0 tw:[&_svg]:text-muted-foreground"
                disabled={!a.enabled}
                data-action={a.title}
                data-active={a.active}
                onClick={() => choose(a)}
              >
                <Check className={a.active ? '' : 'tw:invisible'} />
                <span>{a.title}</span>
                {a.keys[0] && <span className="tw:ml-auto tw:text-xs tw:tracking-widest tw:text-muted-foreground">{showKey(a.keys[0])}</span>}
              </button>
            ),
          )}
        </div>
      ))}
    </div>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent ref={menu} align="start" className="tw:relative tw:w-72 tw:p-0" onCloseAutoFocus={afterClose} onKeyDown={typeToSearch}>
        {summary && (
          <div className="mwps-module-summary" data-side={side} role="note">
            {summary}
          </div>
        )}
        {open && top}
        {above}
        <Command value={highlighted} onValueChange={setHighlighted}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {lead?.(query, () => setOpen(false))}
            {listed && [...groups].map(([moduleId, group]) => (
              <CommandGroup key={moduleId} heading={moduleId}>
                {group.map((a) =>
                  a.kind === 'component' ? (
                    // The list would take the arrows and Enter from its inputs.
                    <div key={a.key} className="tw:px-2 tw:py-1" onKeyDown={(e) => e.stopPropagation()}>
                      <ModuleItems items={[a]} />
                    </div>
                  ) : (
                    <CommandItem
                      key={`${a.moduleId}/${a.name}`}
                      value={`${a.moduleId}/${a.name}`}
                      keywords={[a.title]}
                      disabled={!a.enabled}
                      data-action={a.title}
                      data-active={a.active}
                      onSelect={() => choose(a)}
                    >
                      <Check className={a.active ? '' : 'tw:invisible'} />
                      <span>{a.title}</span>
                      {a.keys[0] && <CommandShortcut>{showKey(a.keys[0])}</CommandShortcut>}
                    </CommandItem>
                  ),
                )}
              </CommandGroup>
            ))}
            {children(query, () => setOpen(false))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PaneTab({
  paneId,
  name,
  state,
  inside,
  onHover,
}: {
  paneId: string;
  name: string;
  state: 'active' | 'contains' | undefined;
  inside: boolean;
  onHover(id: string | null): void;
}) {
  useSyncExternalStore(host.uiVersion.subscribe, host.uiVersion.get);
  const modules = host.paneIds().includes(paneId) ? host.placed(paneId) : [];
  const trigger = (
    <button
      type="button"
      role="tab"
      aria-selected={state === 'active'}
      className="mwps-tab"
      data-tab={paneId}
      data-state={state}
      data-inside={inside || undefined}
      // Choosing a tab focuses its pane; its editor, if any, gets the caret
      // when the menu closes.
      onClick={() => host.paneIds().includes(paneId) && host.focus(paneId)}
      onMouseEnter={() => onHover(paneId)}
      onMouseLeave={() => onHover(null)}
    >
      <span>{name}</span>
      <AiDot modules={modules} />
      <ChevronDown />
    </button>
  );
  return (
    <TabMenu
      trigger={trigger}
      paneId={paneId}
      items={() => (host.paneIds().includes(paneId) ? host.tabMenu(paneId) : [])}
      placeholder="Search modules…"
      top={<AiTrace modules={modules} />}
    >
      {() => <PaneModules paneId={paneId} />}
    </TabMenu>
  );
}

// The project's tab: every project, to switch to one or create one from
// what was typed; then the project modules' actions, and the modules.
function ProjectTab({ project, onPick }: { project: string; onPick(name: string): void }) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    void listProjects().then((found) => setNames(found.includes(project) ? found : [...found, project].sort()));
  }, [project]);

  const trigger = (
    <button type="button" className="mwps-tab mwps-project-tab" aria-label="Project" data-tab="project">
      <FolderOpen />
      <span>{project}</span>
      <AiDot modules={host.placedInProject()} />
      <ChevronsUpDown />
    </button>
  );
  return (
    <TabMenu
      trigger={trigger}
      paneId={null}
      items={() => host.projectMenu().map((a): TabMenuItem => ({ kind: 'action', ...a }))}
      placeholder="Search, or name a new project…"
      top={<AiTrace modules={host.placedInProject()} />}
      listed
      lead={(query, close) => {
        const pick = (name: string) => {
          close();
          onPick(name);
        };
        const typed = query.trim();
        return (
          <>
            <CommandGroup heading="Projects">
              {names.map((n) => (
                <CommandItem key={n} value={`project ${n}`} keywords={[n]} onSelect={() => pick(n)}>
                  <Radio on={n === project} />
                  {n}
                </CommandItem>
              ))}
            </CommandGroup>
            {typed && !names.includes(typed) && (
              <CommandGroup forceMount>
                <CommandItem value={`create project ${typed}`} forceMount onSelect={() => pick(typed)}>
                  <Plus />
                  Create project “{typed}”
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              <CommandItem
                value="settings"
                keywords={['ai', 'key', 'permissions']}
                onSelect={() => {
                  close();
                  openSettings();
                }}
              >
                <Settings />
                Settings…
              </CommandItem>
            </CommandGroup>
          </>
        );
      }}
    >
      {() => <ProjectModules />}
    </TabMenu>
  );
}

// The AI calls of the modules on a tab: a dot on the tab while any is out,
// and at the top of its menu, under "AI Usage": while calls are out, a
// waveform that scrolls left (a flat line while a call is out, a bar for what
// arrived in each few seconds) and a button that stops them. Once none is
// out, how the last one ended, for the rest of the half minute. The waveform
// shows nothing while the last half minute was quiet.
const useAiCalls = (modules: readonly string[]) =>
  useSyncExternalStore(host.aiCalls.subscribe, host.aiCalls.get).filter((c) => modules.includes(c.moduleId));

function AiDot({ modules }: { modules: readonly string[] }) {
  const out = useAiCalls(modules).filter((c) => c.ended === null).length;
  return out > 0 ? <span className="mwps-ai-dot" role="status" aria-label={`AI working (${out})`} title="AI working" /> : null;
}

const quiet = (bars: readonly TraceBar[]) => bars.every((b) => !b.open && !b.pieces);

function AiTrace({ modules }: { modules: readonly string[] }) {
  const calls = useAiCalls(modules);
  const out = calls.filter((c) => c.ended === null).length;
  const [shown, setShown] = useState(false);
  if (!shown && !quiet(traceBars(calls, Date.now()))) setShown(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(calls);
  latest.current = calls;

  useEffect(() => {
    const cv = canvas.current;
    if (!shown || !cv) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const draw = () => {
      const now = Date.now();
      const bars = traceBars(latest.current, now);
      const dpr = devicePixelRatio || 1;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== w * dpr) [cv.width, cv.height] = [w * dpr, h * dpr];
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = getComputedStyle(cv).color;
      const slot = w / TRACE_BARS;
      const width = Math.max(1, slot * 0.4);
      // A bucket sits where its time is, `now` at the right edge, so the
      // current one slides in as it fills; with reduced motion, whole steps.
      const shift = still ? slot : ((now % TRACE_BUCKET_MS) / TRACE_BUCKET_MS) * slot;
      bars.forEach((b, i) => {
        const left = i * slot - shift;
        if (b.open) g.fillRect(left, h / 2 - 0.5, slot + 0.5, 1);
        const height = barHeight(b.pieces) * h;
        if (height) g.fillRect(left + (slot - width) / 2, (h - Math.max(2, height)) / 2, width, Math.max(2, height));
      });
      frame = still ? window.setTimeout(draw, 1000) : requestAnimationFrame(draw);
    };
    draw();
    return () => (still ? clearTimeout(frame) : cancelAnimationFrame(frame));
  }, [shown, out > 0]);

  // With nothing out, the outcome stays until the half minute has passed.
  useEffect(() => {
    if (!shown || out > 0) return;
    const t = window.setTimeout(() => setShown(false), TRACE_BARS * TRACE_BUCKET_MS);
    return () => clearTimeout(t);
  }, [shown, out]);

  if (!shown) return null;
  if (out === 0) {
    const last = calls.filter((c) => c.ended !== null).sort((a, b) => b.ended! - a.ended!)[0];
    const outcome = last?.state === 'failed' ? 'Request failed' : last?.state === 'aborted' ? 'Request cancelled' : 'Request finished';
    return (
      <div className="mwps-ai-trace">
        <div className="mwps-ai-trace-label">AI Usage</div>
        <div className="mwps-ai-trace-outcome" data-outcome={last?.state}>
          {outcome}
        </div>
      </div>
    );
  }
  return (
    <div className="mwps-ai-trace">
      <div className="mwps-ai-trace-label">AI Usage</div>
      <div className="mwps-ai-trace-row">
        <canvas ref={canvas} role="img" aria-label="AI activity over the last 30 seconds" data-out={out || undefined} />
        <button
          type="button"
          className="mwps-ai-trace-stop"
          aria-label="Stop AI calls"
          title="Stop AI calls"
          onClick={() => host.stopAiCalls(modules)}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
