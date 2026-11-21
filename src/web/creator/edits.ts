// The module creator's edit tools, as pure functions of files' text: an
// exact edit (`old` occurs once and becomes `new`), and a search whose
// matches are then replaced one by one, so a change in many places can't
// skip one. Each says what it changed, or why it changed nothing, so an
// edit that missed is never taken for one that happened.

export type Applied = { ok: true; text: string; report: string } | { ok: false; error: string };

const SHOWN = 6;

// The lines of `text` at the given offsets, numbered, at most `most` of them.
function linesAt(text: string, offsets: readonly number[], most = SHOWN): string {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  const lineOf = (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const lines = [...new Set(offsets.map(lineOf))];
  const all = text.split('\n');
  const shown = lines.slice(0, most).map((n) => `  ${n + 1}: ${all[n]!.length > 160 ? `${all[n]!.slice(0, 157)}…` : all[n]}`);
  if (lines.length > most) shown.push(`  … and ${lines.length - most} more lines`);
  return shown.join('\n');
}

/** Replaces the one occurrence of `old` with `replacement`. */
export function editExact(text: string, old: string, replacement: string): Applied {
  if (!old) return { ok: false, error: '`old` is empty; to write a whole file, use write_module' };
  if (old === replacement) return { ok: false, error: '`old` and `new` are the same' };
  const at: number[] = [];
  for (let i = text.indexOf(old); i >= 0; i = text.indexOf(old, i + 1)) at.push(i);
  if (at.length > 1) return { ok: false, error: `\`old\` occurs ${at.length} times, at lines:\n${linesAt(text, at)}\nInclude more of the text around it, so it occurs once` };
  if (!at.length) {
    // Where its first line is, if anywhere, and what the file has from there
    // now: the rest differs, often because an earlier edit changed it.
    const first = old.split('\n').find((l) => l.trim())?.trim() ?? '';
    const near: number[] = [];
    for (let i = first ? text.indexOf(first) : -1; i >= 0; i = text.indexOf(first, i + 1)) near.push(i);
    if (near.length === 1) {
      const all = text.split('\n');
      const from = text.slice(0, near[0]).split('\n').length - 1;
      const lines = all.slice(from, from + old.split('\n').length + 2).map((l, i) => `  ${from + i + 1}: ${l}`);
      return { ok: false, error: `\`old\` was not found. Its first line is at line ${from + 1}, and the file has, from there:\n${lines.join('\n')}\nCopy \`old\` from these lines as they are` };
    }
    const hint = near.length ? `; its first line is at:\n${linesAt(text, near)}\nCompare the rest character by character, or read the file again` : '; read the file again and copy the text exactly';
    return { ok: false, error: `\`old\` was not found${hint}` };
  }
  const next = text.slice(0, at[0]) + replacement + text.slice(at[0]! + old.length);
  return { ok: true, text: next, report: `replaced 1 place:\n${linesAt(next, [at[0]!])}` };
}

/** One place a search text occurs: the file, the offset and length there, and the line it is on. */
export interface Match {
  file: string;
  at: number;
  length: number;
  line: number;
  text: string;
}

/** Every occurrence of `text` in the files, ignoring case, in file order. */
export function search(files: Iterable<readonly [string, string]>, text: string): Match[] {
  const out: Match[] = [];
  if (!text) return out;
  const needle = text.toLowerCase();
  for (const [file, content] of files) {
    const hay = content.toLowerCase();
    let line = 1;
    let counted = 0;
    for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
      for (let i = hay.indexOf('\n', counted); i >= 0 && i < at; i = hay.indexOf('\n', i + 1)) line++, (counted = i + 1);
      out.push({ file, at, length: text.length, line, text: content.slice(at, at + text.length) });
    }
  }
  return out;
}

/** A match's line, with the match marked «like this», cut to about 160 characters around it. */
export function shown(content: string, m: Match): string {
  const start = content.lastIndexOf('\n', m.at - 1) + 1;
  const end = content.indexOf('\n', m.at) < 0 ? content.length : content.indexOf('\n', m.at);
  const before = content.slice(start, m.at).trimStart();
  const after = content.slice(m.at + m.length, end);
  const room = Math.max(20, 160 - m.length);
  const left = before.length > room / 2 ? `…${before.slice(-Math.floor(room / 2))}` : before;
  const right = after.length > room - left.length ? `${after.slice(0, room - left.length)}…` : after;
  return `${left}«${content.slice(m.at, m.at + m.length)}»${right}`;
}

/**
 * The files with each match replaced by its replacement, given one per
 * match in order (a replacement equal to its match leaves it as it is), and
 * the lines changed; or why not.
 */
export function replaceMatches(files: ReadonlyMap<string, string>, matches: readonly Match[], replacements: readonly string[]): { ok: true; files: Map<string, string>; report: string } | { ok: false; error: string } {
  if (!matches.length) return { ok: false, error: 'there are no matches to replace' };
  if (replacements.length !== matches.length) return { ok: false, error: `there ${matches.length === 1 ? 'is 1 match' : `are ${matches.length} matches`}, so give ${matches.length} replacement${matches.length === 1 ? '' : 's'}, one per match in order (you gave ${replacements.length}); to leave a match as it is, give it unchanged` };
  const next = new Map(files);
  const report: string[] = [];
  for (const file of [...new Set(matches.map((m) => m.file))]) {
    let text = files.get(file)!;
    const mine = matches.map((m, i) => [m, replacements[i]!] as const).filter(([m]) => m.file === file);
    const at: number[] = [];
    // From the end, so earlier offsets stay true; then where each landed.
    for (const [m, r] of [...mine].reverse()) text = text.slice(0, m.at) + r + text.slice(m.at + m.length);
    let shift = 0;
    for (const [m, r] of mine) {
      if (r !== m.text) at.push(m.at + shift);
      shift += r.length - m.length;
    }
    next.set(file, text);
    if (at.length) report.push(`${file}: replaced ${at.length} place${at.length === 1 ? '' : 's'}:\n${linesAt(text, at, 30)}`);
  }
  if (!report.length) return { ok: false, error: 'every replacement is the same as its match, so nothing changed' };
  return { ok: true, files: next, report: report.join('\n') };
}
