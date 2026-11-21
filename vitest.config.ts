import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { mwps: fileURLToPath(new URL('./src/core/runtime.ts', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
