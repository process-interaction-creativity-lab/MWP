// npm run new -- <id>: start a module in modules/<id>/ from the template.
// A folder that already holds a description (a module awaiting its port)
// keeps its files; only the missing ones are added.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const id = process.argv[2];
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('usage: npm run new -- <id>   (lowercase letters, digits and dashes)');
  process.exit(1);
}

const template = path.join(import.meta.dirname, 'module-template');
const dir = path.join('modules', id);
if (existsSync(path.join(dir, 'index.tsx'))) {
  console.error(`modules/${id}/index.tsx already exists`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });

for (const file of readdirSync(template)) {
  const target = path.join(dir, file);
  if (existsSync(target)) {
    console.log(`kept      modules/${id}/${file}`);
    continue;
  }
  if (file.endsWith('.md')) writeFileSync(target, readFileSync(path.join(template, file), 'utf8').replaceAll('MODULE_ID', id));
  else copyFileSync(path.join(template, file), target);
  console.log(`created   modules/${id}/${file}`);
}
console.log(`\nCheck it with: npm run check -- ${id}`);
