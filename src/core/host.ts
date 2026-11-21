// Runs modules against a set of panes. Host-agnostic: the web host adds
// views and loading, and the headless test host drives it directly.
//
// A module's scope lives while the module is on. A module that throws
// anywhere the host can catch is marked failed and turned off everywhere
// (Cordis's rule) until its code changes or the user turns it back on.

import type {
  AiSettings,
  ActionDeclaration,
  ActionImplementation,
  ChildHandle,
  ChildPaneOptions,
  ChildPanes,
  Condition,
  DocumentRef,
  DocumentScope,
  ModuleContext,
  ModuleExports,
  PaneChildScope,
  PaneHandle,
  PaneScope,
  PartHandle,
  PartPanes,
  ProjectAccess,
  ProjectDocument,
  Store,
  PaneUiItem,
  UiItem,
  ValueKey,
} from 'mwps';
import { keydownHandler } from 'prosemirror-keymap';
import type { Node, Schema } from 'prosemirror-model';
import { EditorState, Plugin, type Command, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { createElement, Fragment, type ComponentType, type ReactElement } from 'react';
import { bindingNames, checkImplementation, declarationsOf, keysOf } from './actions.js';
import { emptyDocument, moveToSchema, type LoadedDocument } from './document-json.js';
import { DocumentHub, REACTION_CAP, type Busy } from './document-hub.js';
import type { DocumentClient } from './document-client.js';
import { DocumentState } from './document-state.js';
import { PaneImpl, type Pane } from './pane.js';
import { CardsHost, CardSurface, type CardRange } from './card-surface.js';
import { writing } from '../lib/text.js';
import { buildSchema, DATA_NODE, hasParts, partsOf, refusal, sameParts, type ModuleParts } from './parts.js';
import { Saved, type ValuePlace } from './saved.js';
import { CollectionImpl, ScopeImpl, ValueTable, type ControlProvider, type ModuleRuntime, type ValueStore } from './scope.js';
import { actionSources, isUiItem, type ActionSource, type ComponentRoot, type UiItemImpl, type UiRoot } from './ui.js';
import { createCondition, createStore, hostStore, Listeners, type Readable } from './store.js';
import { assertNotInPaneView, isDocumentPlugin, isEditable, wrapPlugin } from './wrap-plugin.js';

export type { Pane } from './pane.js';

export interface ModuleDef {
  id: string;
  exports: ModuleExports;
  /** The first paragraph of its `description.md`, for the writer. */
  summary?: string | null;
  /** Its `help.md`: a walkthrough for the writer. */
  help?: string | null;
}

export type ModuleStatus = 'on' | 'off' | 'failed';

export type ModuleType = 'editorReplacement' | 'extension' | 'project';
const MODULE_TYPES: readonly unknown[] = ['editorReplacement', 'extension', 'project'];

// What `ctx.project` and `ctx.ai` hold for a module: `ai` is `null` for none.
export interface Grants {
  readonly project: boolean;
  readonly ai: AiGrant | null;
}

// One `ai.fetch` call, for the writer to see what AI is doing: `waiting`
// until its response starts, `receiving` while the body arrives, then how
// it ended. `arrivals` holds a time for each piece that arrived: a stream's
// events (`data:` lines), else chunks.
export interface AiCall {
  readonly id: number;
  readonly moduleId: string;
  readonly path: string;
  readonly started: number;
  readonly state: 'waiting' | 'receiving' | 'done' | 'aborted' | 'failed';
  readonly arrivals: readonly number[];
  readonly ended: number | null;
}

// Finished calls kept for the writer to look back on.
const AI_CALLS_KEPT = 20;

// The endpoint a module's `ai.fetch` calls, which the module never sees.
export interface AiGrant {
  readonly key: string;
  readonly url: string;
  readonly model: string;
  readonly transcriptionModel: string;
  readonly imageModel: string;
  // Fields the writer adds to every chat request (to turn a model's
  // reasoning off, say); a field the module sets itself wins.
  readonly extra?: Readonly<Record<string, unknown>>;
}

interface DocumentMember {
  readonly id: string;
}

// A tab menu's row: an action the host draws, or a module's component.
export type TabMenuItem = ({ kind: 'action' } & ActionEntry) | ({ kind: 'component' } & ProvidedUi);

// One action as the palette shows it for a pane (or for no pane).
export interface ActionEntry {
  readonly moduleId: string;
  readonly name: string;
  readonly title: string;
  readonly keys: readonly string[];
  // Implemented here and its dry run (for a command) says it can run.
  readonly enabled: boolean;
  // A toggle that shows as on.
  readonly active: boolean;
}

// Several actions bound to one key apply: the writer picks one.
export interface KeyChoice {
  readonly paneId: string | null;
  readonly actions: readonly ActionEntry[];
}

interface Installed {
  def: ModuleDef;
  type: ModuleType;
  parts: ModuleParts;
  actions: Map<ActionDeclaration, string>;
  enabled: boolean;
  failed: boolean;
  running: RunningModule | null;
}

export interface HostOptions {
  // A module just failed; the host has already turned it off.
  onFailure?(moduleId: string, error: unknown): void;
  // Reads a document that isn't open, for a pane the host opens itself
  // (a hosted child, `openPane`).
  load?(documentId: string, schema: Schema): Promise<LoadedDocument>;
  // After each commit to a document that fits the schema, and after a
  // module's edit to a closed document.
  save?(documentId: string, doc: Node): void;
  // For modules with project access: a new empty document's id, and a
  // rename. The host's app updates the list (`setProjectDocuments`).
  create?(name: string): Promise<string>;
  rename?(documentId: string, name: string): Promise<void>;
  // A hosted child pane, drawn by the host's app: as a React element, and
  // into a DOM node (returning the unmount). Headless hosts draw nothing.
  drawPane?(paneId: string): ReactElement;
  mountPane?(paneId: string, el: HTMLElement): () => void;
  // A card, an editor over one block of its host pane's document.
  drawCard?(card: CardSurface, hostPaneId: string): ReactElement;
  mountCard?(card: CardSurface, hostPaneId: string, el: HTMLElement): () => void;
}

// A place for a pane: a root the host's app made, or a hosted child. The
// pane exists once its document is open; the slot keeps the pane's
// document choice and placements across a change of document.
interface Slot {
  readonly id: string;
  // The host pane's id, for a child.
  readonly parent: string | null;
  documentId: string | null;
  // The writer picks a writer-owned pane's document and modules; a
  // module-owned pane shows what its host module chose and runs its
  // parent's modules, less the module hosting it. Roots are the writer's.
  readonly owner: 'writer' | 'module';
  // Module ids placed here, in placement order (writer-owned only).
  readonly own: string[];
  pane: PaneImpl | null;
  // Counts the panes opened here, so a view knows its pane was replaced.
  generation: number;
  // Set when its document couldn't be read.
  error: string | null;
}

// What the host's app needs to draw a pane's slot.
export interface PaneInfo {
  readonly id: string;
  readonly parent: string | null;
  readonly documentId: string | null;
  readonly owner: 'writer' | 'module';
  // `loading` until its document is read; `error` if it couldn't be.
  readonly status: 'ready' | 'loading' | 'error';
  readonly error: string | null;
  // Changes each time a new pane opens in the slot.
  readonly generation: number;
}

// A pane's children, made by its module's `hostChildPanes`.
interface HostRecord {
  readonly paneId: string;
  readonly moduleId: string;
  readonly members: HostedPanesImpl<PaneHandle>;
  // Its children's slot ids, in order, and what the module holds of each.
  readonly children: string[];
  readonly handles: Map<string, PaneHandle>;
  // Its children are saved with the layout (`hostChildPanes({ persist })`).
  readonly persist: boolean;
}

// What the host's app draws in place of a pane's editor.
export interface ReplacementInfo {
  readonly moduleId: string;
  readonly component: ComponentType;
}

let panesOpened = 0;

export class Host {
  private readonly installed = new Map<string, Installed>();
  // Open panes, and every slot (open or waiting for its document).
  private readonly panes = new Map<string, PaneImpl>();
  private readonly slots = new Map<string, Slot>();
  // Child ids never repeat, so a closed child's handle can't reach a later one.
  private childrenMade = 0;
  private readonly hosts = new Map<string, HostRecord>();
  // Panes whose blocks a layout draws as cards (`hostPartPanes`).
  // Each pane's element, as the host draws it; kept for the pane that
  // next shows in its slot.
  private readonly paneElements = new Map<string, HTMLElement>();
  private readonly cardHosts = new Map<string, { moduleId: string; remove: () => void }>();
  // Documents read for a slot, until a pane opens them; and failed reads.
  // `schema`: the one it was read under, if the host read it.
  private readonly loaded = new Map<string, { doc: LoadedDocument; schema: Schema | null }>();
  private readonly loading = new Set<string>();
  private readonly loadErrors = new Map<string, string>();
  private readonly projectStore = createStore<readonly ProjectDocument[]>([]);
  private grantsOf: (moduleId: string) => Grants = () => ({ project: true, ai: null });
  private readonly grantStore = createStore(0);
  // Module edits to each closed document and reads to open one, one after
  // another, so an open reads after the edits before it.
  private readonly closedEdits = new Map<string, Promise<unknown>>();
  private readonly hubs = new Map<string, DocumentHub>();
  // Each open document's one hidden state.
  private readonly docStates = new Map<string, DocumentState>();
  // The module that provided each plugin.
  readonly pluginModule = new WeakMap<Plugin, string>();
  private readonly documents = new Map<string, DocumentMember>();
  private readonly listeners = new Listeners();
  private batchDepth = 0;
  private readonly deferred: (() => void)[] = [];
  private readonly schemaStore = createStore<Schema>(buildSchema([]));
  // Whether panes' module plugins may be out of date.
  private pluginsDirty = false;
  // Modules whose values changed since the last redraw.
  private readonly redraws = new Set<string>();
  private redrawDepth = 0;
  private readonly focusStore = createStore<string | null>(null);
  private readonly uiStore = createStore(0);
  private readonly choiceStore = createStore<KeyChoice | null>(null);
  // Anything an action's state may read: a pane's state (a value change
  // redraws its module's panes), an implementation, focus, the modules running.
  private readonly controlsStore = createStore(0);
  private readonly controlsChanged = (): void => this.controlsStore.set(this.controlsStore.get() + 1);
  // Reconfiguring waits for rest: no apply or catch-up running.
  readonly busy: Busy = { applying: 0, reacting: 0, flush: () => this.flush() };

  constructor(private readonly options: HostOptions = {}) {}

  // --- what persists ---

  private savedState = Saved.empty();

  // Where the layout and persisted values are kept: set by the host's app
  // before it opens a project's panes, and back to empty after it closes
  // them.
  setSaved(saved: Saved): void {
    this.savedState = saved;
    this.childrenMade = Math.max(this.childrenMade, saved.childrenMade);
  }

  get saved(): Saved {
    return this.savedState;
  }

  valueStore(place: ValuePlace, moduleId: string): ValueStore {
    return {
      load: (name) => this.savedState.value(place, moduleId, name),
      save: (name, value) => this.savedState.setValue(place, moduleId, name, value),
    };
  }

  // Saved placements that can be placed now: installed, not project
  // modules, and one editor replacement at most (the last).
  private restorable(modules: readonly string[]): string[] {
    const placeable = modules.filter((id) => this.installed.has(id) && this.installed.get(id)!.type !== 'project');
    const replacement = placeable.filter((id) => this.installed.get(id)!.type === 'editorReplacement').at(-1);
    return placeable.filter((id) => this.installed.get(id)!.type !== 'editorReplacement' || id === replacement);
  }

  // The base types plus every installed module's parts. A change notifies
  // before any module restarts, so documents move to the new schema first.
  get schema(): Schema {
    return this.schemaStore.get();
  }

  subscribeSchema = this.schemaStore.subscribe;

  // Any change to modules, their status or placements. `version` changes
  // with each, for useSyncExternalStore.
  subscribe = this.listeners.subscribe;
  version = 0;

  // --- modules ---

  // Installing an id again is a code change: the module restarts, and a
  // failed module gets a fresh start. Changed parts rebuild the schema,
  // which restarts every module. Throws, changing nothing, if the module's
  // parts clash with another installed module's or don't make a schema.
  install(def: ModuleDef): void {
    const parts = partsOf(def.id, def.exports);
    const others = [...this.installed.values()].filter((e) => e.def.id !== def.id).map((e) => e.parts);
    const refused = refusal(others, parts);
    if (refused) throw new Error(`module ${def.id} can't be installed: ${refused}`);
    const actions = declarationsOf(def.id, def.exports);
    const type = (def.exports as { moduleType?: unknown }).moduleType ?? 'extension';
    if (!MODULE_TYPES.includes(type)) {
      throw new Error(
        `module ${def.id} can't be installed: moduleType is "${String(type)}", not "editorReplacement", "extension" or "project"`,
      );
    }

    const existing = this.installed.get(def.id);
    const schemaChanges = existing ? !sameParts(existing.parts, parts) : hasParts(parts);
    if (existing) {
      existing.running?.stop();
      existing.running = null;
      existing.def = def;
      existing.parts = parts;
      existing.actions = actions;
      if (existing.type !== type) this.dropPlacements(def.id);
      existing.type = type as ModuleType;
      existing.failed = false;
    } else {
      this.installed.set(def.id, { def, type: type as ModuleType, parts, actions, enabled: true, failed: false, running: null });
    }
    if (schemaChanges) this.rebuildSchema();
    this.sync();
  }

  uninstall(id: string): void {
    const entry = this.installed.get(id);
    if (!entry) return;
    entry.running?.stop();
    this.installed.delete(id);
    this.dropPlacements(id);
    if (hasParts(entry.parts)) this.rebuildSchema();
    this.sync();
  }

  // A module placed where its type no longer goes, or uninstalled.
  private dropPlacements(id: string): void {
    for (const slot of this.slots.values()) {
      const i = slot.own.indexOf(id);
      if (i >= 0) slot.own.splice(i, 1);
    }
    const i = this.projectPlaced.indexOf(id);
    if (i >= 0) this.projectPlaced.splice(i, 1);
  }

  // Every scope restarts against the new types.
  private rebuildSchema(): void {
    for (const entry of this.installed.values()) {
      entry.running?.stop();
      entry.running = null;
    }
    const schema = buildSchema([...this.installed.values()].map((e) => e.parts));
    for (const hub of this.hubs.values()) {
      const moved = moveToSchema(hub.doc, schema);
      hub.reset(moved.doc, moved.error);
    }
    for (const state of this.docStates.values()) state.build([]);
    for (const pane of this.panes.values()) pane.build([]);
    this.pluginsDirty = true;
    this.schemaStore.set(schema);
  }

  // Turning a module on clears a failure.
  setEnabled(id: string, enabled: boolean): void {
    const entry = this.require(id);
    entry.enabled = enabled;
    if (enabled) entry.failed = false;
    this.sync();
  }

  status(id: string): ModuleStatus {
    const entry = this.require(id);
    return entry.failed ? 'failed' : entry.enabled ? 'on' : 'off';
  }

  // The module's `styles` export, if any.
  styles(id: string): string | undefined {
    const styles = this.require(id).def.exports.styles;
    return typeof styles === 'string' ? styles : undefined;
  }

  summary(id: string): string | null {
    return this.installed.get(id)?.def.summary ?? null;
  }

  help(id: string): string | null {
    return this.installed.get(id)?.def.help ?? null;
  }

  moduleIds(): string[] {
    return [...this.installed.keys()];
  }

  moduleType(id: string): ModuleType {
    return this.require(id).type;
  }

  // --- the project ---

  // Project modules placed in the project, in placement order. Each runs
  // while it is on and placed here.
  private readonly projectPlaced: string[] = [];

  placeInProject(moduleId: string): void {
    if (this.require(moduleId).type !== 'project') throw new Error(`module ${moduleId} isn't a project module; place it on a pane`);
    if (!this.projectPlaced.includes(moduleId)) this.projectPlaced.push(moduleId);
    this.sync();
  }

  unplaceFromProject(moduleId: string): void {
    const i = this.projectPlaced.indexOf(moduleId);
    if (i >= 0) this.projectPlaced.splice(i, 1);
    this.sync();
  }

  placedInProject(): readonly string[] {
    return this.projectPlaced;
  }

  // --- panes ---

  // A root pane, opened at once: from `loaded` if no other pane shows the
  // document yet (an empty document if not given); otherwise it joins the
  // open copy. A document closes with the last pane showing it. `loaded` is
  // trusted as current: a host that reads documents uses `openPane`, which
  // reads in line with modules' edits to closed documents.
  addPane(pane: Pane, loaded?: LoadedDocument): void {
    if (this.slots.has(pane.id)) throw new Error(`pane ${pane.id} already exists`);
    const slot = this.rootSlot(pane.id, pane.documentId);
    if (pane.documentId !== null && !this.hubs.has(pane.documentId)) {
      const doc = loaded ?? { doc: emptyDocument(this.schema), error: null };
      this.loaded.set(pane.documentId, { doc, schema: null });
    }
    this.openSlot(slot);
    this.sync();
  }

  // A root pane on a document that may need reading first (with the
  // `load` option): until then the pane is `loading`, though modules can
  // already be placed on it.
  openPane(id: string, documentId: string | null): void {
    if (this.slots.has(id)) throw new Error(`pane ${id} already exists`);
    this.openSlot(this.rootSlot(id, documentId));
    this.sync();
  }

  // A root comes back with the modules saved for it.
  private rootSlot(id: string, documentId: string | null): Slot {
    const saved = this.savedState.pane(id);
    if (saved) this.savedState.setDocument(id, documentId);
    else this.savedState.addPane(id, { parent: null, host: null, owner: 'writer', document: documentId, modules: [] }, this.childrenMade);
    return this.makeSlot(id, null, documentId, 'writer', saved ? this.restorable(saved.modules) : []);
  }

  // Shows another document in a writer-owned pane: a new pane in the same
  // place, keeping its placements (its scopes restart and its children
  // close; only writer-owned ones are restored).
  showDocument(id: string, documentId: string | null): void {
    const slot = this.requireSlot(id);
    if (slot.owner === 'module') throw new Error(`pane ${id}'s document is chosen by the module hosting it`);
    if (slot.documentId === documentId && slot.error === null) return;
    if (documentId !== null) this.loadErrors.delete(documentId);
    this.closeSlot(slot, true);
    slot.documentId = documentId;
    slot.error = null;
    this.savedState.setDocument(id, documentId);
    this.openSlot(slot);
    this.sync();
  }

  // The pane and its children close: their scopes end, then the host's
  // app destroys the views.
  removePane(id: string): void {
    const slot = this.slots.get(id);
    if (!slot) return;
    if (slot.parent !== null) throw new Error(`pane ${id} is a hosted child; the module hosting it closes it`);
    this.closeSlot(slot, false);
    this.sync();
  }

  // Placing an editor replacement replaces the pane's other one, if any.
  place(paneId: string, moduleId: string): void {
    const entry = this.require(moduleId);
    const slot = this.requireSlot(paneId);
    if (slot.owner === 'module') throw new Error(`pane ${paneId}'s modules are its parent's`);
    if (entry.type === 'project') throw new Error(`module ${moduleId} is a project module; place it in the project`);
    const replaced: string[] = [];
    if (entry.type === 'editorReplacement') {
      for (const id of [...slot.own]) {
        if (id !== moduleId && this.installed.get(id)?.type === 'editorReplacement') {
          slot.own.splice(slot.own.indexOf(id), 1);
          replaced.push(id);
        }
      }
    }
    if (!slot.own.includes(moduleId)) slot.own.push(moduleId);
    const saved = (this.savedState.pane(paneId)?.modules ?? []).filter((id) => !replaced.includes(id));
    this.savedState.setModules(paneId, saved.includes(moduleId) ? saved : [...saved, moduleId]);
    for (const id of replaced) this.savedState.forgetModuleIn(paneId, id);
    this.pluginsDirty = true;
    this.sync();
  }

  unplace(paneId: string, moduleId: string): void {
    const slot = this.requireSlot(paneId);
    if (slot.owner === 'module') throw new Error(`pane ${paneId}'s modules are its parent's`);
    const i = slot.own.indexOf(moduleId);
    if (i >= 0) slot.own.splice(i, 1);
    this.savedState.setModules(paneId, (this.savedState.pane(paneId)?.modules ?? []).filter((id) => id !== moduleId));
    this.savedState.forgetModuleIn(paneId, moduleId);
    this.pluginsDirty = true;
    this.sync();
  }

  // The modules placed on a pane, in placement order: a module-owned
  // child's are its parent's, less the module hosting it.
  placed(paneId: string): readonly string[] {
    return this.placedIn(this.requireSlot(paneId));
  }

  private placedIn(slot: Slot): readonly string[] {
    if (slot.owner === 'writer' || slot.parent === null) return slot.own;
    const parent = this.slots.get(slot.parent);
    if (!parent) return [];
    const hosting = this.hosts.get(slot.parent)?.moduleId;
    return this.placedIn(parent).filter((id) => id !== hosting);
  }

  // Every slot, open or not, parents before their children.
  slotIds(): string[] {
    return [...this.slots.keys()];
  }

  paneInfo(id: string): PaneInfo | null {
    const slot = this.slots.get(id);
    if (!slot) return null;
    const status = slot.pane ? 'ready' : slot.error !== null ? 'error' : 'loading';
    const { parent, documentId, owner, error, generation } = slot;
    return { id, parent, documentId, owner, status, error, generation };
  }

  // What is drawn in place of the pane's editor, if anything.
  replacementOf(id: string): ReplacementInfo | null {
    for (const entry of this.installed.values()) {
      const component = entry.running?.replacementFor(id);
      if (component) return { moduleId: entry.def.id, component };
    }
    return null;
  }

  // Whether add-ons placed on the pane run anywhere: in the pane, its cards
  // or its module-owned children. Not while a replacement shows only
  // writer-owned panes (each with its own tab), or no text at all.
  addOnsRun(paneId: string): boolean {
    if (!this.replacementOf(paneId) || this.cardHosts.has(paneId)) return true;
    return [...this.slots.values()].some((slot) => slot.parent === paneId && slot.owner === 'module');
  }

  // The modules running in a pane: those placed, or only its editor
  // replacement's while one shows.
  private active(paneId: string): readonly string[] {
    const placed = this.placed(paneId);
    const replacement = this.replacementOf(paneId);
    // Cards are input surfaces of their pane: its other modules keep running in it.
    if (this.cardHosts.has(paneId)) return placed;
    return replacement ? placed.filter((id) => id === replacement.moduleId) : placed;
  }

  // The project's documents, for `ctx.project`. A deleted document
  // empties each writer-owned pane on it and closes each module-owned one
  // (a card goes with its host's document).
  setProjectDocuments(documents: readonly ProjectDocument[]): void {
    const ids = new Set(documents.map((d) => d.id));
    const deleted = new Set(this.projectStore.get().flatMap((d) => (ids.has(d.id) ? [] : [d.id])));
    this.projectStore.set(documents);
    for (const id of deleted) this.savedState.forgetDocument(id);
    const gone = (slot: Slot) => this.slots.get(slot.id) === slot && slot.documentId !== null && deleted.has(slot.documentId);
    for (const slot of [...this.slots.values()]) {
      if (!gone(slot)) continue;
      if (slot.owner === 'writer') this.showDocument(slot.id, null);
      else {
        const record = this.hosts.get(slot.parent!);
        if (record) this.closeChild(record, slot.id);
      }
    }
  }

  readonly projectDocuments: Readable<readonly ProjectDocument[]> = this.projectStore;

  // Every `ai.fetch` call in flight, then the last finished ones, newest first.
  private readonly aiCallStore = createStore<readonly AiCall[]>([]);
  readonly aiCalls: Readable<readonly AiCall[]> = this.aiCallStore;
  private aiCallsMade = 0;
  private readonly aiCallStops = new Map<number, AbortController>();

  // Stops the calls still out from these modules, as the writer asks from a tab's menu.
  stopAiCalls(moduleIds: readonly string[]): void {
    for (const call of this.aiCallStore.get()) {
      if (call.ended === null && moduleIds.includes(call.moduleId)) {
        this.aiCallStops.get(call.id)?.abort(new DOMException('The writer stopped this AI call', 'AbortError'));
      }
    }
  }

  // Sends a module's call and keeps its `AiCall` current as the response
  // arrives. `send` gets a signal that aborts when the module's own does or
  // when the writer stops the call.
  async trackAiCall(
    moduleId: string,
    path: string,
    send: (signal: AbortSignal) => Promise<Response>,
    own?: AbortSignal | null,
  ): Promise<Response> {
    const now = Date.now();
    let call: AiCall = { id: ++this.aiCallsMade, moduleId, path, started: now, state: 'waiting', arrivals: [], ended: null };
    const stop = new AbortController();
    this.aiCallStops.set(call.id, stop);
    const signal = own ? AbortSignal.any([own, stop.signal]) : stop.signal;
    const update = (change: Partial<AiCall>) => {
      // How a call ended is final: a read still pending when it was stopped fails after.
      if (call.ended !== null) return;
      const next: AiCall = { ...call, ...change };
      const finished = next.state !== 'waiting' && next.state !== 'receiving';
      const others = this.aiCallStore.get().filter((c) => c.id !== call.id);
      const live = others.filter((c) => c.ended === null);
      const done = others.filter((c) => c.ended !== null);
      call = finished ? { ...next, ended: Date.now() } : next;
      if (finished) this.aiCallStops.delete(call.id);
      this.aiCallStore.set(finished ? [...live, call, ...done].slice(0, live.length + AI_CALLS_KEPT) : [call, ...live, ...done]);
    };
    const end = (error: unknown) => update({ state: error instanceof DOMException && error.name === 'AbortError' ? 'aborted' : 'failed' });
    update({});
    let res: Response;
    try {
      res = await send(signal);
    } catch (error) {
      end(error);
      throw error;
    }
    if (!res.ok || !res.body) {
      update({ state: res.ok ? 'done' : 'failed' });
      return res;
    }
    update({ state: 'receiving' });
    const events = /text\/event-stream/.test(res.headers.get('Content-Type') ?? '');
    const decoder = new TextDecoder();
    const counted = res.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, out) => {
          const pieces = events ? (decoder.decode(chunk, { stream: true }).match(/^data:/gm)?.length ?? 0) : 1;
          if (pieces) update({ arrivals: [...call.arrivals, ...new Array<number>(pieces).fill(Date.now())] });
          out.enqueue(chunk);
        },
        flush: () => update({ state: 'done' }),
      }),
    );
    // A reader that gives up (an abort, a module that stops reading) ends it too.
    const reader = counted.getReader();
    const body = new ReadableStream<Uint8Array>({
      pull: async (out) => {
        try {
          const { done, value } = await reader.read();
          if (done) out.close();
          else out.enqueue(value);
        } catch (error) {
          end(error);
          out.error(error);
        }
      },
      cancel: (reason) => {
        update({ state: 'aborted' });
        return reader.cancel(reason);
      },
    });
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  }

  // What the writer grants each module, as the host's app decides it. Until
  // set: project access for every module, and no AI. A change ends the
  // `with(ctx.project, …)` and `with(ctx.ai, …)` scopes whose grant changed,
  // and redraws, as a value's change does, for plugins that read the grant.
  setGrants(grantsOf: (moduleId: string) => Grants): void {
    this.batch(() => {
      this.grantsOf = grantsOf;
      this.grantStore.set(this.grantStore.get() + 1);
      for (const id of this.installed.keys()) this.scheduleRedraw(id);
    });
  }

  grants(moduleId: string): Grants {
    return this.grantsOf(moduleId);
  }

  // Which grants each module has read this session, for the settings that
  // list only the modules a setting would change.
  private readonly asked = new Map<string, Set<keyof Grants>>();
  askedFor(moduleId: string, grant: keyof Grants): void {
    let mine = this.asked.get(moduleId);
    if (!mine) this.asked.set(moduleId, (mine = new Set()));
    mine.add(grant);
  }
  grantsAsked(moduleId: string): ReadonlySet<keyof Grants> {
    return this.asked.get(moduleId) ?? new Set();
  }

  readonly grantsChanged = this.grantStore.subscribe;

  async createDocument(name: string): Promise<string | null> {
    if (!this.options.create) return null;
    try {
      return await this.options.create(name);
    } catch (error) {
      console.error(`[mwps] could not create document "${name}":`, error);
      return null;
    }
  }

  async renameDocument(documentId: string, name: string): Promise<boolean> {
    if (!this.options.rename || !this.projectStore.get().some((d) => d.id === documentId)) return false;
    try {
      await this.options.rename(documentId, name);
      return true;
    } catch (error) {
      console.error(`[mwps] could not rename document ${documentId}:`, error);
      return false;
    }
  }

  // Reads a document that isn't open, for a module's edit; null if it
  // can't be read.
  async readClosed(documentId: string): Promise<{ loaded: LoadedDocument; schema: Schema } | null> {
    const schema = this.schema;
    if (!this.options.load) return null;
    try {
      return { loaded: await this.options.load(documentId, schema), schema };
    } catch {
      return null;
    }
  }

  saveClosed(documentId: string, doc: Node): void {
    this.options.save?.(documentId, doc);
  }

  // Runs `edit` after every earlier module edit to the same closed document,
  // and every earlier read to open it.
  queueClosedEdit<R>(documentId: string, edit: () => Promise<R>): Promise<R> {
    const run = (this.closedEdits.get(documentId) ?? Promise.resolve()).then(edit, edit);
    const settled = run.catch(() => {});
    this.closedEdits.set(documentId, settled);
    void settled.then(() => {
      if (this.closedEdits.get(documentId) === settled) this.closedEdits.delete(documentId);
    });
    return run;
  }

  pane(id: string): Pane {
    const pane = this.requirePane(id);
    return { id: pane.id, documentId: pane.documentId };
  }

  paneIds(): string[] {
    return [...this.panes.keys()];
  }

  // The pane's state, for its view; `undefined` while it shows no document.
  // It follows the slot: a pane switched to another document (or still
  // reading it) is the same pane to its view, and to the focus.
  paneState(id: string): Readable<EditorState | undefined> {
    this.requireSlot(id);
    return {
      get: () => this.panes.get(id)?.state.get(),
      subscribe: (listener) => {
        let pane = this.panes.get(id);
        let stop = pane ? pane.state.subscribe(listener) : () => {};
        const follow = () => {
          const next = this.panes.get(id);
          if (next === pane) return;
          stop();
          pane = next;
          stop = next ? next.state.subscribe(listener) : () => {};
          listener();
        };
        const unfollow = this.subscribe(follow);
        return () => {
          unfollow();
          stop();
        };
      },
    };
  }

  // The host's view sends every transaction here, and gets each new state
  // through `updateState`.
  dispatch(paneId: string, tr: Transaction): void {
    this.requirePane(paneId).dispatch(tr);
  }

  // Runs a command as the writer in the pane, as `p.run` does.
  run(paneId: string, command: Command): boolean {
    return this.requirePane(paneId).run(command);
  }

  // The view the pane's plugins see: its state, its element, its cards.
  paneView(paneId: string): EditorView | undefined {
    return this.panes.get(paneId)?.cards?.adapter;
  }

  // The name a module's action declaration was exported under.
  actionName(moduleId: string, action: ActionDeclaration): string | undefined {
    return this.installed.get(moduleId)?.actions.get(action);
  }

  // The host drew the pane's element, or took it away: the pane's plugin
  // views live while it is there, with it as `view.dom`.
  attachPaneElement(paneId: string, element: HTMLElement | null): void {
    if (element) this.paneElements.set(paneId, element);
    else this.paneElements.delete(paneId);
    this.panes.get(paneId)?.cards?.setElement(element);
  }

  // An open document's shared copy: its current `doc`, its `problem` (set
  // when it doesn't fit the schema), and `subscribe` for each commit.
  document(id: string): { readonly doc: Node; readonly problem: string | null; subscribe(l: () => void): () => void } | null {
    return this.hubs.get(id) ?? null;
  }

  // --- focus and actions ---

  // The pane the writer last focused, while it is open: the one actions,
  // keys and the toolbar act on. `null` before any or after it closes; a
  // pane showing another document keeps it, while it reads too.
  readonly lastFocusedPane: Readable<string | null> = this.focusStore;

  // Focus stays where it lands, a replaced pane included.
  focus(paneId: string | null): void {
    if (paneId !== null) this.requirePane(paneId);
    this.focusStore.set(paneId);
    this.controlsChanged();
  }

  // The focus path from `paneId`: the pane, then each pane hosting it.
  focusPath(paneId: string | null): string[] {
    const out: string[] = [];
    for (let id = paneId; id !== null && this.slots.has(id); id = this.slots.get(id)!.parent) out.push(id);
    return out;
  }

  // Every action of every module that is on, as it stands for `paneId`
  // (the last focused pane; `null` for none). Modules placed in the pane come
  // first, oldest placed first, then the rest in install order.
  actions(paneId: string | null): ActionEntry[] {
    const pane = paneId === null ? null : (this.panes.get(paneId) ?? null);
    const path = this.focusPath(paneId);
    return this.actionOrder(pane).flatMap((entry) => [...entry.actions].map(([decl, name]) => this.entry(entry, decl, name, path)));
  }

  private entry(entry: Installed, decl: ActionDeclaration, name: string, path: readonly string[]): ActionEntry {
    // A dry run that throws turns the module off, so keep a reference.
    const running = entry.running;
    const impl = running?.implementationFor(name, path);
    return {
      moduleId: entry.def.id,
      name,
      title: decl.title,
      keys: keysOf(decl),
      enabled: impl ? running!.canRun(impl) : false,
      active: impl ? running!.isActive(impl) : false,
    };
  }

  // A pane tab's items (`ui.tabMenu`) in the order provided: its actions as
  // they stand from that pane (the first implementation walking outward
  // from it runs), and its components. Modules running in the pane come
  // first, as in the palette.
  tabMenu(paneId: string): TabMenuItem[] {
    const pane = this.requirePane(paneId);
    const path = this.focusPath(paneId);
    return this.actionOrder(pane).flatMap((entry) =>
      entry.running!.uiFor('tabMenu', paneId, false).map((ui): TabMenuItem =>
        'action' in ui.item ? { kind: 'action', ...this.menuEntry(entry, ui.item, path) } : { kind: 'component', ...ui },
      ),
    );
  }

  // The project tab's actions (`ui.projectMenu`), project modules in
  // placement order.
  projectMenu(): ActionEntry[] {
    return this.projectPlaced.flatMap((id) => {
      const entry = this.installed.get(id)!;
      return entry.running?.uiFor('projectMenu', null, true).map(({ item }) => this.menuEntry(entry, item, [])) ?? [];
    });
  }

  private menuEntry(entry: Installed, item: UiItemImpl, path: readonly string[]): ActionEntry {
    const decl = (item as { action: ActionDeclaration }).action;
    return this.entry(entry, decl, entry.actions.get(decl)!, path);
  }

  // Runs an action as the writer would from the palette. Returns whether it
  // ran: `false` when it isn't implemented for the pane or declined.
  runAction(paneId: string | null, moduleId: string, name: string): boolean {
    if (paneId !== null) this.requireSlot(paneId);
    const running = this.installed.get(moduleId)?.running;
    const impl = running?.implementationFor(name, this.focusPath(paneId));
    return impl ? running!.runImplementation(impl) : false;
  }

  // One of a module's actions for `useAction`, as from `paneId` (`null`:
  // from the last focused pane, as the palette).
  actionFrom(moduleId: string, paneId: string | null, decl: ActionDeclaration): ActionSource {
    const name = this.actionName(moduleId, decl);
    if (name === undefined) throw new Error(`module ${moduleId}: useAction() got an action that isn't one of its exported actions`);
    const from = () => (paneId === null ? this.focusStore.get() : paneId);
    return {
      subscribe: this.controlsStore.subscribe,
      version: this.controlsStore.get,
      get: () => {
        const entry = this.installed.get(moduleId)!;
        const { enabled, active } = this.entry(entry, decl, name, this.focusPath(from()));
        return { enabled, active };
      },
      run: () => this.runAction(from(), moduleId, name),
    };
  }

  // A keydown in `paneId` (or outside every pane): dry-runs every action
  // bound to the key that is implemented there (a procedure always
  // applies). None applies: the key passes on. One: it runs. Several: the
  // writer chooses among them (`keyChoice`), and the key is taken.
  actionKey(paneId: string | null, event: KeyboardEvent): boolean {
    const pane = paneId === null ? null : this.panes.get(paneId) ?? null;
    const path = this.focusPath(paneId);
    const bound: Record<string, (() => void)[]> = {};
    const hit = new Set<{ entry: Installed; decl: ActionDeclaration; name: string }>();
    for (const entry of this.actionOrder(pane)) {
      for (const [decl, name] of entry.actions) {
        const action = { entry, decl, name };
        for (const key of keysOf(decl)) for (const b of bindingNames(key)) (bound[b] ??= []).push(() => hit.add(action));
      }
    }
    // Every binding the key matches; the bindings ignore their arguments,
    // so no view is needed.
    const collect = (b: string): Command => () => (bound[b]!.forEach((add) => add()), false);
    keydownHandler(Object.fromEntries(Object.keys(bound).map((b) => [b, collect(b)])))({} as EditorView, event);
    const applying = [...hit].filter(({ entry, name }) => {
      const impl = entry.running?.implementationFor(name, path);
      return impl !== undefined && entry.running!.canRun(impl);
    });
    if (applying.length === 0) return false;
    if (applying.length === 1) return this.runAction(paneId, applying[0]!.entry.def.id, applying[0]!.name);
    this.choiceStore.set({ paneId, actions: applying.map(({ entry, decl, name }) => this.entry(entry, decl, name, path)) });
    return true;
  }

  // The actions a key left to the writer, from the pane it was pressed
  // in: a new object each time, for the app to offer them at the caret.
  readonly keyChoice: Readable<KeyChoice | null> = this.choiceStore;

  // --- UI roots ---

  // Changes whenever any module's UI items change, for useSyncExternalStore.
  readonly uiVersion: Readable<number> = this.uiStore;

  // A module asked for a side view to be shown (`p.reveal`); the side tabs
  // open it if it is closed.
  private readonly revealStore = createStore<{ key: string } | null>(null);
  readonly revealed: Readable<{ key: string } | null> = this.revealStore;
  reveal(key: string): void {
    this.revealStore.set({ key });
  }

  uiChanged(): void {
    this.uiStore.set(this.uiStore.get() + 1);
    this.controlsChanged();
  }

  // An editor replacement came or went: the other modules placed there
  // leave the pane or come back.
  replacementChanged(): void {
    this.pluginsDirty = true;
    this.sync();
  }

  // The components for a root. The toolbar's and the side tabs' are for
  // `paneId` (the last focused pane, or `null`), in the palette's order,
  // with module-wide items of every running module (so placed somewhere). A pane's overlay and
  // selection bubble hold the items of the modules placed in it, oldest
  // placed first. The window's modal root holds every one provided, wherever.
  uiItems(root: ComponentRoot, paneId: string | null): ProvidedUi[] {
    if (root === 'modal') return [...this.installed.values()].flatMap((e) => e.running?.uiFor(root, null, true, true) ?? []);
    const pane = paneId === null ? null : this.panes.get(paneId) ?? null;
    if (root === 'toolbar' || root === 'side') {
      return this.actionOrder(pane).flatMap((e) => e.running!.uiFor(root, pane?.id ?? null, true));
    }
    const modules = pane ? this.modulesIn(pane.id).map((id) => this.installed.get(id)!).filter((e) => e.running) : [];
    return modules.flatMap((e) => e.running!.uiFor(root, paneId, false));
  }

  // Modules placed in the pane, oldest placed first, then the rest.
  private actionOrder(pane: PaneImpl | null): Installed[] {
    const all = [...this.installed.values()].filter((e) => e.running);
    if (!pane) return all;
    const placed = this.active(pane.id).map((id) => this.installed.get(id)!).filter((e) => e.running);
    return [...placed, ...all.filter((e) => !placed.includes(e))];
  }

  // --- internals ---

  batch(fn: () => void): void {
    this.batchDepth++;
    try {
      fn();
    } finally {
      this.batchDepth--;
    }
    if (this.batchDepth > 0) return;
    this.batchDepth++;
    try {
      // Effects see the plugins their setups provided, and the redraws.
      this.flush();
      while (this.deferred.length) {
        this.deferred.shift()!();
        this.flush();
      }
    } finally {
      this.batchDepth--;
    }
  }

  // Plugin lists, then value redraws.
  private flush(): void {
    this.flushPanes();
    this.flushRedraws();
  }

  // Brings every pane's module plugins up to date, unless a dispatch is
  // running (the pane flushes when it ends). A pane's come newest placed
  // module first, so it sees input first, then the module hosting it. Two
  // plugins with one key in a pane fail the module placed later.
  private flushPanes(): void {
    if (!this.pluginsDirty || this.busy.applying > 0) return;
    this.pluginsDirty = false;
    const clashes: [string, Error][] = [];
    // The first `flipped` contributions go in reverse.
    const update = (client: DocumentClient, name: string, contributions: [string, Plugin[]][], flipped = 0) => {
      const keys = client.ownKeys();
      const seen = new Set<Plugin>();
      const byModule: Plugin[][] = [];
      for (const [id, plugins] of contributions) {
        const mine: Plugin[] = [];
        for (const plugin of plugins) {
          if (seen.has(plugin)) continue;
          if (keys.has(keyOf(plugin))) {
            clashes.push([id, new Error(`a plugin with key "${keyOf(plugin)}" is already in ${name}`)]);
            continue;
          }
          keys.add(keyOf(plugin));
          seen.add(plugin);
          mine.push(plugin);
        }
        byModule.push(mine);
      }
      client.setModulePlugins([...byModule.slice(0, flipped).reverse(), ...byModule.slice(flipped)].flat());
    };
    for (const pane of this.panes.values()) {
      const contributions = this.modulesIn(pane.id).map((id): [string, Plugin[]] => [
        id,
        this.installed.get(id)?.running?.pluginsFor(pane) ?? [],
      ]);
      update(pane, `pane ${pane.id}`, contributions, this.active(pane.id).length);
    }
    for (const [id, state] of this.docStates) {
      const contributions = [...this.installed.values()].map((e): [string, Plugin[]] => [
        e.def.id,
        e.running?.documentPlugins(id) ?? [],
      ]);
      update(state, `document ${id}`, contributions);
    }
    for (const [id, error] of clashes) this.fail(id, error);
  }

  // An open document's shared copy.
  hub(id: string): DocumentHub | null {
    return this.hubs.get(id) ?? null;
  }

  // An open document's one hidden state, where modules edit.
  documentState(id: string): DocumentState | null {
    return this.docStates.get(id) ?? null;
  }

  markPluginsDirty(): void {
    this.pluginsDirty = true;
    if (this.batchDepth === 0) this.flushPanes();
  }

  // A value set redraws its module's panes when its batch ends, or, inside
  // a dispatch or reactions, in the flush that ends them.
  scheduleRedraw(moduleId: string): void {
    this.redraws.add(moduleId);
  }

  // A redraw's reactions may set values again, which redraw from inside
  // this one; past the cap, the modules still setting are turned off.
  private flushRedraws(): void {
    if (this.busy.applying > 0 || this.busy.reacting > 0 || this.redraws.size === 0) return;
    const ids = new Set(this.redraws);
    this.redraws.clear();
    if (this.redrawDepth >= REACTION_CAP) {
      const error = new Error(`value sets from reactions to one change passed ${REACTION_CAP}; stopped as a runaway loop`);
      for (const id of ids) this.fail(id, error);
      return;
    }
    this.redrawDepth++;
    try {
      for (const pane of this.panes.values()) if (this.modulesIn(pane.id).some((id) => ids.has(id))) pane.redraw();
    } finally {
      this.redrawDepth--;
    }
  }

  defer(fn: () => void): void {
    if (this.batchDepth === 0) throw new Error('defer outside a batch');
    this.deferred.push(fn);
  }

  fail(id: string, error: unknown): void {
    const entry = this.installed.get(id);
    if (!entry || entry.failed) return;
    entry.failed = true;
    console.error(`[mwps] module ${id} failed and was turned off:`, error);
    this.options.onFailure?.(id, error);
    this.sync();
  }

  // Brings every module's running state and collections in line with the
  // installed modules, their status and the placements, and every host's
  // children with the panes open.
  private sync(): void {
    this.updateModules();
    this.version++;
    this.listeners.notify();
    this.controlsChanged();
  }

  private updating = false;
  private updateAgain = false;

  // One update at a time: a call while one runs (a scope's end closing
  // panes, a module failing in its setup) makes it go round again, so no
  // loop over members sees them change under it. Documents no pane shows
  // close once their scopes have ended.
  private updateModules(): void {
    if (this.updating) {
      this.updateAgain = true;
      return;
    }
    this.updating = true;
    try {
      do {
        this.updateAgain = false;
        this.batch(() => this.updateOnce());
      } while (this.updateAgain);
    } finally {
      this.updating = false;
    }
    this.closeUnusedHubs();
  }

  // Everything that ends goes first, so a module starting in the same
  // change (a replacement replacing another) finds the pane already free.
  private updateOnce(): void {
    this.refreshHosts();
    for (const [id, entry] of this.installed) {
      const shouldRun = this.shouldRun(id, entry);
      if (!shouldRun && entry.running) {
        const running = entry.running;
        entry.running = null;
        running.stop();
      } else if (entry.running) {
        const panes = this.panesFor(id);
        entry.running.setMembers(
          entry.running.paneMembers().filter((p) => panes.includes(p)),
          (docId) => this.documentMember(docId),
        );
      }
    }
    for (const [id, entry] of this.installed) {
      const shouldRun = this.shouldRun(id, entry);
      if (shouldRun && !entry.running) {
        entry.running = new RunningModule(this, entry.def);
        entry.running.start();
      }
      entry.running?.setMembers(this.panesFor(id), (docId) => this.documentMember(docId));
    }
  }

  private closeUnusedHubs(): void {
    for (const hub of [...this.hubs.values()]) {
      if ([...this.panes.values()].some((p) => p.hub === hub)) continue;
      this.hubs.delete(hub.id);
      this.docStates.get(hub.id)?.close();
      this.docStates.delete(hub.id);
    }
  }

  // A module runs while it is on and placed: in at least one pane, or, a
  // project module, in the project.
  private shouldRun(id: string, entry: Installed): boolean {
    if (!entry.enabled || entry.failed) return false;
    return entry.type === 'project' ? this.projectPlaced.includes(id) : this.panesFor(id).length > 0;
  }

    private panesFor(moduleId: string): PaneImpl[] {
    return [...this.panes.values()].filter((p) => this.active(p.id).includes(moduleId));
  }

  // The modules with something in the pane: those running there, then the
  // module hosting it, once. Their plugins go in it and their CSS applies.
  modulesIn(paneId: string): string[] {
    const hosting = this.parentHost(paneId);
    return [...new Set(hosting ? [...this.active(paneId), hosting] : this.active(paneId))];
  }

  private parentHost(paneId: string): string | undefined {
    const parent = this.slots.get(paneId)?.parent;
    return parent == null ? undefined : this.hosts.get(parent)?.moduleId;
  }

  // --- slots and child panes ---

  private makeSlot(
    id: string,
    parent: string | null,
    documentId: string | null,
    owner: 'writer' | 'module',
    own: string[],
  ): Slot {
    const slot: Slot = { id, parent, documentId, owner, own, pane: null, generation: 0, error: null };
    this.slots.set(id, slot);
    return slot;
  }

  // Opens the slot's pane if its document is open or read; else starts
  // reading it. Module scopes catch up at the next `updateModules`.
  private openSlot(slot: Slot): void {
    if (slot.pane || slot.error !== null) return;
    const documentId = slot.documentId;
    let hub: DocumentHub | null = null;
    if (documentId !== null) {
      hub = this.hubs.get(documentId) ?? null;
      if (!hub) {
        const failed = this.loadErrors.get(documentId);
        if (failed !== undefined) {
          slot.error = failed;
          return;
        }
        const read = this.loaded.get(documentId);
        if (!read) {
          this.read(documentId);
          return;
        }
        this.loaded.delete(documentId);
        // Read under a schema that has since changed.
        const stale = read.schema !== null && read.schema !== this.schema;
        hub = this.openHub(documentId, stale ? moveToSchema(read.doc.doc, this.schema) : read.doc);
      }
    }
    this.showIn(slot, new PaneImpl(slot.id, hub, this.busy, (event) => this.actionKey(slot.id, event)));
  }

  private showIn(slot: Slot, pane: PaneImpl): void {
    pane.state.subscribe(this.controlsChanged);
    const hub = pane.hub;
    if (hub) {
      // Every pane's editor is a card over the writing; modules add their own.
      const cards = new CardsHost(() => (this.panes.get(slot.id) === pane ? pane : undefined), () => `${slot.id}/${++this.childrenMade}`);
      pane.cards = cards;
      pane.stopCards = hub.beforeReactions(() => {
        const failed = cards.relist(hub);
        if (failed) this.fail(failed.moduleId, failed.error);
      });
    }
    slot.pane = pane;
    slot.generation = ++panesOpened;
    this.panes.set(slot.id, pane);
    pane.build([]);
    const main = (doc: Node) => [{ parent: -1, from: 0, to: writing(doc).content.size }];
    pane.cards?.addGroup('host', 'writing', main, () => null, () => `${slot.id}/writing`);
    pane.cards?.setElement(this.paneElements.get(slot.id) ?? null);
    this.pluginsDirty = true;
  }

  private openHub(id: string, loaded: LoadedDocument): DocumentHub {
    const hub = new DocumentHub(id, loaded.doc, loaded.error, this.busy);
    this.hubs.set(id, hub);
    const state = new DocumentState(hub, this.busy, (p) => this.pluginModule.get(p) ?? 'host');
    this.docStates.set(id, state);
    state.build([]);
    hub.subscribe(() => {
      if (hub.problem === null) this.options.save?.(id, hub.doc);
    });
    return hub;
  }

  private read(documentId: string): void {
    if (this.loading.has(documentId)) return;
    const load = this.options.load;
    if (!load) {
      this.loadErrors.set(documentId, `document ${documentId} isn't open, and this host can't read documents`);
      this.retryWaiting();
      return;
    }
    this.loading.add(documentId);
    const schema = this.schema;
    // In line with modules' edits to it while closed: it reads what the
    // earlier ones saved, and opens before a later one runs.
    void this.queueClosedEdit(documentId, async () => {
      try {
        this.loaded.set(documentId, { doc: await load(documentId, schema), schema });
      } catch (error) {
        this.loadErrors.set(documentId, error instanceof Error ? error.message : String(error));
      } finally {
        this.loading.delete(documentId);
        this.retryWaiting();
        this.sync();
        // Nobody wanted it after all.
        this.loaded.delete(documentId);
      }
    });
  }

  // Slots waiting for a document that has since been read, or failed.
  private retryWaiting(): void {
    for (const slot of this.slots.values()) if (!slot.pane) this.openSlot(slot);
  }

  // Closes the slot's children (deepest first), then its own pane; their
  // module scopes end at the next update. A kept slot stays, to open again.
  private closeSlot(slot: Slot, keep: boolean): void {
    for (const child of [...this.slots.values()].reverse()) {
      if (child.parent === slot.id) this.closeSlot(child, false);
    }
    const pane = slot.pane;
    slot.pane = null;
    if (!keep) this.slots.delete(slot.id);
    if (!pane) return;
    this.panes.delete(slot.id);
    // A pane showing another document keeps focus, even while it reads.
    if (!keep && this.focusStore.get() === slot.id) {
      this.focusStore.set(slot.parent !== null && this.panes.has(slot.parent) ? slot.parent : null);
    }
    this.pluginsDirty = true;
    // Closed before scopes end, since ending them can make the document's
    // other copies react, and a pane the host no longer has mustn't.
    pane.close();
  }

  // A pane scope's `hostChildPanes`: the pane hosts children until the
  // returned removal, which closes them.
  hostChildren(
    paneId: string,
    moduleId: string,
    members: HostedPanesImpl<PaneHandle>,
    persist = false,
  ): { record: HostRecord; remove: () => void } {
    this.assertNotHosting(paneId);
    // Only a saved pane's children can be saved.
    const saving = persist && this.savedState.pane(paneId) !== undefined;
    const record: HostRecord = { paneId, moduleId, members, children: [], handles: new Map(), persist: saving };
    this.hosts.set(paneId, record);
    // Its saved children come back first, with their ids.
    if (saving) {
      for (const id of this.savedState.children(paneId, moduleId)) {
        const saved = this.savedState.pane(id)!;
        if (this.slots.has(id)) continue;
        this.openChild(record, id, saved.document, saved.owner, saved.owner === 'writer' ? this.restorable(saved.modules) : []);
      }
    }
    const remove = () => {
      if (this.hosts.get(paneId) !== record) return;
      for (const id of [...record.children].reverse()) {
        const slot = this.slots.get(id);
        if (slot) this.closeSlot(slot, false);
      }
      record.children.length = 0;
      this.hosts.delete(paneId);
      this.sync();
    };
    return { record, remove };
  }

  // A pane scope's `hostPartPanes`: the writing's blocks are drawn as
  // cards, editors of the pane, until the returned removal.
  hostParts(paneId: string, moduleId: string, matches: (node: Node) => boolean): { list: Store<readonly PartHandle[]>; remove: () => void } {
    this.assertNotHosting(paneId);
    const cards = this.requirePane(paneId).cards;
    if (!cards) throw new Error(`pane ${paneId} shows no document`);
    const where = (doc: Node) => {
      const out: CardRange[] = [];
      writing(doc).forEach((node, pos) => void (matches(node) && out.push({ parent: -1, from: pos, to: pos + node.nodeSize })));
      return out;
    };
    const { group, remove: ungroup } = cards.addGroup(moduleId, 'layout', where, (card) => this.cardHandle(paneId, card));
    const record = { moduleId, remove: () => {} };
    record.remove = () => {
      if (this.cardHosts.get(paneId) !== record) return;
      ungroup();
      this.cardHosts.delete(paneId);
      this.updateModules();
      this.sync();
    };
    this.cardHosts.set(paneId, record);
    // The pane's other modules run in it while it shows cards.
    this.updateModules();
    return { list: hostStore({ get: group.list.get }, group.list.subscribe), remove: record.remove };
  }

  // A pane scope's `dataCards`: the module's nodes of `type` in the
  // document's data node, each drawn as an editor of the pane whose document is
  // the node, until the returned removal.
  dataCards(paneId: string, moduleId: string, type: string): { list: Store<readonly PartHandle[]>; remove: () => void } {
    const owned = this.installed.get(moduleId)?.parts.nodes[type];
    if (!owned || !(owned.group ?? '').split(' ').includes('module_data')) {
      throw new Error(`module ${moduleId}: dataCards("${type}") takes one of the module's own node types in the module_data group`);
    }
    const cards = this.requirePane(paneId).cards;
    if (!cards) throw new Error(`pane ${paneId} shows no document`);
    const where = (doc: Node) => {
      const out: CardRange[] = [];
      const data = doc.lastChild;
      if (data?.type.name !== DATA_NODE) return out;
      const base = doc.content.size - data.nodeSize + 1;
      data.forEach((node, offset) => {
        const pos = base + offset;
        if (node.type.name === type) out.push({ parent: pos, from: pos + 1, to: pos + node.nodeSize - 1 });
      });
      return out;
    };
    const { group, remove } = cards.addGroup(moduleId, 'data', where, (card) => this.cardHandle(paneId, card));
    return { list: hostStore({ get: group.list.get }, group.list.subscribe), remove };
  }

  // The module whose data card holds the pane's selection, if one does.
  dataCardOwnerAtSelection(paneId: string): string | null {
    const pane = this.panes.get(paneId);
    const sel = pane?.state.get()?.selection;
    if (!sel) return null;
    const group = pane!.cards?.groups.find(
      (g) => g.kind === 'data' && g.surfaces.some((c) => sel.from >= c.from && sel.to <= c.to),
    );
    return group?.moduleId ?? null;
  }

  // A card of the pane, by its handle's id.
  card(paneId: string, id: string): CardSurface | undefined {
    return this.panes.get(paneId)?.cards?.surfaces.find((c) => c.id === id);
  }

  // The pane's main editor: a card over the writing.
  mainCard(paneId: string): CardSurface | undefined {
    return this.panes.get(paneId)?.cards?.groups[0]?.surfaces[0];
  }

  private assertNotHosting(paneId: string): void {
    const existing = this.hosts.get(paneId) ?? this.cardHosts.get(paneId);
    if (existing) throw new Error(`pane ${paneId} already hosts child panes, from module ${existing.moduleId}`);
  }

  // What the layout module holds of a card.
  private cardHandle(hostId: string, card: CardSurface): PartHandle {
    const options = this.options;
    return {
      id: card.id,
      get part() {
        return card.part;
      },
      state: hostStore({ get: () => card.state }, card.listeners.subscribe),
      get element() {
        return options.drawCard?.(card, hostId) ?? createElement(Fragment, { key: card.id });
      },
      mount: (el) => options.mountCard?.(card, hostId, el) ?? (() => {}),
      run: (command) => card.run(command),
      focus: () => {
        this.focus(hostId);
        card.focus();
      },
    };
  }

  // Mints a child of a host pane and opens it.
  createChild(record: HostRecord, options: ChildPaneOptions = {}): ChildHandle {
    this.assertNotApplying('create');
    if (this.hosts.get(record.paneId) !== record) throw new Error(`pane ${record.paneId} no longer hosts child panes`);
    const parent = this.requireSlot(record.paneId);
    const id = `${record.paneId}/${++this.childrenMade}`;
    const owner = options.owner ?? 'module';
    if (owner !== 'writer' && owner !== 'module') {
      throw new Error(`create(): owner is "${String(owner)}", not "writer" or "module"`);
    }
    if (options.document === null && owner === 'module') {
      throw new Error(`create(): a module-owned child shows a document; document: null is for owner: 'writer'`);
    }
    const documentId = options.document === undefined ? parent.documentId : options.document;
    // A writer-owned child starts from its parent's modules.
    const own = owner === 'writer' ? this.placedIn(parent).filter((m) => m !== record.moduleId) : [];
    if (record.persist) {
      const saved = { parent: record.paneId, host: record.moduleId, owner, document: documentId, modules: own };
      this.savedState.addPane(id, saved, this.childrenMade);
    }
    return this.openChild(record, id, documentId, owner, own);
  }

  private openChild(record: HostRecord, id: string, documentId: string | null, owner: 'writer' | 'module', own: string[]): ChildHandle {
    const slot = this.makeSlot(id, record.paneId, documentId, owner, own);
    const handle: ChildHandle = { ...this.hostedHandle(id), owner, close: () => this.closeChild(record, id) };
    record.children.push(id);
    record.handles.set(id, handle);
    this.relist(record);
    this.openSlot(slot);
    this.sync();
    return handle;
  }

  private closeChild(record: HostRecord, id: string): void {
    this.assertNotApplying('close');
    const i = record.children.indexOf(id);
    if (i < 0) return;
    record.children.splice(i, 1);
    record.handles.delete(id);
    this.savedState.removePane(id);
    this.relist(record);
    const slot = this.slots.get(id);
    if (slot) this.closeSlot(slot, false);
    this.sync();
  }

  private assertNotApplying(what: string): void {
    if (this.busy.applying > 0) {
      throw new Error(`${what}() inside a dispatch (a plugin's apply, filter or follow-up); call it from a reaction or later`);
    }
  }

  // What the hosting module holds of any child.
  private hostedHandle(id: string): PaneHandle {
    const pane = () => this.panes.get(id);
    const listening = (listener: () => void) => {
      // The child's pane is replaced when its document changes; the host's
      // listeners hear that, and the new pane's state is followed from then.
      let stop = pane()?.state.subscribe(listener) ?? (() => {});
      let current = pane();
      const stopHost = this.subscribe(() => {
        if (pane() === current) return;
        stop();
        current = pane();
        stop = current?.state.subscribe(listener) ?? (() => {});
        listener();
      });
      return () => {
        stop();
        stopHost();
      };
    };
    return {
      id,
      state: hostStore({ get: () => pane()?.state.get() }, listening),
      element: this.options.drawPane?.(id) ?? createElement(Fragment, { key: id }),
      mount: (el) => this.options.mountPane?.(id, el) ?? (() => {}),
      run: (command) => (pane() ? this.run(id, command) : false),
      focus: () => {
        if (!pane()) return;
        this.focus(id);
        this.paneView(id)?.focus();
      },
    };
  }

  // The list changes as `create` or `close` returns.
  private relist(record: HostRecord): void {
    record.members.setList(record.children.map((id) => record.handles.get(id)!));
  }

  // Each host's open children are its members, once setups are done.
  private refreshHosts(): void {
    for (const record of this.hosts.values()) {
      const running = this.installed.get(record.moduleId)?.running;
      const members = record.children.flatMap((id) => this.slots.get(id)?.pane ?? []);
      if (running && !sameMembers(record.members.members(), members)) running.batch(() => record.members.setMembers(members));
    }
  }

  // One member object per document id, so `each` keeps its scope.
  private documentMember(id: string): DocumentMember {
    let member = this.documents.get(id);
    if (!member) this.documents.set(id, (member = { id }));
    return member;
  }

  private require(id: string): Installed {
    const entry = this.installed.get(id);
    if (!entry) throw new Error(`no module ${id} is installed`);
    return entry;
  }

  private requireSlot(id: string): Slot {
    const slot = this.slots.get(id);
    if (!slot) throw new Error(`no pane ${id}`);
    return slot;
  }

  private requirePane(id: string): PaneImpl {
    const pane = this.panes.get(id);
    if (!pane) throw new Error(`no pane ${id}`);
    return pane;
  }
}

type Target = { kind: 'module' } | { kind: 'document'; id: string } | { kind: 'pane'; id: string };
// Where an action may be implemented.
type ActionTarget = Exclude<Target, { kind: 'document' }>;

interface ProvidedAction {
  name: string;
  target: ActionTarget;
  impl: ActionImplementation;
}

// One component in a UI root; `key` is unique on the page.
export interface ProvidedUi {
  readonly key: string;
  readonly moduleId: string;
  readonly item: UiItemImpl;
  readonly target: ActionTarget;
}

let nextUiKey = 0;

// Whether two implementations can apply to one pane.
function overlaps(a: ActionTarget, b: ActionTarget): boolean {
  return a.kind === 'module' || b.kind === 'module' || a.id === b.id;
}

// A host pane's children: a collection of their panes for `each`, and the
// module's handles as `list`.
class HostedPanesImpl<H extends PaneHandle> extends CollectionImpl<PaneImpl, PaneScopeImpl> {
  private readonly listStore = createStore<readonly H[]>([]);
  readonly list: Store<readonly H[]> = hostStore({ get: this.listStore.get }, this.listStore.subscribe);

  constructor(makeScope: (rt: ModuleRuntime, member: PaneImpl) => PaneScopeImpl) {
    super(new Listeners(), makeScope);
  }

  setList(next: readonly H[]): void {
    const now = this.listStore.get();
    if (next.length !== now.length || next.some((c, i) => c !== now[i])) this.listStore.set(next);
  }

  // A child's handle is listed before its pane is a member.
  override handleOf(member: PaneImpl): H | undefined {
    return this.listStore.get().find((h) => h.id === member.id);
  }
}

class ChildPanesImpl extends HostedPanesImpl<ChildHandle> {
  create: (options?: ChildPaneOptions) => ChildHandle = () => {
    throw new Error('create() before the host pane is ready');
  };
}

class PaneScopeImpl extends ScopeImpl implements PaneScope {
  readonly id: string;
  readonly documentId: string | null;
  readonly document: DocumentRef | null;
  readonly state: Store<EditorState | undefined>;
  readonly isLastFocused: Condition<boolean>;
  private readonly target: Target;
  constructor(
    private readonly running: RunningModule,
    private readonly pane: PaneImpl,
  ) {
    const target: Target = { kind: 'pane', id: pane.id };
    const controls: ControlProvider = (thing, impl) => running.provide(target, thing, impl);
    super(running, true, controls);
    actionSources.set(controls, (decl) => running.host.actionFrom(running.id, pane.id, decl));
    this.target = target;
    this.id = pane.id;
    this.documentId = pane.documentId;
    this.document = pane.documentId === null ? null : documentRef(running, pane.documentId, () => this.live);
    this.state = hostStore({ get: pane.state.get }, pane.state.subscribe);
    const focus = running.host.lastFocusedPane;
    this.isLastFocused = createCondition(() => running.host.focusPath(focus.get()).includes(pane.id), focus.subscribe);
  }

  override provide(thing: Plugin | ActionDeclaration | UiItem | PaneUiItem, implementation?: ActionImplementation): void {
    if (!(thing instanceof Plugin)) return super.provide(thing, implementation);
    this.onEnd(this.running.provide(this.target, thing));
  }

  hostChildPanes(options?: { persist?: boolean }): ChildPanes {
    this.assertLive('hostChildPanes');
    const { children, remove } = this.hostIn(options);
    this.onEnd(remove);
    return children;
  }

  hostPartPanes(matches: (node: Node) => boolean): PartPanes {
    this.assertLive('hostPartPanes');
    const { children, remove } = this.hostPartsIn(matches);
    this.onEnd(remove);
    return children;
  }

  dataCards(type: string): PartPanes {
    this.assertLive('dataCards');
    const { list, remove } = this.running.host.dataCards(this.id, this.running.id, type);
    this.onEnd(remove);
    return { list };
  }

  // `hostChildPanes`, for this scope or a `with` inside it, which ends it.
  hostIn(options: { persist?: boolean } | undefined): { children: ChildPanes; remove: () => void } {
    this.assertMayHost('hostChildPanes');
    if (options !== undefined && (typeof options !== 'object' || options === null)) {
      throw new Error(`module ${this.running.id}: hostChildPanes() takes { persist } or nothing`);
    }
    const host = this.running.host;
    const members = new ChildPanesImpl((_rt, child) => new PaneScopeImpl(this.running, child));
    const persist = options?.persist === true;
    const { record, remove } = host.hostChildren(this.id, this.running.id, members as HostedPanesImpl<PaneHandle>, persist);
    members.create = (opts) => host.createChild(record, opts);
    return { children: members as unknown as ChildPanes, remove };
  }

  // `hostPartPanes`, likewise.
  hostPartsIn(matches: (node: Node) => boolean): { children: PartPanes; remove: () => void } {
    this.assertMayHost('hostPartPanes');
    if (typeof matches !== 'function') throw new Error(`module ${this.running.id}: hostPartPanes() takes a function of a block`);
    const { list, remove } = this.running.host.hostParts(this.id, this.running.id, matches);
    return { children: { list }, remove };
  }

  private assertMayHost(what: string): void {
    const id = this.running.id;
    if (this.running.host.moduleType(id) !== 'editorReplacement') {
      throw new Error(`module ${id}: only an editor replacement hosts child panes (${what}); export const moduleType = 'editorReplacement'`);
    }
  }

  override with<T>(condition: Condition<T>, setup: (scope: PaneChildScope, value: Exclude<T, null | undefined | false>) => void): void {
    // Its children are `withChild`'s, which have `hostChildPanes`.
    super.with(condition, setup as Parameters<ScopeImpl['with']>[1]);
  }

  protected override withChild(): ScopeImpl {
    return new PaneWithScopeImpl(this.running, this.controlProvider, this);
  }

  protected override values(): ValueTable {
    return this.running.valuesOf('pane', this.id);
  }

  run(command: Command): boolean {
    if (!this.live) return false;
    if (this.running.settingUp) {
      throw new Error(`module ${this.running.id}: p.run() while a scope is being set up; start an effect instead`);
    }
    if (this.running.applying) {
      throw new Error(`module ${this.running.id}: p.run() inside another dispatch (a plugin's apply, filter or follow-up)`);
    }
    assertNotInPaneView(`module ${this.running.id}: p.run()`);
    return this.pane.run(command);
  }

  reveal(item: UiItem): void {
    if (!this.live) return;
    const key = this.running.sideKeyOf(item, this.id);
    if (key !== undefined) this.running.host.reveal(key);
  }

  focus(): void {
    if (!this.live) return;
    this.running.host.focus(this.id);
    this.running.host.paneView(this.id)?.focus();
  }
}

// A `with` inside a pane scope: controls, and the pane's children while it
// lives.
class PaneWithScopeImpl extends ScopeImpl implements PaneChildScope {
  constructor(
    private readonly running: RunningModule,
    controlProvider: ControlProvider | null,
    private readonly pane: PaneScopeImpl,
  ) {
    super(running, false, controlProvider);
  }

  hostChildPanes(options?: { persist?: boolean }): ChildPanes {
    this.assertLive('hostChildPanes');
    const { children, remove } = this.pane.hostIn(options);
    this.onEnd(remove);
    return children;
  }

  hostPartPanes(matches: (node: Node) => boolean): PartPanes {
    this.assertLive('hostPartPanes');
    const { children, remove } = this.pane.hostPartsIn(matches);
    this.onEnd(remove);
    return children;
  }

  override with<T>(condition: Condition<T>, setup: (scope: PaneChildScope, value: Exclude<T, null | undefined | false>) => void): void {
    super.with(condition, setup as Parameters<ScopeImpl['with']>[1]);
  }

  protected override withChild(): ScopeImpl {
    return new PaneWithScopeImpl(this.running, this.controlProvider, this.pane);
  }
}

// A document as a pane scope hands it out: edits stop once `live` is false.
function documentRef(running: RunningModule, id: string, live: () => boolean): DocumentRef {
  const host = running.host;
  return {
    id,
    edit: (command) => (live() ? running.edit(id, command) : false),
    state: documentStore(host, id),
    getValue: (key) => {
      if (!live()) throw new Error(`module ${running.id}: getValue() on a document whose pane scope has ended`);
      return running.valuesOf('document', id).get(key);
    },
  };
}

// An open document's state for module code: read at rest, never inside a
// dispatch, where it may not have caught up.
function documentStore(host: Host, id: string): Store<EditorState> {
  const state = () => host.documentState(id)!.state;
  return hostStore(
    {
      get: () => {
        if (host.busy.applying > 0) throw new Error(`d.state.get() inside a dispatch (a plugin's apply, filter or follow-up)`);
        return state().get()!;
      },
    },
    (listener) => state().subscribe(listener),
  );
}

class DocumentScopeImpl extends ScopeImpl implements DocumentScope {
  readonly id: string;
  readonly state: Store<EditorState>;
  constructor(
    private readonly running: RunningModule,
    doc: DocumentMember,
  ) {
    super(running, true);
    this.id = doc.id;
    this.state = documentStore(running.host, doc.id);
  }

  edit(command: Command): boolean {
    return this.live ? this.running.edit(this.id, command) : false;
  }

  protected override values(): ValueTable {
    return this.running.valuesOf('document', this.id);
  }

  override provide(thing: Plugin | ActionDeclaration | UiItem | PaneUiItem, implementation?: ActionImplementation): void {
    // Anything but a plugin: the base class names the error.
    if (!(thing instanceof Plugin)) return super.provide(thing, implementation);
    this.onEnd(this.running.provide({ kind: 'document', id: this.id }, thing));
  }
}

class ModuleContextImpl extends ScopeImpl implements ModuleContext {
  readonly panes: CollectionImpl<PaneImpl, PaneScopeImpl>;
  readonly documents: CollectionImpl<DocumentMember, DocumentScopeImpl>;
  readonly project: Condition<ProjectAccess | null>;
  readonly ai: Condition<AiSettings | null>;
  constructor(
    private readonly running: RunningModule,
    readonly id: string,
  ) {
    const controls: ControlProvider = (thing, impl) => running.provide({ kind: 'module' }, thing, impl);
    super(running, true, controls);
    actionSources.set(controls, (decl) => running.host.actionFrom(running.id, null, decl));
    const asking = (grant: keyof Grants) => running.host.askedFor(running.id, grant);
    this.project = createCondition(() => (asking('project'), running.projectAccess()), running.host.grantsChanged);
    this.ai = createCondition(() => (asking('ai'), running.aiSettings()), running.host.grantsChanged);
    this.panes = new CollectionImpl(new Listeners(), (_rt, p) => new PaneScopeImpl(running, p));
    this.documents = new CollectionImpl(new Listeners(), (_rt, d) => new DocumentScopeImpl(running, d));
  }

  protected override savedValues(): ValueStore {
    return this.running.host.valueStore({ kind: 'module' }, this.id);
  }
}

class RunningModule implements ModuleRuntime {
  readonly id: string;
  private readonly ctx: ModuleContextImpl;
  private stopped = false;
  private setupDepth = 0;
  // Every plugin the module's live scopes provided, in the order provided.
  private readonly provided: { plugin: Plugin; target: Target }[] = [];
  // Every UI item its live scopes provided, in the order provided.
  private readonly ui: ProvidedUi[] = [];
  // Every action implementation its live scopes provided.
  private readonly actions: ProvidedAction[] = [];

  constructor(
    readonly host: Host,
    private readonly def: ModuleDef,
  ) {
    this.id = def.id;
    this.ctx = new ModuleContextImpl(this, def.id);
  }

  get settingUp(): boolean {
    return this.setupDepth > 0;
  }

  get applying(): boolean {
    return this.host.busy.applying > 0;
  }

  start(): void {
    this.setup(() => this.def.exports.setup(this.ctx));
  }

  stop(): void {
    this.stopped = true;
    this.ctx.end();
    for (const table of this.tables.values()) table.end();
    this.tables.clear();
  }

  // Values per pane and per document the module is placed on, shared by
  // every scope for it; they end when it leaves the module's panes.
  private readonly tables = new Map<string, ValueTable>();
  private readonly keyNames = new Map<string, object>();

  valuesOf(kind: 'pane' | 'document', id: string): ValueTable {
    const name = `${kind}:${id}`;
    let table = this.tables.get(name);
    if (!table) this.tables.set(name, (table = new ValueTable(this, true, this.host.valueStore({ kind, id }, this.id))));
    return table;
  }

  claimKey(key: ValueKey<unknown>): void {
    const seen = this.keyNames.get(key.name);
    if (seen && seen !== key) throw new Error(`module ${this.id}: two value keys are named "${key.name}"`);
    this.keyNames.set(key.name, key);
  }

  // Ends the values of panes and documents no longer among the members.
  private dropTables(): void {
    const live = new Set([
      ...this.ctx.panes.members().map((p) => `pane:${p.id}`),
      ...this.ctx.documents.members().map((d) => `document:${d.id}`),
    ]);
    for (const [name, table] of this.tables) {
      if (live.has(name)) continue;
      table.end();
      this.tables.delete(name);
    }
  }

  setup(fn: () => void): void {
    this.setupDepth++;
    try {
      this.guard(fn);
    } finally {
      this.setupDepth--;
    }
  }

  paneMembers(): readonly PaneImpl[] {
    return this.ctx.panes.members();
  }

  setMembers(panes: PaneImpl[], documentMember: (id: string) => DocumentMember): void {
    if (this.stopped) return;
    this.ctx.panes.setMembers(panes);
    const docIds = [...new Set(panes.flatMap((p) => (p.documentId === null ? [] : [p.documentId])))];
    this.ctx.documents.setMembers(docIds.map(documentMember));
    this.dropTables();
  }

  // Runs `command` as the module in an open document's state.
  edit(documentId: string, command: Command): boolean {
    this.assertCanEdit();
    if (!this.ctx.documents.members().some((d) => d.id === documentId)) {
      throw new Error(
        `module ${this.id}: edit() on document ${documentId}, which no pane the module is placed on shows`,
      );
    }
    return this.editOpen(documentId, command);
  }

  private assertCanEdit(): void {
    if (this.settingUp) {
      throw new Error(`module ${this.id}: edit() while a scope is being set up; start an effect instead`);
    }
    if (this.applying) {
      throw new Error(`module ${this.id}: edit() inside another dispatch (a plugin's apply, filter or follow-up)`);
    }
  }

  // The module's AI settings, the same object until one of them changes.
  private aiGrant: AiGrant | null = null;
  private ai: AiSettings | null = null;
  aiSettings(): AiSettings | null {
    const now = this.stopped ? null : this.host.grants(this.id).ai;
    const was = this.aiGrant;
    const same = (a: AiGrant, b: AiGrant) =>
      a.key === b.key &&
      a.url === b.url &&
      a.model === b.model &&
      a.transcriptionModel === b.transcriptionModel &&
      a.imageModel === b.imageModel &&
      JSON.stringify(a.extra ?? {}) === JSON.stringify(b.extra ?? {});
    if (now && was && same(now, was)) return this.ai;
    this.aiGrant = now;
    if (!now) return (this.ai = null);
    const base = now.url.replace(/\/+$/, '');
    const ai: AiSettings = {
      model: now.model,
      transcriptionModel: now.transcriptionModel,
      imageModel: now.imageModel,
      fetch: (path, init) => {
        if (this.ai !== ai || this.aiSettings() !== ai) return Promise.reject(new Error(`module ${this.id}: ai.fetch after its AI settings ended`));
        if (!path.startsWith('/')) return Promise.reject(new Error(`module ${this.id}: ai.fetch takes a path starting with '/', got ${JSON.stringify(path)}`));
        const headers = new Headers(init?.headers);
        headers.set('Authorization', `Bearer ${now.key}`);
        if (typeof init?.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
        const body = path === '/chat/completions' ? withExtra(init?.body, now.extra) : init?.body;
        return this.host.trackAiCall(this.id, path, (signal) => fetch(base + path, { ...init, headers, body, signal }), init?.signal);
      },
    };
    return (this.ai = ai);
  }

  // The module's project access while it has it, the same object until
  // access ends (so `with` keeps its scope).
  private access: ProjectAccess | null = null;
  projectAccess(): ProjectAccess | null {
    if (this.stopped || !this.host.grants(this.id).project) return (this.access = null);
    if (this.access) return this.access;
    const live = (): boolean => this.access === access && !this.stopped && this.host.grants(this.id).project;
    const { get, subscribe } = this.host.projectDocuments;
    const access: ProjectAccess = {
      documents: hostStore({ get }, subscribe),
      create: async (name) => (live() ? this.host.createDocument(name) : null),
      rename: async (documentId, name) => (live() ? this.host.renameDocument(documentId, name) : false),
      edit: (documentId, command) => {
        if (!live()) return Promise.resolve(false);
        this.assertCanEdit();
        if (this.host.hub(documentId)) return Promise.resolve(this.editOpen(documentId, command));
        return this.host.queueClosedEdit(documentId, () => this.editClosed(documentId, command, live));
      },
      read: (documentId) => {
        if (!live()) return Promise.resolve(null);
        const hub = this.host.hub(documentId);
        if (hub) return Promise.resolve(hub.doc);
        return this.host.queueClosedEdit(documentId, () => this.readClosed(documentId, live));
      },
    };
    return (this.access = access);
  }

  private editOpen(documentId: string, command: Command): boolean {
    return this.host.documentState(documentId)!.run(this.id, command);
  }

  // A closed document: read, edit a plain state of it, save. No module's
  // plugins run there.
  private async editClosed(documentId: string, command: Command, live: () => boolean): Promise<boolean> {
    for (;;) {
      const read = await this.host.readClosed(documentId);
      if (!live()) return false;
      // Opened while it was being read: edit the open copy.
      if (this.host.hub(documentId)) return this.editOpen(documentId, command);
      if (!read || read.loaded.error !== null) return false;
      // The schema changed while it was being read: read it again.
      if (read.schema !== this.host.schema) continue;
      const before = read.loaded.doc;
      let state = EditorState.create({ doc: before });
      const ran = this.guard(() => command(state, (tr) => void (state = state.apply(tr))));
      if (ran !== true) return false;
      if (!state.doc.eq(before)) this.host.saveClosed(documentId, state.doc);
      return true;
    }
  }

  private async readClosed(documentId: string, live: () => boolean): Promise<Node | null> {
    for (;;) {
      const read = await this.host.readClosed(documentId);
      if (!live()) return null;
      const hub = this.host.hub(documentId);
      if (hub) return hub.doc;
      if (!read || read.loaded.error !== null) return null;
      if (read.schema === this.host.schema) return read.loaded.doc;
    }
  }

  // The module's document plugins for one document's state.
  documentPlugins(documentId: string): Plugin[] {
    if (this.stopped) return [];
    return this.provided.filter(({ target: t }) => t.kind === 'document' && t.id === documentId).map((e) => e.plugin);
  }

  // Returns the removal, for the providing scope's end.
  provide(target: Target, thing: Plugin | ActionDeclaration | UiItem | PaneUiItem, implementation?: ActionImplementation): () => void {
    if (!(thing instanceof Plugin)) {
      if (target.kind === 'document') throw new Error(`module ${this.id}: only plugins can be provided on a document scope`);
      if (isUiItem(thing)) return this.provideUi(target, thing);
      if (implementation === undefined) {
        throw new Error(
          `module ${this.id}: provide() takes a ProseMirror Plugin, a ui.… item, or an action and its implementation`,
        );
      }
      return this.provideAction(target, thing as ActionDeclaration, implementation);
    }
    const plugin = thing;
    if (isDocumentPlugin(plugin) && target.kind === 'pane') {
      throw new Error(`module ${this.id}: a document plugin goes on the module or a document scope, not a pane`);
    }
    if (!isDocumentPlugin(plugin) && target.kind === 'document') {
      throw new Error(`module ${this.id}: a document scope takes only a documentPlugin; provide plain plugins on a pane`);
    }
    this.host.pluginModule.set(plugin, this.id);
    wrapPlugin(plugin, {
      moduleId: this.id,
      active: () => !this.stopped,
      fail: (error) => this.host.fail(this.id, error),
    });
    const entry = { plugin, target };
    this.provided.push(entry);
    this.host.markPluginsDirty();
    return () => {
      const i = this.provided.indexOf(entry);
      if (i >= 0) this.provided.splice(i, 1);
      this.host.markPluginsDirty();
    };
  }

  private provideUi(target: ActionTarget, item: UiItemImpl): () => void {
    const project = this.host.moduleType(this.id) === 'project';
    if (project ? item.root !== 'projectMenu' && item.root !== 'modal' : item.root === 'projectMenu') {
      throw new Error(
        project
          ? `module ${this.id}: a project module's only UI is ui.projectMenu and ui.modal`
          : `module ${this.id}: only a project module provides ui.projectMenu; export const moduleType = 'project'`,
      );
    }
    if (item.root !== 'toolbar' && item.root !== 'side' && item.root !== 'modal' && item.root !== 'projectMenu' && target.kind !== 'pane') {
      throw new Error(`module ${this.id}: ui.${item.root} goes on a pane`);
    }
    if ('action' in item && this.host.actionName(this.id, item.action) === undefined) {
      throw new Error(`module ${this.id}: ui.${item.root}() got an action that isn't one of its exported actions`);
    }
    // The toolbar is for add-ons; a tab's menu is for the layout in it.
    if (item.root === 'tabMenu') {
      if (this.host.moduleType(this.id) !== 'editorReplacement') {
        throw new Error(`module ${this.id}: only an editor replacement provides ui.tabMenu; an add-on's controls go in the toolbar`);
      }
      if (target.kind === 'pane' && this.host.paneInfo(target.id)?.owner === 'module') {
        throw new Error(`module ${this.id}: pane ${target.id} is module-owned and has no tab; ui.tabMenu goes on a writer-owned pane`);
      }
    }
    const replacing = item.root === 'editorReplacement';
    if (replacing) {
      if (this.host.moduleType(this.id) !== 'editorReplacement') {
        throw new Error(`module ${this.id}: only an editor replacement provides ui.editorReplacement; export const moduleType = 'editorReplacement'`);
      }
      if (target.kind !== 'pane') throw new Error(`module ${this.id}: ui.editorReplacement goes on the pane it replaces`);
      if (this.host.replacementOf(target.id)) throw new Error(`module ${this.id}: pane ${target.id} already has an editor replacement`);
    }
    if (item.root === 'side') {
      const title = 'title' in item ? item.title : undefined;
      const clash = this.ui.find((u) => u.item.root === 'side' && ('title' in u.item ? u.item.title : undefined) === title && overlaps(u.target, target));
      if (clash) {
        throw new Error(`module ${this.id}: a second ui.side view${title ? ` titled "${title}"` : ''} that can show beside the first; give each view its own title`);
      }
    }
    const entry: ProvidedUi = { key: `${this.id}#${nextUiKey++}`, moduleId: this.id, item, target };
    this.ui.push(entry);
    this.host.uiChanged();
    if (replacing) this.host.replacementChanged();
    return () => {
      const i = this.ui.indexOf(entry);
      if (i >= 0) this.ui.splice(i, 1);
      this.host.uiChanged();
      if (replacing) this.host.replacementChanged();
    };
  }

  // The key of this module's side view `item` on the pane, if it provided one.
  sideKeyOf(item: UiItem, paneId: string): string | undefined {
    if (this.stopped) return undefined;
    return this.ui.find((u) => (u.item as unknown) === item && u.item.root === 'side' && u.target.kind === 'pane' && u.target.id === paneId)?.key;
  }

  // This module's editor replacement for the pane, while it runs.
  replacementFor(paneId: string): ComponentType | undefined {
    if (this.stopped) return undefined;
    const found = this.ui.find(({ item, target: t }) => item.root === 'editorReplacement' && t.kind === 'pane' && t.id === paneId);
    return found && 'component' in found.item ? found.item.component : undefined;
  }

  // This module's components for a root on `pane`, and, when `moduleWide`,
  // those on the module scope.
  uiFor(root: UiRoot, pane: string | null, moduleWide: boolean, everyPane = false): ProvidedUi[] {
    if (this.stopped) return [];
    return this.ui.filter(({ item, target: t }) => item.root === root && (t.kind === 'module' ? moduleWide : everyPane || t.id === pane));
  }

  private provideAction(target: ActionTarget, action: ActionDeclaration, impl: ActionImplementation): () => void {
    const name = this.host.actionName(this.id, action);
    if (name === undefined) {
      throw new Error(`module ${this.id}: provide() got an action that isn't one of its exported actions`);
    }
    checkImplementation(this.id, name, impl);
    if ('command' in impl) {
      if (target.kind === 'module') {
        throw new Error(
          `module ${this.id}: action "${name}" is a command on the module scope, which has no editor state; provide it on a pane, or make it a procedure`,
        );
      }
    }
    const clash = this.actions.find((a) => a.name === name && overlaps(a.target, target));
    if (clash) {
      throw new Error(`module ${this.id}: action "${name}" already has an implementation that applies here`);
    }
    const entry: ProvidedAction = { name, target, impl };
    this.actions.push(entry);
    this.host.uiChanged();
    return () => {
      const i = this.actions.indexOf(entry);
      if (i >= 0) this.actions.splice(i, 1);
      this.host.uiChanged();
    };
  }

  // The implementation of action `name` that applies on the focus path
  // `path`, if live: the first found walking outward, else the module's.
  // A pane one runs against its own pane.
  implementationFor(name: string, path: readonly string[]): ProvidedAction | undefined {
    if (this.stopped) return undefined;
    for (const id of path) {
      const found = this.actions.find(({ name: n, target: t }) => n === name && t.kind === 'pane' && t.id === id);
      if (found) return found;
    }
    return this.actions.find(({ name: n, target: t }) => n === name && t.kind === 'module');
  }

  canRun({ impl, target }: ProvidedAction): boolean {
    if (this.stopped) return false;
    if ('procedure' in impl) return true;
    // A read-only pane refuses every edit, so its command actions grey out.
    const state = this.stateFor(target);
    if (!state || !isEditable(state)) return false;
    return this.guard(() => impl.command(state, undefined, this.viewFor(target))) === true;
  }

  isActive({ impl, target }: ProvidedAction): boolean {
    if (this.stopped || !impl.active) return false;
    if ('procedure' in impl) return this.guard(() => impl.active!()) === true;
    const state = this.stateFor(target);
    return state ? this.guard(() => impl.active!(state)) === true : false;
  }

  // A command runs only if its dry run agrees, so a greyed action never
  // acts, whether chosen in the palette or by its key.
  runImplementation(action: ProvidedAction): boolean {
    const { impl, target } = action;
    if (this.stopped) return false;
    if ('procedure' in impl) return this.ran(action, this.guard(() => impl.procedure()) === true, true);
    if (!this.canRun(action) || target.kind !== 'pane') return false;
    const before = this.stateFor(target);
    const ran = this.guard(() => this.host.run(target.id, impl.command)) === true;
    return this.ran(action, ran, this.stateFor(target) !== before);
  }

  // In development, a warning when an action said it could run and then
  // didn't. Not an error: a command may act outside the document.
  private ran({ name }: ProvidedAction, ran: boolean, changed: boolean): boolean {
    if (import.meta.env.DEV && !this.stopped && (!ran || !changed)) {
      console.warn(`[mwps] module ${this.id}: action "${name}" said it could run, then ${ran ? 'dispatched nothing' : 'returned false'}`);
    }
    return ran;
  }

  private stateFor(target: ActionTarget): EditorState | undefined {
    return target.kind === 'pane' ? this.host.paneState(target.id).get() : undefined;
  }

  private viewFor(target: ActionTarget): EditorView | undefined {
    return target.kind === 'pane' ? this.host.paneView(target.id) : undefined;
  }

  pluginsFor(pane: PaneImpl): Plugin[] {
    return this.provided
      .filter(({ plugin, target: t }) =>
        isDocumentPlugin(plugin) ? false : t.kind === 'pane' && t.id === pane.id,
      )
      .map((e) => e.plugin);
  }

  // While stopping, a throwing cleanup is logged and the teardown goes on.
  guard<R>(fn: () => R): R | undefined {
    try {
      return fn();
    } catch (error) {
      if (this.stopped) console.error(`[mwps] module ${this.id} threw while stopping:`, error);
      else this.host.fail(this.id, error);
      return undefined;
    }
  }

  batch(fn: () => void): void {
    this.host.batch(fn);
  }

  defer(fn: () => void): void {
    this.host.defer(fn);
  }

  redraw(): void {
    if (!this.stopped) this.host.scheduleRedraw(this.id);
  }
}

// A chat request's JSON body with the writer's extra fields under the
// module's own; any other body as it is.
function withExtra(body: BodyInit | null | undefined, extra: AiGrant['extra']): BodyInit | null | undefined {
  if (!extra || typeof body !== 'string') return body;
  let request: unknown;
  try {
    request = JSON.parse(body);
  } catch {
    return body;
  }
  if (!request || typeof request !== 'object' || Array.isArray(request)) return body;
  return JSON.stringify({ ...extra, ...request });
}

// ProseMirror's own key for a plugin (`name$`, unique per PluginKey).
function keyOf(plugin: Plugin): string {
  return (plugin as unknown as { key: string }).key;
}

function sameMembers<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((m, i) => m === b[i]);
}
