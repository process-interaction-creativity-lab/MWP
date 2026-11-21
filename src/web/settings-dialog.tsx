// The Settings dialog, from the project tab's menu: the writer's default AI
// endpoint, and per module what it may use. A module is listed once it has
// asked for AI or the project this session, or has settings of its own.

import { useState, useSyncExternalStore } from 'react';
import { Button } from '../ui/components/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/components/dialog.js';
import { Input } from '../ui/components/input.js';
import { Switch } from '../ui/components/switch.js';
import { Textarea } from '../ui/components/textarea.js';
import { createStore } from '../core/store.js';
import { host } from './host.js';
import { currentSettings, saveSettings } from './settings.js';
import { IMAGE_MODEL, TRANSCRIPTION_MODEL, type DefaultAi, type ModuleSettings, type Settings } from './settings-data.js';

const openStore = createStore(false);
export const openSettings = () => openStore.set(true);

export function SettingsDialog() {
  const open = useSyncExternalStore(openStore.subscribe, openStore.get);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  // Extra-fields boxes whose text isn't a JSON object yet; Save waits for them.
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const validity = (field: string) => (ok: boolean) =>
    setInvalid((was) => {
      const next = new Set(was);
      if (ok) next.delete(field);
      else next.add(field);
      return next;
    });
  // A fresh draft each time it opens; nothing is saved until Save.
  if (open && !draft) setDraft(structuredClone(currentSettings.get()));
  if (!open && draft) {
    setDraft(null);
    setInvalid(new Set());
  }
  const close = () => openStore.set(false);
  if (!draft) return null;

  const ai: DefaultAi = draft.ai ?? { key: '', url: '', model: '' };
  const setAi = (change: Partial<DefaultAi>) => setDraft({ ...draft, ai: { ...ai, ...change } });
  const setModule = (id: string, change: ModuleSettings) =>
    setDraft({ ...draft, modules: { ...draft.modules, [id]: { ...draft.modules[id], ...change } } });
  const listed = host
    .moduleIds()
    .filter((id) => host.grantsAsked(id).size > 0 || draft.modules[id])
    .sort();

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="mwps-settings">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Kept on this computer, outside every project, so a key never travels with a project.</DialogDescription>
        </DialogHeader>
        <section aria-labelledby="mwps-settings-ai">
          <h3 id="mwps-settings-ai" className="mwps-settings-heading">AI, for every module</h3>
          <div className="mwps-settings-fields">
            <label htmlFor="mwps-ai-key">Key</label>
            <Input id="mwps-ai-key" type="password" autoComplete="off" data-1p-ignore data-lpignore="true" value={ai.key} onChange={(e) => setAi({ key: e.target.value })} />
            <label htmlFor="mwps-ai-url">Address</label>
            <Input id="mwps-ai-url" placeholder="https://api.openai.com/v1" value={ai.url} onChange={(e) => setAi({ url: e.target.value })} />
            <label htmlFor="mwps-ai-model">Model</label>
            <Input id="mwps-ai-model" value={ai.model} onChange={(e) => setAi({ model: e.target.value })} />
            <label htmlFor="mwps-ai-transcription-model">Transcription model</label>
            <Input
              id="mwps-ai-transcription-model"
              placeholder={TRANSCRIPTION_MODEL}
              value={ai.transcriptionModel ?? ''}
              onChange={(e) => setAi({ transcriptionModel: e.target.value || undefined })}
            />
            <label htmlFor="mwps-ai-image-model">Image model</label>
            <Input
              id="mwps-ai-image-model"
              placeholder={IMAGE_MODEL}
              value={ai.imageModel ?? ''}
              onChange={(e) => setAi({ imageModel: e.target.value || undefined })}
            />
            <label htmlFor="mwps-ai-extra">Extra fields</label>
            <ExtraFields
              id="mwps-ai-extra"
              value={ai.extra}
              placeholder={'Added to every chat request, e.g. {"reasoning": {"effort": "none"}}'}
              onChange={(extra) => setAi({ extra })}
              onValidity={validity('default')}
            />
          </div>
        </section>
        <section aria-labelledby="mwps-settings-modules">
          <h3 id="mwps-settings-modules" className="mwps-settings-heading">Modules</h3>
          {listed.length === 0 && <p className="mwps-settings-empty">No module has asked for AI or the project yet.</p>}
          {listed.map((id) => (
            <ModuleRow
              key={id}
              id={id}
              mine={draft.modules[id] ?? {}}
              fallback={ai}
              onChange={(c) => setModule(id, c)}
              onValidity={validity(id)}
            />
          ))}
        </section>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={saving || invalid.size > 0}
            onClick={async () => {
              // Closes once the settings are on disk, so a reload right after keeps them.
              setSaving(true);
              try {
                await saveSettings(host, { ...draft, ai: ai.key || ai.url || ai.model || ai.transcriptionModel || ai.imageModel ? ai : null });
                close();
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModuleRow({
  id,
  mine,
  fallback,
  onChange,
  onValidity,
}: {
  id: string;
  mine: ModuleSettings;
  fallback: DefaultAi;
  onChange(change: ModuleSettings): void;
  onValidity(ok: boolean): void;
}) {
  const asked = host.grantsAsked(id);
  const own = !!(mine.key || mine.url || mine.transcriptionModel || mine.imageModel || mine.extra);
  const showsAi = asked.has('ai') || mine.ai !== undefined || !!mine.model || own;
  const byDefault = (value: string | undefined) => (value ? `Default (${value})` : 'Default');
  const showsProject = asked.has('project') || mine.project !== undefined;
  return (
    <div className="mwps-settings-module" data-settings-module={id}>
      <div className="mwps-settings-name">{id}</div>
      {showsAi && (
        <div className="mwps-settings-line">
          <label htmlFor={`mwps-ai-on-${id}`}>AI</label>
          <Switch id={`mwps-ai-on-${id}`} checked={mine.ai !== false} onCheckedChange={(on) => onChange({ ai: on })} />
          <Input
            aria-label={`Model for ${id}`}
            placeholder={byDefault(fallback.model)}
            value={mine.model ?? ''}
            onChange={(e) => onChange({ model: e.target.value || null })}
          />
        </div>
      )}
      {showsAi && (
        <details className="mwps-settings-own" open={own}>
          <summary>Its own key, address, models and extra fields</summary>
          <div className="mwps-settings-fields">
            <label htmlFor={`mwps-ai-key-${id}`}>Key</label>
            <Input
              id={`mwps-ai-key-${id}`}
              type="password"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              placeholder="Default"
              value={mine.key ?? ''}
              onChange={(e) => onChange({ key: e.target.value || null })}
            />
            <label htmlFor={`mwps-ai-url-${id}`}>Address</label>
            <Input
              id={`mwps-ai-url-${id}`}
              placeholder="Default"
              value={mine.url ?? ''}
              onChange={(e) => onChange({ url: e.target.value || null })}
            />
            <label htmlFor={`mwps-ai-transcription-model-${id}`}>Transcription model</label>
            <Input
              id={`mwps-ai-transcription-model-${id}`}
              placeholder={byDefault(fallback.transcriptionModel || TRANSCRIPTION_MODEL)}
              value={mine.transcriptionModel ?? ''}
              onChange={(e) => onChange({ transcriptionModel: e.target.value || null })}
            />
            <label htmlFor={`mwps-ai-image-model-${id}`}>Image model</label>
            <Input
              id={`mwps-ai-image-model-${id}`}
              placeholder={byDefault(fallback.imageModel || IMAGE_MODEL)}
              value={mine.imageModel ?? ''}
              onChange={(e) => onChange({ imageModel: e.target.value || null })}
            />
            <label htmlFor={`mwps-ai-extra-${id}`}>Extra fields</label>
            <ExtraFields
              id={`mwps-ai-extra-${id}`}
              value={mine.extra ?? undefined}
              placeholder="Added to the default's, field by field"
              onChange={(extra) => onChange({ extra: extra ?? null })}
              onValidity={onValidity}
            />
          </div>
        </details>
      )}
      {showsProject && (
        <div className="mwps-settings-line">
          <label htmlFor={`mwps-project-${id}`}>Project</label>
          <Switch id={`mwps-project-${id}`} checked={mine.project !== false} onCheckedChange={(on) => onChange({ project: on })} />
          <span className="mwps-settings-hint">Read, create and change any document in the project</span>
        </div>
      )}
    </div>
  );
}

// A JSON object typed by hand. The text is the box's own until it parses,
// so a half-typed object doesn't reach the draft; empty means none.
function ExtraFields({
  id,
  value,
  placeholder,
  onChange,
  onValidity,
}: {
  id: string;
  value: Readonly<Record<string, unknown>> | undefined;
  placeholder: string;
  onChange(extra: Record<string, unknown> | undefined): void;
  onValidity(ok: boolean): void;
}) {
  const [text, setText] = useState(() => (value ? JSON.stringify(value) : ''));
  const parsed = parseObject(text);
  return (
    <div className="mwps-settings-extra">
      <Textarea
        id={id}
        rows={2}
        spellCheck={false}
        placeholder={placeholder}
        value={text}
        aria-invalid={parsed === false || undefined}
        aria-describedby={parsed === false ? `${id}-error` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const next = parseObject(e.target.value);
          onValidity(next !== false);
          if (next !== false) onChange(next);
        }}
      />
      {parsed === false && (
        <p id={`${id}-error`} className="mwps-settings-error">
          Not a JSON object yet, such as {'{"reasoning": {"effort": "none"}}'}.
        </p>
      )}
    </div>
  );
}

// The object in `text`, `undefined` for blank text, `false` for anything else.
function parseObject(text: string): Record<string, unknown> | undefined | false {
  if (!text.trim()) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : false;
  } catch {
    return false;
  }
}
