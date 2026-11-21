// The toolbar's ? button and the help it opens: for each module on in the
// last focused pane (and each project module), its summary, its `help.md`
// walkthrough, and its actions with their keys. A first entry says how to
// turn modules on.

import { Fragment, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/components/dialog.js';
import { parseHelp, type Block, type Inline } from './help.js';
import { host } from './host.js';
import { showKey } from './palette.js';

const START = '';

// The modules the writer has in front of them: on in the focused pane, then
// the project's.
function modulesInView(pane: string | null): string[] {
  const inPane = pane && host.paneInfo(pane) ? host.modulesIn(pane) : [];
  const ids = [...new Set([...inPane, ...host.placedInProject()])];
  return ids.filter((id) => host.moduleIds().includes(id) && host.status(id) === 'on');
}

export function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="mwps-help-button"
        aria-label="Help"
        title="Help: how to use the modules that are on"
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && <HelpDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function HelpDialog({ onClose }: { onClose(): void }) {
  useSyncExternalStore(host.subscribe, () => host.version);
  const pane = useSyncExternalStore(host.lastFocusedPane.subscribe, host.lastFocusedPane.get);
  const modules = modulesInView(pane);
  const [picked, setPicked] = useState<string>(() => modules[0] ?? START);
  const shown = picked === START || modules.includes(picked) ? picked : START;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="mwps-help"
        onOpenAutoFocus={(e) => {
          // Focus starts on the topic shown, not the first in the list.
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.mwps-help-nav-item[aria-current]')?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Help</DialogTitle>
          <DialogDescription>How to use the modules that are on here, and what each of their parts is for.</DialogDescription>
        </DialogHeader>
        <div className="mwps-help-body">
          <nav className="mwps-help-nav" aria-label="Help topics">
            <NavItem id={START} label="Getting started" shown={shown} onPick={setPicked} />
            {modules.map((id) => (
              <NavItem key={id} id={id} label={id} shown={shown} onPick={setPicked} />
            ))}
          </nav>
          <article className="mwps-help-page" data-help={shown || 'start'} tabIndex={0}>
            {shown === START ? <GettingStarted count={modules.length} /> : <ModuleHelp id={shown} pane={pane} />}
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NavItem({ id, label, shown, onPick }: { id: string; label: string; shown: string; onPick(id: string): void }) {
  return (
    <button type="button" className="mwps-help-nav-item" aria-current={id === shown || undefined} onClick={() => onPick(id)}>
      {label}
    </button>
  );
}

function GettingStarted({ count }: { count: number }) {
  return (
    <>
      <h2>Getting started</h2>
      <p>
        Everything beyond plain typing comes from modules. Each pane has a tab in the row at the top (such as Text Editor); click
        it for its menu, which lists the modules you can turn on in that pane. Hover one to read what it does. Project-wide modules
        are in the menu of the first tab, the project's, which also picks the project.
      </p>
      <p>
        A module that is on puts its controls in the toolbar, in a frame with its name, and may add a side tab at the right, a
        bubble over selected text, or marks in the text itself. Every module's commands are also in the action palette:
        press {showKey('Mod-/')} and type.
      </p>
      <p>Modules marked as needing AI use the key and model you set in Settings, in the project tab's menu.</p>
      <p>
        {count === 0
          ? 'No module is on in this pane yet. Turn one on and come back here for its walkthrough.'
          : `${count === 1 ? 'One module is' : `${count} modules are`} on here; pick one on the left for its walkthrough.`}
      </p>
    </>
  );
}

function ModuleHelp({ id, pane }: { id: string; pane: string | null }) {
  const summary = host.summary(id);
  const help = host.help(id);
  const actions = host.actions(pane).filter((a) => a.moduleId === id);
  return (
    <>
      <h2>{id}</h2>
      {summary && <p className="mwps-help-summary">{summary}</p>}
      {help ? <Blocks blocks={parseHelp(help)} /> : <p className="mwps-help-none">This module has no walkthrough yet.</p>}
      {actions.length > 0 && (
        <>
          <h3>In the action palette ({showKey('Mod-/')})</h3>
          <ul className="mwps-help-actions">
            {actions.map((a) => (
              <li key={a.name}>
                <span>{a.title}</span>
                {a.keys.length > 0 && <kbd>{a.keys.map(showKey).join(' ')}</kbd>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return blocks.map((b, i) => {
    if (b.kind === 'heading') return b.level === 2 ? <h3 key={i}>{inline(b.text)}</h3> : <h4 key={i}>{inline(b.text)}</h4>;
    if (b.kind === 'paragraph') return <p key={i}>{inline(b.text)}</p>;
    const items = b.items.map((it, j) => <li key={j}>{inline(it)}</li>);
    return b.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
  });
}

function inline(parts: Inline[]): ReactNode {
  return parts.map((p, i) => {
    if (p.kind === 'text') return <Fragment key={i}>{p.text}</Fragment>;
    if (p.kind === 'code') return <code key={i}>{p.text}</code>;
    if (p.kind === 'bold') return <strong key={i}>{inline(p.children)}</strong>;
    if (p.kind === 'italic') return <em key={i}>{inline(p.children)}</em>;
    const external = /^https?:\/\//.test(p.href);
    return external ? (
      <a key={i} href={p.href} target="_blank" rel="noreferrer">
        {inline(p.children)}
      </a>
    ) : (
      <Fragment key={i}>{inline(p.children)}</Fragment>
    );
  });
}
