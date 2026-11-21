// A page opened with `?modules=a,b` loads only those modules and is a
// scratch tab: what it keeps (projects, module values, settings, the last
// project open) goes to this tab's session storage, never to OPFS or
// localStorage. It survives a reload, goes with the tab, and never touches
// the writer's own projects. Opening another module set starts it over.

import { type KeyStore, keysOf, memoryKeyStore } from '../core/vault/keyed.js';

// The ids a `?modules=` names, or null when the URL has none.
export function parseModules(search: string): Set<string> | null {
  const list = new URLSearchParams(search).get('modules');
  return list === null ? null : new Set(list.split(',').map((id) => id.trim()).filter(Boolean));
}

export const onlyModules: ReadonlySet<string> | null = parseModules(location.search);

// `?modules=&trial`: the module creator's trial run (creator/trial.ts), a
// scratch page in a hidden frame that keeps everything in memory, so it
// never touches the tab's own session storage, and opens no starter project.
export const trial = !!onlyModules && new URLSearchParams(location.search).has('trial');

const PREFIX = 'mwps-scratch:';
const SET = `${PREFIX}modules`;

// A name for something kept in the scratch store.
export const scratchKey = (name: string) => PREFIX + name;

// Session storage, emptied if it held another module set; memory where the
// tab has no session storage. Null on an ordinary page.
export const scratchStore: KeyStore | null = onlyModules && (trial ? memoryKeyStore() : start(onlyModules));

function start(only: ReadonlySet<string>): KeyStore {
  let store: KeyStore;
  try {
    store = sessionStorage;
    void store.length;
  } catch {
    return memoryKeyStore();
  }
  const set = [...only].sort().join(',');
  if (store.getItem(SET) !== set) {
    for (const key of keysOf(store)) if (key.startsWith(PREFIX)) store.removeItem(key);
    store.setItem(SET, set);
  }
  return store;
}

const VAULTS = scratchKey('vault/');

// The scratch store's key prefix for a project's vault.
export const scratchVaultPrefix = (name: string) => `${VAULTS}${encodeURIComponent(name)}/`;

// Every vault the scratch store holds files for.
export function scratchVaultNames(): string[] {
  if (!scratchStore) return [];
  const names = new Set<string>();
  for (const key of keysOf(scratchStore)) {
    if (key.startsWith(VAULTS)) names.add(decodeURIComponent(key.slice(VAULTS.length).split('/')[0]!));
  }
  return [...names];
}
