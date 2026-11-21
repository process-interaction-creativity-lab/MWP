import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { loadPreset } from './src/bundle/preset.js';
import { mwpsTypes } from './src/bundle/types.js';
import { mwpsModules } from './src/bundle/vite-plugin.js';

// MWPS_E2E adds the test modules the Playwright journeys use.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const moduleRoots = process.env.MWPS_E2E ? ['modules', 'e2e/modules'] : ['modules'];
// MWPS_PRESET=presets/<name>: only its modules, and its starter project
// (src/bundle/preset.ts; `npm run build:preset -- <name>`).
const preset = process.env.MWPS_PRESET ? loadPreset(process.env.MWPS_PRESET, moduleRoots) : null;

export default defineConfig({
  root: 'src/web',
  // Relative URLs, so a build works from any path.
  base: './',
  // The module creator's typecheck worker imports the type files
  // (mwpsTypes): served through `plugins` in dev, `worker.plugins` in a build.
  plugins: [tailwindcss(), mwpsModules(moduleRoots, preset?.modules), mwpsTypes(repoRoot)],
  worker: { format: 'es', plugins: () => [mwpsTypes(repoRoot)] },
  // The kit's own imports (shadcn's `@/ui/...` alias).
  resolve: {
    alias: {
      '@/ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
  // In e2e builds, the page exposes its host to the journeys.
  // A preset's starter project is in the page (src/web/starter.ts).
  define: {
    __MWPS_E2E__: JSON.stringify(Boolean(process.env.MWPS_E2E)),
    __MWPS_STARTER__: JSON.stringify(preset?.starter ?? null),
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      // Radix and cmdk mark their files "use client" for React Server
      // Components, which this app doesn't use.
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' || warning.code === 'SOURCEMAP_ERROR') return;
        warn(warning);
      },
    },
  },
});
