// What every editing pane has before any module is placed: undo, the
// list-aware Enter and ProseMirror's base keymap. (The drop cursor is each
// card's own, since it draws in one editor.) History and its keys come
// before modules' plugins; the basics after the action keys, so a module's
// key handler and then an action win.

import { baseKeymap, chainCommands } from 'prosemirror-commands';
import { gapCursor } from 'prosemirror-gapcursor';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Node, Schema } from 'prosemirror-model';
import { liftListItem, splitListItem } from 'prosemirror-schema-list';
import { NodeSelection, Plugin, TextSelection, type Command, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { OWNER } from './parts.js';
import { HOST } from './wrap-plugin.js';

export function historyPlugins(): Plugin[] {
  return [history(), keymap({ 'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo })];
}

export function basicPlugins(schema: Schema): Plugin[] {
  const item = schema.nodes.list_item!;
  return [
    // An empty item's Enter lifts it out of the list.
    keymap({ Enter: chainCommands(splitListItem(item), liftListItem(item)) }),
    keymap({ Backspace: clearEmptyModuleBlock }),
    keymap(baseKeymap),
    // Tab that nothing took stays in the text rather than moving focus.
    keymap({ Tab: () => true, 'Shift-Tab': () => true }),
    gapCursor(),
    moduleFrames(),
    inactiveSelection(),
    // Last: an editing key nothing took inside a module's block.
    new Plugin({ props: { handleKeyDown: refusedInModuleBlock } }),
  ];
}

const EDITING_KEYS = new Set(['Enter', 'Backspace', 'Delete']);

// An editing key that no module, action or base command took, inside a
// module's block, does nothing on purpose when it would reach past the
// textblock the caret is in (the block's schema has no room for that): the
// host takes it, so the browser doesn't edit the page behind ProseMirror's
// back, and says so for a moment beside the block's name. Backspace and
// Delete within a textblock's text are the browser's own character
// deletions, which ProseMirror reads back like typing: those go through.
function refusedInModuleBlock(view: EditorView, event: KeyboardEvent): boolean {
  if (!EDITING_KEYS.has(event.key) || event.metaKey || event.ctrlKey || event.altKey) return false;
  const { $from, empty } = view.state.selection;
  if (empty && $from.parent.isTextblock) {
    if (event.key === 'Backspace' && $from.parentOffset > 0) return false;
    if (event.key === 'Delete' && $from.parentOffset < $from.parent.content.size) return false;
  }
  for (let d = $from.depth; d > 0; d--) {
    if (!$from.node(d).type.spec[OWNER]) continue;
    const block = view.nodeDOM($from.before(d));
    const label = block instanceof HTMLElement ? block.querySelector<HTMLElement>(':scope > .mwps-module-block-label') : null;
    if (label) {
      label.dataset.mwpsRefused = `${label.dataset.mwpsTip?.split('\n')[0] ?? ''}\nno ${event.key} here`;
      clearTimeout(Number(label.dataset.mwpsRefusedTimer));
      label.dataset.mwpsRefusedTimer = String(setTimeout(() => delete label.dataset.mwpsRefused, 1500));
    }
    return true;
  }
  return false;
}

// Backspace at the start of a module's block that holds nothing turns it
// into an empty paragraph, as an empty heading does. A sealed block has no
// edge to join across, so without this one left empty (or left alone by
// Select All and Delete) could never be removed by keys.
export const clearEmptyModuleBlock: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (!node.type.spec[OWNER]) continue;
    if (node.textContent !== '' || !onlyEmptyTextblocks(node)) return false;
    // At the start of the block's first textblock.
    if ($from.pos !== firstTextPos(node, $from.start(d))) return false;
    if (dispatch) {
      const from = $from.before(d);
      const tr = state.tr.replaceWith(from, $from.after(d), state.schema.nodes.paragraph!.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 1)).scrollIntoView());
    }
    return true;
  }
  return false;
};

function onlyEmptyTextblocks(node: Node): boolean {
  let ok = true;
  node.descendants((n) => {
    if (!ok) return false;
    if (n.isLeaf && !n.isText) ok = false;
    return !n.isTextblock;
  });
  return ok;
}

function firstTextPos(node: Node, start: number): number {
  let pos = start;
  let n: Node | null = node;
  while (n && !n.isTextblock && n.firstChild) {
    n = n.firstChild;
    pos += 1;
  }
  return pos;
}

// The name of the module beside every block it added to the writing, in
// the left margin, so the writer sees whose block it is.
function frames(doc: Node): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    const owner = node.type.spec[OWNER] as string | undefined;
    // The name is an element of its own, not a pseudo-element of the
    // module's, which the module may use (a placeholder): inside the block
    // when it has content, else just before it.
    // Inside the block when it has content, else just before it: either way
    // level with its first line, in the page's left margin.
    if (owner) decos.push(Decoration.widget(node.isLeaf ? pos : pos + 1, () => label(owner), { side: -1, ignoreSelection: true, key: `mwps-owner:${owner}` }));
    return !node.isTextblock;
  });
  return DecorationSet.create(doc, decos);
}

// A small info mark in the margin; hovering it names the module. Drawn from
// attributes, so the block's DOM text stays the module's.
function label(owner: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'mwps-module-block-label';
  el.contentEditable = 'false';
  el.setAttribute('aria-hidden', 'true');
  el.dataset.mwpsTip = owner;
  return el;
}

function moduleFrames(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    state: {
      init: (_, state) => frames(state.doc),
      apply: (tr, set) => (tr.docChanged ? frames(tr.doc) : set),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}

// The browser hides a selection while its editor isn't focused (the writer
// is in a module's text box, or another pane), so the writer couldn't see
// which words an instruction will act on. While no editor of the pane has
// focus, a non-empty selection is tinted, as an editor's inactive
// selection. Focus is read live from the pane's view; the plugin asks for
// a redraw when focus leaves, and only when there is a selection to show,
// so typing and drag-selecting while focused draw nothing extra. Taking
// focus never dispatches: it comes with a click, and an update during the
// click puts ProseMirror's old selection back over the one the click makes.
// The tint left until the next transaction is hidden by CSS meanwhile.
function inactiveSelection(): Plugin {
  let pane: EditorView | null = null;
  const show = (state: EditorState) => !state.selection.empty && !(state.selection instanceof NodeSelection);
  const redraw = (view: EditorView) => {
    if (show(view.state)) view.dispatch(view.state.tr.setMeta(HOST, 'focus'));
  };
  return new Plugin({
    view(view) {
      pane = view;
      return {
        destroy() {
          pane = null;
        },
      };
    },
    props: {
      decorations(state) {
        if (!pane || pane.hasFocus() || !show(state)) return null;
        const found = state.selection.ranges.filter((r) => r.$from.pos < r.$to.pos).map((r) => Decoration.inline(r.$from.pos, r.$to.pos, { class: 'mwps-inactive-selection' }));
        return DecorationSet.create(state.doc, found);
      },
      handleDOMEvents: {
        blur: (view) => (redraw(view), false),
      },
    },
  });
}
