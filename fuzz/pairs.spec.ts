// Fuzzing, phase two: random sets of modules on one pane (pairs by default,
// FUZZ_SIZE=3 for triples), through the scenario in scenario.ts, after every
// module has passed it alone (singles.spec.ts). `npm run test:fuzz` runs both
// phases; add `--no-deps` for the sets alone. FUZZ_SEED picks the sets, so a
// run replays; FUZZ_PAIRS says how many, FUZZ_A="x,y" starts every set from
// one of a slice of modules (to cover them all between runs), and
// FUZZ_ONLY="a,b" (or "a,b,c") runs one set (and, in phase one, each module
// in it alone).
import { test } from '@playwright/test';
import { fuzz, MODULES, replaces } from './scenario.js';

test.setTimeout(120_000);

/** A small deterministic generator, so a seed replays the same sets. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Add-ons go on first: a layout placed first may offer none (it shows no text). */
const ordered = (set: string[]) => [...set.filter((id) => !replaces(id)), ...set.filter(replaces)];

function sets(): string[][] {
  if (process.env.FUZZ_ONLY) return [process.env.FUZZ_ONLY.split(',')];
  const r = rng(Number(process.env.FUZZ_SEED ?? 1));
  const n = Number(process.env.FUZZ_PAIRS ?? 10);
  const size = Number(process.env.FUZZ_SIZE ?? 2);
  const firsts = process.env.FUZZ_A?.split(',');
  const pick = () => MODULES[Math.floor(r() * MODULES.length)];
  const seen = new Set<string>();
  const out: string[][] = [];
  for (let tries = 0; out.length < n && tries < n * 50; tries++) {
    const set = [firsts ? firsts[out.length % firsts.length] : pick()];
    while (set.length < size) set.push(pick());
    const key = [...set].sort().join('+');
    if (new Set(set).size < size || seen.has(key)) continue;
    seen.add(key);
    out.push(ordered(set));
  }
  return out;
}

for (const ids of sets()) {
  test(ids.join(' + '), async ({ page }) => {
    await fuzz(page, ids);
  });
}
