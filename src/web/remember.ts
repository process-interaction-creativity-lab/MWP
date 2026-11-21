// A per-browser convenience: the last project open. Storage can
// be missing or throw (private windows); then nothing is remembered. A
// scratch tab remembers in its own store (scratch.ts).

import { scratchKey, scratchStore } from './scratch.js';

const KEY = scratchStore ? scratchKey('last-open') : 'mwps:last-open';
const store = () => scratchStore ?? localStorage;

interface LastOpen {
  project?: string;
  side?: SideLayout;
}

// The side tabs: the ones closed (a new tab opens), the ones opened, least
// recently first, the area's width, and each open view's share of its height.
export interface SideLayout {
  closed: string[];
  opened: string[];
  width: number;
  shares: Record<string, number>;
}

function readAll(): LastOpen {
  try {
    return JSON.parse(store().getItem(KEY) ?? '{}') as LastOpen;
  } catch {
    return {};
  }
}

function writeAll(value: LastOpen): void {
  try {
    store().setItem(KEY, JSON.stringify(value));
  } catch {
    // Not remembered.
  }
}

export const lastProject = (): string | undefined => readAll().project;

export function rememberProject(project: string): void {
  writeAll({ ...readAll(), project });
}

export const lastSide = (): SideLayout => ({ closed: [], opened: [], width: 320, shares: {}, ...readAll().side });

export function rememberSide(side: SideLayout): void {
  writeAll({ ...readAll(), side });
}
