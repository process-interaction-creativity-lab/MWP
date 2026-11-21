// Each module's `styles`, scoped to where it is placed: elements whose
// scope attribute lists the module (pane frames list the modules on and
// placed in them; module UI lists its module), stopping at any nested
// element whose scope doesn't (another module's UI, a child pane).

import { SCOPE_ATTR } from '../ui/lib/module-scope.js';
import { host } from './host.js';

export function scopeModuleCss(id: string, css: string): string {
  const name = JSON.stringify(id);
  return `@scope ([${SCOPE_ATTR}~=${name}]) to ([${SCOPE_ATTR}]:not([${SCOPE_ATTR}~=${name}])) {\n${css}\n}\n`;
}

const elements = new Map<string, HTMLStyleElement>();

// Brings the page's module stylesheets in line with the installed modules.
function sync(): void {
  const ids = new Set(host.moduleIds());
  for (const [id, el] of elements) {
    if (ids.has(id)) continue;
    el.remove();
    elements.delete(id);
  }
  for (const id of ids) {
    const css = host.styles(id);
    let el = elements.get(id);
    if (!css) {
      el?.remove();
      elements.delete(id);
      continue;
    }
    const text = scopeModuleCss(id, css);
    if (!el) {
      el = document.createElement('style');
      el.dataset.mwpsModule = id;
      document.head.append(el);
      elements.set(id, el);
    }
    if (el.textContent !== text) el.textContent = text;
  }
}

export function startModuleStyles(): void {
  sync();
  host.subscribe(sync);
}
