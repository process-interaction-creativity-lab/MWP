// npm run build:preset -- <name>: build the web host from presets/<name>/
// (only its modules, and its starter project; src/bundle/preset.ts) into
// dist/<name>/, and zip it to dist/<name>.zip, ready for any static host.
// `MWPS_PRESET=presets/<name> npm run dev` serves the same thing in dev.

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const name = process.argv[2];
if (!name || !existsSync(path.join('presets', name, 'preset.json'))) {
  console.error('usage: npm run build:preset -- <name>   (a folder in presets/ with a preset.json)');
  process.exit(1);
}

const run = (cmd: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// outDir is relative to Vite's root, src/web.
run('npx', ['vite', 'build', '--outDir', `../../dist/${name}`], { env: { ...process.env, MWPS_PRESET: path.join('presets', name) } });
const zip = path.resolve('dist', `${name}.zip`);
rmSync(zip, { force: true });
run('zip', ['-qr', zip, '.'], { cwd: path.join('dist', name) });
console.log(`built dist/${name}/ and dist/${name}.zip`);
