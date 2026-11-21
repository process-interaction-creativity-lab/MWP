// rhyme.ts — rhyme grading and scheme detection/enforcement.
//
// Locked decision: the scheme is DETECTED, not declared. Infer it from the
// first stanza, then enforce it on every later stanza, stanza-by-stanza. A
// line that doesn't match what the scheme demands gets flagged (the caller
// turns its text red).

import { rhymeKeyOf, splitRhymeKey } from './pronounce';
import type { Line } from './lines';

export type RhymeGrade = 'perfect' | 'slant' | 'none';

/** A line's end word, stripped of trailing punctuation the dictionary key
 *  won't include. Exported so callers (the rhyme-word hover, index.tsx) can
 *  show the actual word rather than just its scheme letter. */
export function lineEndWord(line: Line): string | null {
  const w = line.words[line.words.length - 1];
  if (!w) return null;
  const stripped = w.text.replace(/[^a-zA-Z']+$/, '');
  return stripped || null;
}

/** The rhyme key of a line's end word, or null when the line has no words
 *  or the word isn't in the dictionary. */
export function lineRhymeKey(line: Line): string | null {
  const word = lineEndWord(line);
  return word ? rhymeKeyOf(word) : null;
}

/** Grade two rhyme keys. "Perfect" is an exact match; "slant" shares the
 *  stressed vowel OR the sound after it, not both (open question in
 *  HANDOFF.md §7 — computed and exposed, but NOT treated as a scheme match:
 *  only a perfect rhyme satisfies the declared scheme). */
export function gradeRhyme(keyA: string | null, keyB: string | null): RhymeGrade {
  if (!keyA || !keyB) return 'none';
  if (keyA === keyB) return 'perfect';
  const a = splitRhymeKey(keyA);
  const b = splitRhymeKey(keyB);
  if (a.vowel === b.vowel || a.coda === b.coda) return 'slant';
  return 'none';
}

export interface RhymeScheme {
  /** One letter per line of the stanza the scheme was detected from, e.g.
   *  ['A', 'B', 'A', 'B']. Lines that share a letter are meant to rhyme. */
  readonly letters: readonly string[];
}

/**
 * Detect a rhyme scheme from a stanza's lines: group lines whose end words
 * rhyme PERFECTLY, assigning the same letter (A, B, C, …) in order of first
 * appearance. A line with no perfect match anywhere else in the stanza still
 * gets its own letter — a "group of one," there to be confirmed or broken by
 * a later stanza.
 *
 * Returns null when nothing in the stanza rhymes at all: that's blank verse,
 * and enforcement should be skipped rather than inventing a scheme
 * (HANDOFF.md §7).
 */
export function detectScheme(lines: readonly Line[]): RhymeScheme | null {
  if (lines.length === 0) return null;
  const keys = lines.map(lineRhymeKey);

  const anyRhymes = keys.some((k, i) => k !== null && keys.some((k2, j) => j !== i && k2 === k));
  if (!anyRhymes) return null;

  const letters = new Array<string>(lines.length);
  const assigned = new Array<boolean>(lines.length).fill(false);
  let nextCode = 65; // 'A'
  for (let i = 0; i < lines.length; i++) {
    if (assigned[i]) continue;
    const letter = String.fromCharCode(nextCode++);
    letters[i] = letter;
    assigned[i] = true;
    for (let j = i + 1; j < lines.length; j++) {
      if (!assigned[j] && keys[i] !== null && keys[i] === keys[j]) {
        letters[j] = letter;
        assigned[j] = true;
      }
    }
  }
  return { letters };
}

export interface LineRhymeResult {
  /** The scheme slot this line occupies, cycling if the stanza is longer
   *  than the pattern. Null when there is no scheme to check against. */
  readonly letter: string | null;
  /** True when this line agrees with the scheme — including when there's
   *  nothing to check it against (a letter that appears only once in this
   *  stanza, or no scheme at all). */
  readonly matches: boolean;
}

/**
 * Check a stanza's lines against a scheme detected elsewhere (normally the
 * first stanza). The pattern repeats if this stanza has more lines, and
 * truncates if it has fewer. A line "matches" when at least one other line
 * sharing its letter, within this same stanza, rhymes with it perfectly.
 */
export function checkStanza(lines: readonly Line[], scheme: RhymeScheme): LineRhymeResult[] {
  const patternLen = scheme.letters.length;
  if (patternLen === 0) return lines.map(() => ({ letter: null, matches: true }));

  const keys = lines.map(lineRhymeKey);
  const letterAt = (i: number) => scheme.letters[i % patternLen]!;

  return lines.map((_, i) => {
    const letter = letterAt(i);
    const partners = lines.map((_, j) => j).filter((j) => j !== i && letterAt(j) === letter);
    if (partners.length === 0) return { letter, matches: true };
    const key = keys[i];
    const matches = key !== null && partners.some((j) => keys[j] === key);
    return { letter, matches };
  });
}
