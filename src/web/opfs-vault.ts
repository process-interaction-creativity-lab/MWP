// Atomicity comes from OPFS: createWritable() writes a swap file that replaces
// the original only on close(), so a tab killed mid-write keeps the old content.
//
// The unload journal: an unloading page doesn't wait for an async OPFS write,
// so the pagehide flush alone loses whatever is inside the debounce window.
// localStorage is synchronous, so pending content is journaled there too and
// the next `open` replays it. An entry leaves as soon as that exact content
// lands in OPFS; replaying a stale one would roll a document back. Best
// effort: a journal over quota is skipped, and a renderer crash fires no
// pagehide.

import type { Vault } from '../core/vault/vault.js';
import { DebouncedDocWriter } from '../core/vault/debounced-writer.js';
import { assertVaultPath, assertVaultPrefix } from '../core/vault/path.js';

// OPFS reports a file-where-a-directory-was-expected (or the reverse) as
// TypeMismatchError; either way nothing is at that path.
function isAbsent(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'NotFoundError' || err.name === 'TypeMismatchError')
  );
}

const JOURNAL_PREFIX = 'mwps:vault-journal:';

type Journal = Record<string, string>;

export class OpfsVault implements Vault {
  private readonly writer: DebouncedDocWriter;

  constructor(
    private readonly root: FileSystemDirectoryHandle,
    private readonly journalKey: string,
    debounceMs?: number,
  ) {
    this.writer = new DebouncedDocWriter(async (path, content) => {
      await this.writeNow(path, content);
      this.forgetJournaled(path, content);
    }, debounceMs);
  }

  // Throws where the browser has no OPFS, or no createWritable (older Safari).
  static async open(name: string, debounceMs?: number): Promise<OpfsVault> {
    if (typeof navigator.storage?.getDirectory !== 'function') {
      throw new Error('this browser has no origin-private file system (OPFS)');
    }
    const origin = await navigator.storage.getDirectory();
    if (typeof FileSystemFileHandle.prototype.createWritable !== 'function') {
      throw new Error('this browser cannot write to the origin-private file system');
    }
    const vault = new OpfsVault(
      await origin.getDirectoryHandle(name, { create: true }),
      JOURNAL_PREFIX + name,
      debounceMs,
    );
    await vault.replayJournal();
    return vault;
  }

  async read(path: string): Promise<string | null> {
    assertVaultPath(path);
    const pending = this.writer.peek(path);
    if (pending !== undefined) return pending;
    try {
      const file = await this.fileHandle(path, false);
      return await (await file.getFile()).text();
    } catch (err) {
      if (isAbsent(err)) return null;
      throw err;
    }
  }

  async write(path: string, content: string): Promise<void> {
    assertVaultPath(path);
    this.writer.schedule(path, content);
  }

  async delete(path: string): Promise<void> {
    assertVaultPath(path);
    this.writer.discard(path);
    // A write already in flight would re-create the file after the removal.
    await this.writer.settled(path);
    const { dirs, name } = split(path);
    try {
      const dir = await this.dirHandle(dirs, false);
      await dir.removeEntry(name);
    } catch (err) {
      if (!isAbsent(err)) throw err;
    }
  }

  async list(prefix: string): Promise<string[]> {
    assertVaultPrefix(prefix);
    const dirPath = prefix.slice(0, prefix.lastIndexOf('/') + 1);
    const found = new Set<string>();
    let dir: FileSystemDirectoryHandle | null = null;
    try {
      dir = await this.dirHandle(dirPath.split('/').filter(Boolean), false);
    } catch (err) {
      if (!isAbsent(err)) throw err;
    }
    if (dir) {
      for (const rel of await walk(dir, dirPath)) if (rel.startsWith(prefix)) found.add(rel);
    }
    for (const p of this.writer.pendingPaths()) if (p.startsWith(prefix)) found.add(p);
    return [...found];
  }

  async flush(path?: string): Promise<void> {
    if (path === undefined) {
      await this.writer.flushAll();
      return;
    }
    assertVaultPath(path);
    await this.writer.flush(path);
  }

  // Journals synchronously before the async flush; see the header.
  flushOnHide(target: Window = window): () => void {
    const flush = (): void => {
      this.writeJournal(target.localStorage);
      void this.writer.flushAll().catch((err: unknown) => {
        console.error('[vault] flush on hide failed:', err);
      });
    };
    const onVisibility = (): void => {
      if (target.document.visibilityState === 'hidden') flush();
    };
    target.addEventListener('pagehide', flush);
    target.document.addEventListener('visibilitychange', onVisibility);
    return () => {
      target.removeEventListener('pagehide', flush);
      target.document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  // Replaces any earlier journal: whatever it held has landed or is pending again.
  private writeJournal(storage: Storage): void {
    const journal: Journal = {};
    for (const path of this.writer.pendingPaths()) {
      const content = this.writer.peek(path);
      if (content !== undefined) journal[path] = content;
    }
    try {
      if (Object.keys(journal).length === 0) storage.removeItem(this.journalKey);
      else storage.setItem(this.journalKey, JSON.stringify(journal));
    } catch (err) {
      // Over quota: the async flush is all there is.
      console.error('[vault] could not journal pending writes:', err);
    }
  }

  // Only on matching content: a newer journaled value must survive an older write landing.
  private forgetJournaled(path: string, content: string, storage: Storage = localStorage): void {
    const raw = storage.getItem(this.journalKey);
    if (raw === null) return;
    let journal: Journal;
    try {
      journal = JSON.parse(raw) as Journal;
    } catch {
      return;
    }
    if (journal[path] !== content) return;
    delete journal[path];
    if (Object.keys(journal).length === 0) storage.removeItem(this.journalKey);
    else storage.setItem(this.journalKey, JSON.stringify(journal));
  }

  // The journal holds each path's newest accepted content, so it wins over OPFS.
  private async replayJournal(storage: Storage = localStorage): Promise<void> {
    const raw = storage.getItem(this.journalKey);
    if (raw === null) return;
    let journal: Journal;
    try {
      journal = JSON.parse(raw) as Journal;
    } catch {
      console.error('[vault] discarding an unreadable unload journal');
      storage.removeItem(this.journalKey);
      return;
    }
    for (const [path, content] of Object.entries(journal)) {
      assertVaultPath(path);
      await this.writeNow(path, content);
    }
    storage.removeItem(this.journalKey);
  }

  private async writeNow(path: string, content: string): Promise<void> {
    const file = await this.fileHandle(path, true);
    const writable = await file.createWritable();
    try {
      await writable.write(content);
      await writable.close();
    } catch (err) {
      // Discard the swap file; the previous content stays in place.
      await writable.abort().catch(() => {});
      throw err;
    }
  }

  private async fileHandle(path: string, create: boolean): Promise<FileSystemFileHandle> {
    const { dirs, name } = split(path);
    const dir = await this.dirHandle(dirs, create);
    return dir.getFileHandle(name, { create });
  }

  private async dirHandle(segments: readonly string[], create: boolean): Promise<FileSystemDirectoryHandle> {
    let dir = this.root;
    for (const s of segments) dir = await dir.getDirectoryHandle(s, { create });
    return dir;
  }
}

function split(path: string): { dirs: string[]; name: string } {
  const segments = path.split('/');
  const name = segments.pop()!;
  return { dirs: segments, name };
}

async function walk(dir: FileSystemDirectoryHandle, rel: string): Promise<string[]> {
  const out: string[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory') out.push(...(await walk(handle, `${rel}${name}/`)));
    else out.push(`${rel}${name}`);
  }
  return out;
}
