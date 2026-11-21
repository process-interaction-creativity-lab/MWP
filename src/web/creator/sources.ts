// What the module creator's agent can read, by repo path: the guide, the
// contract and the libraries it names, the module template, and every
// module's source as an example. Loaded only when the agent asks.

type Loaders = Record<string, () => Promise<string>>;
const reference = import.meta.glob<string>(
  [
    '../../../docs/work/module-framework/12-authoring-guide.md',
    '../../../docs/work/module-framework/tips.md',
    '../../api/mwps.d.ts',
    '../../api/react.d.ts',
    '../../lib/{ai,text,changes,held,idmarks}.ts',
    '../../ui/index.ts',
    '../../ui/icons.ts',
  ],
  { query: '?raw', import: 'default' },
);
const examples = import.meta.glob<string>(
  ['../../../modules/*/**/*.{ts,tsx,md}', '!**/node_modules/**', '!**/*.spec.ts'],
  { query: '?raw', import: 'default' },
);

export const template = import.meta.glob<string>('../../../scripts/module-template/*', { query: '?raw', import: 'default', eager: true });

// A glob key (relative to this folder) as a path from the repo root.
export const repoPath = (key: string): string => (key.startsWith('../../../') ? key.slice(9) : `src/${key.slice(6)}`);

/** Every readable file, by repo path, loaded when first read. */
export const files: Loaders = Object.fromEntries(
  Object.entries({ ...reference, ...examples }).map(([key, load]) => [repoPath(key), load]),
);

/** Every module's id, from its folder. */
export const exampleIds: readonly string[] = [
  ...new Set(Object.keys(examples).flatMap((key) => /^\.\.\/\.\.\/\.\.\/modules\/([\w-]+)\/index\.tsx$/.exec(key)?.[1] ?? [])),
].sort();

/** A readable file's text, or null if there is no such file. */
export async function readSource(path: string): Promise<string | null> {
  const load = files[path.replace(/^\/+/, '')];
  return load ? load() : null;
}

/** The files in a module's folder, for a listing. */
export function filesOf(id: string): string[] {
  return Object.keys(files).filter((p) => p.startsWith(`modules/${id}/`));
}

let loaded: Promise<[string, string][]> | null = null;

/** Every readable file with its text, by repo path, loaded once. */
export function allSources(): Promise<[string, string][]> {
  return (loaded ??= Promise.all(Object.entries(files).map(async ([path, load]) => [path, await load()] as [string, string])));
}
