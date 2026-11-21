// What the module records: one entry per edit of the writer's own, kept in
// the document plugin's state (where the transactions are), plus the session's
// paragraph visits. The totals that outlive a session are added up in the
// plugin view, in `index.tsx`.

import type { Node } from 'prosemirror-model';
import type { StateField, Transaction } from 'prosemirror-state';
import { AddMarkStep, ReplaceStep } from 'prosemirror-transform';
import { authorOf, historyKind } from 'mwps';
import { commitLog, type CommitLog } from 'mwps/changes';

/** A deletion this many characters wide, with less than half put back. */
export const BIG_DELETE = 30;
/** A step that removes and puts back at least this much is a rewrite. */
export const REWRITE = 4;
/** Paragraphs returned to this often are "revisited". */
export const REVISITED = 3;
const MAX_TRACKED = 200;

/** One edit of the writer's, reduced to what the totals need. */
export interface Entry {
  /** Undo or redo: counted as an undo, and as nothing else. */
  readonly undo: boolean;
  readonly inserted: number;
  readonly deleted: number;
  readonly bigDeletes: number;
  readonly rewrites: number;
  readonly marks: readonly string[];
}

/** The writer's own edit as an entry, or `null` for anything else (another
 *  module's, a restore, a selection change). A follow-up another module
 *  makes within the writer's edit has the writer as its author. */
export function observe(tr: Transaction): Entry | null {
  if (!tr.docChanged || authorOf(tr) !== 'user') return null;
  if (historyKind(tr)) return { undo: true, inserted: 0, deleted: 0, bigDeletes: 0, rewrites: 0, marks: [] };
  let inserted = 0;
  let deleted = 0;
  let bigDeletes = 0;
  let rewrites = 0;
  const marks: string[] = [];
  tr.steps.forEach((step, i) => {
    if (step instanceof AddMarkStep) marks.push(step.mark.type.name);
    else if (step instanceof ReplaceStep) {
      const out = tr.docs[i]!.textBetween(step.from, step.to, '\n').length;
      const into = step.slice.content.textBetween(0, step.slice.content.size, '\n').length;
      deleted += out;
      inserted += into;
      if (out >= BIG_DELETE && into < out / 2) bigDeletes++;
      if (out >= REWRITE && into >= REWRITE) rewrites++;
    }
  });
  return { undo: false, inserted, deleted, bigDeletes, rewrites, marks };
}

interface Tracked {
  readonly id: number;
  readonly pos: number;
  readonly visits: number;
}

/** The plugin state: the log of entries, and the session's paragraph visits
 *  (top-level blocks, kept at their mapped positions). */
export interface ActivityState {
  readonly log: CommitLog<Entry>;
  readonly blocks: readonly Tracked[];
  /** The id of the block the last edit landed in. */
  readonly last: number | null;
  readonly nextId: number;
}

/** The top-level block the edit landed in, as its position in `tr.doc`; `null`
 *  for an edit that isn't inside one block. */
function blockOf(tr: Transaction): number | null {
  const i = tr.steps.findIndex((s) => s instanceof ReplaceStep);
  if (i < 0) return null;
  const step = tr.steps[i] as ReplaceStep;
  const doc: Node = tr.docs[i]!;
  const $from = doc.resolve(step.from);
  const $to = doc.resolve(step.to);
  if ($from.depth === 0 || $to.depth === 0 || $from.before(1) !== $to.before(1)) return null;
  const r = tr.mapping.slice(i).mapResult($from.before(1), 1);
  return r.deleted ? null : r.pos;
}

const log = commitLog(observe);

export const activityState: StateField<ActivityState> = {
  init: (config, instance) => ({ log: log.init(config, instance), blocks: [], last: null, nextId: 1 }),
  apply(tr, st, oldState, newState) {
    if (!tr.docChanged) return st;
    const entry = observe(tr);
    const nextLog = entry ? log.apply(tr, st.log, oldState, newState) : st.log;
    let blocks: Tracked[] = [];
    let last = st.last;
    for (const b of st.blocks) {
      const r = tr.mapping.mapResult(b.pos, 1);
      if (r.deleted) {
        if (b.id === last) last = null;
      } else blocks.push({ ...b, pos: r.pos });
    }
    let nextId = st.nextId;
    if (entry && !entry.undo) {
      const pos = blockOf(tr);
      if (pos !== null) {
        let t = blocks.find((b) => b.pos === pos);
        if (!t) {
          t = { id: nextId++, pos, visits: 0 };
          blocks.push(t);
        }
        const visited = { ...t, visits: t.visits + (t.id === last ? 0 : 1) };
        blocks = blocks.map((b) => (b.id === t!.id ? visited : b));
        last = t.id;
        if (blocks.length > MAX_TRACKED) {
          const drop = blocks.filter((b) => b.id !== last).sort((a, b) => a.visits - b.visits)[0]!;
          blocks = blocks.filter((b) => b.id !== drop.id);
        }
      }
    }
    return { log: nextLog, blocks, last, nextId };
  },
};

/** How many blocks have been visited `REVISITED` times or more, counting from
 *  `baseline` (the visits at the last "forget"). */
export function revisited(blocks: readonly Tracked[], baseline: Readonly<Record<number, number>>): { count: number; peak: number } {
  const n = blocks.map((b) => b.visits - (baseline[b.id] ?? 0));
  return { count: n.filter((v) => v >= REVISITED).length, peak: Math.max(0, ...n) };
}

/** Everything kept across sessions: the writer's, for every document. */
export interface Totals {
  readonly edits: number;
  readonly minutes: number;
  /** The last minute (since 1970) with an edit. */
  readonly lastMinute: number | null;
  readonly inserted: number;
  readonly deleted: number;
  readonly bigDeletes: number;
  readonly rewrites: number;
  readonly undos: number;
  readonly marks: Readonly<Record<string, number>>;
}

export const EMPTY: Totals = {
  edits: 0, minutes: 0, lastMinute: null, inserted: 0, deleted: 0, bigDeletes: 0, rewrites: 0, undos: 0, marks: {},
};

/** Add entries to the totals; `now` is when they were noticed. */
export function add(t: Totals, entries: readonly Entry[], now: number): Totals {
  if (entries.length === 0) return t;
  const marks = { ...t.marks };
  let next: { -readonly [K in keyof Totals]: Totals[K] } = { ...t, marks };
  const edits = entries.filter((e) => !e.undo);
  for (const e of entries) {
    if (e.undo) next.undos++;
    next.inserted += e.inserted;
    next.deleted += e.deleted;
    next.bigDeletes += e.bigDeletes;
    next.rewrites += e.rewrites;
    for (const m of e.marks) marks[m] = (marks[m] ?? 0) + 1;
  }
  next.edits += edits.length;
  if (edits.length > 0) {
    const minute = Math.floor(now / 60_000);
    if (minute !== t.lastMinute) next = { ...next, minutes: next.minutes + 1, lastMinute: minute };
  }
  return next;
}

export function isEmpty(t: Totals, revisitedCount: number): boolean {
  return t.edits === 0 && t.undos === 0 && Object.keys(t.marks).length === 0 && revisitedCount === 0;
}

/** The footer's one line. */
export function footer(t: Totals, revisitedCount: number): string {
  if (isEmpty(t, revisitedCount)) return 'Nothing recorded yet.';
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  return [
    n(t.edits, 'edit', 'edits'),
    n(t.minutes, 'active minute', 'active minutes'),
    `${t.deleted} characters cut, ${t.inserted} written`,
    n(revisitedCount, 'paragraph revisited', 'paragraphs revisited'),
    n(t.undos, 'undo', 'undos'),
  ].join(' · ');
}

/** The activity half of the prompt, in plain words. */
export function describe(t: Totals, revisitedCount: number, peak: number): string {
  if (t.edits === 0 && t.undos === 0) return 'No editing has been recorded yet.';
  const ratio = t.inserted > 0 ? (t.deleted / t.inserted).toFixed(2) : 'n/a';
  const lines = [
    `- ${t.edits} edits over ${t.minutes} active minutes.`,
    `- ${t.inserted} characters written, ${t.deleted} cut (deleted-to-written ratio ${ratio}; above about 0.6 means they cut nearly as much as they write).`,
    `- ${t.bigDeletes} large deletions (30+ characters at once) and ${t.rewrites} in-place rewrites.`,
    `- ${t.undos} undos.`,
    `- ${revisitedCount} paragraphs returned to 3 or more times this session (the most-worked, ${peak} times).`,
  ];
  const marks = Object.entries(t.marks).sort((a, b) => b[1] - a[1]);
  if (marks.length > 0) lines.push(`- Formatting applied: ${marks.map(([m, c]) => `${m} x${c}`).join(', ')}.`);
  return lines.join('\n');
}
