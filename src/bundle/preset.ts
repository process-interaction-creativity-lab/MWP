// A preset builds the web host with only some modules, and a starter
// project the app opens on its first visit: documents, and panes with
// modules placed and pane values set. `presets/<name>/preset.json`:
//
//   {
//     "modules": ["word-processor", "resizable-split", ...],
//     "project": "Demo",
//     "documents": [{ "name": "Tutorial", "file": "tutorial.md" }, ...],
//     "layout": {
//       "modules": ["resizable-split"],
//       "values": { "resizable-split": { "orientation": "horizontal" } },
//       "children": [{ "document": "tutorial", "modules": ["word-processor"] }, ...]
//     }
//   }
//
// A document's id is its file's name without the extension; `.md` is
// converted (markdown.ts), `.json` is stored document JSON as is. The
// layout is the root pane: `document` (an id; the first document if
// absent), `modules` in placement order, `values` (each module's persisted
// pane values, by name) and `children`, the panes its last module hosts
// (as a split's `hostChildPanes({ persist: true })` makes them), each a pane
// of the same shape. Everything is checked here, so a typo fails the build.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { SavedPane } from '../core/saved.ts';
import { markdownToDoc } from './markdown.ts';
import { findModules } from './modules.ts';

export interface PaneSpec {
  document?: string;
  modules?: string[];
  values?: Record<string, Record<string, unknown>>;
  children?: PaneSpec[];
}

interface PresetFile {
  modules: string[];
  project?: string;
  documents?: { name: string; file: string }[];
  layout?: PaneSpec;
}

/** What the app seeds a project's vault with when it opens it empty. */
export interface Starter {
  project: string;
  /** Vault paths to their content. */
  files: Record<string, string>;
}

export interface Preset {
  modules: string[];
  starter: Starter | null;
}

// The root pane's id in the web host (app.tsx).
const ROOT = 'main';

export function loadPreset(dir: string, moduleRoots: readonly string[]): Preset {
  const file = path.join(dir, 'preset.json');
  if (!existsSync(file)) throw new Error(`preset: no ${file}`);
  const spec = JSON.parse(readFileSync(file, 'utf8')) as PresetFile;
  const fail = (why: string) => {
    throw new Error(`preset ${file}: ${why}`);
  };

  if (!Array.isArray(spec.modules) || !spec.modules.length) fail('"modules" lists no modules');
  const known = new Set(findModules(moduleRoots).map((m) => m.id));
  for (const id of spec.modules) if (!known.has(id)) fail(`there is no module "${id}"`);
  if (!spec.documents?.length && !spec.layout) return { modules: spec.modules, starter: null };

  const files: Record<string, string> = {};
  const documents = (spec.documents ?? []).map(({ name, file: docFile }) => {
    const source = path.join(dir, docFile);
    if (!existsSync(source)) fail(`document "${name}": no ${source}`);
    const id = path.basename(docFile, path.extname(docFile));
    if (!/^[\w-]+$/.test(id)) fail(`document file "${docFile}": name it with letters, digits, - and _ only`);
    const text = readFileSync(source, 'utf8');
    const json = docFile.endsWith('.json') ? JSON.parse(text) : markdownToDoc(text);
    files[`documents/${id}.json`] = JSON.stringify(json);
    return { id, name };
  });
  const ids = documents.map((d) => d.id);
  if (new Set(ids).size !== ids.length) fail('two documents have the same file name');
  files['project.json'] = JSON.stringify({ documents, projectModules: [] }, null, 2);

  if (spec.layout) {
    const problems = checkLayout(spec.layout, new Set(spec.modules), new Set(ids));
    if (problems.length) fail(problems.join('; '));
    files['layout.json'] = JSON.stringify(layoutFile(spec.layout, ids[0] ?? null), null, 2);
  }
  return { modules: spec.modules, starter: { project: spec.project ?? path.basename(path.resolve(dir)), files } };
}

/** What is wrong with a layout: modules the preset leaves out, unknown documents. */
export function checkLayout(root: PaneSpec, modules: ReadonlySet<string>, documents: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const walk = (pane: PaneSpec, where: string) => {
    for (const id of [...(pane.modules ?? []), ...Object.keys(pane.values ?? {})]) {
      if (!modules.has(id)) problems.push(`${where} uses "${id}", which "modules" leaves out`);
    }
    if (pane.document !== undefined && !documents.has(pane.document)) problems.push(`${where} shows "${pane.document}", which isn't a document`);
    if (pane.children?.length && !pane.modules?.length) problems.push(`${where} has children but no module to host them`);
    pane.children?.forEach((child, i) => walk(child, `${where}.children[${i}]`));
  };
  walk(root, 'layout');
  return [...new Set(problems)];
}

/** The layout as the host saves it (core/saved.ts): the root pane and its
 *  children, with ids as the host mints them (`<parent>/<n>`). */
export function layoutFile(root: PaneSpec, firstDocument: string | null): { childrenMade: number; panes: Record<string, SavedPane> } {
  const panes: Record<string, SavedPane> = {};
  let made = 0;
  const add = (id: string, pane: PaneSpec, parent: string | null, host: string | null) => {
    panes[id] = {
      parent,
      host,
      owner: 'writer',
      document: pane.document ?? firstDocument,
      modules: [...(pane.modules ?? [])],
      values: structuredClone(pane.values ?? {}),
    };
    const childHost = pane.modules?.at(-1) ?? null;
    for (const child of pane.children ?? []) add(`${id}/${++made}`, child, id, childHost);
  };
  add(ROOT, root, null, null);
  return { childrenMade: made, panes };
}
