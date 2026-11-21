import { Plugin } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ModuleContext } from 'mwps';
import { Toggle } from 'mwps/ui';
import { ordinaryBlocks, splitSentences, textOf } from 'mwps/text';

const onKey = valueKey<boolean>('on', { default: true });

export const actions = { flip: { title: 'Toggle sentence flip' } };

// ---- Flipping (rule-based) ---------------------------------------------------

const CLOSERS = '"\'”’)\\]';
const END = new RegExp(`([.!?]+)([${CLOSERS}]*)$`);
const TRUE_PREFIX = /^is it true that\s+/i;
const WH = /^(what|who|whom|whose|where|when|why|how|which)\s+/i;
const AUX = /^(is|are|was|were|am|can|could|would|should|will|may|might|shall|must|have|has|had)\s+/i;
const DO = /^(do|does|did)\s+/i;
const PRONOUN = /^(i|you|he|she|it|we|they|there)\s+/i;
const DET = /^(the|a|an|this|that|these|those|my|your|his|her|its|our|their)\s+(\S+)\s+/i;
// Words that start a sentence without being names: only these are lowercased.
const COMMON = new Set(
  ('the a an this that these those it he she they we you there here my your his her its our their ' +
    'some any all every each no not one if when while although because since after before as so but and or ' +
    'then now today yesterday tomorrow in on at by for with from to of what who where why how is are was were ' +
    'do does did can could would should will may might shall have has had many most few several').split(' '),
);

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function lowerFirst(s: string): string {
  const m = /^[A-Za-z]+/.exec(s);
  if (!m) return s;
  const w = m[0];
  return COMMON.has(w.toLowerCase()) && w !== 'I' ? w.toLowerCase() + s.slice(w.length) : s;
}

/** Whether `s` has a word to flip. */
const flippable = (s: string) => /[\p{L}\p{N}]/u.test(s);

export function flip(sentence: string): string {
  const m = END.exec(sentence);
  const closers = m ? m[2] : '';
  const body = m ? sentence.slice(0, m.index) : sentence;
  const isQuestion = !!m && m[1].includes('?');
  if (!isQuestion) return `Is it true that ${lowerFirst(body)}?${closers}`;

  let s = body.trim();
  if (TRUE_PREFIX.test(s)) s = s.replace(TRUE_PREFIX, '');
  else if (WH.test(s)) s = s.replace(WH, '');
  else if (DO.test(s)) s = s.replace(DO, '');
  else if (AUX.test(s)) {
    const aux = AUX.exec(s)![1];
    const rest = s.replace(AUX, '');
    const pron = PRONOUN.exec(rest);
    const det = DET.exec(rest);
    if (pron) s = `${pron[1]} ${aux.toLowerCase()} ${rest.slice(pron[0].length)}`;
    else if (det) s = `${det[1]} ${det[2]} ${aux.toLowerCase()} ${rest.slice(det[0].length)}`;
    else s = rest;
  }
  s = s.trim();
  if (!s) s = body.trim();
  return `${upper(s)}.${closers}`;
}

// ---- Decorations -------------------------------------------------------------

interface Flip { from: number; to: number; text: string } // relative to the block's start

const cache = new WeakMap<Node, Flip[]>();

function flipsOf(block: Node): Flip[] {
  let out = cache.get(block);
  if (out) return out;
  out = [];
  const t = textOf(block, 0);
  for (const s of splitSentences(t.text)) {
    const core = s.text.trim();
    if (!flippable(core)) continue;
    const lead = s.text.slice(0, s.text.length - s.text.trimStart().length);
    const trail = s.text.slice(lead.length + core.length);
    const from = t.pos(s.from);
    const to = t.pos(s.to, -1);
    if (to > from) out.push({ from, to, text: lead + flip(core) + trail });
  }
  cache.set(block, out);
  return out;
}

function build(state: EditorState): DecorationSet {
  const { from: sf, to: st } = state.selection;
  const decos: Decoration[] = [];
  for (const { node, pos } of ordinaryBlocks(state.doc)) {
    const flips = flipsOf(node);
    flips.forEach((f, i) => {
      const a = pos + f.from;
      const b = pos + f.to;
      // The sentence the selection touches, with its end shared by the next
      // sentence's start: a caret at a boundary belongs to the one after.
      const last = i === flips.length - 1;
      if (sf <= (last ? b : b - 1) && st >= a) return;
      decos.push(
        Decoration.widget(a, () => {
          const el = document.createElement('span');
          el.className = 'sentence-flipper-text';
          el.textContent = f.text;
          return el;
        }, { side: -1, key: `sf-${f.text}` }),
        Decoration.inline(a, b, { class: 'sentence-flipper-hidden' }),
      );
    });
  }
  return DecorationSet.create(state.doc, decos);
}

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const on = p.getValue(onKey);
    p.provide(actions.flip, { procedure: () => (on.set((v) => !v), true), active: () => on.get() });
    p.provide(new Plugin({ props: { decorations: (state) => (on.get() ? build(state) : null) } }));

    const Control = () => {
      const flipAction = useAction(p, actions.flip);
      useStore(on);
      return (
        <Toggle size="sm" pressed={flipAction.active} disabled={!flipAction.enabled} onPressedChange={flipAction.run}>
          Flip
        </Toggle>
      );
    };
    p.provide(ui.toolbar(Control));
  });
}

export const styles = `
.sentence-flipper-hidden { display: none; }
.sentence-flipper-text { white-space: pre-wrap; }
`;
