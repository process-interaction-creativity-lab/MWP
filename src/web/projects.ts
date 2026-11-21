// Each project is one top-level OPFS directory, opened as its own vault.

import { Project } from '../core/project.js';
import { ModuleValues, Saved } from '../core/saved.js';
import { KeyedVault } from '../core/vault/keyed.js';
import { MemoryVault } from '../core/vault/memory.js';
import type { Vault } from '../core/vault/vault.js';
import { OpfsVault } from './opfs-vault.js';
import { scratchStore, scratchVaultNames, scratchVaultPrefix } from './scratch.js';
import { seedStarter } from './starter.js';
import { opfsRoot, readTopFile, removeTopFile } from './storage.js';

// Without OPFS: each project's vault, kept for the life of the page, in a
// scratch tab's session storage or else in memory.
const pageVaults = new Map<string, Vault>();

function pageVault(name: string): Vault {
  if (!pageVaults.has(name)) {
    pageVaults.set(name, scratchStore ? new KeyedVault(scratchStore, scratchVaultPrefix(name)) : new MemoryVault());
  }
  return pageVaults.get(name)!;
}

// The top-level directory that is no project: the user's module values.
const USER_VALUES = 'module-values';
// The single file earlier versions kept them in.
const OLD_MODULE_VALUES = 'module-values.json';

export async function listProjects(): Promise<string[]> {
  const origin = await opfsRoot();
  if (!origin) return [...new Set([...pageVaults.keys(), ...scratchVaultNames()])].filter((name) => name !== USER_VALUES).sort();
  const names: string[] = [];
  for await (const [name, handle] of origin.entries()) {
    if (handle.kind === 'directory' && name !== USER_VALUES) names.push(name);
  }
  return names.sort();
}

export interface OpenProject {
  name: string;
  project: Project;
  // Its layout and persisted values, and the user's module values.
  saved: Saved;
  // Flushes pending writes and stops watching for the page hiding.
  close(): Promise<void>;
}

// A top-level directory as a vault, flushed when the page hides.
async function openVault(name: string): Promise<{ vault: Vault; stopFlushOnHide: () => void }> {
  if (await opfsRoot()) {
    const opfs = await OpfsVault.open(name);
    return { vault: opfs, stopFlushOnHide: opfs.flushOnHide() };
  }
  return { vault: pageVault(name), stopFlushOnHide: () => {} };
}

export async function openProject(name: string): Promise<OpenProject> {
  if (name === USER_VALUES) throw new Error(`“${name}” is where module values are kept; pick another name`);
  const { vault, stopFlushOnHide } = await openVault(name);
  await seedStarter(name, vault);
  return {
    name,
    project: await Project.open(vault),
    saved: await Saved.open(vault, await moduleValues),
    async close() {
      stopFlushOnHide();
      await vault.flush();
    },
  };
}

// Module values: a vault of their own outside every project, one file per
// module and value, read once for the page and kept for its life. The
// single file earlier versions kept moves into it.
const moduleValues = openVault(USER_VALUES).then(({ vault }) =>
  ModuleValues.open(vault, {
    read: () => readTopFile(OLD_MODULE_VALUES),
    remove: () => removeTopFile(OLD_MODULE_VALUES),
  }),
);
