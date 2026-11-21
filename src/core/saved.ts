// What persists beside the documents: the pane layout (each pane's
// document, modules and values, and the children their hosts asked to
// persist), document values and module values. Reads are synchronous, so
// the host's app loads it all before opening panes; each change is written
// at once (the vault debounces).
//
// Something saved is forgotten only when the writer removes what it is
// keyed by; a module failing, turned off or restarting keeps it all.

import type { Vault } from './vault/vault.js';

export interface SavedPane {
  readonly parent: string | null;
  // The module hosting it, for a child.
  readonly host: string | null;
  readonly owner: 'writer' | 'module';
  document: string | null;
  // Placed here, in placement order (writer-owned panes only); kept while
  // a module is missing, so it comes back placed.
  modules: string[];
  // Each module's persisted pane values, by name.
  values: Record<string, Record<string, unknown>>;
}

interface Layout {
  // The child id counter, so a new child never takes a saved one's id.
  childrenMade: number;
  // In creation order, so a host's children come back in theirs.
  panes: Record<string, SavedPane>;
}

export type ValuePlace = { kind: 'module' } | { kind: 'document'; id: string } | { kind: 'pane'; id: string };

// The one file module values used to share, outside every project: all
// of them as `{ module: { name: value } }`. Read once, then removed.
export interface OldModuleValuesFile {
  read(): Promise<string | null>;
  remove(): Promise<void>;
}

// A module's value is the file `<module>/<name>.json`, both encoded.
const valueFile = (module: string, name: string) =>
  `${encodeURIComponent(module)}/${encodeURIComponent(name)}.json`;

// The user's module values: read once per page and shared by every
// project opened in it, so a project never starts from a stale copy. Each
// value is a file of its own in a vault outside every project, so setting
// one writes only that file, however large another is.
export class ModuleValues {
  private constructor(
    // By file path.
    private readonly values: Map<string, unknown>,
    private readonly vault: Vault | null,
  ) {}

  static empty(): ModuleValues {
    return new ModuleValues(new Map(), null);
  }

  // `old` is the single file earlier versions kept: its values move into
  // the vault, and it goes only once they are written.
  static async open(vault: Vault, old: OldModuleValuesFile | null = null): Promise<ModuleValues> {
    const oldText = await old?.read();
    if (old && oldText != null) {
      const all = parse<Record<string, Record<string, unknown>>>('module values', oldText, {});
      for (const [module, named] of Object.entries(all)) {
        for (const [name, value] of Object.entries(named ?? {})) {
          const path = valueFile(module, name);
          if ((await vault.read(path)) === null) await vault.write(path, JSON.stringify(value) ?? 'null');
        }
      }
      await vault.flush();
      await old.remove();
    }
    const values = new Map<string, unknown>();
    for (const path of await vault.list('')) {
      const value = parse<unknown>(path, await vault.read(path), undefined);
      if (value !== undefined) values.set(path, value);
    }
    return new ModuleValues(values, vault);
  }

  get(module: string, name: string): unknown {
    return this.values.get(valueFile(module, name));
  }

  set(module: string, name: string, value: unknown): void {
    const path = valueFile(module, name);
    this.values.set(path, value);
    void this.vault?.write(path, JSON.stringify(value) ?? 'null');
  }
}

const LAYOUT = 'layout.json';
const DOC_VALUES = 'doc-values/';
const docValuePath = (doc: string, module: string, name: string) =>
  `${DOC_VALUES}${doc}/${module}/${encodeURIComponent(name)}.json`;

function parse<T>(what: string, text: string | null, fallback: T): T {
  if (text === null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error(`[mwps] ${what} couldn't be read; starting without it:`, error);
    return fallback;
  }
}

export class Saved {
  private constructor(
    private readonly layout: Layout,
    // `<document>/<module>/<name>` to its value.
    private readonly documentValues: Map<string, unknown>,
    private readonly moduleValues: ModuleValues,
    private readonly vault: Vault | null,
  ) {}

  // Kept in memory only: a host with no project open, and tests.
  static empty(): Saved {
    return new Saved({ childrenMade: 0, panes: {} }, new Map(), ModuleValues.empty(), null);
  }

  static async open(vault: Vault, moduleValues: ModuleValues): Promise<Saved> {
    const layout = parse<Layout>(LAYOUT, await vault.read(LAYOUT), { childrenMade: 0, panes: {} });
    const documentValues = new Map<string, unknown>();
    for (const path of await vault.list(DOC_VALUES)) {
      const [doc, module, file] = path.slice(DOC_VALUES.length).split('/');
      if (!doc || !module || !file?.endsWith('.json')) continue;
      const value = parse<unknown>(path, await vault.read(path), undefined);
      if (value !== undefined) documentValues.set(`${doc}/${module}/${decodeURIComponent(file.slice(0, -5))}`, value);
    }
    return new Saved(layout, documentValues, moduleValues, vault);
  }

  // --- the layout ---

  get childrenMade(): number {
    return this.layout.childrenMade;
  }

  pane(id: string): Readonly<SavedPane> | undefined {
    return this.layout.panes[id];
  }

  // A module's saved children of a pane, in creation order.
  children(parent: string, host: string): string[] {
    return Object.keys(this.layout.panes).filter((id) => {
      const pane = this.layout.panes[id]!;
      return pane.parent === parent && pane.host === host;
    });
  }

  addPane(id: string, pane: Omit<SavedPane, 'values'>, childrenMade: number): void {
    this.layout.panes[id] = { ...pane, modules: [...pane.modules], values: {} };
    this.layout.childrenMade = Math.max(this.layout.childrenMade, childrenMade);
    this.writeLayout();
  }

  // A pane showing another document keeps the children the writer owns
  // and forgets those its modules chose for the old one.
  setDocument(id: string, document: string | null): void {
    const pane = this.layout.panes[id];
    if (!pane || pane.document === document) return;
    pane.document = document;
    for (const [child, saved] of Object.entries(this.layout.panes)) {
      if (saved.parent === id && saved.owner === 'module') this.drop(child);
    }
    this.writeLayout();
  }

  setModules(id: string, modules: readonly string[]): void {
    const pane = this.layout.panes[id];
    if (!pane) return;
    pane.modules = [...modules];
    this.writeLayout();
  }

  // A closed pane goes with everything inside it.
  removePane(id: string): void {
    if (!this.layout.panes[id]) return;
    this.drop(id);
    this.writeLayout();
  }

  // A module unplaced from a pane: its children and values there.
  forgetModuleIn(id: string, module: string): void {
    const pane = this.layout.panes[id];
    if (!pane) return;
    delete pane.values[module];
    for (const child of this.children(id, module)) this.drop(child);
    this.writeLayout();
  }

  private drop(id: string): void {
    delete this.layout.panes[id];
    for (const [child, pane] of Object.entries(this.layout.panes)) if (pane.parent === id) this.drop(child);
  }

  private writeLayout(): void {
    void this.vault?.write(LAYOUT, JSON.stringify(this.layout, null, 2));
  }

  // --- values ---

  // undefined when none is saved; a pane value only on a saved pane.
  value(place: ValuePlace, module: string, name: string): unknown {
    switch (place.kind) {
      case 'module':
        return this.moduleValues.get(module, name);
      case 'document':
        return this.documentValues.get(`${place.id}/${module}/${name}`);
      case 'pane':
        return this.layout.panes[place.id]?.values[module]?.[name];
    }
  }

  // Saved as JSON; a pane value on a pane that isn't saved stays in memory.
  setValue(place: ValuePlace, module: string, name: string, value: unknown): void {
    const json = JSON.stringify(value);
    const stored: unknown = json === undefined ? null : JSON.parse(json);
    switch (place.kind) {
      case 'module':
        this.moduleValues.set(module, name, stored);
        return;
      case 'document':
        this.documentValues.set(`${place.id}/${module}/${name}`, stored);
        void this.vault?.write(docValuePath(place.id, module, name), json ?? 'null');
        return;
      case 'pane': {
        const pane = this.layout.panes[place.id];
        if (!pane) return;
        (pane.values[module] ??= {})[name] = stored;
        this.writeLayout();
      }
    }
  }

  // A deleted document's values.
  forgetDocument(id: string): void {
    for (const key of [...this.documentValues.keys()]) {
      if (!key.startsWith(`${id}/`)) continue;
      this.documentValues.delete(key);
      const [, module, ...name] = key.split('/');
      void this.vault?.delete(docValuePath(id, module!, name.join('/')));
    }
  }
}
