// Word detection for the deleted-words printer. A deleted word is a run of
// letters and digits of two or more characters that lies wholly inside the
// deleted span and is bounded in the text as it was before the deletion by
// anything that isn't a letter or digit (space, punctuation, a paragraph
// break, an inline object) or the edge of the text.

const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;
const RUN_RE = /[\p{L}\p{N}\p{M}]+/gu;
const FULL_WORD_RE = /^[\p{L}\p{N}]+$/u;

export function isFullWord(word: string): boolean {
  return word.length > 1 && FULL_WORD_RE.test(word);
}

/**
 * Words deleted between two full-document texts, in document order. The
 * changed range is the span left after trimming the common prefix and suffix.
 * Boundaries are checked in the *before* text, so "llo" cut from "hello"
 * doesn't look bounded.
 */
export function findDeletedWords(beforeText: string, afterText: string): string[] {
  if (beforeText === afterText) return [];
  const start = commonPrefixEnd(beforeText, afterText);
  const end = commonSuffixEnd(beforeText, afterText, start);

  const words: string[] = [];
  for (const m of beforeText.slice(start, end).matchAll(RUN_RE)) {
    const from = start + m.index;
    const to = from + m[0].length;
    if (from === start && start > 0 && WORD_CHAR.test(beforeText[start - 1])) continue;
    if (to === end && end < beforeText.length && WORD_CHAR.test(beforeText[end])) continue;
    if (isFullWord(m[0])) words.push(m[0]);
  }
  return words;
}

function commonPrefixEnd(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function commonSuffixEnd(a: string, b: string, start: number): number {
  let ia = a.length;
  let ib = b.length;
  while (ia > start && ib > start && a[ia - 1] === b[ib - 1]) {
    ia--;
    ib--;
  }
  return ia;
}
