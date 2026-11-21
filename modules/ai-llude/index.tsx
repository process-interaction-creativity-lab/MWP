import type { ActionDeclaration, AiSettings, ModuleContext } from 'mwps';
import { chat, failure } from 'mwps/ai';
import { textOf } from 'mwps/text';
import type { MarkSpec, Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { Command, EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

type Kind = 'continue' | 'allude';

// Both on Tab: where both apply, the palette opens at the caret with them.
export const actions = {
  continue: { title: 'Continue with AI', keys: 'Tab' },
  allude: { title: 'Allude with AI', keys: 'Tab' },
} satisfies Record<string, ActionDeclaration>;

const MARK = 'ai_llude_ai';

export const marks: { [name: string]: MarkSpec } = {
  [MARK]: {
    inclusive: false,
    parseDOM: [{ tag: 'span.ai-llude-ai' }],
    toDOM: () => ['span', { class: 'ai-llude-ai' }, 0],
  },
};

const MIN_CHARS = 100;
const MAX_CHARS = 4000;

const CONTINUE_SYSTEM =
  "Continue the writer's text from exactly where it stops. Reply with the continuation only, in the same voice, " +
  'no more than about 40 words, without starting a new paragraph.';

const FRAGMENTS = [
  'Suggest a possible next event in the story (a plot beat).',
  'Suggest a sensory detail of the place where the story is now (a setting detail).',
  'Suggest a loosely related aside (a benign tangent).',
  "Make a playful remark in a whimsical storyteller's voice.",
].map((p) => `${p} Reply with one fragment of at most 15 words, no full stop, nothing else.`);

// ---- session state of one pane: the request out, a note ----

interface Req {
  id: string;
  /** Where the answer lands. */
  pos: number;
}
interface State {
  req: Req | null;
  note: number | null;
}
type Meta = { start?: Req; cancel?: true; note?: number | null };

const stateKey = new PluginKey<State>('ai-llude');
const idle: State = { req: null, note: null };

/** The text before `head` in every text block (paragraphs, headings, other
 *  modules' fields), blocks on separate lines, the last `cap` characters. */
function prefixOf(doc: Node, head: number, cap: number): string {
  const blocks: string[] = [];
  doc.nodesBetween(Math.max(0, head - 4 * cap - 200), head, (node, pos) => {
    if (!node.isTextblock) return true;
    const t = textOf(node, pos);
    let text = t.text;
    if (head < pos + node.nodeSize) {
      let k = 0;
      while (k < text.length && t.pos(k) < head) k++;
      text = text.slice(0, k);
    }
    blocks.push(text);
    return false;
  });
  return blocks.join('\n').slice(-cap);
}

const canAsk = (state: EditorState) =>
  state.selection.empty && prefixOf(state.doc, state.selection.head, MIN_CHARS).length >= MIN_CHARS;

// ---- the calls ----

// No token cap on requests: a reasoning model spends it thinking and replies
// with nothing. Length is asked for in the prompt and held here.
const firstLine = (s: string) => s.trim().split('\n')[0]!.replace(/\s+/g, ' ').trim();
const words = (s: string, n: number) => s.split(' ').slice(0, n).join(' ');

async function continuation(ai: AiSettings, prefix: string, signal: AbortSignal): Promise<string> {
  const reply = await chat(
    ai,
    {
      messages: [
        { role: 'system', content: CONTINUE_SYSTEM },
        { role: 'user', content: prefix },
      ],
    },
    signal,
  );
  return words(firstLine(reply), 60);
}

async function allusion(ai: AiSettings, prefix: string, signal: AbortSignal): Promise<string> {
  const results = await Promise.allSettled(
    FRAGMENTS.map((system) =>
      chat(
        ai,
        {
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prefix },
          ],
        },
        signal,
      ),
    ),
  );
  const parts = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map((r) => words(firstLine(r.value), 15).replace(/[.\s]+$/, ''))
    .filter(Boolean);
  // All failed: say why, so the writer's stop is told from a failure.
  const failed = results.find((r) => r.status === 'rejected');
  if (!parts.length && failed) throw failed.reason;
  return parts.join(' ... ');
}

// ---- setup ----

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    let current: { id: string; ctl: AbortController } | undefined;
    let noteTimer: ReturnType<typeof setTimeout> | undefined;
    p.effect(() => () => clearTimeout(noteTimer));

    const meta = (m: Meta): Command => (s, dispatch) => {
      dispatch?.(s.tr.setMeta(stateKey, m));
      return true;
    };

    // Finish request `id`: insert `text` where it was asked, or note a failure.
    const finish =
      (id: string, text: string): Command =>
      (state, dispatch) => {
        const v = stateKey.getState(state);
        if (!v?.req || v.req.id !== id) return false;
        if (dispatch) {
          const { pos } = v.req;
          const tr = state.tr;
          if (text) {
            const $p = state.doc.resolve(pos);
            const before = pos > $p.start() ? state.doc.textBetween(pos - 1, pos) : '';
            const full = (before && !/\s/.test(before) ? ' ' : '') + text;
            const type = state.schema.marks[MARK];
            // A field that takes no marks gets the words without the AI tint.
            const marks = $p.parent.type.allowsMarkType(type) ? type.create().addToSet($p.marks()) : $p.marks();
            tr.insert(pos, state.schema.text(full, marks));
            tr.setMeta(stateKey, { cancel: true } satisfies Meta);
          } else {
            tr.setMeta(stateKey, { cancel: true, note: pos } satisfies Meta);
          }
          dispatch(tr);
        }
        return true;
      };

    async function run(kind: Kind, id: string, ai: AiSettings, prefix: string, signal: AbortSignal) {
      let text = '';
      try {
        text = await (kind === 'continue' ? continuation(ai, prefix, signal) : allusion(ai, prefix, signal));
      } catch (e) {
        // The writer's stop leaves no note, and the signal stays unaborted.
        if (failure(e) === null && !signal.aborted) {
          current = undefined;
          p.run(meta({ cancel: true }));
          return;
        }
        text = '';
      }
      if (signal.aborted) return;
      if (current?.id === id) current = undefined;
      if (p.run(finish(id, text)) && !text) {
        clearTimeout(noteTimer);
        noteTimer = setTimeout(() => void p.run(meta({ note: null })), 4000);
      }
    }

    const ask =
      (kind: Kind): Command =>
      (state, dispatch) => {
        const ai = ctx.ai.get();
        if (!ai || !canAsk(state)) return false;
        if (dispatch) {
          current?.ctl.abort();
          const ctl = new AbortController();
          p.signal.addEventListener('abort', () => ctl.abort(), { once: true });
          const id = crypto.randomUUID();
          current = { id, ctl };
          const prefix = prefixOf(state.doc, state.selection.head, MAX_CHARS);
          dispatch(state.tr.setMeta(stateKey, { start: { id, pos: state.selection.head } } satisfies Meta));
          void run(kind, id, ai, prefix, ctl.signal);
        }
        return true;
      };

    const plugin = new Plugin<State>({
      key: stateKey,
      state: {
        init: () => idle,
        apply(tr, v) {
          let { req, note } = v;
          if (tr.docChanged || tr.selectionSet) note = null;
          if (tr.docChanged && req) {
            const r = tr.mapping.mapResult(req.pos, -1);
            req = r.deleted ? null : { id: req.id, pos: r.pos };
          }
          const m = tr.getMeta(stateKey) as Meta | undefined;
          if (m) {
            if (m.start) req = m.start;
            if (m.cancel) req = null;
            if ('note' in m) note = m.note ?? null;
          }
          return req === v.req && note === v.note ? v : { req, note };
        },
      },
      props: {
        decorations(state) {
          const v = stateKey.getState(state);
          if (!v) return null;
          const decos: Decoration[] = [];
          if (v.req) {
            decos.push(
              Decoration.widget(
                v.req.pos,
                () => {
                  const el = document.createElement('span');
                  el.className = 'ai-llude-pending';
                  el.setAttribute('aria-label', 'Waiting for a suggestion');
                  return el;
                },
                { side: -1, key: `ai-llude-pending-${v.req.id}`, ignoreSelection: true },
              ),
            );
          }
          if (v.note !== null) {
            decos.push(
              Decoration.widget(
                v.note,
                () => {
                  const el = document.createElement('span');
                  el.className = 'ai-llude-note';
                  el.textContent = "Couldn't get a suggestion. Try again.";
                  return el;
                },
                { side: 1, key: 'ai-llude-note', ignoreSelection: true },
              ),
            );
          }
          return decos.length ? DecorationSet.create(state.doc, decos) : null;
        },
        handleKeyDown(view, e) {
          if (e.ctrlKey || e.metaKey || e.altKey) return false;
          const v = stateKey.getState(view.state);
          if (!v) return false;
          if (e.key === 'Escape' && v.req) {
            view.dispatch(view.state.tr.setMeta(stateKey, { cancel: true } satisfies Meta));
            return true;
          }
          return false;
        },
        handleTextInput(view, from, to, text) {
          // The writer's characters are never the AI's, even inside its span.
          const type = view.state.schema.marks[MARK];
          const marks = view.state.storedMarks ?? view.state.doc.resolve(from).marks();
          if (!marks.some((m) => m.type === type)) return false;
          const tr = view.state.tr.insertText(text, from, to);
          tr.removeMark(from, from + text.length, type);
          view.dispatch(tr.scrollIntoView().setMeta('uiEvent', 'input'));
          return true;
        },
      },
      view: () => ({
        update(view) {
          const r = stateKey.getState(view.state)?.req;
          if (current && r?.id !== current.id) {
            current.ctl.abort();
            current = undefined;
          }
        },
        destroy() {
          current?.ctl.abort();
          current = undefined;
        },
      }),
    });
    p.provide(plugin);

    // The actions exist only while AI is on; AI going off also ends the request.
    p.with(ctx.ai, (s) => {
      s.provide(actions.continue, { command: ask('continue') });
      s.provide(actions.allude, { command: ask('allude') });
      s.effect(() => () => {
        if (current) {
          current.ctl.abort();
          current = undefined;
        }
        p.run((st, dispatch) => {
          const v = stateKey.getState(st);
          if (!v?.req) return false;
          dispatch?.(st.tr.setMeta(stateKey, { cancel: true } satisfies Meta));
          return true;
        });
      });
    });
  });
}

export const styles = `
.ai-llude-ai {
  color: color-mix(in srgb, #8b5cf6 75%, var(--foreground));
}
.ai-llude-pending {
  display: inline-block;
  width: 0.6em;
  height: 0.6em;
  margin: 0 0.15em;
  border-radius: 50%;
  background: color-mix(in srgb, #8b5cf6 75%, var(--foreground));
  animation: ai-llude-pulse 1s ease-in-out infinite;
  vertical-align: baseline;
}
@keyframes ai-llude-pulse {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .ai-llude-pending { animation: none; opacity: 0.6; }
}
.ai-llude-note {
  color: var(--muted-foreground);
  font-size: 0.85em;
  margin-left: 0.4em;
  user-select: none;
}
`;
