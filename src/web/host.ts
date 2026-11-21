// The page's one module host, its failure toasts, and the page-wide error
// handlers that attribute a stray error to the module whose bundle threw it.

import { createElement, Fragment, type ReactElement } from 'react';
import { MODULE_CHANGED } from '../bundle/events.js';
import type { CardSurface } from '../core/card-surface.js';
import { Host } from '../core/host.js';
import type { Project } from '../core/project.js';
import { createStore } from '../core/store.js';
import { loadSettings, saveSettings } from './settings.js';
import type { Settings } from './settings-data.js';
import { fetchModule, loadModules, moduleOfStack } from './load-modules.js';
import { onlyModules, trial } from './scratch.js';

export interface Toast {
  id: number;
  text: string;
}

let nextToast = 0;
export const toasts = createStore<readonly Toast[]>([]);

export function showToast(text: string): void {
  const toast = { id: nextToast++, text };
  toasts.set([...toasts.get(), toast]);
  setTimeout(() => toasts.set(toasts.get().filter((t) => t !== toast)), 8_000);
}

// How a hosted child pane is drawn; pane-view.tsx fills these in, since it
// imports the host.
export const childPanes = {
  draw: (_paneId: string): ReactElement => createElement(Fragment),
  mount: (_paneId: string, _el: HTMLElement): (() => void) => () => {},
};

// How a card (an editor over one block of its host pane) is drawn.
export const cardViews = {
  draw: (_card: CardSurface, _hostPaneId: string): ReactElement => createElement(Fragment),
  mount: (_card: CardSurface, _hostPaneId: string, _el: HTMLElement): (() => void) => () => {},
};

// The open project, which panes read their documents from and save to.
let project: Project | null = null;

export function setProject(next: Project | null): void {
  project = next;
}

export const openProjectNow = (): Project | null => project;

// The latest module failure, for the module creator to tell its agent.
export const lastFailure = createStore<{ id: string; error: unknown } | null>(null);

export const host: Host = new Host({
  onFailure: (id, error) => {
    showToast(`${id} stopped working and was turned off`);
    lastFailure.set({ id, error });
  },
  load: (id, schema) => {
    if (!project) return Promise.reject(new Error('no project is open'));
    return project.load(schema, id);
  },
  save: (id, doc) => void project?.save(id, doc),
  create: async (name) => {
    if (!project) throw new Error('no project is open');
    return (await project.createDocument(host.schema, name)).id;
  },
  rename: async (id, name) => {
    if (!project) throw new Error('no project is open');
    await project.renameDocument(id, name);
  },
  drawPane: (id) => childPanes.draw(id),
  mountPane: (id, el) => childPanes.mount(id, el),
  drawCard: (card, hostPaneId) => cardViews.draw(card, hostPaneId),
  mountCard: (card, hostPaneId, el) => cardViews.mount(card, hostPaneId, el),
});

host.subscribeSchema(() => {
  if (host.paneIds().length) showToast('Modules changed the document types; undo history was reset');
});

function failFromStack(error: unknown): void {
  const id = moduleOfStack(error instanceof Error ? error.stack : undefined);
  if (id && host.moduleIds().includes(id)) host.fail(id, error);
}

window.addEventListener('error', (e) => failFromStack(e.error));
window.addEventListener('unhandledrejection', (e) => failFromStack(e.reason));

const reportLoadError = (id: string, error: unknown) => {
  console.error(`[mwps] module ${id} could not load:`, error);
  showToast(`${id} could not load`);
};

// `?modules=a,b` loads only those, in a scratch tab (scratch.ts).
export const modulesLoaded = loadModules(host, reportLoadError, onlyModules);
void loadSettings(host);

// The module creator's trial frame runs its scenario here (creator/trial.ts).
if (trial) void import('./creator/trial-runner.js').then(({ runTrial }) => Object.assign(window, { mwpsTrial: { runTrial } }));

declare const __MWPS_E2E__: boolean;
if (__MWPS_E2E__) {
  Object.assign(window, { mwpsE2E: { host, fetchModule, saveSettings: (settings: Settings) => saveSettings(host, settings) } });
}

// A module edited in dev is rebuilt and installed again: a code change, so
// it restarts, and a failed module gets a fresh start.
if (import.meta.hot) {
  import.meta.hot.on(MODULE_CHANGED, async ({ id }: { id: string }) => {
    if (onlyModules && !onlyModules.has(id)) return;
    try {
      host.install(await fetchModule(id));
    } catch (error) {
      reportLoadError(id, error);
    }
  });
}
