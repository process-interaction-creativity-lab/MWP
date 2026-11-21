/** Syllable counting and phrase finding: pure functions of words. */

/** A plain heuristic: vowel groups, less a silent final e. Every word counts
 *  at least one, and words of three letters or fewer count exactly one. */
export function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length <= 3) return 1;
  const trimmed = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  return Math.max(1, trimmed.match(/[aeiouy]+/g)?.length ?? 1);
}

/** Runs of consecutive words totalling exactly five (or seven) syllables,
 *  found left to right without reusing words. */
export function extractPhrases(words: string[]): { phrases5: string[]; phrases7: string[] } {
  const phrases5: string[] = [];
  const phrases7: string[] = [];
  const run = (i: number, target: number): number => {
    let syl = 0;
    let j = i;
    while (j < words.length && syl < target) {
      const s = countSyllables(words[j]);
      if (syl + s > target) break;
      syl += s;
      j++;
    }
    return syl === target ? j : -1;
  };
  let i = 0;
  while (i < words.length) {
    if (countSyllables(words[i]) > 7) {
      i++;
      continue;
    }
    const j5 = run(i, 5);
    if (j5 > i) {
      phrases5.push(words.slice(i, j5).join(' '));
      i = j5;
      continue;
    }
    const j7 = run(i, 7);
    if (j7 > i) {
      phrases7.push(words.slice(i, j7).join(' '));
      i = j7;
      continue;
    }
    i++;
  }
  return { phrases5, phrases7 };
}

export interface Haiku {
  lines: [string, string, string];
}

/** Use as few paragraphs as will do: the first, then two, and so on, until
 *  the words hold two five-syllable phrases and one seven-syllable phrase. */
export function generateHaiku(paragraphs: string[], random: () => number = Math.random): Haiku | null {
  for (let count = 1; count <= paragraphs.length; count++) {
    const words = paragraphs.slice(0, count).join(' ').split(/\s+/).filter(Boolean);
    const { phrases5, phrases7 } = extractPhrases(words);
    if (phrases5.length >= 2 && phrases7.length >= 1) {
      const a = Math.floor(random() * phrases5.length);
      const rest = phrases5.filter((_, i) => i !== a);
      const b = Math.floor(random() * rest.length);
      const m = Math.floor(random() * phrases7.length);
      return { lines: [phrases5[a], phrases7[m], rest[b]].map(cleanLine) as Haiku['lines'] };
    }
  }
  return null;
}

/** Drop trailing punctuation from a line. */
function cleanLine(line: string): string {
  return line.trim().replace(/[;:,.\-–—!?]+$/, '').trim();
}

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
