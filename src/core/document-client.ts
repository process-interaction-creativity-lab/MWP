// One EditorState over an open document, kept in step with the document's
// other copies as a prosemirror-collab client of its hub. Panes are clients
// (with history and keymaps, and maybe a view), and so is the document's
// one hidden state (with the modules' document plugins). A card (an editor
// over one block) is not a client: it edits through its host pane.

import { collab, getVersion, receiveTransaction, sendableSteps } from 'prosemirror-collab';
import type { Node } from 'prosemirror-model';
import { EditorState, Plugin, TextSelection, type Selection, type Transaction } from 'prosemirror-state';
import { runsOf, type Busy, type DocumentHub, type HubClient } from './document-hub.js';
import { Listeners } from './store.js';
import { assertNotInPaneView, AUTHOR, HOST, isEditable, isLocal, KIND, RECEIVED } from './wrap-plugin.js';

export type { Busy } from './document-hub.js';

// The client's own plugins, around the modules' ones.
export interface OwnPlugins {
  before: Plugin[];
  after: Plugin[];
}

let clients = 0;

export abstract class DocumentClient implements HubClient {
  private current: EditorState | undefined;
  private readonly listeners = new Listeners();
  // Its state as drawn and heard, for `react`.
  private reacted: EditorState | undefined;
  // Read at any time; listeners hear at rest.
  readonly state = { get: () => this.current, subscribe: this.listeners.subscribe };
  private stopHub = () => {};
  // Per state build: the plugins whose state must survive reconfiguring.
  private own: Plugin[][] | null = null;
  private moduleList: readonly Plugin[] = [];
  private clientID = '';
  protected closed = false;
  abstract readonly rank: number;

  constructor(
    readonly hub: DocumentHub | null,
    protected readonly busy: Busy,
  ) {}

  // For collab's client id and messages.
  protected abstract get label(): string;
  protected abstract ownPlugins(state: { schema: EditorState['schema'] }): OwnPlugins;

  get documentId(): string | null {
    return this.hub?.id ?? null;
  }

  // A fresh state from the hub's document, with a new collab client.
  // Keeps the selection where it can, since positions shift on a rebuild.
  build(modulePlugins: readonly Plugin[]): void {
    const start = this.start();
    if (!start) return;
    const { before, after } = this.ownPlugins({ schema: start.doc.type.schema });
    this.own = [[...start.first, ...before], after];
    this.moduleList = modulePlugins;
    const previous = this.current;
    let state = EditorState.create({ doc: start.doc, plugins: this.plugins() });
    if (previous) state = keepSelection(state, previous.selection);
    this.setState(state);
    this.settle();
  }

  // Starts over from the source, with the same module plugins.
  protected rebuild(): void {
    this.build(this.moduleList);
  }

  // The document a build starts from and the plugins first in the state;
  // joins the hub as a new collab client.
  protected start(): { doc: Node; first: Plugin[] } | null {
    const hub = this.hub;
    if (!hub) return null;
    this.clientID = `${this.label}#${clients++}`;
    this.stopHub();
    this.stopHub = hub.attach(this);
    return { doc: hub.doc, first: [collab({ version: hub.version, clientID: this.clientID }), hostPlugin(hub)] };
  }

  // Reconfigures when the modules' plugins changed; their order is the
  // host's to compute.
  setModulePlugins(modulePlugins: readonly Plugin[]): void {
    const state = this.current;
    if (!state || !this.own) return;
    if (modulePlugins.length === this.moduleList.length && modulePlugins.every((p, i) => p === this.moduleList[i])) {
      return;
    }
    this.moduleList = modulePlugins;
    this.setState(state.reconfigure({ plugins: this.plugins() }));
    this.settle();
  }

  // The keys of the host's own plugins in this client.
  ownKeys(): Set<string> {
    return new Set((this.own ?? []).flat().map((p) => (p as unknown as { key: string }).key));
  }

  private plugins(): Plugin[] {
    const [before, after] = this.own!;
    return [...before!, ...this.moduleList, ...after!];
  }

  // ProseMirror's dispatch: apply, store, send; then, if this is the
  // outermost one, everything reacts.
  dispatch = (tr: Transaction): void => {
    const state = this.current;
    if (!state || this.closed) return;
    if (isLocal(tr)) assertNotInPaneView('an edit');
    tr = this.beforeApply(tr);
    if (tr.docChanged && isLocal(tr)) this.hub?.checkEdit();
    let applied: { state: EditorState; transactions: readonly Transaction[] };
    this.busy.applying++;
    try {
      applied = state.applyTransaction(tr);
      this.setState(applied.state, applied.transactions);
    } finally {
      this.busy.applying--;
    }
    this.afterDispatch(applied.transactions);
    this.settle();
  };

  // A hook for a client to mark a transaction before it is applied.
  protected beforeApply(tr: Transaction): Transaction {
    return tr;
  }

  // Passes what was applied on: to the hub, for a hub client. `trs` is
  // empty when a filter refused the transaction.
  protected afterDispatch(_trs: readonly Transaction[]): void {
    this.send();
  }

  // At rest only: every copy of the document reacts, then the host flushes.
  protected settle(): void {
    if (this.busy.applying > 0) return;
    this.busy.reacting++;
    try {
      if (this.hub) this.hub.settle();
      else this.react();
    } finally {
      this.busy.reacting--;
    }
    this.busy.flush();
  }

  sync(): void {
    this.receive();
    this.send();
  }

  refresh(): void {
    const state = this.current;
    if (state && !this.closed) this.setState(state.apply(state.tr.setMeta(HOST, 'document')));
  }

  react(): void {
    const state = this.current;
    if (!state || state === this.reacted || this.closed) return;
    const prev = this.reacted;
    this.reacted = state;
    this.draw(state, prev);
    // An edit made while drawing has already been drawn and heard.
    if (this.reacted === state) this.listeners.notify();
  }

  private send(): void {
    const state = this.current;
    const sendable = state && sendableSteps(state);
    if (sendable) this.hub!.receive(sendable.version, sendable.steps, sendable.clientID, sendable.origins);
  }

  private receive(): void {
    const hub = this.hub!;
    const state = this.current;
    if (!state) return;
    const version = getVersion(state);
    if (version === hub.version) return;
    // One transaction per run. The client's own steps come first, as
    // collab requires.
    for (const run of runsOf(hub.stepsSince(version))) {
      const now = this.current!;
      const tr = receiveTransaction(now, run.map((e) => e.step), run.map((e) => e.clientID), { mapSelectionBackward: true });
      tr.setMeta(RECEIVED, true).setMeta(KIND, run[0]!.kind);
      if (run[0]!.author) tr.setMeta(AUTHOR, run[0]!.author);
      this.dispatch(tr);
    }
    // A safety net: received steps that didn't apply leave the client behind
    // the hub, so it starts over from the hub's document.
    const after = this.current;
    if (after && getVersion(after) !== hub.version) {
      console.error(`[mwps] ${this.label} fell behind its document and was rebuilt; its undo history is lost`);
      this.build(this.moduleList);
    }
  }

  close(): void {
    this.closed = true;
    this.stopHub();
    this.stopHub = () => {};
  }

  // Pure: stores the state. `trs`: the transactions that made it, if it
  // came from a dispatch.
  protected setState(state: EditorState, _trs?: readonly Transaction[]): void {
    this.current = state;
  }

  // At rest: shows the new state (`prev` is what was shown). As in
  // ProseMirror, plugin views updated here read the new state, and may edit.
  protected draw(_state: EditorState, _prev: EditorState | undefined): void {}
}

// First in every client: refuses local edits while the state isn't
// editable, and makes it uneditable while its document doesn't fit the
// schema.
export function hostPlugin(hub: DocumentHub): Plugin {
  return new Plugin({
    props: { editable: () => hub.problem === null },
    filterTransaction: (tr, state) => !(tr.docChanged && isLocal(tr) && !isEditable(state)),
  });
}

function keepSelection(state: EditorState, selection: Selection): EditorState {
  const doc = state.doc;
  const clamp = (pos: number) => Math.min(pos, doc.content.size);
  try {
    const sel = TextSelection.between(doc.resolve(clamp(selection.anchor)), doc.resolve(clamp(selection.head)));
    return state.apply(state.tr.setSelection(sel).setMeta(HOST, 'selection'));
  } catch {
    return state;
  }
}
