// The write-timing half of a Vault backend, shared by both hosts: `peek`
// lets reads see accepted writes, and `flush` resolves once they're durable.
//
// Writes to one path are chained, never concurrent: two overlapping
// temp-then-rename writes would share `<file>.tmp`. An in-flight write stays
// visible to `peek` / `flush`: it has left `pending` but isn't durable yet.

const DEFAULT_DEBOUNCE_MS = 500;

interface Pending {
  content: string;
  timer: ReturnType<typeof setTimeout>;
}

interface InFlight {
  content: string;
  done: Promise<void>;
}

export class DebouncedDocWriter {
  private readonly pending = new Map<string, Pending>();
  private readonly inFlight = new Map<string, InFlight>();

  constructor(
    // The backend's atomic write.
    private readonly write: (filePath: string, content: string) => Promise<void>,
    private readonly debounceMs: number = DEFAULT_DEBOUNCE_MS,
  ) {}

  schedule(filePath: string, content: string): void {
    const existing = this.pending.get(filePath);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      this.start(filePath)?.catch((err: unknown) => {
        // The schedule() caller has already returned, so log.
        console.error('[vault] debounced write failed:', err);
      });
    }, this.debounceMs);
    this.pending.set(filePath, { content, timer });
  }

  // Pending or in-flight content; undefined if the disk is current.
  peek(filePath: string): string | undefined {
    return this.pending.get(filePath)?.content ?? this.inFlight.get(filePath)?.content;
  }

  // A write already in flight can't be recalled; await `settled` for it.
  discard(filePath: string): void {
    const p = this.pending.get(filePath);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(filePath);
  }

  // Resolves once no write to the path is in flight. Never rejects — a
  // failed write has already been reported to whoever was awaiting it.
  async settled(filePath: string): Promise<void> {
    await this.inFlight.get(filePath)?.done.catch(() => {});
  }

  // Also waits for a write already in flight when called.
  async flush(filePath: string): Promise<void> {
    await (this.start(filePath) ?? this.inFlight.get(filePath)?.done);
  }

  async flushAll(): Promise<void> {
    await Promise.all(this.pendingPaths().map((p) => this.flush(p)));
  }

  // Every path with a write not yet on disk (Vault.list includes them).
  pendingPaths(): string[] {
    return [...new Set([...this.pending.keys(), ...this.inFlight.keys()])];
  }

  hasPending(filePath?: string): boolean {
    if (filePath !== undefined) {
      return this.pending.has(filePath) || this.inFlight.has(filePath);
    }
    return this.pending.size > 0 || this.inFlight.size > 0;
  }

  // undefined if nothing was pending.
  private start(filePath: string): Promise<void> | undefined {
    const p = this.pending.get(filePath);
    if (!p) return undefined;
    clearTimeout(p.timer);
    this.pending.delete(filePath);

    // Chain behind any write still in flight; a failed predecessor must not
    // skip this one.
    const prev = this.inFlight.get(filePath)?.done.catch(() => {}) ?? Promise.resolve();
    const done = prev.then(() => this.write(filePath, p.content));
    this.inFlight.set(filePath, { content: p.content, done });
    const clear = (): void => {
      if (this.inFlight.get(filePath)?.done === done) this.inFlight.delete(filePath);
    };
    // Two-argument then, not finally: finally's promise would re-reject and
    // surface as an unhandled rejection for a write whose caller handles it.
    done.then(clear, clear);
    return done;
  }
}
