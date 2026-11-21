// Bundles a module made in the module creator, in the page, the way
// bundle/modules.ts bundles one from disk: one CommonJS factory handed to
// DEFINE, shared packages left out, and no import outside the module's own
// files. esbuild runs as WebAssembly, loaded the first time it's needed.

import type * as Esbuild from 'esbuild-wasm';
import { defineBanner, defineFooter, SHARED } from '../../bundle/events.js';

let loaded: Promise<typeof Esbuild> | null = null;

function esbuild(): Promise<typeof Esbuild> {
  return (loaded ??= (async () => {
    const [mod, wasm] = await Promise.all([import('esbuild-wasm'), import('esbuild-wasm/esbuild.wasm?url')]);
    await mod.initialize({ wasmURL: wasm.default });
    return mod;
  })().catch((error: unknown) => {
    loaded = null;
    throw error;
  }));
}

const LOADERS: Record<string, Esbuild.Loader> = { '.tsx': 'tsx', '.ts': 'ts', '.jsx': 'jsx', '.js': 'js', '.json': 'json' };
const RESOLVE = ['', '.tsx', '.ts', '.jsx', '.js', '.json', '/index.tsx', '/index.ts'];

const extensionOf = (file: string) => /\.[^./]+$/.exec(file)?.[0] ?? '';

// `a/b/../c` to `a/c`, relative to the module's folder.
function normalize(file: string): string {
  const out: string[] = [];
  for (const part of file.split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

/** The module's bundle: `files` are its folder's, by path within it, with
 *  `index.tsx` the entry. Throws with esbuild's messages if it doesn't build. */
export async function bundleModule(id: string, files: ReadonlyMap<string, string>, meta: { summary: string | null; help: string | null }): Promise<string> {
  const { build } = await esbuild();
  const plugin: Esbuild.Plugin = {
    name: 'mwps-created-module',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return { path: args.path, namespace: 'module' };
        if ((SHARED as readonly string[]).includes(args.path)) return { path: args.path, external: true };
        if (!args.path.startsWith('.')) {
          return { errors: [{ text: `"${args.path}" isn't available: a module made here may import mwps, React, ProseMirror (the packages the guide lists) and its own files` }] };
        }
        const base = normalize(`${args.resolveDir}/${args.path}`);
        const found = RESOLVE.map((ext) => base + ext).find((file) => files.has(file));
        if (!found) return { errors: [{ text: `"${args.path}" isn't one of the module's files` }] };
        return { path: found, namespace: 'module' };
      });
      b.onLoad({ filter: /.*/, namespace: 'module' }, (args) => {
        const loader = LOADERS[extensionOf(args.path)];
        if (!loader) return { errors: [{ text: `${args.path}: data files aren't available to a module made here` }] };
        return { contents: files.get(args.path)!, loader, resolveDir: args.path.split('/').slice(0, -1).join('/') };
      });
    },
  };
  try {
    const result = await build({
      entryPoints: ['index.tsx'],
      bundle: true,
      format: 'cjs',
      platform: 'browser',
      target: 'es2022',
      jsx: 'automatic',
      sourcemap: 'inline',
      write: false,
      logLevel: 'silent',
      outfile: `${id}.js`,
      banner: { js: defineBanner(id) },
      footer: { js: defineFooter(meta) },
      plugins: [plugin],
    });
    return result.outputFiles[0]!.text;
  } catch (error) {
    const failure = error as Partial<Esbuild.BuildFailure>;
    if (!failure.errors?.length) throw error;
    throw new Error(
      failure.errors.map((e) => (e.location ? `${e.location.file}:${e.location.line}:${e.location.column}: ${e.text}\n  ${e.location.lineText}` : e.text)).join('\n'),
    );
  }
}
