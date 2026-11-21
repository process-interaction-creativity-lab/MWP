// The writer's settings: one file at the top of OPFS, outside every project
// (projects are its directories), so a key never travels with a project's
// files. What each module may use: AI, with its own key, address or models
// where the writer set them, and the project.

import type { Host } from '../core/host.js';
import { createStore } from '../core/store.js';
import { aiFor, aiFromLink, withLinkedAi, type DefaultAi, type ModuleSettings, type Settings } from './settings-data.js';
import { starter } from './starter.js';
import { readTopFile, writeTopFile } from './storage.js';

const FILE = 'settings.json';
// Where AI settings were kept before project access joined them.
const OLD_FILE = 'ai-settings.json';

const EMPTY: Settings = { ai: null, modules: {} };

const store = createStore<Settings>(EMPTY);
export const currentSettings = { get: store.get, subscribe: store.subscribe };

function apply(host: Host, settings: Settings): void {
  store.set(settings);
  host.setGrants((id) => ({ project: settings.modules[id]?.project !== false, ai: aiFor(settings, id) }));
}

// An `ai-settings.json` from before: `{ settings, modules: { id: { on, model } } }`.
function fromOld(old: { settings: DefaultAi | null; modules: Record<string, { on: boolean; model: string | null }> }): Settings {
  const modules: Record<string, ModuleSettings> = {};
  for (const [id, m] of Object.entries(old.modules ?? {})) modules[id] = { ai: m.on, model: m.model };
  return { ai: old.settings, modules };
}

export async function loadSettings(host: Host): Promise<void> {
  try {
    const text = await readTopFile(FILE);
    const old = text === null ? await readTopFile(OLD_FILE) : null;
    if (text !== null) apply(host, { ...EMPTY, ...(JSON.parse(text) as Settings) });
    else if (old !== null) apply(host, fromOld(JSON.parse(old)));
  } catch (error) {
    console.error('[mwps] could not read the settings:', error);
  }
  await takeLinkedAi(host);
}

// A demo's link can carry its AI settings (`?ai-key=…&ai-url=…&ai-model=…`),
// so a reviewer who clicks it gets a working app, the module creator
// included; the key is one made to leak, with its own limits. Only a build
// with a starter project (a preset's demo) takes them: elsewhere a link
// could point a writer's AI address, and so their writing, at someone
// else's server. Saved like settings set by hand. They stay in the address
// bar, so an address copied from it still opens a working demo.
async function takeLinkedAi(host: Host): Promise<void> {
  const linked = aiFromLink(location.search);
  if (!linked || !starter) return;
  try {
    await saveSettings(host, withLinkedAi(store.get(), linked));
  } catch (error) {
    console.error("[mwps] could not keep the link's AI settings:", error);
  }
}

// Replaces every setting, in the host at once and then on disk.
export async function saveSettings(host: Host, settings: Settings): Promise<void> {
  apply(host, settings);
  await writeTopFile(FILE, JSON.stringify(settings, null, 2));
}
