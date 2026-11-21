// meter.ts — meter presets, the best-fit scanner, and the five-trick roster.
//
// The locked decision is BEST-FIT SEARCH, not a left-to-right zip: try the
// licensed liberties (the five tricks below), keep the reading with fewest
// violations, and report which tricks were used. A naive zip can't ship —
// one elided syllable shifts everything after it out of alignment and
// manufactures violations that aren't there.
//
// The other load-bearing insight: a dictionary marks nearly every
// one-syllable word as "stressed" in isolation, but that's not how reading
// aloud works. POLYSYLLABLES ARE RIGID — "compare" must be com-PARE, so a
// mismatch there is a real violation. MONOSYLLABLES ARE FLEXIBLE — they bend
// to fit the meter, the way a reader's voice does, and genuinely go either
// way ("shall", "will", "to" routinely carry a beat in ordinary iambic
// pentameter). So only a polysyllable's lexical stress is a hard constraint;
// a monosyllable never violates, at any position.

import { pronounce, STRONG, WEAK, type Stress } from './pronounce';
import { estimateSyllables, syllabify } from './syllabify';
import type { WordSpan } from './lines';

export type { Stress };
export { STRONG, WEAK };

// ---- Meter presets ------------------------------------------------------

export interface MeterSpec {
  readonly id: string;
  readonly label: string;
  /** One character per syllable in a single foot: '0' = weak, '1' = strong. */
  readonly footPattern: string;
  readonly feet: number;
  /** The declared form drops the final syllable (Blake's "Tyger Tyger,
   *  burning bright" — trochaic tetrameter, catalectic). This is a property
   *  of the FORM, not a liberty taken against it, so it lives here rather
   *  than in the trick roster (HANDOFF.md §2). */
  readonly catalectic?: boolean;
}

export const METER_PRESETS: readonly MeterSpec[] = [
  { id: 'iambic-tetrameter', label: 'Iambic tetrameter', footPattern: '01', feet: 4 },
  { id: 'iambic-pentameter', label: 'Iambic pentameter', footPattern: '01', feet: 5 },
  { id: 'iambic-hexameter', label: 'Iambic hexameter (alexandrine)', footPattern: '01', feet: 6 },
  { id: 'trochaic-tetrameter', label: 'Trochaic tetrameter', footPattern: '10', feet: 4 },
  {
    id: 'trochaic-tetrameter-catalectic',
    label: 'Trochaic tetrameter, catalectic',
    footPattern: '10',
    feet: 4,
    catalectic: true,
  },
  { id: 'anapestic-trimeter', label: 'Anapestic trimeter', footPattern: '001', feet: 3 },
  { id: 'anapestic-tetrameter', label: 'Anapestic tetrameter', footPattern: '001', feet: 4 },
  { id: 'dactylic-hexameter', label: 'Dactylic hexameter', footPattern: '100', feet: 6 },
];

export const DEFAULT_METER_ID = 'iambic-pentameter';

export function meterById(id: string | null | undefined): MeterSpec | null {
  return METER_PRESETS.find((m) => m.id === id) ?? null;
}

function feetOf(meter: MeterSpec): string[] {
  const feet = Array.from({ length: meter.feet }, () => meter.footPattern);
  if (meter.catalectic) feet[feet.length - 1] = feet[feet.length - 1]!.slice(0, -1);
  return feet;
}

export function basePattern(meter: MeterSpec): string {
  return feetOf(meter).join('');
}

// ---- The five-trick roster (fixed set — HANDOFF.md §2) -------------------

export type TrickId = 'elision' | 'initial-inversion' | 'feminine-ending' | 'anapest' | 'pyrrhic-spondee';

export const TRICK_ROSTER: readonly { id: TrickId; label: string; blurb: string }[] = [
  { id: 'elision', label: 'Elision', blurb: "Squeezing a syllable together, e.g. ‘every’ → ‘ev’ry’." },
  {
    id: 'initial-inversion',
    label: 'Initial inversion',
    blurb: "Flipping the line's first foot so it starts DUM-da instead of da-DUM.",
  },
  {
    id: 'feminine-ending',
    label: 'Feminine ending',
    blurb: 'One extra soft syllable hanging off the end of the line.',
  },
  {
    id: 'anapest',
    label: 'Anapest',
    blurb: 'An extra soft syllable slipped into the middle of the line (da-da-DUM for da-DUM).',
  },
  {
    id: 'pyrrhic-spondee',
    label: 'Pyrrhic / spondee',
    blurb: 'Two soft beats landing together, or two strong beats landing together.',
  },
];

export interface TrickReport {
  readonly id: TrickId;
  readonly label: string;
  readonly blurb: string;
  readonly applied: boolean;
  readonly detail?: string;
}

// ---- A small, curated elision list (HANDOFF.md §7: "start narrow") -------

const ELISION_SPELLING: Readonly<Record<string, string>> = {
  every: "ev'ry",
  ever: "e'er",
  over: "o'er",
  heaven: "heav'n",
  heavens: "heav'ns",
  flower: "flow'r",
  flowers: "flow'rs",
  power: "pow'r",
  powers: "pow'rs",
  prayer: "pray'r",
  spirit: 'sprite',
  evening: "ev'ning",
};

export interface ElisionOption {
  readonly reducedCount: number;
  readonly label: string;
}

/** A word squeezable by one syllable, or null if this word isn't one of the
 *  small curated set. Exported for tests. */
export function elisionOption(word: string, syllableCount: number): ElisionOption | null {
  if (syllableCount < 2) return null;
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  const spelled = ELISION_SPELLING[w];
  if (spelled) return { reducedCount: syllableCount - 1, label: `${word} → ${spelled}` };
  if (syllableCount > 2 && /(tion|sion)$/.test(w)) {
    return { reducedCount: syllableCount - 1, label: `${word} (-ion squeezed to one beat)` };
  }
  if (syllableCount > 2 && /ery$/.test(w)) {
    return { reducedCount: syllableCount - 1, label: `${word} (-ery squeezed to one beat)` };
  }
  return null;
}

// ---- Per-word syllables, plain and elided --------------------------------

interface RawSyllable {
  readonly text: string;
  readonly from: number;
  readonly to: number;
  readonly wordIndex: number;
  /** The lexically fixed stress for this syllable, or null when it's free to
   *  flex to fit the meter (a monosyllable, an unknown word, or the result
   *  of eliding a word down to one beat). A free syllable NEVER causes a
   *  violation, at any position — HANDOFF.md §3(b): monosyllables genuinely
   *  go either way, the way a reader's voice bends to fit the line, so
   *  forcing "to" or "shall" onto a strong beat is unremarkable, ordinary
   *  iambic pentameter, not a problem to flag. */
  readonly fixed: Stress | null;
}

function plainSyllables(word: WordSpan, wordIndex: number): RawSyllable[] {
  const pron = pronounce(word.text);
  if (!pron) {
    // Not in the dictionary: its syllables are guessed, and bend to the meter.
    const guess = estimateSyllables(word.text);
    const parts = guess > 1 ? syllabify(word.text, guess) : null;
    if (!parts) return [{ text: word.text, from: word.from, to: word.to, wordIndex, fixed: null }];
    let at = word.from;
    return parts.map((text) => {
      const from = at;
      at += text.length;
      return { text, from, to: at, wordIndex, fixed: null };
    });
  }
  if (pron.stresses.length <= 1) {
    return [{ text: word.text, from: word.from, to: word.to, wordIndex, fixed: null }];
  }

  const chunks = syllabify(word.text, pron.stresses.length);
  if (!chunks) {
    // The splitter couldn't reconcile the spelling to the syllable count
    // (HANDOFF.md §3: ~5% of polysyllables). Fall back to one mark for the
    // whole word, taking its dominant (loudest) stress as fixed — still a
    // real constraint, just without a syllable-by-syllable breakdown.
    const fixed: Stress = pron.stresses.includes(STRONG) ? STRONG : WEAK;
    return [{ text: word.text, from: word.from, to: word.to, wordIndex, fixed }];
  }

  let cursor = word.from;
  return chunks.map((text, i) => {
    const from = cursor;
    const to = from + text.length;
    cursor = to;
    return { text, from, to, wordIndex, fixed: pron.stresses[i]! };
  });
}

/** Apply this word's elision (if it has one) to its plain syllable split, by
 *  merging the last two syllables into one. Returns null when the word has
 *  no elision option or only produced one syllable to begin with. */
function elidedSyllables(
  word: WordSpan,
  wordIndex: number,
  plain: RawSyllable[],
): { syls: RawSyllable[]; label: string } | null {
  const pron = pronounce(word.text);
  if (!pron || plain.length < 2) return null;
  const opt = elisionOption(word.text, pron.stresses.length);
  if (!opt) return null;

  const last = plain[plain.length - 1]!;
  const secondLast = plain[plain.length - 2]!;
  const merged: RawSyllable = {
    text: secondLast.text + last.text,
    from: secondLast.from,
    to: last.to,
    wordIndex,
    fixed: last.fixed,
  };
  let syls = [...plain.slice(0, -2), merged];
  // Squeezed all the way down to one syllable: it now behaves like any other
  // monosyllable (free to flex), not like a fixed lexical stress.
  if (syls.length === 1) {
    syls = [{ ...syls[0]!, fixed: null }];
  }
  return { syls, label: opt.label };
}

interface WordAlt {
  readonly plain: RawSyllable[];
  readonly elided: { syls: RawSyllable[]; label: string } | null;
}

function buildWordAlts(words: readonly WordSpan[]): WordAlt[] {
  return words.map((w, i) => {
    const plain = plainSyllables(w, i);
    return { plain, elided: elidedSyllables(w, i, plain) };
  });
}

// Bound the elision search space — real lines rarely offer more than one or
// two elidable words; if a line somehow has more, only the first few are
// tried in combination (the rest stay un-elided in every combo).
const MAX_ELISION_CANDIDATES = 4;

function elisionCombos(alts: WordAlt[]): boolean[][] {
  const candidateIdx = alts.map((a, i) => (a.elided ? i : -1)).filter((i) => i >= 0).slice(0, MAX_ELISION_CANDIDATES);
  const combos: boolean[][] = [];
  for (let mask = 0; mask < 1 << candidateIdx.length; mask++) {
    const pick = new Array<boolean>(alts.length).fill(false);
    candidateIdx.forEach((idx, bit) => {
      if (mask & (1 << bit)) pick[idx] = true;
    });
    combos.push(pick);
  }
  return combos;
}

function syllablesForCombo(alts: WordAlt[], pick: boolean[]): { syls: RawSyllable[]; labels: string[] } {
  const syls: RawSyllable[] = [];
  const labels: string[] = [];
  alts.forEach((a, i) => {
    if (pick[i] && a.elided) {
      syls.push(...a.elided.syls);
      labels.push(a.elided.label);
    } else {
      syls.push(...a.plain);
    }
  });
  return { syls, labels };
}

// ---- Target-pattern variants (the length-changing tricks) ---------------

interface Variant {
  readonly initialInversion: boolean;
  readonly trailingWeak: boolean; // feminine ending
  readonly anapestFoot: number | null;
  // Pyrrhic/spondee as a genuine foot SUBSTITUTION, not just a cosmetic
  // label: a foot whose syllables both carry the same lexical weight (a
  // compound like "sometime" — CMUdict marks BOTH syllables stressed, so no
  // alternating iambic reading can ever satisfy it without this) needs the
  // TARGET to bend, not the word. `substWeight` replaces the whole foot with
  // all-weak (pyrrhic) or all-strong (spondee), same length, same position.
  readonly substFoot: number | null;
  readonly substWeight: Stress | null;
}

const NO_SUBST: Pick<Variant, 'substFoot' | 'substWeight'> = { substFoot: null, substWeight: null };

function invertFoot(pattern: string): string {
  return pattern.split('').reverse().join('');
}

/** Generalizes the anapest substitution (da-da-DUM for da-DUM) to any foot
 *  type by inserting one extra weak syllable just before the foot's final
 *  symbol. */
function insertWeak(pattern: string): string {
  return pattern.slice(0, -1) + '0' + pattern.slice(-1);
}

function variantTarget(meter: MeterSpec, v: Variant): string {
  const feet = feetOf(meter);
  if (v.initialInversion && feet.length > 0) feet[0] = invertFoot(feet[0]!);
  if (v.anapestFoot != null) feet[v.anapestFoot] = insertWeak(feet[v.anapestFoot]!);
  if (v.substFoot != null && v.substWeight != null) {
    feet[v.substFoot] = v.substWeight === STRONG ? '1'.repeat(feet[v.substFoot]!.length) : '0'.repeat(feet[v.substFoot]!.length);
  }
  return feet.join('') + (v.trailingWeak ? '0' : '');
}

function variantFootLengths(meter: MeterSpec, v: Variant): number[] {
  return feetOf(meter).map((f, i) => f.length + (i === v.anapestFoot ? 1 : 0));
}

function candidateVariants(syllableCount: number, baseLength: number, feet: number): Variant[] {
  if (syllableCount === baseLength) {
    const variants: Variant[] = [
      { initialInversion: false, trailingWeak: false, anapestFoot: null, ...NO_SUBST },
      { initialInversion: true, trailingWeak: false, anapestFoot: null, ...NO_SUBST },
    ];
    for (let i = 0; i < feet; i++) {
      variants.push({ initialInversion: false, trailingWeak: false, anapestFoot: null, substFoot: i, substWeight: WEAK });
      variants.push({ initialInversion: false, trailingWeak: false, anapestFoot: null, substFoot: i, substWeight: STRONG });
    }
    return variants;
  }
  if (syllableCount === baseLength + 1) {
    const variants: Variant[] = [
      { initialInversion: false, trailingWeak: true, anapestFoot: null, ...NO_SUBST },
      { initialInversion: true, trailingWeak: true, anapestFoot: null, ...NO_SUBST },
    ];
    for (let i = 0; i < feet; i++) {
      variants.push({ initialInversion: false, trailingWeak: false, anapestFoot: i, ...NO_SUBST });
      variants.push({ initialInversion: true, trailingWeak: false, anapestFoot: i, ...NO_SUBST });
    }
    return variants;
  }
  return [];
}

interface Violation {
  readonly index: number;
}

/** A syllable violates the target only when it has a FIXED lexical stress
 *  that conflicts with what the meter wants there. Free syllables — every
 *  monosyllable, plus anything elided down to one beat — never violate,
 *  at any position (HANDOFF.md §3(b)). */
function scoreAgainst(syls: readonly RawSyllable[], target: string): Violation[] {
  const violations: Violation[] = [];
  syls.forEach((s, i) => {
    const want = (Number(target[i]) as Stress) ?? WEAK;
    if (s.fixed !== null && s.fixed !== want) violations.push({ index: i });
  });
  return violations;
}

function tricksUsedCount(pick: boolean[], v: Variant): number {
  return (
    pick.filter(Boolean).length +
    (v.initialInversion ? 1 : 0) +
    (v.anapestFoot != null ? 1 : 0) +
    (v.trailingWeak ? 1 : 0) +
    (v.substFoot != null ? 1 : 0)
  );
}

// ---- The public scan result -----------------------------------------------

export interface ScannedSyllable {
  readonly text: string;
  readonly from: number;
  readonly to: number;
  readonly wordIndex: number;
  readonly mark: Stress;
  readonly footStart: boolean;
  readonly violation: boolean;
}

export interface LineScan {
  readonly syllables: readonly ScannedSyllable[];
  readonly target: string;
  readonly tricks: readonly TrickReport[];
  readonly violationCount: number;
  /** False when no combination of tricks could reconcile the line's syllable
   *  count to the meter at all — report "couldn't scan this line" rather
   *  than confident nonsense (HANDOFF.md §3, "known limitation"). */
  readonly scannable: boolean;
}

function emptyTricks(): TrickReport[] {
  return TRICK_ROSTER.map((t) => ({ ...t, applied: false }));
}

/**
 * Best-fit scan of one line's words against a declared meter. Tries the
 * five licensed liberties in combination, keeps the reading with the fewest
 * violations (ties broken by using fewer tricks), and reports every trick —
 * applied or not.
 */
export function scanLine(words: readonly WordSpan[], meter: MeterSpec): LineScan {
  const base = basePattern(meter);

  if (words.length === 0) {
    return { syllables: [], target: base, tricks: emptyTricks(), violationCount: 0, scannable: true };
  }

  const alts = buildWordAlts(words);
  const combos = elisionCombos(alts);

  let best: {
    syls: RawSyllable[];
    target: string;
    violations: Violation[];
    elisionLabels: string[];
    variant: Variant;
    tricksUsed: number;
  } | null = null;

  for (const pick of combos) {
    const { syls, labels } = syllablesForCombo(alts, pick);
    for (const variant of candidateVariants(syls.length, base.length, meter.feet)) {
      const target = variantTarget(meter, variant);
      if (target.length !== syls.length) continue;
      const violations = scoreAgainst(syls, target);
      const tricksUsed = tricksUsedCount(pick, variant);
      if (
        !best ||
        violations.length < best.violations.length ||
        (violations.length === best.violations.length && tricksUsed < best.tricksUsed)
      ) {
        best = { syls, target, violations, elisionLabels: labels, variant, tricksUsed };
      }
    }
  }

  if (!best) {
    const { syls } = syllablesForCombo(alts, new Array(alts.length).fill(false));
    return {
      syllables: syls.map((s, i) => ({
        text: s.text,
        from: s.from,
        to: s.to,
        wordIndex: s.wordIndex,
        mark: s.fixed ?? WEAK,
        footStart: i % (meter.footPattern.length || 1) === 0,
        violation: false,
      })),
      target: base,
      tricks: emptyTricks(),
      violationCount: 0,
      scannable: false,
    };
  }

  const footLengths = variantFootLengths(meter, best.variant);
  const footStarts = new Set<number>();
  {
    let cursor = 0;
    for (const len of footLengths) {
      footStarts.add(cursor);
      cursor += len;
    }
  }

  // Pyrrhic/spondee is reported exactly when the search reached for
  // `substFoot` — i.e. when it was structurally NECESSARY (a fixed compound
  // like "sometime", where CMUdict marks both syllables stressed, so no
  // alternating reading can satisfy it without bending the grid). Free
  // syllables never force this: they never violate under any target, so
  // there's nothing for a free-syllable pair to be "rescued" from. Guessing
  // that two adjacent free monosyllables FEEL like a spondee from word class
  // alone (a little word + a little word = pyrrhic) was tried and produces
  // false positives on perfectly ordinary iambic feet ("Shall I", "of May")
  // — dropped in favor of reporting only what the search can actually show
  // its work for.

  const violationIndices = new Set(best.violations.map((v) => v.index));
  const syllables: ScannedSyllable[] = best.syls.map((s, i) => ({
    text: s.text,
    from: s.from,
    to: s.to,
    wordIndex: s.wordIndex,
    mark: s.fixed ?? (Number(best!.target[i]) as Stress),
    footStart: footStarts.has(i),
    violation: violationIndices.has(i),
  }));

  const tricks: TrickReport[] = TRICK_ROSTER.map((t) => {
    switch (t.id) {
      case 'elision':
        return { ...t, applied: best!.elisionLabels.length > 0, detail: best!.elisionLabels.join('; ') || undefined };
      case 'initial-inversion':
        return { ...t, applied: best!.variant.initialInversion };
      case 'feminine-ending':
        return { ...t, applied: best!.variant.trailingWeak };
      case 'anapest':
        return {
          ...t,
          applied: best!.variant.anapestFoot != null,
          detail: best!.variant.anapestFoot != null ? `foot ${best!.variant.anapestFoot! + 1}` : undefined,
        };
      case 'pyrrhic-spondee': {
        const applied = best!.variant.substFoot != null;
        const detail = applied
          ? `foot ${best!.variant.substFoot! + 1} (${best!.variant.substWeight === STRONG ? 'spondee' : 'pyrrhic'})`
          : undefined;
        return { ...t, applied, detail };
      }
    }
  });

  return { syllables, target: best.target, tricks, violationCount: best.violations.length, scannable: true };
}
