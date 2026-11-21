import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '../ui/components/button.js';
import { CreatorButton, CreatorPanel } from './creator/panel.js';
import { DocumentPicker } from './document-picker.js';
import { HelpButton } from './help-dialog.js';
import { ResetDemoButton } from './reset-demo.js';
import { host, setProject } from './host.js';
import { Modals, Toolbar } from './module-ui.js';
import { PaneView } from './pane-view.js';
import { Palette } from './palette.js';
import { askForProject, holdProject } from './project-lock.js';
import { openProject, type OpenProject } from './projects.js';
import { Saved } from '../core/saved.js';
import { lastProject, rememberProject } from './remember.js';
import { SettingsDialog } from './settings-dialog.js';
import { SideTabs } from './side-tabs.js';
import { showsNoDocument, TabRow, writerTarget } from './tabs.js';
import { starter } from './starter.js';
import { Toasts } from './toasts.js';

// A preset build opens its starter project first (starter.ts).
const DEFAULT_PROJECT = starter?.project ?? 'My project';
// The root pane; layouts add panes inside it.
const ROOT = 'main';

export function App() {
  const [projectName, setProjectName] = useState(() => lastProject() ?? DEFAULT_PROJECT);
  const [open, setOpen] = useState<OpenProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Why the project isn't shown here: another tab has it, this tab handed
  // it to another, or this tab is waiting for another to let go.
  const [away, setAway] = useState<'elsewhere' | 'moved' | 'waiting' | null>(null);
  // Bumped to ask the tab holding the project for it.
  const [takeOver, setTakeOver] = useState(0);
  // The last project's close, which ends with letting go of its lock.
  const closing = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    let opened: OpenProject | null = null;
    let release: (() => void) | null = null;
    const wait = takeOver > 0;
    setOpen(null);
    setAway(wait ? 'waiting' : null);
    // Another tab asked for the project: stop showing it, write out what
    // this tab has, and let go.
    const handOver = async () => {
      if (cancelled) return;
      cancelled = true;
      flushSync(() => {
        setOpen(null);
        setAway('moved');
      });
      await opened?.close();
      opened = null;
    };
    void (async () => {
      await closing.current;
      if (cancelled) return;
      if (wait) askForProject(projectName);
      const held = await holdProject(projectName, handOver, wait);
      if (cancelled) return held?.();
      if (!held) return setAway('elsewhere');
      release = held;
      const p = await openProject(projectName);
      if (cancelled) {
        await p.close();
        return held();
      }
      opened = p;
      rememberProject(projectName);
      setAway(null);
      setOpen(p);
    })().catch((err: unknown) => setError(String(err)));
    return () => {
      cancelled = true;
      const [p, r] = [opened, release];
      closing.current = (async () => {
        await p?.close();
        r?.();
      })();
    };
  }, [projectName, takeOver]);

  if (error) return <p className="mwps-error">Could not open the project: {error}</p>;
  return (
    <div className="mwps-app">
      <Toasts />
      <Palette />
      <SettingsDialog />
      {open ? (
        <ProjectView key={open.name} open={open} onPickProject={setProjectName} />
      ) : (
        <div className="mwps-main">
          <TabRow project={projectName} onPickProject={setProjectName} />
          {away && <ProjectAway project={projectName} away={away} onTakeOver={() => setTakeOver((n) => n + 1)} />}
        </div>
      )}
    </div>
  );
}

// The project is open in another tab: writing in both would overwrite one
// with the other, so this tab offers to take it over instead.
function ProjectAway({ project, away, onTakeOver }: { project: string; away: 'elsewhere' | 'moved' | 'waiting'; onTakeOver(): void }) {
  const said = {
    elsewhere: `“${project}” is open in another tab. Writing in both at once would lose work, so it opens in one tab at a time.`,
    moved: `“${project}” was opened in another tab, so this tab let go of it. Your writing is saved.`,
    waiting: `Waiting for the other tab to let go of “${project}”…`,
  }[away];
  return (
    <div className="mwps-away" role="status">
      <p>{said}</p>
      {away !== 'waiting' && <Button onClick={onTakeOver}>Use it in this tab</Button>}
    </div>
  );
}

function ProjectView({ open, onPickProject }: { open: OpenProject; onPickProject(name: string): void }) {
  const { project, name, saved } = open;
  const documents = useSyncExternalStore(project.subscribe, () => project.documents);
  useSyncExternalStore(host.subscribe, () => host.version);
  const focused = useSyncExternalStore(host.lastFocusedPane.subscribe, host.lastFocusedPane.get);

  // The root pane and the project modules live as long as the project is
  // open; the root comes back as saved, with everything inside it.
  useEffect(() => {
    setProject(project);
    host.setSaved(saved);
    host.setProjectDocuments(project.documents);
    const stop = project.subscribe(() => host.setProjectDocuments(project.documents));
    const docs = project.documents;
    const last = saved.pane(ROOT)?.document;
    const first = last === null ? null : (docs.find((d) => d.id === last) ?? docs[0]);
    host.openPane(ROOT, first?.id ?? null);
    const installed = host.moduleIds();
    const projectWide = project.projectModules.filter((id) => installed.includes(id) && host.moduleType(id) === 'project');
    for (const id of projectWide) host.placeInProject(id);
    return () => {
      stop();
      for (const id of projectWide) host.unplaceFromProject(id);
      host.removePane(ROOT);
      host.setSaved(Saved.empty());
      setProject(null);
    };
  }, [project, saved]);

  // The picker switches the innermost writer-owned pane on the focus path.
  const target = writerTarget(focused) ?? ROOT;
  const select = (id: string) => {
    if (!host.paneInfo(target)) return;
    host.showDocument(target, id);
  };
  const create = async (named: string) => {
    const entry = await project.createDocument(host.schema, named || `Untitled ${documents.length + 1}`);
    select(entry.id);
  };

  return (
    <div className="mwps-main">
      <TabRow project={name} onPickProject={onPickProject} />
      <Toolbar
        start={
          // A split shows no document of its own: no picker for it.
          !showsNoDocument(target) && (
            <DocumentPicker
              paneId={target}
              documents={documents}
              current={host.paneInfo(target)?.documentId ?? null}
              onPick={select}
              onCreate={(named) => void create(named)}
              onRename={(id, next) => void project.renameDocument(id, next)}
              onDelete={(id) => void project.deleteDocument(id)}
            />
          )
        }
        end={
          <>
            <CreatorButton />
            <ResetDemoButton />
            <HelpButton />
          </>
        }
      />
      <div className="mwps-body">
        <PaneView paneId={ROOT} />
        <SideTabs />
        <CreatorPanel />
      </div>
      <Modals />
    </div>
  );
}
