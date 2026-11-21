// The one hidden state of an open document: a client of its hub with no
// history and no view, carrying the modules' document plugins. Modules edit
// here as peers (`d.edit`, a document plugin's `dispatch`): each edit is
// local here and tagged with the module's id, so its follow-ups run here
// once, it is on no undo stack, and every pane receives it like a
// collaborator's. It catches up first, so panes read its plugin state
// current.

import type { DocumentView } from 'mwps';
import type { Command, EditorState, Plugin, PluginView, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { DocumentClient, type Busy, type OwnPlugins } from './document-client.js';
import type { DocumentHub } from './document-hub.js';
import { AUTHOR, isLocal } from './wrap-plugin.js';

export class DocumentState extends DocumentClient {
  readonly rank = 0;
  // `end`: its `dispatch` does nothing from then on.
  private views: { view: DocumentView; pluginView: PluginView; end(): void }[] = [];
  // The plugins the views were made for.
  private viewsFor: readonly Plugin[] | null = null;

  constructor(
    hub: DocumentHub,
    busy: Busy,
    // The module that provided a plugin: its edits carry the module's id.
    private readonly moduleOf: (plugin: Plugin) => string,
  ) {
    super(hub, busy);
  }

  protected get label(): string {
    return `document ${this.hub!.id}`;
  }

  protected ownPlugins(): OwnPlugins {
    return { before: [], after: [] };
  }

  run(moduleId: string, command: Command): boolean {
    const state = this.state.get();
    if (!state) return false;
    return command(state, (tr: Transaction) => this.dispatch(tr.setMeta(AUTHOR, moduleId)));
  }

  // A stepless edit here (a result kept as meta) changes plugin state the
  // panes may draw from, so they redraw too.
  protected override afterDispatch(trs: readonly Transaction[]): void {
    super.afterDispatch(trs);
    if (trs.length && isLocal(trs[0]!) && !trs.some((tr) => tr.docChanged)) this.hub!.refreshCopies(this);
  }

  // Plugin views as ProseMirror's view keeps them: remade when the plugins
  // change, else updated. Each gets a view with only `state` and `dispatch`.
  protected override draw(state: EditorState, prev: EditorState | undefined): void {
    if (state.plugins !== this.viewsFor) {
      this.destroyViews();
      this.viewsFor = state.plugins;
      for (const plugin of state.plugins) {
        if (!plugin.spec.view) continue;
        const moduleId = this.moduleOf(plugin);
        const get = () => this.state.get()!;
        let live = true;
        const view: DocumentView = {
          get state() {
            return get();
          },
          dispatch: (tr) => void (live && this.dispatch(tr.setMeta(AUTHOR, moduleId))),
        };
        const pluginView = plugin.spec.view(view as unknown as EditorView);
        this.views.push({ view, pluginView, end: () => (live = false) });
      }
      return;
    }
    for (const { view, pluginView } of this.views) pluginView.update?.(view as unknown as EditorView, prev!);
  }

  private destroyViews(): void {
    for (const { pluginView, end } of this.views) {
      end();
      pluginView.destroy?.();
    }
    this.views = [];
  }

  override close(): void {
    this.destroyViews();
    super.close();
  }
}
