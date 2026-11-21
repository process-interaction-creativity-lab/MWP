// npm run check -- <id>: check one module's description, typecheck it
// against the module API, bundle it as the host would (which refuses
// imports outside its folder), and install it in a host with no panes. A
// module not yet ported (a description and no index.tsx) gets only the first.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { DEFINE } from '../src/bundle/events.ts';
import { lintSource } from '../src/bundle/lint.ts';
import { bundleModule, findModules, type ModuleSource } from '../src/bundle/modules.ts';
import { summaryOf } from '../src/bundle/summary.ts';

const id = process.argv[2];
const root = path.resolve(import.meta.dirname, '..');
const roots = ['modules', 'e2e/modules'];
const source = findModules(roots).find((m) => m.id === id);
const unported = !source && !!id && existsSync(path.join(root, 'modules', id, 'description.md'));
if (!source && !unported) {
  console.error(`usage: npm run check -- <id>   (no module "${id ?? ''}" in ${roots.join(' or ')})`);
  process.exit(1);
}

// A module the writer can place opens its description with a summary for
// them (test modules are exempt).
function descriptionOk(dir: string): boolean {
  const file = path.join(dir, 'description.md');
  const found = existsSync(file) ? summaryOf(readFileSync(file, 'utf8')) : { problem: 'it has no description.md' };
  if ('problem' in found) console.error(`description.md: ${found.problem}`);
  return !('problem' in found);
}

if (!source) {
  const ok = descriptionOk(path.join(root, 'modules', id!));
  console.log(ok ? `${id}: description ok (not ported yet)` : `${id}: failed`);
  process.exit(ok ? 0 : 1);
}

const tmp = mkdtempSync(path.join(tmpdir(), 'mwps-check-'));
const config = path.join(tmp, 'tsconfig.json');
writeFileSync(
  config,
  JSON.stringify({
    extends: path.join(root, 'tsconfig.json'),
    // A module sees the browser and mwps, not Node or Vite.
    compilerOptions: { types: [] },
    include: [path.join(source.dir, '**/*'), path.join(root, 'src/api/mwps.d.ts'), path.join(root, 'src/api/assets.d.ts')],
  }),
);

let ok = true;
const tsc = spawnSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', config], { stdio: 'inherit' });
rmSync(tmp, { recursive: true });
if (tsc.status !== 0) ok = false;

if (source.dir.startsWith(path.join(root, 'modules') + path.sep) && !descriptionOk(source.dir)) ok = false;

// The walkthrough the toolbar's ? shows.
if (source.dir.startsWith(path.join(root, 'modules') + path.sep)) {
  const help = path.join(source.dir, 'help.md');
  if (!existsSync(help)) console.warn(`warning: no help.md, so the toolbar's ? shows only the summary (see scripts/module-template/help.md)`);
  else if (!readFileSync(help, 'utf8').startsWith(`# ${id}: help\n`)) {
    console.error(`help.md must start with its title, "# ${id}: help"`);
    ok = false;
  }
}

try {
  const refused = await installRefusal(source, (await bundleModule(source)).code);
  if (refused) {
    console.error(refused);
    ok = false;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  ok = false;
}

for (const file of readdirSync(source.dir, { recursive: true, encoding: 'utf8' })) {
  if (!/\.[jt]sx?$/.test(file) || file.includes('node_modules') || file.endsWith('.spec.ts')) continue;
  for (const warning of lintSource(file, readFileSync(path.join(source.dir, file), 'utf8'))) console.warn(warning);
}

/** Why the page couldn't load the bundle, or null. It runs with the page's
 *  shared packages and is installed in a host with no panes, so what the host
 *  refuses at install shows here (a type name, a clash, a schema ProseMirror
 *  rejects, a bad moduleType); setup runs only once a module is placed, so a
 *  throw in it shows in the app instead. */
async function installRefusal(source: ModuleSource, code: string): Promise<string | null> {
  // The core and the shared-package table, built for Node; React and
  // ProseMirror stay external so the module and the host share one copy.
  const out = path.join(root, 'node_modules/.cache/mwps-check/host.cjs');
  await esbuild.build({
    stdin: {
      contents: `export { Host } from './src/core/host.ts'; export { requireShared } from './src/web/shared-packages.ts';`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    outfile: out,
    loader: { '.css': 'empty' },
    alias: { mwps: path.join(root, 'src/core/runtime.ts') },
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'prosemirror-*'],
    logLevel: 'error',
  });
  const { Host, requireShared } = createRequire(out)(out);
  // `mwps/react` draws only in a pane; installing needs just its names.
  const require = (id: string) => (id === 'mwps/react' ? { reactWidget: () => null } : requireShared(id));
  type Factory = (module: { exports: Record<string, unknown> }, exports: Record<string, unknown>, require: unknown) => void;
  let defined: { factory: Factory; meta: { summary: string | null; help: string | null } } | undefined;
  Object.assign(globalThis, { [DEFINE]: (_id: string, factory: Factory, meta: never) => (defined = { factory, meta }) });
  const module = { exports: {} as Record<string, unknown> };
  try {
    new Function(code)();
    defined!.factory(module, module.exports, require);
  } catch (err) {
    // A browser global at load time works in the page; only Node lacks it.
    if (err instanceof ReferenceError && /\b(window|document|navigator|localStorage|self|location)\b/.test(err.message)) {
      console.warn(`warning: not installed here, since loading it needs the browser (${err.message})`);
      return null;
    }
    return `module ${source.id} didn't load: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (typeof module.exports.setup !== 'function') return `module ${source.id} doesn't export setup`;
  try {
    new Host({ onFailure: () => {} }).install({ id: source.id, exports: module.exports, ...defined!.meta });
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return null;
}

console.log(ok ? `${id}: ok` : `${id}: failed`);
process.exit(ok ? 0 : 1);
