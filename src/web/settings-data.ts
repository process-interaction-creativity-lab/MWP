// The shape of the writer's settings, and the endpoint each module gets from
// them: plain data and a pure function, kept apart from settings.ts, which
// reads and writes them in OPFS.

import type { AiGrant } from '../core/host.js';

export interface ModuleSettings {
  // AI and project access are on unless turned off.
  ai?: boolean;
  project?: boolean;
  // Unset or empty: the default.
  model?: string | null;
  transcriptionModel?: string | null;
  imageModel?: string | null;
  key?: string | null;
  url?: string | null;
  // Added to the default's extra request fields, field by field.
  extra?: Record<string, unknown> | null;
}

// The writer's default AI endpoint. A transcription or image model left
// unset is OpenAI's name for one, which other endpoints may also take.
export interface DefaultAi {
  key: string;
  url: string;
  model: string;
  transcriptionModel?: string;
  imageModel?: string;
  extra?: Readonly<Record<string, unknown>>;
}

export const TRANSCRIPTION_MODEL = 'whisper-1';
export const IMAGE_MODEL = 'dall-e-3';

export interface Settings {
  ai: DefaultAi | null;
  modules: Record<string, ModuleSettings>;
}

// The endpoint behind a module's `ctx.ai`: present while a key is set (its
// own or the default) and the writer hasn't turned AI off for it; each of
// key, address and each model is its own where the writer set one.
export function aiFor(settings: Settings, moduleId: string): AiGrant | null {
  const mine = settings.modules[moduleId];
  const all = settings.ai;
  const key = mine?.key || all?.key;
  if (!key || mine?.ai === false) return null;
  const extra = { ...all?.extra, ...mine?.extra };
  return {
    key,
    url: mine?.url || all?.url || '',
    model: mine?.model || all?.model || '',
    transcriptionModel: mine?.transcriptionModel || all?.transcriptionModel || TRANSCRIPTION_MODEL,
    imageModel: mine?.imageModel || all?.imageModel || IMAGE_MODEL,
    ...(Object.keys(extra).length ? { extra } : {}),
  };
}

/** The AI settings a link gives (`?ai-key=…&ai-url=…&ai-model=…`), or null when it gives none. */
export function aiFromLink(search: string): Partial<Pick<DefaultAi, 'key' | 'url' | 'model'>> | null {
  const params = new URLSearchParams(search);
  const given: Partial<Pick<DefaultAi, 'key' | 'url' | 'model'>> = {};
  for (const [param, field] of [['ai-key', 'key'], ['ai-url', 'url'], ['ai-model', 'model']] as const) {
    const value = params.get(param)?.trim();
    if (value) given[field] = value;
  }
  return Object.keys(given).length ? given : null;
}

/** The settings with a link's AI settings over the default's, the rest kept. */
export function withLinkedAi(settings: Settings, linked: Partial<Pick<DefaultAi, 'key' | 'url' | 'model'>>): Settings {
  const ai = { key: '', url: '', model: '', ...settings.ai, ...linked };
  return { ...settings, ai };
}
