// Random edits and small modules for properties of editing.

import fc from 'fast-check';
import type { ModuleContext } from 'mwps';
import { redo, undo } from 'prosemirror-history';
import type { Node } from 'prosemirror-model';
import { Plugin, type Command, type Transaction } from 'prosemirror-state';
import type { Host, ModuleDef } from '../src/core/host.js';
import { buildSchema } from '../src/core/parts.js';

const schema = buildSchema([]);
const p = (text: string) => schema.nodes.paragraph!.create(null, text ? schema.text(text) : null);
export const startDoc = () => schema.nodes.doc!.create(null, [p('one two'), p('three'), schema.nodes.mwps_data!.create()]);

// Positions inside textblocks, where text may go.
export function textPositions(doc: Node): number[] {
  const out: number[] = [];
  doc.descendants((node, pos) => {
    if (node.inlineContent) for (let i = 0; i <= node.content.size; i++) out.push(pos + 1 + i);
  });
  return out;
}

export type Edit =
  | { kind: 'insert'; at: number; text: string }
  | { kind: 'delete'; from: number; to: number }
  | { kind: 'split'; at: number }
  | { kind: 'bold'; from: number; to: number }
  | { kind: 'undo' }
  | { kind: 'redo' };

export const edit: fc.Arbitrary<Edit> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('insert' as const), at: fc.nat(), text: fc.constantFrom('a', 'teh ', 'x y', 'h') }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('delete' as const), from: fc.nat(), to: fc.nat() }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('split' as const), at: fc.nat() }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('bold' as const), from: fc.nat(), to: fc.nat() }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'undo' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'redo' as const }) },
);

// The edit as a command against whatever state the pane has now.
export function command(e: Edit): Command {
  if (e.kind === 'undo') return undo;
  if (e.kind === 'redo') return redo;
  return (state, dispatch) => {
    const spots = textPositions(state.doc);
    if (!spots.length) return false;
    const at = (n: number) => spots[n % spots.length]!;
    const [a, b] = 'from' in e ? [at(e.from), at(e.to)].sort((x, y) => x - y) : [at(e.at), at(e.at)];
    let tr: Transaction;
    try {
      if (e.kind === 'insert') tr = state.tr.insertText(e.text, a);
      else if (e.kind === 'delete') tr = state.tr.delete(a!, b!);
      else if (e.kind === 'split') tr = state.tr.split(a!);
      else tr = state.tr.addMark(a!, b!, state.schema.marks.strong!.create());
    } catch {
      return false;
    }
    dispatch?.(tr);
    return true;
  };
}

// A follow-up that checks the state: every "teh" becomes "the". Counts the
// times it is asked, and whether any of those was for a received edit.
export function autocorrect() {
  const seen = { received: 0 };
  const def: ModuleDef = {
    id: 'autocorrect',
    exports: {
      setup(ctx: ModuleContext) {
        ctx.each(ctx.panes, (pane) => {
          pane.provide(
            new Plugin({
              appendTransaction(trs, _old, state) {
                if (trs.some((tr) => tr.getMeta('mwps-received'))) seen.received++;
                let tr: Transaction | null = null;
                state.doc.descendants((node, pos) => {
                  if (!node.isText) return;
                  for (const m of node.text!.matchAll(/teh/g)) {
                    tr ??= state.tr;
                    const from = tr.mapping.map(pos + m.index);
                    tr.insertText('the', from, from + 3);
                  }
                });
                return tr;
              },
            }),
          );
        });
      },
    },
  };
  return { def, seen };
}

export const docOf = (host: Host, pane: string): Node => host.paneState(pane).get()!.doc;
