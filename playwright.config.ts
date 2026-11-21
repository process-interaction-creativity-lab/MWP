import { existsSync } from 'node:fs';
import { chromium, defineConfig } from '@playwright/test';

// Writer journeys against the built web host (`npm run test:e2e` builds first).
// MWPS_PORT lets parallel runs on one machine (agents in worktrees) each serve their own build.
const port = Number(process.env.MWPS_PORT ?? 4173);

// The browser: the Chromium this Playwright version ships with, where it is
// installed; else the
// one the cloud image ships (/opt/pw-browsers/chromium), or MWPS_CHROMIUM's.
// Which one is found then doesn't depend on PLAYWRIGHT_BROWSERS_PATH being
// right in every shell, which it often wasn't. A slightly newer Chromium
// than Playwright's own drives fine.
const ownBrowser = existsSync(chromium.executablePath());
const fallback = [process.env.MWPS_CHROMIUM, '/opt/pw-browsers/chromium'].find((p): p is string => !!p && existsSync(p));
const launchOptions = !ownBrowser && fallback ? { executablePath: fallback } : {};

const fuzzing = { fullyParallel: true, expect: { timeout: 15_000 }, use: { actionTimeout: 15_000 } };

export default defineConfig({
  // `e2e`: the journeys. `modules`: modules' optional qa.md walks, run only on request.
  projects: [
    { name: 'e2e', testDir: 'e2e' },
    // A module's walk is one file; its tests run in parallel, each in its own browser context.
    { name: 'modules', testDir: 'modules', testMatch: '*/qa.spec.ts', fullyParallel: true },
    // Fuzzing, run only on request, in two phases: each module alone, then (only if
    // every one passes) random pairs, or triples with FUZZ_SIZE=3. Patient: many at once load the machine.
    { name: 'fuzz-singles', testDir: 'fuzz', testMatch: 'singles.spec.ts', ...fuzzing },
    { name: 'fuzz', testDir: 'fuzz', testMatch: 'pairs.spec.ts', dependencies: ['fuzz-singles'], ...fuzzing },
  ],
  use: { baseURL: `http://localhost:${port}`, headless: true, launchOptions },
  webServer: { command: `npx vite preview --port ${port} --strictPort`, port, reuseExistingServer: false },
});
