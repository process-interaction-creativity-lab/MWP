// The module creator: a panel at the window's right where the writer asks
// for a module and an agent builds it (agent.ts), installed in this page
// once it checks. Opened from the toolbar.

import { Blocks, Download, RotateCcw, Square, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createStore } from '../../core/store.js';
import { Button } from '../../ui/components/button.js';
import { Textarea } from '../../ui/components/textarea.js';
import { host, lastFailure, openProjectNow } from '../host.js';
import { openSettings } from '../settings-dialog.js';
import { currentSettings } from '../settings.js';
import { showsNoDocument, writerTarget } from '../tabs.js';
import { creator, creatorModel, download, send, startOver, stop, type Entry } from './agent.js';

const openStore = createStore(false);

const EXAMPLES = [
  'Highlight every adverb ending in -ly',
  'A word count goal in the toolbar, with a progress bar',
  'A button that asks the AI for three possible titles for the document',
];

export function CreatorButton() {
  const open = useSyncExternalStore(openStore.subscribe, openStore.get);
  return (
    <Button variant={open ? 'secondary' : 'outline'} size="sm" className="mwps-creator-button" aria-pressed={open} onClick={() => openStore.set(!open)}>
      <Blocks />
      Create a module
    </Button>
  );
}

export function CreatorPanel() {
  const open = useSyncExternalStore(openStore.subscribe, openStore.get);
  const state = useSyncExternalStore(creator.subscribe, creator.get);
  useSyncExternalStore(currentSettings.subscribe, currentSettings.get);
  useSyncExternalStore(host.subscribe, () => host.version);
  const failure = useSyncExternalStore(lastFailure.subscribe, lastFailure.get);
  const [draft, setDraft] = useState('');
  const log = useRef<HTMLDivElement>(null);
  // The failure the writer has already asked about (or that came before this module).
  const [seen, setSeen] = useState(failure);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [state.entries.length, state.running]);

  if (!open) return null;
  const model = creatorModel();
  const { moduleId, running, entries } = state;
  const failed = failure && failure !== seen && failure.id === moduleId ? failure : null;
  const submit = (text: string) => {
    if (!text.trim() || running || !model) return;
    setDraft('');
    setSeen(failure);
    void send(text.trim());
  };
  const askToFix = () => {
    const error = failed!.error;
    const detail = error instanceof Error ? `${error.message}\n${(error.stack ?? '').split('\n').slice(1, 4).join('\n')}` : String(error);
    submit(`It stopped working in the app and was turned off. The app's error:\n\n${detail}\n\nPlease fix it.`);
  };

  return (
    <aside className="mwps-creator" aria-label="Create a module">
      <header className="mwps-creator-head">
        <h2>Create a module</h2>
        {entries.length > 0 && (
          <Button variant="ghost" size="icon" title="Start over" aria-label="Start over" onClick={startOver}>
            <RotateCcw />
          </Button>
        )}
        <Button variant="ghost" size="icon" title="Close" aria-label="Close" onClick={() => openStore.set(false)}>
          <X />
        </Button>
      </header>

      <div className="mwps-creator-log" ref={log}>
        {entries.length === 0 && (
          <div className="mwps-creator-intro">
            <p>Describe a new tool or interface design using natural language. AI will be used to generate code and create your design! Examples:</p>
            {EXAMPLES.map((text) => (
              <button key={text} type="button" className="mwps-creator-example" disabled={!model} onClick={() => submit(text)}>
                {text}
              </button>
            ))}
          </div>
        )}
        {entries.map((entry, i) => (
          <EntryView key={i} entry={entry} />
        ))}
        {running && <div className="mwps-creator-working">Working…</div>}
      </div>

      {failed && (
        <div className="mwps-creator-alert" role="alert">
          <span>
            {failed.id} stopped working: {failed.error instanceof Error ? failed.error.message : String(failed.error)}
          </span>
          <Button size="sm" onClick={askToFix} disabled={running}>
            Ask to fix
          </Button>
        </div>
      )}
      {moduleId && state.installed && !running && <ModuleBar id={moduleId} />}

      {model ? (
        <form
          className="mwps-creator-input"
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <Textarea
            value={draft}
            placeholder={moduleId ? 'Ask for a change…' : state.entries.length ? 'Your answer…' : 'What should the module do?'}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit(draft);
              }
            }}
          />
          {running ? (
            <Button type="button" variant="outline" onClick={stop}>
              <Square />
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!draft.trim()}>
              {state.entries.length ? 'Send' : 'Create'}
            </Button>
          )}
        </form>
      ) : (
        <div className="mwps-creator-input">
          <p>The module is built by your AI model. Set a key in Settings first.</p>
          <Button onClick={openSettings}>Open Settings</Button>
        </div>
      )}
    </aside>
  );
}

function EntryView({ entry }: { entry: Entry }) {
  switch (entry.kind) {
    case 'writer':
      return <div className="mwps-creator-writer">{entry.text}</div>;
    case 'agent':
      return <div className="mwps-creator-agent">{entry.text}</div>;
    case 'error':
      return <div className="mwps-creator-error">{entry.text}</div>;
    case 'step':
      return entry.detail === undefined ? (
        <div className="mwps-creator-step">{entry.text}</div>
      ) : (
        <details className="mwps-creator-step" data-failed={entry.failed || undefined}>
          <summary>{entry.text}</summary>
          <pre>{entry.detail}</pre>
        </details>
      );
  }
}

// The built module: turn it on where the writer is, or download its folder.
function ModuleBar({ id }: { id: string }) {
  const type = host.moduleType(id);
  const target = type === 'project' ? null : targetPane(type);
  const on = type === 'project' ? host.placedInProject().includes(id) : !!target && host.placed(target).includes(id);
  const turnOn = () => {
    if (type === 'project') {
      host.placeInProject(id);
      void openProjectNow()?.setProjectModules(host.placedInProject());
    } else if (target) host.place(target, id);
  };
  return (
    <div className="mwps-creator-module">
      <span>
        <strong>{id}</strong> is installed.
      </span>
      <Button size="sm" disabled={on || (type !== 'project' && !target)} onClick={turnOn}>
        {on ? 'On' : 'Turn on'}
      </Button>
      <Button size="sm" variant="outline" onClick={download} title="Download the module's folder as a zip">
        <Download />
        .zip
      </Button>
    </div>
  );
}

// The writer's pane the module would go on: the one they're in, else the
// first that can take it.
function targetPane(type: 'editorReplacement' | 'extension'): string | null {
  const fits = (id: string) => (type === 'editorReplacement' ? !showsNoDocument(id) : host.addOnsRun(id));
  const writers = host.slotIds().filter((id) => host.paneInfo(id)?.owner === 'writer');
  return [writerTarget(host.lastFocusedPane.get()), ...writers].find((id): id is string => !!id && fits(id)) ?? null;
}
