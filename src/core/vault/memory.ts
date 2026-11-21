// Models durability rather than skipping it: writes reach `durable` only on
// flush, so a test can assert something was flushed, not just written.

import type { Vault } from './vault.js';
import { assertVaultPath, assertVaultPrefix } from './path.js';

export class MemoryVault implements Vault {
  private readonly visible: Map<string, string>;
  private readonly dirty = new Set<string>();

  constructor(private readonly durable: Map<string, string> = new Map()) {
    this.visible = new Map(durable);
  }

  async read(path: string): Promise<string | null> {
    assertVaultPath(path);
    return this.visible.get(path) ?? null;
  }

  async write(path: string, content: string): Promise<void> {
    assertVaultPath(path);
    this.visible.set(path, content);
    this.dirty.add(path);
  }

  async delete(path: string): Promise<void> {
    assertVaultPath(path);
    this.visible.delete(path);
    this.dirty.delete(path);
    this.durable.delete(path);
  }

  async list(prefix: string): Promise<string[]> {
    assertVaultPrefix(prefix);
    return [...this.visible.keys()].filter((p) => p.startsWith(prefix));
  }

  async flush(path?: string): Promise<void> {
    if (path !== undefined) assertVaultPath(path);
    const paths = path === undefined ? [...this.dirty] : this.dirty.has(path) ? [path] : [];
    for (const p of paths) {
      this.durable.set(p, this.visible.get(p)!);
      this.dirty.delete(p);
    }
  }

  // What a restart would see: the durable state, with pending writes lost.
  reopen(): MemoryVault {
    return new MemoryVault(this.durable);
  }

  // Test introspection: the durable content at a path, or null.
  durableContent(path: string): string | null {
    return this.durable.get(path) ?? null;
  }
}
