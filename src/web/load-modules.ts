// Fetches the bundled modules and runs each with the host's own copy of the
// shared packages (shared-packages.ts).

import type { ModuleExports } from 'mwps';
import { DEFINE } from '../bundle/events.js';
import type { Host, ModuleDef } from '../core/host.js';
import { reactFor } from './react-widget.js';
import { requireShared } from './shared-packages.js';

// `mwps/react` is each module's own, so what it draws is in that module's
// scope and boundary.
function requireFor(moduleId: string): typeof requireShared {
  let own: unknown;
  return (id) => (id === 'mwps/react' ? (own ??= reactFor(moduleId)) : requireShared(id));
}

export async function fetchModuleIds(): Promise<string[]> {
  const res = await fetch('modules/index.json');
  if (!res.ok) throw new Error(`the module list didn't load (${res.status} ${res.statusText})`);
  try {
    return (await res.json()) as string[];
  } catch {
    throw new Error("the module list isn't JSON");
  }
}

type Factory = (module: { exports: Record<string, unknown> }, exports: Record<string, unknown>, require: typeof requireShared) => void;
type Meta = { summary: string | null; help?: string | null };
type Defined = { factory: Factory; meta: Meta };

// Bundles call this as they run (see bundle/modules.ts).
const defined = new Map<string, Defined>();
Object.assign(window, {
  [DEFINE]: (id: string, factory: Factory, meta: Meta) => void defined.set(id, { factory, meta }),
});

let loads = 0;

// Loads a module's bundle with a script tag (a fresh URL each time, for hot
// reload). Throws with the bundler's message if the module doesn't build or
// load.
export async function fetchModule(id: string): Promise<ModuleDef> {
  const url = `modules/${id}.js?v=${++loads}`;
  defined.delete(id);
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      script.remove();
      resolve();
    };
    // The script tag can't read the error, so ask for it.
    script.onerror = () => {
      script.remove();
      void fetch(url).then((res) => res.text()).then((text) => reject(new Error(text)), reject);
    };
    document.head.append(script);
  });
  return takeDefined(id);
}

// Runs a bundle made in the page (the module creator) as `fetchModule` runs
// a fetched one. Its source URL names it `created/modules/<id>.js`, so an
// error it throws later is still attributed to it (moduleOfStack). Throws
// if it doesn't run.
export function moduleFromCode(id: string, code: string): ModuleDef {
  defined.delete(id);
  // Indirect eval: global scope, and a throw here is the caller's to catch.
  (0, eval)(`${code}\n//# sourceURL=created/modules/${id}.js`);
  return takeDefined(id);
}

function takeDefined(id: string): ModuleDef {
  const found = defined.get(id);
  defined.delete(id);
  if (!found) throw new Error(`module ${id}'s bundle didn't run (see the console for its error)`);
  const module = { exports: {} as Record<string, unknown> };
  found.factory(module, module.exports, requireFor(id));
  if (typeof module.exports.setup !== 'function') throw new Error(`module ${id} doesn't export setup`);
  return { id, exports: module.exports as unknown as ModuleExports, summary: found.meta.summary, help: found.meta.help ?? null };
}

// Loads every module into the host, or those `only` names. A module that
// can't load is reported and skipped; the rest still load. Bundles are
// fetched at once and installed in list order, so the order modules are
// installed in doesn't depend on which bundle arrives first. Throws if the
// list itself doesn't load.
export async function loadModules(
  host: Host,
  onLoadError: (id: string, error: unknown) => void,
  only: ReadonlySet<string> | null = null,
): Promise<void> {
  const all = await fetchModuleIds();
  for (const id of only ?? []) if (!all.includes(id)) onLoadError(id, new Error(`there is no module ${id}`));
  const ids = only ? all.filter((id) => only.has(id)) : all;
  const fetched = ids.map((id) =>
    fetchModule(id).then(
      (def) => ({ def }),
      (error: unknown) => ({ error }),
    ),
  );
  for (const [i, id] of ids.entries()) {
    const result = await fetched[i]!;
    try {
      if ('error' in result) throw result.error;
      host.install(result.def);
    } catch (error) {
      onLoadError(id, error);
    }
  }
}

// The module a stack trace came from, by its bundle's URL.
export function moduleOfStack(stack: string | undefined): string | null {
  return /\/modules\/([\w-]+)\.js/.exec(stack ?? '')?.[1] ?? null;
}
