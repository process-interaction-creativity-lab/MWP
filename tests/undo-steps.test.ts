// Undo steps: an edit a module makes through `run` is its own step; typing
// groups as ProseMirror's history does.

import { undo, undoDepth } from 'prosemirror-history';
import type { Command } from 'prosemirror-state';
import { expect, it } from 'vitest';
import { startDoc } from './edits.js';
import { bootHeadless } from './headless.js';

function boot() {
  const { host } = bootHeadless([]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  const depth = () => undoDepth(host.paneState('a').get()!);
  const text = () => host.paneState('a').get()!.doc.textContent;
  // The writer typing: straight to the pane, as a view does.
  const type = (s: string) => host.dispatch('a', host.paneState('a').get()!.tr.insertText(s, 1));
  const insert =
    (s: string, meta?: Record<string, unknown>): Command =>
    (state, dispatch) => {
      const tr = state.tr.insertText(s, 1);
      for (const [k, v] of Object.entries(meta ?? {})) tr.setMeta(k, v);
      dispatch?.(tr);
      return true;
    };
  return { host, depth, text, type, insert };
}

it('typing groups; a run starts a step before and after itself', () => {
  const { host, depth, type, insert } = boot();
  type('a');
  type('b');
  expect(depth()).toBe(1);
  host.run('a', insert('X'));
  expect(depth()).toBe(2);
  type('c');
  type('d');
  expect(depth()).toBe(3);
  host.run('a', insert('Y'));
  host.run('a', insert('Z'));
  expect(depth()).toBe(5);
});

it('a stream (one composition id) is one step, and the next stream another', () => {
  const { host, depth, insert } = boot();
  for (const c of ['1', '2', '3']) host.run('a', insert(c, { composition: 's1' }));
  expect(depth()).toBe(1);
  for (const c of ['4', '5']) host.run('a', insert(c, { composition: 's2' }));
  expect(depth()).toBe(2);
});

it('a run with addToHistory false is no step; undo through run takes back one step', () => {
  const { host, depth, text, type, insert } = boot();
  type('a');
  host.run('a', insert('Q', { addToHistory: false }));
  expect(depth()).toBe(1);
  host.run('a', insert('X'));
  type('b');
  expect(depth()).toBe(3);
  host.run('a', undo);
  expect(depth()).toBe(2);
  expect(text()).not.toContain('b');
  expect(text()).toContain('X');
});
