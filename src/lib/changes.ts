// The commit log, imported by modules as `mwps/changes`: carries facts about
// each transaction from a plugin's `apply`, where the transactions are, to
// its view's `update`, where acting is allowed, handing each over once.

import type { EditorState, StateField, Transaction } from 'prosemirror-state';

/** What `commitLog` keeps in plugin state. */
export interface CommitLog<E> {
  /** How many entries have been logged since the state started. */
  readonly seq: number;
  /** The last entries (at most `KEEP`), oldest first. */
  readonly entries: readonly { readonly seq: number; readonly entry: E }[];
}

/** How many entries the log keeps. A reader that falls further behind loses
 *  the oldest; one change rarely makes more than a few. */
export const KEEP = 256;

/** A plugin state that logs `pick(tr)` for each transaction, skipping
 *  `null`. Pure, as `apply` must be:
 *    const deletions = new PluginKey<CommitLog<string[]>>('deletions');
 *    documentPlugin({ key: deletions, state: commitLog(deletedWords), view: … });
 *  `pick` sees every transaction the state applies, received ones
 *  included; filter with `authorOf`, `historyKind` and `tr.docChanged`. */
export function commitLog<E>(pick: (tr: Transaction) => E | null): StateField<CommitLog<E>> {
  return {
    init: () => ({ seq: 0, entries: [] }),
    apply(tr, log) {
      const entry = pick(tr);
      if (entry === null) return log;
      const seq = log.seq + 1;
      return { seq, entries: [...log.entries.slice(1 - KEEP), { seq, entry }] };
    },
  };
}

/** For a plugin view: a function that returns the entries logged since it
 *  last ran, each once. It starts at `state`, so a view made afresh (the
 *  plugin set changed) doesn't read old entries again:
 *    view: (v) => {
 *      const read = reader((s) => deletions.getState(s)!, v.state);
 *      return { update: (v) => tally(read(v.state).flat()) };
 *    }
 *  It keeps its own count and never compares with `update`'s `prevState`,
 *  which may be more than one change old. */
export function reader<E>(get: (state: EditorState) => CommitLog<E>, state: EditorState): (now: EditorState) => E[] {
  let seen = get(state).seq;
  return (now) => {
    const log = get(now);
    const fresh = log.entries.filter((x) => x.seq > seen).map((x) => x.entry);
    seen = log.seq;
    return fresh;
  };
}
