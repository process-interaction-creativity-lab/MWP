// Where the page keeps things: the origin-private file system (OPFS);
// a scratch tab's session storage (scratch.ts); or memory where the browser
// has no OPFS (Firefox private windows). Decided once, at first use;
// projects.ts and settings.ts go through here. In memory mode nothing
// survives the page, so leaving it asks the browser's confirmation.

import { memoryKeyStore } from '../core/vault/keyed.js';
import { scratchKey, scratchStore } from './scratch.js';

const origin: Promise<FileSystemDirectoryHandle | null> = (async () => {
  if (scratchStore) return null;
  try {
    if (typeof navigator.storage?.getDirectory !== 'function') return null;
    if (typeof FileSystemFileHandle.prototype.createWritable !== 'function') return null;
    const root = await navigator.storage.getDirectory();
    if (resetAsked()) await reset(root);
    return root;
  } catch {
    return null;
  }
})();

// "Reset demo" (reset-demo.tsx) empties the page's storage on the next load,
// not this one: as this page unloads it saves pending edits, which would
// bring a project deleted now straight back. Everything goes but the
// writer's settings (their AI key and model). Every project, the module
// values and the remembered last project go, so the app opens the starter
// project fresh. Nothing opens storage before this runs: everything asks
// for the root first.
const RESET = 'mwps:reset';
const KEPT = ['settings.json', 'ai-settings.json'];

/** Reloads the page with its storage emptied, but for the writer's settings. */
export function resetOnReload(): void {
  try {
    localStorage.setItem(RESET, '1');
  } catch {
    // Without localStorage there's no OPFS either: the reload alone empties memory.
  }
  location.reload();
}

function resetAsked(): boolean {
  try {
    return localStorage.getItem(RESET) === '1';
  } catch {
    return false;
  }
}

async function reset(root: FileSystemDirectoryHandle): Promise<void> {
  const names: string[] = [];
  for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
  for (const name of names) if (!KEPT.includes(name)) await root.removeEntry(name, { recursive: true });
  // The unload journals and the last project open, then the request itself.
  for (const key of Object.keys(localStorage)) if (key.startsWith('mwps:')) localStorage.removeItem(key);
}

/** The OPFS root, or null in memory mode. */
export async function opfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  const root = await origin;
  if (!root && !scratchStore && !warned) {
    warned = true;
    window.addEventListener('beforeunload', (event) => event.preventDefault());
  }
  return root;
}
let warned = false;

// Top files without OPFS.
const pageFiles = scratchStore ?? memoryKeyStore();
const fileKey = (name: string) => scratchKey(`file/${name}`);

/** A file at the top of the store: its text, or null if absent. */
export async function readTopFile(name: string): Promise<string | null> {
  const root = await opfsRoot();
  if (!root) return pageFiles.getItem(fileKey(name));
  try {
    return await (await (await root.getFileHandle(name)).getFile()).text();
  } catch {
    return null;
  }
}

/** Removes a file at the top of the store; absent is not an error. */
export async function removeTopFile(name: string): Promise<void> {
  const root = await opfsRoot();
  if (!root) {
    pageFiles.removeItem(fileKey(name));
    return;
  }
  try {
    await root.removeEntry(name);
  } catch {
    // Not there.
  }
}

export async function writeTopFile(name: string, text: string): Promise<void> {
  const root = await opfsRoot();
  if (!root) {
    pageFiles.setItem(fileKey(name), text);
    return;
  }
  const writable = await (await root.getFileHandle(name, { create: true })).createWritable();
  await writable.write(text);
  await writable.close();
}
