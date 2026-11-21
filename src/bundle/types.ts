// The type files the module creator's typecheck needs, as `npm run check`
// would read them: the contract, every shared package's types, and the
// TypeScript libs the tsconfig names. The kit and the libraries (`mwps/ui`,
// `mwps/text`, …) are sources here, so they go as the declarations
// TypeScript emits for them; doc comments are dropped (the checker doesn't
// read them, and lucide's carry an image per icon). Served to the page as
// `virtual:mwps-types` (mwpsTypes), loaded only by the typecheck's worker.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type * as TS from 'typescript';
import type { Plugin } from 'vite';
import { SHARED } from './events.ts';

export interface TypeFiles {
  /** The repo's tsconfig `compilerOptions`, for the page to parse. */
  compilerOptions: Record<string, unknown>;
  /** Repo-relative path to text. */
  files: Record<string, string>;
}

export function typeFiles(root: string): TypeFiles {
  const ts = createRequire(path.join(root, 'package.json'))('typescript') as typeof TS;
  const configFile = path.join(root, 'tsconfig.json');
  const { config } = ts.readConfigFile(configFile, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, root);
  const options: TS.CompilerOptions = { ...parsed.options, types: [], noEmit: false, declaration: true, emitDeclarationOnly: true, outDir: path.join(root, '.types-out') };

  // One file importing every shared package, so the program reads them all.
  const stub = path.join(root, '__mwps_types.ts');
  const stubText = SHARED.map((id, i) => `import * as m${i} from '${id}';\nvoid m${i};`).join('\n');
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (file, language, ...rest) => (file === stub ? ts.createSourceFile(file, stubText, language) : read(file, language, ...rest));
  const program = ts.createProgram([stub, path.join(root, 'src/api/assets.d.ts')], options, host);

  const files: Record<string, string> = {};
  const strip = (text: string) => text.replace(/\/\*\*[\s\S]*?\*\//g, '');
  for (const sf of program.getSourceFiles()) {
    if (!sf.isDeclarationFile) continue;
    const file = path.relative(root, sf.fileName);
    files[file] = strip(sf.text);
    // The package's manifest, which says where its types are.
    const pkg = /^(node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(file)?.[1];
    const manifest = pkg && path.join(root, pkg, 'package.json');
    if (manifest && !files[`${pkg}/package.json`] && existsSync(manifest)) {
      const { name, version, type, main, module, types, typings, exports, typesVersions } = JSON.parse(readFileSync(manifest, 'utf8'));
      files[`${pkg}/package.json`] = JSON.stringify({ name, version, type, main, module, types, typings, exports, typesVersions });
    }
  }
  program.emit(undefined, (file, text) => {
    const source = path.relative(options.outDir!, file);
    if (!source.startsWith('__mwps_types')) files[source] = text;
  });
  return { compilerOptions: config.compilerOptions, files };
}

export function mwpsTypes(root: string): Plugin {
  const id = 'virtual:mwps-types';
  let cached: string | null = null;
  return {
    name: 'mwps-types',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(resolved) {
      if (resolved !== `\0${id}`) return undefined;
      return (cached ??= `export default ${JSON.stringify(typeFiles(root))};`);
    },
  };
}
