// Deterministic pixel-art portrait data for a poet — pure, no DOM, no
// randomness beyond a seeded hash of the poet's name, so the same poet
// always draws the same little cartoon. index.tsx turns this into an <svg>.

import type { Poet } from './poets';

export const GRID_COLS = 12;
export const GRID_ROWS = 14;

export const PIXEL = {
  BLANK: 0,
  SKIN: 1,
  HAIR: 2,
  EYE: 3,
  MOUTH: 4,
  COLLAR: 5,
} as const;

export type PixelCode = (typeof PIXEL)[keyof typeof PIXEL];

// One fixed face template, shared by every poet — only the palette (below)
// varies. Symmetric left/right on purpose: the mouth sits dead-center, so a
// speech-bubble tail can point at a fixed fraction of the image (see
// `MOUTH_ANCHOR`) no matter which poet is drawn.
export const PORTRAIT_GRID: readonly (readonly PixelCode[])[] = [
  [0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0],
  [0, 0, 0, 2, 2, 2, 2, 2, 2, 0, 0, 0],
  [0, 0, 2, 2, 1, 1, 1, 1, 2, 2, 0, 0],
  [0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 2, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [1, 1, 1, 3, 1, 1, 1, 1, 3, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 4, 4, 4, 4, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 5, 5, 5, 5, 0, 0, 0, 0],
  [0, 0, 0, 5, 5, 5, 5, 5, 5, 0, 0, 0],
];

const SKIN_TONES = ['#f2c9a0', '#e0a878', '#c68642', '#8d5524', '#ffdbac'];
const HAIR_COLORS = ['#2b2b2b', '#5a3825', '#a8763e', '#d4d4d4', '#7a2e2e', '#c9a0dc'];
const COLLAR_COLORS = ['#3b4d61', '#6b2737', '#2f5233', '#4a4a4a', '#5b4636'];
export const EYE_COLOR = '#1a1a1a';
export const MOUTH_COLOR = '#7a2020';

export interface Palette {
  readonly skin: string;
  readonly hair: string;
  readonly collar: string;
}

/** A small, deterministic string hash (FNV-1a) — same input always yields
 *  the same portrait; no external randomness. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length]!;
}

/** The poet's palette, derived from their name so it's stable across
 *  renders and sessions — including a "Custom…" poet, as soon as a name is
 *  typed, with no id of its own to key off of. */
export function poetPalette(poet: Poet): Palette {
  const h = hashString(poet.name);
  return {
    skin: pick(SKIN_TONES, h),
    hair: pick(HAIR_COLORS, Math.floor(h / 7)),
    collar: pick(COLLAR_COLORS, Math.floor(h / 13)),
  };
}

export function colorFor(code: PixelCode, palette: Palette): string | null {
  switch (code) {
    case PIXEL.BLANK:
      return null;
    case PIXEL.SKIN:
      return palette.skin;
    case PIXEL.HAIR:
      return palette.hair;
    case PIXEL.EYE:
      return EYE_COLOR;
    case PIXEL.MOUTH:
      return MOUTH_COLOR;
    case PIXEL.COLLAR:
      return palette.collar;
  }
}

/** Where a speech-bubble tail should point, as a fraction of the portrait's
 *  own width/height — computed from the grid (rather than hand-measured) so
 *  it stays correct if the template above ever changes. */
export function anchorFor(code: PixelCode): { x: number; y: number } {
  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;
  PORTRAIT_GRID.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell !== code) return;
      minRow = Math.min(minRow, r);
      maxRow = Math.max(maxRow, r);
      minCol = Math.min(minCol, c);
      maxCol = Math.max(maxCol, c);
    });
  });
  return {
    x: (minCol + maxCol + 1) / 2 / GRID_COLS,
    y: (minRow + maxRow + 1) / 2 / GRID_ROWS,
  };
}

export const MOUTH_ANCHOR = anchorFor(PIXEL.MOUTH);
