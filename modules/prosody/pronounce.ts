// pronounce.ts — dictionary access: per-syllable stress and rhyme keys.
//
// Wraps `cmu-pronouncing-dictionary` (135k English words as ARPABET
// pronunciations with stress digits). Plain-English glossary, since the user
// asked for this to stay approachable:
//
//   - "stress" — whether a syllable is said loudly (STRONG) or quietly
//     (WEAK) when you read the word on its own. CMUdict marks each vowel
//     sound 0 (weak), 1 (strong/primary) or 2 (strong/secondary); we collapse
//     1 and 2 into one STRONG bucket, because meter only cares about the
//     two-way contrast.
//   - "rhyme key" — the sound from a word's last strong vowel to the end of
//     the word, stress digits stripped, so BRIGHT and NIGHT compare equal
//     even though one is marked stress-1 in isolation.
//
// Built from an offline feasibility spike (dictionary coverage, timing, and
// the "monosyllables are flexible, polysyllables are rigid" insight that
// meter.ts relies on).

import { dictionary } from 'cmu-pronouncing-dictionary';

const VOWEL_RE = /[012]$/;

export const STRONG = 1;
export const WEAK = 0;
export type Stress = typeof STRONG | typeof WEAK;

export interface Pronunciation {
  /** One stress value per syllable, in reading order. */
  readonly stresses: readonly Stress[];
  /** From the last strong vowel to the end of the word, or null if the word
   *  has no vowel sound at all (shouldn't happen for a real word). */
  readonly rhymeKey: string | null;
}

function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[’]/g, "'") // curly apostrophe -> straight, dictionary keys use straight
    .replace(/[^a-z']/g, '');
}

/** Raw ARPABET phones for a word (e.g. `"K AH0 M P EH1 R"`), or null when the
 *  word isn't in the dictionary. Exported so tests can check coverage
 *  directly without going through stress/rhyme parsing. */
export function rawPronunciation(word: string): string | null {
  const key = normalizeWord(word);
  if (!key) return null;
  return dictionary[key] ?? dictionary[key.replace(/'/g, '')] ?? null;
}

function stressesFromPhones(phones: string): Stress[] {
  return phones
    .split(' ')
    .filter((p) => VOWEL_RE.test(p))
    .map((p) => (p.at(-1) === '0' ? WEAK : STRONG));
}

function rhymeKeyFromPhones(phones: string): string | null {
  const ph = phones.split(' ');
  let i = -1;
  for (let k = ph.length - 1; k >= 0; k--) {
    const d = ph[k]!.at(-1);
    if (d === '1' || d === '2') {
      i = k;
      break;
    }
  }
  if (i < 0) {
    for (let k = ph.length - 1; k >= 0; k--) {
      if (VOWEL_RE.test(ph[k]!)) {
        i = k;
        break;
      }
    }
  }
  if (i < 0) return null;
  return ph
    .slice(i)
    .map((p) => p.replace(/[012]$/, ''))
    .join(' ');
}

/** Look up a word's pronunciation. Null means the word isn't in the
 *  dictionary (archaic spellings, proper names, typos) — callers fall back
 *  to treating it as a single syllable of unknown stress. */
export function pronounce(word: string): Pronunciation | null {
  const phones = rawPronunciation(word);
  if (!phones) return null;
  return { stresses: stressesFromPhones(phones), rhymeKey: rhymeKeyFromPhones(phones) };
}

export function syllableCount(word: string): number {
  return pronounce(word)?.stresses.length ?? 1;
}

/** Rhyme key of a word's last vowel-to-end sound, or null if unknown. */
export function rhymeKeyOf(word: string): string | null {
  return pronounce(word)?.rhymeKey ?? null;
}

/** Split a rhyme key into its vowel (first phone) and coda (everything
 *  after) — used to grade slant rhyme (shares one but not both). */
export function splitRhymeKey(key: string): { vowel: string; coda: string } {
  const [vowel = '', ...rest] = key.split(' ');
  return { vowel, coda: rest.join(' ') };
}
