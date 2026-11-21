// Finds modules by folder and bundles each with esbuild into one CommonJS
// script. Shared packages stay external: the host supplies its own copy at
// load time, so the page has one React and one ProseMirror (prosemirror-utils
// included, for its finders). A module may import only those, `mwps`, the UI
// kit (`mwps/ui`), the icons (`mwps/icons`), the text library (`mwps/text`),
// the commit log (`mwps/changes`), chat (`mwps/ai`), React widgets (`mwps/react`), its own files and its own node_modules.
// Data files (a word list, a model, an image) are not bundled: importing one
// gives its URL, and the file is emitted beside the bundle.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { defineBanner, defineFooter, SHARED } from './events.ts';
import { summaryOf } from './summary.ts';

/** Extensions imported as a URL string to a file emitted beside the bundle,
 *  for the module to `fetch` when it needs it. (.json stays bundled; .svg is
 *  data here, not code.) Keep in step with `src/api/assets.d.ts`. */
export const DATA_EXTENSIONS = [
  '.txt', '.tsv', '.csv', '.bin', '.gz', '.wasm',
  '.png', '.jpg', '.webp', '.svg', '.mp3', '.glb',
] as const;

export interface ModuleSource {
  id: string;
  dir: string;
  entry: string;
  /** The summary from `description.md`, or `null` if it has none (or it
   *  doesn't follow the rules: `npm run check` says why). */
  summary: string | null;
  /** `help.md`, the writer's walkthrough shown by the toolbar's ?, or `null`. */
  help: string | null;
}

// Folders without an index.tsx (a description awaiting its port) are skipped.
export function findModules(roots: readonly string[]): ModuleSource[] {
  const found: ModuleSource[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const id of readdirSync(root).sort()) {
      const dir = path.resolve(root, id);
      const entry = path.join(dir, 'index.tsx');
      if (existsSync(entry)) found.push({ id, dir, entry, summary: summaryIn(dir), help: helpIn(dir) });
    }
  }
  return found;
}

function summaryIn(dir: string): string | null {
  const file = path.join(dir, 'description.md');
  if (!existsSync(file)) return null;
  const found = summaryOf(readFileSync(file, 'utf8'));
  return 'summary' in found ? found.summary : null;
}

function helpIn(dir: string): string | null {
  const file = path.join(dir, 'help.md');
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

// The page loads each bundle with a script tag, so its URL names the module
// in stack traces; that is how the host attributes an error thrown from a
// timer or a promise. The bundle hands its CommonJS factory to the host
// through DEFINE, with the module's summary and help. The source map is a separate
// file beside the bundle, `<id>.js.map`, which the browser fetches only while
// devtools is open: an inline map kept every bundle's sources in the page as
// a string, tens of megabytes across all modules.

// A data file is named `<name>-<hash>.<ext>` and served at
// `modules/<id>/<name>-<hash>.<ext>`: the URL a module gets is relative to
// the page, like the bundle's own, so it works under any static base path.
export interface Bundled {
  code: string;
  map: string;
  /** Data files by name, served under `modules/<id>/`. */
  files: Map<string, Uint8Array>;
}

export async function bundleModule(source: ModuleSource): Promise<Bundled> {
  const result = await esbuild.build({
    entryPoints: [source.entry],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    sourcemap: 'linked',
    outfile: `${source.id}.js`,
    loader: Object.fromEntries(DATA_EXTENSIONS.map((ext) => [ext, 'file'])),
    assetNames: '[name]-[hash]',
    publicPath: `modules/${source.id}`,
    write: false,
    logLevel: 'silent',
    external: [...SHARED],
    // In esbuild's banner and footer, so the source map stays aligned.
    banner: { js: defineBanner(source.id) },
    footer: { js: defineFooter({ summary: source.summary, help: source.help }) },
    plugins: [boundary(source)],
  });
  const file = (ext: string) => result.outputFiles.find((f) => f.path.endsWith(ext))!.text;
  const files = new Map<string, Uint8Array>();
  for (const f of result.outputFiles) {
    if (!f.path.endsWith('.js') && !f.path.endsWith('.js.map')) files.set(path.basename(f.path), f.contents);
  }
  // publicPath also prefixes the map's URL; it sits beside the bundle.
  const code = file('.js').replace(/^\/\/# sourceMappingURL=.*$/m, `//# sourceMappingURL=${source.id}.js.map`);
  return { code, map: file('.js.map'), files };
}

function boundary(source: ModuleSource): esbuild.Plugin {
  const inside = (file: string) => file === source.dir || file.startsWith(source.dir + path.sep);
  return {
    name: 'mwps-module-boundary',
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.kind === 'entry-point' || args.pluginData === 'checked') return undefined;
        if ((SHARED as readonly string[]).includes(args.path)) return { path: args.path, external: true };
        const resolved = await build.resolve(args.path, {
          kind: args.kind,
          resolveDir: args.resolveDir,
          importer: args.importer,
          pluginData: 'checked',
        });
        if (resolved.errors.length) return { errors: resolved.errors };
        if (!inside(resolved.path)) {
          return {
            errors: [
              {
                text:
                  `module ${source.id} imports "${args.path}", which is outside its folder. ` +
                  `A module may import mwps, React, ProseMirror, its own files and its own dependencies.`,
              },
            ],
          };
        }
        return resolved;
      });
    },
  };
}
