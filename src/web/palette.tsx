import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '../ui/components/command.js';
import { Dialog, DialogContent, DialogTitle } from '../ui/components/dialog.js';
import type { ActionEntry } from '../core/host.js';
import { host } from './host.js';

const mac = /Mac|iP(hone|[oa]d)/.test(navigator.platform);

// Mod-/ opens the palette everywhere, before any module's keymap sees it
// (Google Docs' key for searching its menus). Shift is allowed, since some
// layouts type `/` with it.
const isPaletteKey = (e: KeyboardEvent) =>
  (mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey && e.key === '/';

interface Group {
  moduleId: string;
  enabled: ActionEntry[];
  greyed: ActionEntry[];
}

// One group per module, in the host's order (placed modules first), modules
// with something runnable before those with nothing.
function groupByModule(entries: readonly ActionEntry[]): Group[] {
  const groups = new Map<string, Group>();
  for (const a of entries) {
    let g = groups.get(a.moduleId);
    if (!g) groups.set(a.moduleId, (g = { moduleId: a.moduleId, enabled: [], greyed: [] }));
    (a.enabled ? g.enabled : g.greyed).push(a);
  }
  const all = [...groups.values()];
  return [...all.filter((g) => g.enabled.length), ...all.filter((g) => !g.enabled.length)];
}

// Where a palette opened by a key draws: under the caret of the pane the
// key was pressed in, kept on screen; `null` to centre it.
function caretOf(paneId: string | null): { left: number; top: number } | null {
  const view = paneId === null ? undefined : host.paneView(paneId);
  const state = paneId === null ? undefined : host.paneState(paneId).get();
  if (!view || !state) return null;
  const caret = view.coordsAtPos(state.selection.head);
  const width = 320;
  const height = 240;
  const below = caret.bottom + 4;
  return {
    left: Math.max(8, Math.min(caret.left, window.innerWidth - width - 8)),
    top: below + height <= window.innerHeight ? below : Math.max(8, caret.top - height - 4),
  };
}

// The action palette (Mod-/): every action of every module that is on, under
// its module, greyed where it can't run in the last focused pane. Greyed
// actions fold away until expanded or matched by a search. A key that
// several actions apply to opens it at the caret with just those.
export function Palette() {
  const [entries, setEntries] = useState<ActionEntry[] | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  // The pane the chosen action runs from.
  const from = useRef<string | null>(null);

  useEffect(() => {
    const open = (pane: string | null, list: readonly ActionEntry[], place: typeof at) => {
      from.current = pane;
      setSearch('');
      setExpanded(new Set());
      setAt(place);
      setEntries([...list]);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const pane = host.lastFocusedPane.get();
      open(pane, host.actions(pane), null);
    };
    const onChoice = () => {
      const choice = host.keyChoice.get();
      if (choice) open(choice.paneId, choice.actions, caretOf(choice.paneId));
    };
    window.addEventListener('keydown', onKey, { capture: true });
    const stop = host.keyChoice.subscribe(onChoice);
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      stop();
    };
  }, []);

  // The chosen action runs once the dialog has closed and focus is back in
  // the pane, so an action that moves focus keeps it.
  const chosen = useRef<ActionEntry | null>(null);
  // Closed at once, in the key's own handler, with focus back in the pane
  // before the next key: Radix would hand focus back a task later, and a
  // key pressed in between would land on the page and be lost.
  const close = () => {
    flushSync(() => setEntries(null));
    const pane = from.current;
    if (pane) host.paneView(pane)?.focus();
    const action = chosen.current;
    chosen.current = null;
    if (action) host.runAction(pane, action.moduleId, action.name);
  };
  const afterClose = (e: Event) => e.preventDefault();

  const toggle = (moduleId: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (!next.delete(moduleId)) next.add(moduleId);
      return next;
    });

  const item = (a: ActionEntry) => (
    <CommandItem
      key={`${a.moduleId}/${a.name}`}
      value={`${a.moduleId}/${a.name}`}
      keywords={[a.title, a.moduleId]}
      disabled={!a.enabled}
      onSelect={() => {
        chosen.current = a;
        close();
      }}
    >
      <span>{a.title}</span>
      {a.active && <span aria-label="on">✓</span>}
      {a.keys.length > 0 && <CommandShortcut>{a.keys.map(showKey).join(' ')}</CommandShortcut>}
    </CommandItem>
  );

  // A row that shows or hides a module's greyed actions; gone while searching,
  // when every match shows.
  const fold = (g: Group, label: string) => (
    <CommandItem
      key={`${g.moduleId}/ fold`}
      value={`${g.moduleId}/ fold`}
      className="tw:text-muted-foreground"
      onSelect={() => toggle(g.moduleId)}
    >
      {label}
    </CommandItem>
  );

  const searching = search.trim() !== '';

  return (
    <Dialog open={entries !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="tw:overflow-hidden tw:p-0 tw:data-[state=closed]:animate-none!"
        style={at ? { left: at.left, top: at.top, translate: 'none', width: 320 } : undefined}
        showCloseButton={false}
        onCloseAutoFocus={afterClose}
      >
        <DialogTitle className="tw:sr-only">Actions</DialogTitle>
        <Command loop>
          <CommandInput placeholder={at ? 'Choose an action…' : 'Run an action…'} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No actions.</CommandEmpty>
            {entries &&
              groupByModule(entries).map((g) => {
                const open = searching || expanded.has(g.moduleId);
                const n = g.greyed.length;
                // A module with nothing runnable is one row until opened.
                if (!g.enabled.length && !open)
                  return (
                    <CommandGroup key={g.moduleId}>
                      {fold(g, `▸ ${g.moduleId} · ${n} unavailable`)}
                    </CommandGroup>
                  );
                return (
                  <CommandGroup key={g.moduleId} heading={g.moduleId}>
                    {g.enabled.map(item)}
                    {open && g.greyed.map(item)}
                    {!searching && n > 0 && fold(g, open ? '▾ Hide unavailable' : `▸ ${n} unavailable`)}
                  </CommandGroup>
                );
              })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// `Mod-Shift-s` as the platform writes it: ⌘⇧S, or Ctrl+Shift+S.
export function showKey(key: string): string {
  const parts = key.split(/-(?!$)/);
  const last = parts.pop()!;
  const names: Record<string, [string, string]> = {
    mod: mac ? ['⌘', ''] : ['Ctrl', '+'],
    cmd: ['⌘', ''],
    meta: mac ? ['⌘', ''] : ['Meta', '+'],
    ctrl: mac ? ['⌃', ''] : ['Ctrl', '+'],
    c: mac ? ['⌃', ''] : ['Ctrl', '+'],
    shift: mac ? ['⇧', ''] : ['Shift', '+'],
    s: mac ? ['⇧', ''] : ['Shift', '+'],
    alt: mac ? ['⌥', ''] : ['Alt', '+'],
    a: mac ? ['⌥', ''] : ['Alt', '+'],
  };
  const mods = parts.map((m) => names[m.toLowerCase()] ?? [m, '+']);
  const keys: Record<string, string> = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Tab: '⇥', Enter: '↩', Escape: 'Esc', Backspace: '⌫',
  };
  return mods.map(([n, sep]) => n + sep).join('') + (keys[last] ?? (last.length === 1 ? last.toUpperCase() : last));
}
