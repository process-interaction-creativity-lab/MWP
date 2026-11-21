// Actions: declared by a module's `actions` export, implemented in its
// scopes, listed for the palette and bound to their keys.

import type { ActionDeclaration, ActionImplementation, ModuleExports } from 'mwps';

// Each declaration object of a module, by identity, to its name.
export function declarationsOf(moduleId: string, exports: ModuleExports): Map<ActionDeclaration, string> {
  const out = new Map<ActionDeclaration, string>();
  for (const [name, decl] of Object.entries(exports.actions ?? {})) {
    if (typeof decl !== 'object' || decl === null || typeof decl.title !== 'string' || !decl.title) {
      throw new Error(`module ${moduleId}: action "${name}" needs a title`);
    }
    const keys = keysOf(decl);
    if (keys.some((k) => typeof k !== 'string' || !k)) {
      throw new Error(`module ${moduleId}: action "${name}" has a key that isn't a key name`);
    }
    out.set(decl, name);
  }
  return out;
}

export function keysOf(decl: ActionDeclaration): string[] {
  return decl.keys === undefined ? [] : typeof decl.keys === 'string' ? [decl.keys] : [...decl.keys];
}

// The bindings for one key name. With Shift held, browsers disagree on
// whether a letter comes as upper or lower case (macOS Chromium reports
// `s` for Cmd-Shift-S), so a shifted letter is bound in both cases.
export function bindingNames(key: string): string[] {
  const parts = key.split(/-(?!$)/);
  const last = parts[parts.length - 1]!;
  if (!/^[a-z]$/i.test(last) || !parts.slice(0, -1).some((m) => /^shift$/i.test(m))) return [key];
  const head = parts.slice(0, -1).join('-');
  return [`${head}-${last.toLowerCase()}`, `${head}-${last.toUpperCase()}`];
}

export function checkImplementation(moduleId: string, name: string, impl: ActionImplementation): void {
  const hasCommand = 'command' in impl;
  const hasProcedure = 'procedure' in impl;
  if (hasCommand === hasProcedure) {
    throw new Error(`module ${moduleId}: action "${name}" needs exactly one of { command } or { procedure }`);
  }
  const fn = hasCommand ? (impl as { command: unknown }).command : (impl as { procedure: unknown }).procedure;
  if (typeof fn !== 'function' || (impl.active !== undefined && typeof impl.active !== 'function')) {
    throw new Error(`module ${moduleId}: action "${name}"'s implementation must be functions`);
  }
}
