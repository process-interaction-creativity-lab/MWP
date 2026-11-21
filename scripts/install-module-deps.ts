// Run by the root `npm install` (postinstall): install each module that has
// its own package.json, from its lockfile, so a fresh checkout builds with one
// install at the root.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
for (const base of ['modules', 'e2e/modules']) {
  const dir = path.join(root, base);
  if (!existsSync(dir)) continue;
  for (const id of readdirSync(dir)) {
    const folder = path.join(dir, id);
    if (!existsSync(path.join(folder, 'package.json'))) continue;
    const command = existsSync(path.join(folder, 'package-lock.json')) ? 'ci' : 'install';
    console.log(`${base}/${id}: npm ${command}`);
    const result = spawnSync('npm', [command, '--no-audit', '--no-fund'], { cwd: folder, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
