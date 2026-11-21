import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Fragment, Slice } from 'prosemirror-model';
import type { MarkSpec, Node, NodeSpec } from 'prosemirror-model';
import { Plugin, TextSelection } from 'prosemirror-state';
import type { Command, EditorState, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { EditorView } from 'prosemirror-view';
import { ui, useAction, useStore, valueKey } from 'mwps';
import type { AiSettings, ModuleContext } from 'mwps';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from 'mwps/ui';
import { chat } from 'mwps/ai';
import type { ChatMessage } from 'mwps/ai';
import { appendData, dataEnd, findData, ordinaryBlocks, textOf, writing } from 'mwps/text';

// ---- Declarations -----------------------------------------------------------

const MARK = 'writor_anchor';
const DATA = 'writor_data';
const GOALS = 'writor_goals';
const CARD = 'writor_card';

interface Msg {
  from: 'tutor' | 'you';
  text: string;
}

type Kind = 'critique' | 'praise' | 'question';

interface Card {
  id: string;
  kind: Kind;
  topic: string;
  comment: string;
  /** What the writer asked, for a question card. */
  question?: string;
  /** What kind of help a critique asks for: the reader's view, or an example. */
  ftype: string;
  addressed: boolean;
  thread: Msg[];
  /** The sentence as it was when the comment was made. */
  quote: string;
}

interface Goal {
  id: string;
  text: string;
  on: boolean;
  mine: boolean;
}

interface Answers {
  task: string;
  rubric: string;
  focus: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'done'; n: number; dropped: number }
  | { kind: 'error'; message: string };

// Per document, this session.
const statusKey = valueKey<Status>('status', { default: { kind: 'idle' } });
const busyKey = valueKey<Record<string, 'replying' | 'error'>>('busy', { default: {} });
// Per pane, this session.
const markedKey = valueKey<string | null>('marked', { default: null });
const hoverKey = valueKey<string | null>('hover', { default: null });
const goalsOpenKey = valueKey('goalsOpen', { default: false });
const goalsShownKey = valueKey('goalsShown', { default: false });
const confirmKey = valueKey('confirm', { default: false });
const askBoxKey = valueKey<{ from: number; to: number } | null>('askBox', { default: null });

export const actions = {
  setGoals: { title: 'Set writing goals' },
  getFeedback: { title: 'Get feedback from the writing tutor' },
  askAbout: { title: 'Ask the tutor about this' },
};

export const marks: { [name: string]: MarkSpec } = {
  [MARK]: {
    attrs: { id: { default: '' } },
    inclusive: false,
    // A question may be asked about a sentence that already has a comment.
    excludes: '',
    parseDOM: [{ tag: 'span[data-writor]', getAttrs: (d) => ({ id: (d as HTMLElement).getAttribute('data-writor') ?? '' }) }],
    toDOM: (m) => ['span', { 'data-writor': m.attrs.id }, 0],
  },
};

// ---- The module's data ------------------------------------------------------------
// One `writor_data` node after the writing: a goals child (goals and the planning
// answers as attributes) and one card child per card, so each edit touches one card.

export const nodes: { [name: string]: NodeSpec } = {
  [DATA]: {
    group: 'module_data',
    content: `${GOALS} ${CARD}*`,
    toDOM: () => ['div', { class: 'writor-data' }, 0],
  },
  [GOALS]: {
    atom: true,
    attrs: { goals: { default: [] }, task: { default: '' }, rubric: { default: '' }, focus: { default: '' } },
    toDOM: () => ['div', { class: 'writor-goals-data' }],
  },
  [CARD]: {
    atom: true,
    attrs: {
      id: { default: '' },
      kind: { default: 'critique' },
      topic: { default: '' },
      comment: { default: '' },
      question: { default: '' },
      ftype: { default: '' },
      addressed: { default: false },
      thread: { default: [] },
      quote: { default: '' },
    },
    toDOM: (n) => ['div', { class: 'writor-card-data', 'data-id': String(n.attrs.id) }],
  },
};

interface Data {
  goals: Goal[];
  answers: Answers;
  /** In document order, which is creation order. */
  cards: Card[];
  at: Map<string, { card: Card; pos: number }>;
}

const dataCache = new WeakMap<Node, Data>();

const dataNode = (doc: Node) => findData(doc, DATA);

/** The goals, answers and cards in `doc`. A second card with an id already seen is ignored. */
function dataOf(doc: Node): Data {
  const hit = dataCache.get(doc);
  if (hit) return hit;
  const out: Data = { goals: [], answers: { task: '', rubric: '', focus: '' }, cards: [], at: new Map() };
  const d = dataNode(doc);
  if (d) {
    d.node.forEach((child, offset) => {
      const a = child.attrs;
      if (child.type.name === GOALS) {
        out.goals = a.goals as Goal[];
        out.answers = { task: a.task, rubric: a.rubric, focus: a.focus };
      } else if (!out.at.has(a.id)) {
        const card = { ...a } as Card;
        out.cards.push(card);
        out.at.set(a.id, { card, pos: d.pos + 1 + offset });
      }
    });
  }
  dataCache.set(doc, out);
  return out;
}

/** The data node, made in the document's data node when it is first needed. */
function ensureData(tr: Transaction): { node: Node; pos: number } {
  const found = dataNode(tr.doc);
  if (found) return found;
  const t = tr.doc.type.schema.nodes;
  tr.insert(dataEnd(tr.doc), t[DATA].create(null, t[GOALS].create()));
  return dataNode(tr.doc)!;
}

const cardNode = (state: EditorState | Transaction, card: Card) =>
  (('schema' in state ? state.schema : state.doc.type.schema) as EditorState['schema']).nodes[CARD].create(card);

/** Replace every card with `cards`, in the transaction. */
function setCards(tr: Transaction, cards: Card[]) {
  const d = ensureData(tr);
  const from = d.pos + 1 + d.node.firstChild!.nodeSize;
  const to = d.pos + d.node.nodeSize - 1;
  if (to > from) tr.delete(from, to);
  tr.insert(from, cards.map((c) => cardNode(tr, c)));
}

const addCard = (tr: Transaction, card: Card) => appendData(tr, DATA, cardNode(tr, card));

/** Change one card's attributes; false if it is gone. */
const patchCard =
  (id: string, fn: (c: Card) => Partial<Card>): Command =>
  (state, dispatch) => {
    const hit = dataOf(state.doc).at.get(id);
    if (!hit) return false;
    if (dispatch) {
      const node = state.doc.nodeAt(hit.pos)!;
      dispatch(state.tr.setNodeMarkup(hit.pos, undefined, { ...node.attrs, ...fn(hit.card) }));
    }
    return true;
  };

const removeCard =
  (id: string): Command =>
  (state, dispatch) => {
    const hit = dataOf(state.doc).at.get(id);
    if (!hit) return false;
    dispatch?.(state.tr.delete(hit.pos, hit.pos + state.doc.nodeAt(hit.pos)!.nodeSize));
    return true;
  };

const saveGoals =
  (goals: Goal[], answers: Answers): Command =>
  (state, dispatch) => {
    if (dispatch) {
      const tr = state.tr;
      const d = ensureData(tr);
      tr.setNodeMarkup(d.pos + 1, undefined, { goals, ...answers });
      dispatch(tr);
    }
    return true;
  };

// ---- Anchors in a document ----------------------------------------------------

interface Anchor {
  id: string;
  pieces: { from: number; to: number; parent: Node }[];
}

const anchorCache = new WeakMap<Node, Map<string, Anchor>>();

/** Every anchor in `doc`, in document order of its first piece. */
function anchorsOf(doc: Node): Map<string, Anchor> {
  const hit = anchorCache.get(doc);
  if (hit) return hit;
  const out = new Map<string, Anchor>();
  writing(doc).descendants((node, pos, parent) => {
    if (!node.isText) return true;
    for (const m of node.marks) {
      if (m.type.name !== MARK) continue;
      const id = m.attrs.id as string;
      let a = out.get(id);
      if (!a) out.set(id, (a = { id, pieces: [] }));
      const last = a.pieces[a.pieces.length - 1];
      if (last && last.parent === parent && last.to === pos) last.to = pos + node.nodeSize;
      else a.pieces.push({ from: pos, to: pos + node.nodeSize, parent: parent! });
    }
    return false;
  });
  anchorCache.set(doc, out);
  return out;
}

const textOfAnchor = (doc: Node, a: Anchor) => a.pieces.map((p) => doc.textBetween(p.from, p.to)).join(' ');

// ---- Reading the draft ----------------------------------------------------------

const normalize = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

function documentText(doc: Node): string {
  return ordinaryBlocks(doc)
    .map(({ node, pos }) => {
      const t = textOf(node, pos).text;
      return node.type.name === 'heading' ? `${'#'.repeat(Number(node.attrs.level) || 1)} ${t}` : t;
    })
    .join('\n\n');
}

interface Haystack {
  text: string;
  start: number[];
  end: number[];
}

/** The body text with whitespace collapsed and quotes straightened, each
 *  character with its document position. Blocks are separated by a newline no
 *  quote contains, so no quote matches across blocks. */
function haystack(doc: Node): Haystack {
  let text = '';
  const start: number[] = [];
  const end: number[] = [];
  for (const { node, pos } of ordinaryBlocks(doc)) {
    if (text) (text += '\n'), start.push(-1), end.push(-1);
    const t = textOf(node, pos);
    for (let i = 0; i < t.text.length; i++) {
      let ch = t.text[i];
      if (/\s/.test(ch)) {
        if (text === '' || text.endsWith(' ') || text.endsWith('\n')) continue;
        ch = ' ';
      } else if (ch === '‘' || ch === '’') ch = "'";
      else if (ch === '“' || ch === '”') ch = '"';
      text += ch;
      start.push(t.pos(i));
      end.push(t.pos(i + 1, -1));
    }
  }
  return { text, start, end };
}

/** Where `quote` is in the text, word for word (whitespace and quote style
 *  aside); `null` if it isn't. */
function place(hay: Haystack, quote: string): { from: number; to: number } | null {
  const q = normalize(quote);
  if (!q) return null;
  const i = hay.text.indexOf(q);
  if (i < 0) return null;
  const from = hay.start[i];
  const to = hay.end[i + q.length - 1];
  return from >= 0 && to > from ? { from, to } : null;
}

// ---- The model -------------------------------------------------------------------

const TUTOR =
  'You are a writing-center tutor helping a student revise their own draft. Give feedback on the thinking (thesis, organisation, development, audience), tied to the writer\'s goals. ' +
  'Ask, don\'t write for them: never write or rewrite sentences the writer could paste into the draft, never offer replacement wording. End each comment with an open question.';

class Unreadable extends Error {}

function parseJson(raw: string): Record<string, unknown> {
  const a = raw.indexOf('{');
  const b = raw.lastIndexOf('}');
  try {
    const data = JSON.parse(raw.slice(a, b + 1));
    if (data && typeof data === 'object') return data as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new Unreadable();
}

function strings(x: unknown, keys: string[]): Record<string, string>[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((e) => e && typeof e === 'object' && keys.every((k) => typeof (e as Record<string, unknown>)[k] === 'string'))
    .map((e) => Object.fromEntries(keys.map((k) => [k, (e as Record<string, string>)[k]])));
}

function context(goals: Goal[], answers: Answers): string {
  const on = goals.filter((g) => g.on).map((g) => `- ${g.text}`);
  return (
    `The writer's goals:\n${on.join('\n') || '(none given)'}\n\n` +
    `What the piece is for, and its audience: ${answers.task || '(not said)'}\n` +
    `The assignment or rubric: ${answers.rubric || '(not said)'}\n` +
    `What they want feedback on: ${answers.focus || '(not said)'}`
  );
}

interface Item {
  quote: string;
  kind: Kind;
  topic: string;
  comment: string;
  ftype: string;
}

async function askCritiques(ai: AiSettings, doc: Node, goals: Goal[], answers: Answers, signal: AbortSignal): Promise<Item[]> {
  const reply = await chat(
    ai,
    {
      messages: [
        {
          role: 'system',
          content:
            `${TUTOR}\nPick up to four higher-order concerns relevant to the goals. For them choose up to five sentences of the draft that most need work. ` +
            'For each, either take the reader\'s perspective (what a reader would think or be confused by) or ask for an example or analogy ("reader" or "example"). ' +
            'Reply with JSON only: {"critiques":[{"quote":"...","topic":"...","type":"reader"|"example","comment":"..."}]}. ' +
            '"quote": ONE whole sentence copied exactly, word for word, from the draft (if something is missing at a point, quote the sentence before it). ' +
            '"topic": two to four words ("Thesis", "Development"). "comment": under 700 characters, ending with an open question, with no rewritten text.',
        },
        { role: 'user', content: `${context(goals, answers)}\n\nThe draft:\n\n${documentText(doc)}` },
      ],
      response_format: { type: 'json_object' },
    },
    signal,
  );
  const raw = parseJson(reply).critiques;
  const typeOf = (quote: string) =>
    Array.isArray(raw) && raw.some((r) => r?.quote === quote && r.type === 'example') ? 'example' : 'reader';
  return strings(raw, ['quote', 'topic', 'comment'])
    .slice(0, 5)
    .map((c) => ({ quote: c.quote, kind: 'critique', topic: c.topic, comment: c.comment, ftype: typeOf(c.quote) }));
}

async function askPraise(ai: AiSettings, doc: Node, goals: Goal[], answers: Answers, signal: AbortSignal): Promise<Item[]> {
  const reply = await chat(
    ai,
    {
      messages: [
        {
          role: 'system',
          content:
            `${TUTOR}\nPick the three best sentences of the draft, relative to the writer's goals, and praise what they do. ` +
            'Reply with JSON only: {"praises":[{"quote":"...","topic":"Good ...","comment":"..."}]}. ' +
            '"quote": ONE whole sentence copied exactly, word for word, from the draft. "topic": a label that starts with "Good" ("Good use of evidence"). ' +
            '"comment": under 400 characters, saying what works and why.',
        },
        { role: 'user', content: `${context(goals, answers)}\n\nThe draft:\n\n${documentText(doc)}` },
      ],
      response_format: { type: 'json_object' },
    },
    signal,
  );
  return strings(parseJson(reply).praises, ['quote', 'topic', 'comment'])
    .slice(0, 3)
    .map((c) => ({ quote: c.quote, kind: 'praise', topic: c.topic, comment: c.comment, ftype: '' }));
}

async function suggestGoals(ai: AiSettings, answers: Answers, signal: AbortSignal): Promise<string[]> {
  const reply = await chat(
    ai,
    {
      messages: [
        {
          role: 'system',
          content:
            'From these answers, propose five revision goals a writing tutor would set; the fifth is about the reader or grader. One line each. ' +
            'Reply with JSON only: {"goals":["...","...","...","...","..."]}.',
        },
        {
          role: 'user',
          content: `What the piece is for, and its audience: ${answers.task}\nThe assignment or rubric: ${answers.rubric}\nWhat I want feedback on: ${answers.focus}`,
        },
      ],
      response_format: { type: 'json_object' },
    },
    signal,
  );
  const list = parseJson(reply).goals;
  if (!Array.isArray(list)) throw new Unreadable();
  return list.filter((g): g is string => typeof g === 'string' && !!g.trim()).slice(0, 5);
}

function threadMessages(doc: Node, card: Card, goals: Goal[], answers: Answers, sentence: string, thread: Msg[], last?: string): ChatMessage[] {
  const system =
    `${TUTOR}\nYou left a comment on one sentence and the writer is talking with you about it. Answer briefly, in the thread. ` +
    'If asked for an example: first quote a passage from the writer\'s own draft that already does the thing well; if there is none, offer an analogy or an example on another topic.\n\n' +
    `${context(goals, answers)}\n\nThe sentence the comment is about (as it is now): "${sentence}"\n\nThe whole draft now:\n\n${documentText(doc)}`;
  const turns: ChatMessage[] = [];
  if (card.kind === 'question') turns.push({ role: 'user', content: card.question ?? '' });
  if (card.comment) turns.push({ role: 'assistant', content: card.comment });
  thread.forEach((m, i) => {
    const content = last && i === thread.length - 1 && m.from === 'you' ? last : m.text;
    turns.push({ role: m.from === 'you' ? 'user' : 'assistant', content });
  });
  return [{ role: 'system', content: system }, ...turns];
}

// ---- Edits the module makes (its own door: no undo) ----------------------------------

/** Replace all feedback: remove every anchor and card, then add an anchor and a card for each
 *  item whose sentence is still in the text, word for word. One edit, so they never disagree. */
const replaceFeedback =
  (items: Item[], done: (placed: number) => void): Command =>
  (state, dispatch) => {
    const type = state.schema.marks[MARK];
    const hay = haystack(state.doc);
    const tr = state.tr;
    tr.removeMark(0, writing(state.doc).content.size, type);
    const placed: { item: Item; id: string; from: number }[] = [];
    for (const item of items) {
      const r = place(hay, item.quote);
      if (!r) continue;
      const id = crypto.randomUUID();
      tr.addMark(r.from, r.to, type.create({ id }));
      placed.push({ item, id, from: r.from });
    }
    placed.sort((a, b) => a.from - b.from);
    setCards(
      tr,
      placed.map(({ item, id }) => ({
        id,
        kind: item.kind,
        topic: item.topic,
        comment: item.comment,
        ftype: item.ftype,
        addressed: false,
        thread: [],
        quote: item.quote,
      })),
    );
    done(placed.length);
    dispatch?.(tr);
    return true;
  };

/** Slices that come in with anchors of their own (a paste from another
 *  document, or from this one) take them off: a copy is not the comment. */
function withoutAnchors(slice: Slice): Slice {
  const walk = (f: Fragment): Fragment => {
    const out: Node[] = [];
    f.forEach((n) => {
      const c = n.isLeaf ? n : n.copy(walk(n.content));
      out.push(c.marks.some((m) => m.type.name === MARK) ? c.mark(c.marks.filter((m) => m.type.name !== MARK)) : c);
    });
    return Fragment.fromArray(out);
  };
  return new Slice(walk(slice.content), slice.openStart, slice.openEnd);
}

// ---- The module -------------------------------------------------------------------------

const REQUEST_MS = 120_000;

const EMPTY: Data = { goals: [], answers: { task: '', rubric: '', focus: '' }, cards: [], at: new Map() };

const KIND_LABEL: Record<Kind, string> = { critique: 'Critique', praise: 'Praise', question: 'Your question' };

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    const d = p.document;
    if (!d) return;
    const status = d.getValue(statusKey);
    const busy = d.getValue(busyKey);
    const marked = p.getValue(markedKey);
    const hover = p.getValue(hoverKey);
    const goalsOpen = p.getValue(goalsOpenKey);
    const goalsShown = p.getValue(goalsShownKey);
    const confirm = p.getValue(confirmKey);
    const askBox = p.getValue(askBoxKey);

    const setBusy = (id: string, v: 'replying' | 'error' | null) =>
      busy.set((b) => {
        const { [id]: _gone, ...rest } = b;
        return v ? { ...rest, [id]: v } : rest;
      });
    const dataNow = () => dataOf(d.state.get().doc);
    /** The module's own write to one card: no undo (chat, replies). */
    const patch = (id: string, fn: (c: Card) => Partial<Card>) => d.edit(patchCard(id, fn));

    // -- AI work ------------------------------------------------------------

    let asking: AbortController | null = null;
    const cancelAsk = () => asking?.abort();

    async function getFeedback(ai: AiSettings, scope: AbortSignal) {
      if (status.get().kind === 'asking') return;
      // The writer's Cancel, or the scope ending, is an abort; a reply that never comes is an error, so Get feedback is not stuck.
      const ctl = (asking = new AbortController());
      const signal = AbortSignal.any([scope, ctl.signal]);
      const request = AbortSignal.any([signal, AbortSignal.timeout(REQUEST_MS)]);
      const doc = d!.state.get().doc;
      if (!documentText(doc).trim()) return void status.set({ kind: 'error', message: 'Nothing to give feedback on yet' });
      status.set({ kind: 'asking' });
      const { goals: gs, answers: as } = dataNow();
      try {
        const [crit, praise] = await Promise.allSettled([
          askCritiques(ai, doc, gs, as, request),
          askPraise(ai, doc, gs, as, request),
        ]);
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        if (crit.status === 'rejected' && praise.status === 'rejected') throw crit.reason;
        const items = [...(crit.status === 'fulfilled' ? crit.value : []), ...(praise.status === 'fulfilled' ? praise.value : [])];
        let placed = 0;
        // The text is as it is now, not as it was when asked. Anchors and cards change together, as the module's edit.
        d!.edit(replaceFeedback(items, (n) => (placed = n)));
        marked.set(null);
        status.set({ kind: 'done', n: placed, dropped: items.length - placed });
      } catch (e) {
        if (signal.aborted) return void status.set({ kind: 'idle' });
        status.set({ kind: 'error', message: e instanceof Unreadable ? "Couldn't read the tutor's reply" : "Couldn't reach the AI" });
      } finally {
        if (asking === ctl) asking = null;
      }
    }

    /** The tutor's reply to a card's thread (the writer's message is already in it). */
    async function answer(ai: AiSettings, id: string, last?: string) {
      const doc = d!.state.get().doc;
      const { goals, answers, at } = dataOf(doc);
      const card = at.get(id)?.card;
      if (!card) return;
      const a = anchorsOf(doc).get(id);
      const sentence = a ? textOfAnchor(doc, a) : card.quote;
      setBusy(id, 'replying');
      try {
        const text = (await chat(ai, { messages: threadMessages(doc, card, goals, answers, sentence, card.thread, last) }, p.signal)).trim();
        patch(id, (c) =>
          c.kind === 'question' && !c.comment && c.thread.length === 0
            ? { comment: text }
            : { thread: [...c.thread, { from: 'tutor', text }] },
        );
        setBusy(id, null);
      } catch {
        if (!p.signal.aborted) setBusy(id, 'error');
      }
    }

    async function chatMore(ai: AiSettings, id: string, text: string, instruction?: string) {
      if (!dataNow().at.has(id)) return;
      patch(id, (c) => ({ thread: [...c.thread, { from: 'you', text }] }));
      await answer(ai, id, instruction);
    }

    async function askAbout(ai: AiSettings, from: number, to: number, question: string) {
      const id = crypto.randomUUID();
      let sentence = '';
      // The anchor and its card in one edit of the module's.
      d!.edit((state, dispatch) => {
        if (from >= to || to > writing(state.doc).content.size) return false;
        sentence = state.doc.textBetween(from, to, ' ');
        if (!sentence.trim()) return false;
        if (dispatch) {
          const tr = state.tr.addMark(from, to, state.schema.marks[MARK].create({ id }));
          addCard(tr, { id, kind: 'question', topic: 'Your question', comment: '', question, ftype: '', addressed: false, thread: [], quote: sentence });
          dispatch(tr);
        }
        return true;
      });
      if (!sentence) return;
      marked.set(id);
      await answer(ai, id);
    }

    // -- Text: highlights, clicks, paste -------------------------------------

    /** ProseMirror scrolls only to a selection the browser's focus is in, and focus sits in the card just
     *  clicked. Scroll the pane (`view.dom`, or the nearest box around it that scrolls) instead. */
    const reveal = (view: EditorView, pos: number) => {
      let box: HTMLElement | null = view.dom;
      while (box && box.scrollHeight <= box.clientHeight + 1) box = box.parentElement;
      if (!box) return;
      const at = view.coordsAtPos(pos);
      const c = box.getBoundingClientRect();
      const margin = c.height * 0.15;
      if (at.top < c.top + margin || at.bottom > c.bottom - margin) box.scrollBy({ top: at.top - c.top - c.height / 3 });
    };

    const goTo =
      (id: string): Command =>
      (state, dispatch, view) => {
        const a = anchorsOf(state.doc).get(id);
        if (!a) return false;
        const from = a.pieces[0].from;
        if (dispatch) {
          dispatch(state.tr.setSelection(TextSelection.create(state.doc, from)));
          if (view) reveal(view, from);
        }
        return true;
      };

    p.provide(
      new Plugin({
        props: {
          decorations(state) {
            const all = dataOf(state.doc).at;
            const hot = hover.get();
            const decos: Decoration[] = [];
            for (const a of anchorsOf(state.doc).values()) {
              const card = all.get(a.id)?.card;
              if (!card) continue;
              const cls = `writor-hl writor-k-${card.kind}${card.addressed ? ' writor-done' : ''}${a.id === hot ? ' writor-hot' : ''}`;
              for (const piece of a.pieces) decos.push(Decoration.inline(piece.from, piece.to, { class: cls }));
            }
            return DecorationSet.create(state.doc, decos);
          },
          handleClick(view, pos) {
            const all = dataOf(view.state.doc).at;
            for (const a of anchorsOf(view.state.doc).values()) {
              if (all.has(a.id) && a.pieces.some((x) => x.from <= pos && pos <= x.to)) {
                marked.set(a.id);
                break;
              }
            }
            return false;
          },
          transformPasted: withoutAnchors,
        },
      }),
    );

    // -- Actions ---------------------------------------------------------------

    const activeGoals = () => dataNow().goals.filter((g) => g.on);
    p.provide(actions.setGoals, { procedure: () => (goalsOpen.set(true), true) });
    p.with(ctx.ai, (s, ai) => {
      s.provide(actions.getFeedback, {
        procedure: () => {
          if (status.get().kind === 'asking') return false;
          if (activeGoals().length === 0) goalsOpen.set(true);
          else if (dataNow().cards.length > 0) confirm.set(true);
          else void getFeedback(ai, s.signal);
          return true;
        },
      });
      s.provide(actions.askAbout, {
        command: (state: EditorState, dispatch) => {
          if (state.selection.empty) return false;
          if (dispatch) askBox.set({ from: state.selection.from, to: state.selection.to });
          return true;
        },
      });
    });

    // -- The feedback view -------------------------------------------------------

    const CardView = ({ id }: { id: string }) => {
      const card = useStore(p.state, (s) => (s ? dataOf(s.doc).at.get(id)?.card : undefined));
      const present = useStore(p.state, (s) => (s ? anchorsOf(s.doc).has(id) : false));
      const isMarked = useStore(marked, (m) => m === id);
      const state = useStore(busy, (b) => b[id]);
      const ai = useStore(ctx.ai);
      const [open, setOpen] = useState(false);
      const [text, setText] = useState('');
      const ref = useRef<HTMLDivElement>(null);
      useEffect(() => {
        if (isMarked) ref.current?.scrollIntoView({ block: 'nearest' });
      }, [isMarked]);
      if (!card) return null;
      const send = (t: string, instruction?: string) => {
        if (!ai || !t.trim() || state === 'replying') return;
        setOpen(true);
        void chatMore(ai, id, t.trim(), instruction);
      };
      return (
        <div
          ref={ref}
          className={`writor-card writor-k-${card.kind}${card.addressed ? ' writor-card-done' : ''}${isMarked ? ' writor-card-marked' : ''}`}
          data-writor-card={id}
          onMouseEnter={() => hover.set(id)}
          onMouseLeave={() => hover.set((h) => (h === id ? null : h))}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button, input, textarea, label')) return;
            marked.set(id);
            if (present) {
              p.run(goTo(id));
              p.focus();
            }
          }}
        >
          <div className="writor-card-head">
            <span className="writor-kind">{KIND_LABEL[card.kind]}</span>
            <b className="writor-topic">{card.topic}</b>
          </div>
          {card.question && <div className="writor-question">{card.question}</div>}
          <div className="writor-comment">{card.comment || (state === 'replying' ? '…' : '')}</div>
          {!present && (
            <div className="writor-removed">
              <span>text removed</span>
              <Button variant="ghost" size="xs" onClick={() => p.run(removeCard(id))}>
                Remove
              </Button>
            </div>
          )}
          <label className="writor-addressed">
            <input type="checkbox" checked={card.addressed} onChange={(e) => p.run(patchCard(id, () => ({ addressed: e.target.checked })))} />
            Addressed
          </label>
          <Button variant="ghost" size="xs" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide chat' : card.thread.length ? `Chat (${card.thread.length})` : 'Chat'}
          </Button>
          {open && (
            <div className="writor-thread">
              {card.thread.map((m, i) => (
                <div key={i} className="writor-msg">
                  <b>{m.from === 'tutor' ? 'Tutor' : 'You'}</b> {m.text}
                </div>
              ))}
              {state === 'replying' && <div className="writor-note">Tutor is replying…</div>}
              {state === 'error' && <div className="writor-note">Couldn't get a reply</div>}
              <div className="writor-reply">
                <Textarea
                  value={text}
                  disabled={!ai}
                  placeholder={ai ? 'Chat more…' : 'AI is off'}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(text);
                      setText('');
                    }
                  }}
                />
                <div className="writor-row">
                  <Button
                    size="xs"
                    disabled={!ai || !text.trim() || state === 'replying'}
                    onClick={() => (send(text), setText(''))}
                  >
                    Send
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!ai || state === 'replying'}
                    onClick={() =>
                      send(
                        'Find examples',
                        'Find an example for this comment: first quote a passage from my own draft that already does this well; if there is none, give an analogy or an example on another topic. Do not write text for my draft.',
                      )
                    }
                  >
                    Find examples
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    };

    const View = () => {
      const data = useStore(p.state, (s) => (s ? dataOf(s.doc) : EMPTY));
      const order = useStore(p.state, (s) => (s ? [...anchorsOf(s.doc).keys()].join(',') : ''));
      const gs = data.goals;
      const shown = useStore(goalsShown);
      const st = useStore(status);
      const ai = useStore(ctx.ai);
      const setGoals = useAction(p, actions.setGoals);
      const get = useAction(p, actions.getFeedback);
      const ids = order ? order.split(',') : [];
      const anchored = ids.filter((id) => data.at.has(id));
      const gone = data.cards.filter((c) => !ids.includes(c.id)).map((c) => c.id);
      const total = data.cards.length;
      const done = data.cards.filter((c) => c.addressed).length;
      const on = gs.filter((g) => g.on);
      return (
        <div className="writor-view">
          <div className="writor-header">
            <div className="writor-row">
              <Button variant="ghost" size="xs" onClick={() => goalsShown.set((v) => !v)} aria-expanded={shown}>
                {on.length === 0 ? 'No goals yet' : `${on.length} ${on.length === 1 ? 'goal' : 'goals'}`} {shown ? '▴' : '▾'}
              </Button>
              <Button variant="outline" size="xs" onClick={setGoals.run}>
                Set goals
              </Button>
            </div>
            {shown && (
              <ul className="writor-goals">
                {on.map((g) => (
                  <li key={g.id}>{g.text}</li>
                ))}
              </ul>
            )}
            <div className="writor-row">
              <span className="writor-count">
                {done} / {total} addressed
              </span>
              <Button size="xs" disabled={!get.enabled || st.kind === 'asking'} onClick={get.run}>
                Get feedback
              </Button>
            </div>
            {!ai && <div className="writor-note">AI is off</div>}
            {st.kind === 'asking' && (
              <div className="writor-note" role="status">
                <span className="writor-spinner" aria-hidden />
                Reading your draft…
                <Button variant="ghost" size="xs" onClick={() => cancelAsk()}>
                  Cancel
                </Button>
              </div>
            )}
            {st.kind === 'done' && st.dropped > 0 && (
              <div className="writor-note">
                {st.dropped} {st.dropped === 1 ? 'comment was' : 'comments were'} dropped: the sentence changed before the reply arrived.
              </div>
            )}
            {st.kind === 'error' && <div className="writor-note">{st.message}</div>}
          </div>
          <div className="writor-cards">
            {[...anchored, ...gone].map((id) => (
              <CardView key={id} id={id} />
            ))}
          </div>
        </div>
      );
    };
    p.provide(ui.side(View));

    // -- Goals dialog ------------------------------------------------------------------

    const GoalsDialog = () => {
      const open = useStore(goalsOpen);
      const saved = useStore(p.state, (s) => (s ? dataOf(s.doc) : EMPTY));
      const ai = useStore(ctx.ai);
      // What the writer is typing stays here until they finish: one undo step for the whole dialog.
      const [draft, setDraft] = useState<{ goals: Goal[]; answers: Answers } | null>(null);
      useEffect(() => {
        setDraft(open ? { goals: dataOf(p.state.get()!.doc).goals, answers: dataOf(p.state.get()!.doc).answers } : null);
      }, [open]);
      const gs = (draft ?? saved).goals;
      const an = (draft ?? saved).answers;
      const edit = (fn: (d: { goals: Goal[]; answers: Answers }) => { goals: Goal[]; answers: Answers }) =>
        setDraft((d) => fn(d ?? { goals: saved.goals, answers: saved.answers }));
      const setAnswers = (patch: Partial<Answers>) => edit((d) => ({ ...d, answers: { ...d.answers, ...patch } }));
      const finish = () => {
        if (draft && JSON.stringify(draft) !== JSON.stringify({ goals: saved.goals, answers: saved.answers })) {
          p.run(saveGoals(draft.goals, draft.answers));
        }
        goalsOpen.set(false);
      };
      const [own, setOwn] = useState('');
      const [suggesting, setSuggesting] = useState<'idle' | 'busy' | 'error'>('idle');
      const addOwn = () => {
        const t = own.trim();
        if (!t) return;
        edit((d) => ({ ...d, goals: [...d.goals, { id: crypto.randomUUID(), text: t, on: true, mine: true }] }));
        setOwn('');
      };
      const suggest = async () => {
        if (!ai) return;
        setSuggesting('busy');
        try {
          const list = await suggestGoals(ai, an, p.signal);
          edit((d) => ({
            ...d,
            goals: [
              ...d.goals.filter((x) => x.on || x.mine),
              ...list.map((text) => ({ id: crypto.randomUUID(), text, on: false, mine: false })),
            ],
          }));
          setSuggesting('idle');
        } catch {
          if (!p.signal.aborted) setSuggesting('error');
        }
      };
      return (
        <Dialog open={open} onOpenChange={(v) => (v ? goalsOpen.set(true) : finish())}>
          <DialogContent
            className="writor-dialog"
          >
            <DialogHeader>
              <DialogTitle>Goals for this draft</DialogTitle>
            </DialogHeader>
            <div className="writor-form">
              <label>
                What is the piece for, and who is it for?
                <Textarea value={an.task} onChange={(e) => setAnswers({ task: e.target.value })} />
              </label>
              <label>
                The assignment or rubric
                <Textarea value={an.rubric} onChange={(e) => setAnswers({ rubric: e.target.value })} />
              </label>
              <label>
                What do you want feedback on?
                <Textarea value={an.focus} onChange={(e) => setAnswers({ focus: e.target.value })} />
              </label>
              <div className="writor-row">
                <Button variant="outline" size="sm" disabled={!ai || suggesting === 'busy'} onClick={() => void suggest()}>
                  {suggesting === 'busy' ? 'Suggesting…' : 'Suggest goals'}
                </Button>
                {!ai && <span className="writor-note">AI is off</span>}
                {suggesting === 'error' && <span className="writor-note">Couldn't get suggestions</span>}
              </div>
              <ul className="writor-goal-list">
                {gs.map((g) => (
                  <li key={g.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={g.on}
                        onChange={(e) => edit((d) => ({ ...d, goals: d.goals.map((x) => (x.id === g.id ? { ...x, on: e.target.checked } : x)) }))}
                      />
                      {g.text}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="writor-row">
                <Input
                  value={own}
                  placeholder="Add a goal of your own"
                  onChange={(e) => setOwn(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.preventDefault(), addOwn());
                  }}
                />
                <Button variant="outline" size="sm" disabled={!own.trim()} onClick={addOwn}>
                  Add
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" onClick={finish}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    };
    p.provide(ui.modal(GoalsDialog));

    const ConfirmDialog = () => {
      const open = useStore(confirm);
      const all = useStore(p.state, (s) => (s ? dataOf(s.doc) : EMPTY)).cards;
      const ai = useStore(ctx.ai);
      const n = all.length;
      const chats = all.filter((c) => c.thread.length > 0).length;
      return (
        <Dialog open={open} onOpenChange={confirm.set}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Replace the feedback?</DialogTitle>
            </DialogHeader>
            <p>
              This replaces all {n} {n === 1 ? 'comment' : 'comments'}
              {chats > 0 ? `, ${chats} with a chat` : ''}, and clears the ticks.
            </p>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => confirm.set(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!ai}
                onClick={() => {
                  confirm.set(false);
                  if (ai) void getFeedback(ai, p.signal);
                }}
              >
                Replace
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    };
    p.provide(ui.modal(ConfirmDialog));

    // -- Selection bubble ----------------------------------------------------------------

    const Bubble = () => {
      const ai = useStore(ctx.ai);
      const ask = useAction(p, actions.askAbout);
      const box = useStore(askBox);
      const hasSelection = useStore(p.state, (s) => !!s && !s.selection.empty);
      const [t, setT] = useState('');
      useLayoutEffect(() => {
        if (!hasSelection && askBox.get()) askBox.set(null);
      }, [hasSelection]);
      const send = () => {
        const q = t.trim();
        const b = askBox.get();
        if (!q || !ai || !b) return;
        askBox.set(null);
        setT('');
        p.focus();
        void askAbout(ai, b.from, b.to, q);
      };
      return (
        <div className="writor-ask">
          <Button variant="ghost" size="sm" disabled={!ask.enabled} onClick={ask.run}>
            Ask about this
          </Button>
          {box && ai && (
            <>
              <Textarea
                autoFocus
                value={t}
                placeholder="Ask the tutor about this passage…"
                onChange={(e) => setT(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), send());
                  if (e.key === 'Escape') (askBox.set(null), p.focus());
                }}
              />
              <Button size="sm" disabled={!t.trim()} onClick={send}>
                Send
              </Button>
            </>
          )}
        </div>
      );
    };
    p.provide(ui.selection(Bubble));
  });
}

export const styles = `
.writor-hl { background: rgb(var(--writor-c) / 0.28); }
.writor-k-critique { --writor-c: 139 92 246; }
.writor-k-praise { --writor-c: 34 197 94; }
.writor-k-question { --writor-c: 59 130 246; }
.writor-hl.writor-done { background: rgb(var(--writor-c) / 0.1); }
.writor-hl.writor-hot { background: rgb(var(--writor-c) / 0.55); }
.writor-view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.writor-header { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-bottom: 1px solid var(--border); }
.writor-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.writor-count { flex: 1; font-size: 12px; }
.writor-goals { margin: 0; padding-left: 18px; font-size: 12px; }
.writor-note { font-size: 12px; color: var(--muted-foreground); }
.writor-spinner { display: inline-block; width: 10px; height: 10px; margin-right: 6px; border: 2px solid var(--muted-foreground); border-top-color: transparent; border-radius: 50%; animation: writor-spin 0.8s linear infinite; }
@keyframes writor-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .writor-spinner { animation: none; } }
.writor-cards { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 8px; padding: 8px; }
.writor-card { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 8px; border: 1px solid var(--border); border-left: 4px solid rgb(var(--writor-c)); border-radius: 6px; cursor: pointer; font-size: 13px; }
.writor-card-done { opacity: 0.55; }
.writor-card-marked { outline: 2px solid var(--ring); }
.writor-card-head { display: flex; gap: 6px; align-items: baseline; }
.writor-kind { font-size: 11px; color: var(--muted-foreground); }
.writor-question { font-style: italic; }
.writor-removed { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--destructive); }
.writor-addressed { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
.writor-thread { width: 100%; display: flex; flex-direction: column; gap: 4px; cursor: default; }
.writor-msg { white-space: pre-wrap; }
.writor-reply { display: flex; flex-direction: column; gap: 4px; }
.writor-form { display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow: auto; }
.writor-form label { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.writor-goal-list { list-style: none; margin: 0; padding: 0; }
.writor-goal-list label, .writor-addressed { flex-direction: row; align-items: center; gap: 6px; }
.writor-ask { display: flex; flex-direction: column; gap: 4px; }
`;
