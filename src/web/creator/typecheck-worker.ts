// The module creator's typecheck, in a worker: TypeScript over the module's
// files and the type files `npm run check` would read (bundle/types.ts),
// with the repo's compiler options. The libraries' parsed files are kept
// between checks; only the module's are parsed each time.

import ts from 'typescript';
import types from 'virtual:mwps-types';

const files = new Map(Object.entries(types.files).map(([file, text]) => [`/${file}`, text]));
const dirs = new Set<string>();
for (const file of files.keys()) for (let d = file.slice(0, file.lastIndexOf('/')); d; d = d.slice(0, d.lastIndexOf('/'))) dirs.add(d);

// The kit and libraries are here as declarations: point `paths` at them.
const compilerOptions = types.compilerOptions as { paths?: Record<string, string[]> };
const paths = Object.fromEntries(
  Object.entries(compilerOptions.paths ?? {}).map(([key, targets]) => [
    key,
    targets.map((t) => (files.has(t.replace(/^\./, '').replace(/\.tsx?$/, '.d.ts')) ? t.replace(/\.tsx?$/, '.d.ts') : t)),
  ]),
);
const parseHost: ts.ParseConfigHost = { useCaseSensitiveFileNames: true, readDirectory: () => [], fileExists: (f) => files.has(f), readFile: (f) => files.get(f) };
const { options } = ts.parseJsonConfigFileContent({ compilerOptions: { ...compilerOptions, paths, types: [] }, files: [] }, parseHost, '/');
options.noEmit = true;

const parsed = new Map<string, ts.SourceFile>();

// A name declared and never used (`noUnusedLocals`, `noUnusedParameters`):
// an error to `npm run check`, a warning here, where fixing it costs the
// agent a round of the whole prompt and the module works without.
const UNUSED = new Set([6133, 6138, 6192, 6196, 6198, 6199, 6205]);

export interface Request {
  id: string;
  files: [string, string][];
}

self.onmessage = ({ data }: MessageEvent<Request>) => {
  const dir = `/modules/${data.id}`;
  const own = new Map(data.files.map(([file, text]) => [`${dir}/${file}`, text]));
  const host: ts.CompilerHost = {
    getSourceFile(file, language) {
      const mine = own.get(file);
      if (mine !== undefined) return ts.createSourceFile(file, mine, language, true);
      const text = files.get(file);
      if (text === undefined) return undefined;
      let sf = parsed.get(file);
      if (!sf) parsed.set(file, (sf = ts.createSourceFile(file, text, language, true)));
      return sf;
    },
    getDefaultLibFileName: (o) => `/node_modules/typescript/lib/${ts.getDefaultLibFileName(o)}`,
    writeFile: () => {},
    getCurrentDirectory: () => dir,
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (f) => own.has(f) || files.has(f),
    readFile: (f) => own.get(f) ?? files.get(f),
    directoryExists: (d) => d === dir || dirs.has(d.replace(/\/$/, '')),
    getDirectories: () => [],
  };
  const roots = [...own.keys()].filter((f) => /\.tsx?$/.test(f)).concat('/src/api/mwps.d.ts', '/src/api/assets.d.ts');
  const program = ts.createProgram(roots, options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const format = (list: readonly ts.Diagnostic[]) =>
    ts.formatDiagnostics(list, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => dir, getNewLine: () => '\n' }).trim();
  const unused = (d: ts.Diagnostic) => UNUSED.has(d.code);
  self.postMessage({ errors: format(diagnostics.filter((d) => !unused(d))), warnings: format(diagnostics.filter(unused)) });
};
