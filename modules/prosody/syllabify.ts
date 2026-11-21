// syllabify.ts — split a word's SPELLING into exactly `n` syllable chunks,
// where `n` comes from the dictionary's pronunciation (pronounce.ts).
//
// This is orthographic, not phonemic — CMUdict tells us *how many* syllables
// a word has and which are stressed, but not where the letters divide. We
// find vowel groups (nuclei) and cut the consonants between them.
//
// The cut rule is ONSET MAXIMIZATION: when consonants sit between two vowel
// groups, give as many of them as possible to the syllable that FOLLOWS
// (the "onset"), stopping as soon as what's left is not a legal way to start
// an English word. This is the standard linguistic rule, and it's why
// "kindly" splits kind·ly (only "l" can start a word — "ndl" and "dl" can't)
// while "table" splits ta·ble ("bl" can start a word, e.g. "block").
//
// The feasibility spike's original rule (split a cluster down the middle)
// got this wrong; hand-checked to fix kind·ly, de·clines, ta·ble.

// Legal English word-initial consonant clusters, longest first within each
// length so a check can just walk the list. Not exhaustive (this is poetry
// vocabulary, not a linguistics reference) — extend if a real poem's split
// looks wrong. Single consonants are always a legal onset and don't need to
// be listed.
const ONSET_3 = ['scr', 'spr', 'str', 'shr', 'thr', 'phr', 'spl', 'squ'];
const ONSET_2 = [
  'bl', 'br', 'ch', 'cl', 'cr', 'dr', 'dw', 'fl', 'fr', 'gl', 'gr', 'gw',
  'kn', 'ph', 'pl', 'pr', 'qu', 'sc', 'sh', 'sk', 'sl', 'sm', 'sn', 'sp',
  'st', 'sw', 'th', 'tr', 'tw', 'wh', 'wr', 'gh',
];
const ONSETS = new Set([...ONSET_3, ...ONSET_2]);

/** Longest legal onset that is a SUFFIX of `cluster`, i.e. how many trailing
 *  letters of the consonant run between two nuclei can start the next
 *  syllable. Falls back to 1 (a single consonant is always legal) when
 *  `cluster` is non-empty, or 0 when there's nothing to split (vowel hiatus). */
function onsetLength(cluster: string): number {
  if (cluster.length === 0) return 0;
  if (cluster.length >= 3 && ONSETS.has(cluster.slice(-3))) return 3;
  if (cluster.length >= 2 && ONSETS.has(cluster.slice(-2))) return 2;
  return 1;
}

function vowelGroups(word: string): Array<[number, number]> {
  const groups: Array<[number, number]> = [];
  const re = /[aeiouy]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(word))) groups.push([m.index, m.index + m[0].length]);
  return groups;
}

const HIATUS_RE = /^(ia|io|ie|ea|eo|ua|uo|ui|iu|oa)/;

/**
 * Split `word`'s spelling into exactly `n` syllable chunks. Returns null
 * when the vowel-group count can't be reconciled to `n` (the caller should
 * fall back to treating the whole word as one unit). `n <= 1` returns the
 * word unsplit.
 */
export function syllabify(word: string, n: number): string[] | null {
  const w = word.toLowerCase();
  if (n <= 1) return [word];

  let groups = vowelGroups(w);

  // Silent trailing "e" ("date", "shake") is not its own nucleus — except
  // "-le" ("table", "little"), where that "e" carries a syllabic "l".
  if (
    groups.length > 1 &&
    /[^aeiou]e$/.test(w) &&
    groups.at(-1)![1] === w.length &&
    !/le$/.test(w)
  ) {
    groups.pop();
  }

  // Too few nuclei for `n`: split a vowel hiatus ("ia", "io", ...) in two.
  while (groups.length < n) {
    let did = false;
    for (let i = 0; i < groups.length && groups.length < n; i++) {
      const [s, e] = groups[i]!;
      if (e - s >= 2 && HIATUS_RE.test(w.slice(s, e))) {
        groups.splice(i, 1, [s, s + 1], [s + 1, e]);
        did = true;
      }
    }
    if (!did) break;
  }

  // Too many nuclei for `n`: merge the closest pair (fewest consonants
  // between them) until we're down to `n`.
  while (groups.length > n) {
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i + 1 < groups.length; i++) {
      const gap = groups[i + 1]![0] - groups[i]![1];
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    groups.splice(best, 2, [groups[best]![0], groups[best + 1]![1]]);
  }

  if (groups.length !== n) return null;

  // Cut each inter-nucleus consonant run by onset maximization.
  const cuts: number[] = [];
  for (let i = 0; i + 1 < groups.length; i++) {
    const consonantStart = groups[i]![1];
    const consonantEnd = groups[i + 1]![0];
    const cluster = w.slice(consonantStart, consonantEnd);
    const onset = onsetLength(cluster);
    cuts.push(consonantEnd - onset);
  }

  const out: string[] = [];
  let prev = 0;
  for (const c of cuts) {
    out.push(word.slice(prev, c));
    prev = c;
  }
  out.push(word.slice(prev));

  return out.every((s) => s.length > 0) ? out : null;
}

/** A guess at how many syllables a word has, for words the dictionary lacks:
 *  its vowel groups, less a silent final "e". */
export function estimateSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  let n = (w.match(/[aeiouy]+/g) ?? []).length;
  if (n > 1 && /[^aeiou]e$/.test(w) && !/le$/.test(w)) n--;
  return Math.max(1, n);
}
