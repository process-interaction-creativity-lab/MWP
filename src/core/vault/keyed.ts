// A vault over a synchronous key-value store (a tab's session storage):
// each path is one key under `prefix`. A write lands at once, so it is
// durable when accepted and flush has nothing to do; a full store makes
// the write reject.

import { assertVaultPath, assertVaultPrefix } from './path.js';
import type { Vault } from './vault.js';

export type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export function keysOf(store: KeyStore): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
}

// A KeyStore in memory, for tests and tabs without session storage.
export function memoryKeyStore(): KeyStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

export class KeyedVault implements Vault {
  constructor(
    private readonly store: KeyStore,
    private readonly prefix: string,
  ) {}

  async read(path: string): Promise<string | null> {
    assertVaultPath(path);
    return this.store.getItem(this.prefix + path);
  }

  async write(path: string, content: string): Promise<void> {
    assertVaultPath(path);
    this.store.setItem(this.prefix + path, content);
  }

  async delete(path: string): Promise<void> {
    assertVaultPath(path);
    this.store.removeItem(this.prefix + path);
  }

  async list(prefix: string): Promise<string[]> {
    assertVaultPrefix(prefix);
    const start = this.prefix + prefix;
    return keysOf(this.store)
      .filter((key) => key.startsWith(start))
      .map((key) => key.slice(this.prefix.length));
  }

  async flush(path?: string): Promise<void> {
    if (path !== undefined) assertVaultPath(path);
  }
}
