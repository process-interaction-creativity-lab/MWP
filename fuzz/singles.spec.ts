// Fuzzing, phase one: every module on its own, through the scenario in
// scenario.ts. A module that breaks alone is fixed before its pairs are
// worth reading, so `npm run test:fuzz` runs this phase first and the pairs
// only when it passes. FUZZ_ONLY="a,b" runs some modules alone.
import { test } from '@playwright/test';
import { fuzz, MODULES } from './scenario.js';

test.setTimeout(120_000);

const only = process.env.FUZZ_ONLY?.split(',');

for (const id of only ?? MODULES) {
  test(id, async ({ page }) => {
    await fuzz(page, [id]);
  });
}
