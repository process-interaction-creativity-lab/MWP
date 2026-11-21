// A pane in the core: a document client with history and keymaps, where the
// writer edits. A host draws its cards; headless panes draw none.

import type { Schema } from 'prosemirror-model';
import { closeHistory, isHistoryTransaction } from 'prosemirror-history';
import { Plugin, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { basicPlugins, historyPlugins } from './base-plugins.js';
import { DocumentClient, type Busy, type OwnPlugins } from './document-client.js';
import type { DocumentHub } from './document-hub.js';
import type { CardsHost } from './card-surface.js';
import { HOST, isLocal } from './wrap-plugin.js';

export interface Pane {
  readonly id: string;
  readonly documentId: string | null;
}

export class PaneImpl extends DocumentClient implements Pane {
  // Its editors: the main editor over the writing, and any other cards.
  cards: CardsHost | null = null;
  stopCards: () => void = () => {};
  readonly rank: number = 1;

  constructor(
    readonly id: string,
    hub: DocumentHub | null,
    busy: Busy,
    // The host's action keys for this pane.
    private readonly actionKey: (event: KeyboardEvent) => boolean,
  ) {
    super(hub, busy);
  }

  protected get label(): string {
    return `pane ${this.id}`;
  }

  // The one plugin order: host, history and undo keys, extensions, action
  // keys, base keymap and cursors. A module's own key handler (a mode, a
  // menu it has open) sees a key before the actions bound to it.
  protected ownPlugins({ schema }: { schema: Schema }): OwnPlugins {
    const actionKeys = new Plugin({ props: { handleKeyDown: (_view, event) => this.actionKey(event) } });
    return { before: this.historyPlugins(), after: [actionKeys, ...basicPlugins(schema)] };
  }

  protected historyPlugins(): Plugin[] {
    return historyPlugins();
  }

  // Runs a command as the writer would, as its own undo step: history is
  // closed before its first edit and before the next one after it, so it
  // neither joins the writer's typing nor has typing join it. A transaction with
  // `addToHistory: false` or a `composition` id (a stream's or a gesture's
  // later edits) is left to ProseMirror's grouping; the first edit with a
  // new `composition` id still starts a step.
  run(command: Command): boolean {
    const state = this.state.get();
    if (!state) return false;
    return this.asOwnStep(() => command(state, this.dispatch, this.cards?.adapter));
  }

  asOwnStep(run: () => boolean): boolean {
    if (this.stepping) return run();
    this.stepping = true;
    try {
      return run();
    } finally {
      this.stepping = false;
    }
  }

  private stepping = false;
  // The next local edit starts a step: set by a run's edit, cleared by it.
  private closeNext = false;
  private composition: unknown = undefined;

  protected override beforeApply(tr: Transaction): Transaction {
    if (!tr.docChanged || isHistoryTransaction(tr) || !isLocal(tr)) return tr;
    const closing = this.closeNext;
    this.closeNext = false;
    if (!this.stepping || tr.getMeta('addToHistory') === false) return closing ? closeHistory(tr) : tr;
    const composition = tr.getMeta('composition');
    const continues = composition !== undefined && composition === this.composition;
    this.composition = composition;
    this.closeNext = composition === undefined;
    return continues ? tr : closeHistory(tr);
  }

  // A stepless host transaction, so decorations recompute.
  redraw(): void {
    const state = this.state.get();
    if (state) this.dispatch(state.tr.setMeta(HOST, 'values'));
  }

  override close(): void {
    super.close();
    this.stopCards();
    this.cards?.close();
  }

  protected override draw(state: EditorState, prev?: EditorState): void {
    this.cards?.update(state, prev);
  }
}
