// A build from a preset (src/bundle/preset.ts) carries a starter project:
// its documents and layout, as the files of a project's vault. The app opens
// it when nothing else was open last, and a project of that name that has
// no files yet starts from them: the first visit, or after the browser
// cleared its storage. Once there, it is the writer's like any other.

import type { Vault } from '../core/vault/vault.js';
import { trial } from './scratch.js';

declare const __MWPS_STARTER__: { project: string; files: Record<string, string> } | null;

export const starter = trial ? null : __MWPS_STARTER__;

// A project that already has files is never touched.
export async function seedStarter(name: string, vault: Vault): Promise<void> {
  if (!starter || name !== starter.project) return;
  if ((await vault.list('')).length) return;
  for (const [path, content] of Object.entries(starter.files)) await vault.write(path, content);
  await vault.flush();
}
