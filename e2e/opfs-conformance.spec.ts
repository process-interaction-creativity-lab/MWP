import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import * as esbuild from 'esbuild';

// The harness is bundled on the fly, so the page runs this checkout's source.

const here = path.dirname(fileURLToPath(import.meta.url));

interface Harness {
  names: string[];
  run(index: number): Promise<{ name: string; error: string | null }>;
}

test('OpfsVault passes the Vault conformance suite', async ({ page }) => {
  const bundle = await esbuild.build({
    entryPoints: [path.join(here, 'harness/opfs-conformance.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  // OPFS is per origin, so any same-origin page will do.
  await page.goto('/');
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });

  const names = await page.evaluate(
    () => (globalThis as unknown as { __vaultConformance: Harness }).__vaultConformance.names,
  );
  expect(names.length).toBeGreaterThan(10);

  const failures: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const r = await page.evaluate(
      (idx) => (globalThis as unknown as { __vaultConformance: Harness }).__vaultConformance.run(idx),
      i,
    );
    if (r.error !== null) failures.push(`${r.name}: ${r.error}`);
  }
  expect(failures).toEqual([]);
});
