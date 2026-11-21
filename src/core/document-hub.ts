// The shared copy of one open document: prosemirror-collab's central
// authority, as a plain step log in memory.
//
// Every copy of the document pulls from the hub by version. After the log
// grows, every copy catches up in rank order (the document state, then
// panes, then cards), and nothing runs but ProseMirror's pure `apply`.
// Only then, at rest, does anything react: the host first brings its lists
// of cards up to date, then views draw (and their plugin views update),
// and listeners hear. A reaction may edit; that
// edit is an ordinary one, since everything it can see is current.

import type { Node } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { Step } from 'prosemirror-transform';
import { Listeners } from './store.js';
import { AUTHOR, historyKind, rootOf, type HistoryKind } from './wrap-plugin.js';

export const REACTION_CAP = 100;

// Host-wide: how deep we are inside an `apply` or a catch-up (`applying`),
// and inside reactions (`reacting`). Zero applying is rest.
export interface Busy {
  applying: number;
  reacting: number;
  // At rest, after reactions: the host brings plugin sets and value
  // redraws up to date.
  flush(): void;
}

export interface HubClient {
  // 0 the document state, 1 a pane, 2 and up a card (one more than its parent).
  readonly rank: number;
  // Pure: pull what it hasn't seen, and send what it hasn't sent.
  sync(): void;
  // Pure: a new state with no steps, so its decorations recompute.
  refresh(): void;
  // At rest: draw and tell listeners, if its state changed since.
  react(): void;
}

// `author`: a module's id, or null for the writer's.
export interface LogEntry {
  step: Step;
  clientID: string | number;
  author: string | null;
  kind: HistoryKind;
}

export class DocumentHub {
  private log: LogEntry[] = [];
  private readonly clients = new Set<HubClient>();
  private readonly listeners = new Listeners();
  private readonly rest = new Listeners();
  private heard = 0;
  private settling = 0;
  // Edits made from reactions to one change, which stops a runaway loop.
  private reactionEdits = 0;

  constructor(
    readonly id: string,
    private current: Node,
    // Set when the document doesn't fit the schema: its copies are read-only
    // and it isn't saved.
    public problem: string | null,
    private readonly busy: Busy,
  ) {}

  get doc(): Node {
    return this.current;
  }

  get version(): number {
    return this.log.length;
  }

  // At rest, after every commit, with the new document.
  subscribe = this.listeners.subscribe;

  // At rest, before anything reacts: the host's own bookkeeping.
  beforeReactions = this.rest.subscribe;

  attach(client: HubClient): () => void {
    this.clients.add(client);
    return () => this.clients.delete(client);
  }

  stepsSince(version: number): readonly LogEntry[] {
    return this.log.slice(version);
  }

  // Collab's contract: steps from a client at an older version are ignored,
  // and the client resends after it has received what it missed.
  // `origins` holds each step's original transaction; a module's id on it
  // is the step's author, and its root's undo or redo is the step's kind.
  receive(version: number, steps: readonly Step[], clientID: string | number, origins: readonly Transaction[]): boolean {
    if (version !== this.version || steps.length === 0) return false;
    let doc = this.current;
    for (const step of steps) {
      const result = step.apply(doc);
      if (!result.doc) return false;
      doc = result.doc;
    }
    this.current = doc;
    steps.forEach((step, i) => {
      const root = rootOf(origins[i]!);
      const author = (root.getMeta(AUTHOR) as string | undefined) ?? null;
      this.log.push({ step, clientID, author, kind: historyKind(root) });
    });
    this.catchUp();
    return true;
  }

  // A fresh start under a new schema: the log restarts, so every client
  // must be rebuilt from `doc`.
  reset(doc: Node, problem: string | null): void {
    this.current = doc;
    this.problem = problem;
    this.log = [];
    this.heard = 0;
  }

  // Every copy, in rank order. Nothing edits during a catch-up, so no
  // client sends while others receive; if one did, it would only pull more.
  private catchUp(): void {
    this.busy.applying++;
    try {
      for (const client of this.ranked()) client.sync();
    } finally {
      this.busy.applying--;
    }
  }

  private ranked(): HubClient[] {
    return [...this.clients].sort((a, b) => a.rank - b.rank);
  }

  // The document state changed with no steps (a module's meta): every other
  // copy gets a new state too, so it redraws when everything reacts.
  refreshCopies(from: HubClient): void {
    this.busy.applying++;
    try {
      for (const client of this.ranked()) if (client !== from) client.refresh();
    } finally {
      this.busy.applying--;
    }
  }

  // Called before an edit is applied in one of its copies.
  checkEdit(): void {
    if (this.settling > 0 && ++this.reactionEdits > REACTION_CAP) {
      throw new Error(`edits made from reactions to one change passed ${REACTION_CAP}; stopped as a runaway loop`);
    }
  }

  // Reactions, once every copy has caught up: each copy draws and tells its
  // listeners, in rank order; then the document's listeners. An edit made
  // here settles within, so the loops below find most things already done.
  settle(): void {
    if (this.busy.applying > 0) return;
    this.settling++;
    try {
      this.rest.notify();
      for (const client of this.ranked()) client.react();
      if (this.heard !== this.version) {
        this.heard = this.version;
        this.listeners.notify();
      }
    } finally {
      this.settling--;
    }
    if (this.settling === 0) this.reactionEdits = 0;
  }
}

// Log entries in runs of one client, author and kind, so a received edit
// never mixes them.
export function runsOf(entries: readonly LogEntry[]): LogEntry[][] {
  const runs: LogEntry[][] = [];
  for (const entry of entries) {
    const last = runs.at(-1)?.[0];
    const same = last && last.clientID === entry.clientID && last.author === entry.author && last.kind === entry.kind;
    if (same) runs.at(-1)!.push(entry);
    else runs.push([entry]);
  }
  return runs;
}
