// ---------------------------------------------------------------------------
// Vault
//
// Paths are '/'-separated, relative to the project root, with no leading '/'
// and no '..' segment; backends reject anything else.
//
// `write` resolves once the host has accepted the content, which need not
// mean it is on disk. Reads see accepted writes. When `flush` resolves, every
// write accepted before it was called is durable.
// ---------------------------------------------------------------------------

export interface Vault {
  // null if nothing is there. Sees pending writes.
  read(path: string): Promise<string | null>;
  // Creates parents. Atomic once durable: a crash mid-write leaves the
  // previous content, never a torn file.
  write(path: string, content: string): Promise<void>;
  // Discards any pending write to `path`. Absent is not an error.
  delete(path: string): Promise<void>;
  // `prefix` is directory-like ('modules/foo/'; '' lists everything).
  // Includes pending writes. Order is unspecified.
  list(prefix: string): Promise<string[]>;
  // One path's writes, or with no argument all of them.
  flush(path?: string): Promise<void>;
}
