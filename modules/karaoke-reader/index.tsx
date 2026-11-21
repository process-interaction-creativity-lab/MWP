import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ActionDeclaration, ModuleContext } from 'mwps';
import { Button } from 'mwps/ui';
import { Square, Volume2 } from 'mwps/icons';
import { splitSentences, splitWords, textOf, writing } from 'mwps/text';
import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { Command } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/** The id of the pane being read, or null. One reading at a time. */
const readingKey = valueKey<string | null>('reading', { default: null });

export const actions = {
  read: { title: 'Read the document aloud, highlighting each word' } satisfies ActionDeclaration,
  stop: { title: 'Stop reading' } satisfies ActionDeclaration,
};

const PARAGRAPH_PAUSE_MS = 450;

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' ? window.speechSynthesis ?? null : null;

/** A word as the document had it when reading began; `from`..`to` follow edits. */
interface Word {
  from: number;
  to: number;
  text: string;
}

/** One spoken piece (a sentence), with the words in it. */
interface Chunk {
  text: string;
  pause: boolean;
  /** Each word's offset in `text` and its index in the word list. */
  words: { at: number; idx: number }[];
}

/** Everything to say, in order, and the words that will be highlighted. */
function plan(doc: Node): { chunks: Chunk[]; words: Word[] } {
  const chunks: Chunk[] = [];
  const words: Word[] = [];
  writing(doc).descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    const t = textOf(node, pos);
    let first = true;
    for (const s of splitSentences(t.text)) {
      const chunk: Chunk = { text: s.text, pause: false, words: [] };
      for (const w of splitWords(s.text)) {
        chunk.words.push({ at: w.from, idx: words.length });
        words.push({ from: t.pos(s.from + w.from), to: t.pos(s.from + w.to, -1), text: w.text });
      }
      if (chunk.words.length === 0) continue;
      chunk.pause = first && chunks.length > 0;
      first = false;
      chunks.push(chunk);
    }
    return false;
  });
  return { chunks, words };
}

interface State {
  words: Word[];
  current: number;
}
type Meta = { start: Word[] } | { at: number } | { end: true };

const key = new PluginKey<State>('karaoke-reader');
const IDLE: State = { words: [], current: -1 };

const send = (m: Meta): Command => (s, dispatch) => {
  dispatch?.(s.tr.setMeta(key, m));
  return true;
};

/** Highlights the spoken word; the words are kept mapped through edits. */
const highlighter = new Plugin<State>({
  key,
  state: {
    init: () => IDLE,
    apply(tr, st) {
      let next = st;
      if (tr.docChanged && st.words.length) {
        next = {
          current: st.current,
          words: st.words.map((w) => {
            const from = tr.mapping.map(w.from, 1);
            const to = tr.mapping.map(w.to, -1);
            return from < to ? { from, to, text: w.text } : { from, to: from, text: w.text };
          }),
        };
      }
      const m = tr.getMeta(key) as Meta | undefined;
      if (m && 'start' in m) next = { words: m.start, current: -1 };
      else if (m && 'at' in m) next = { ...next, current: m.at };
      else if (m && 'end' in m) next = IDLE;
      return next;
    },
  },
  props: {
    decorations(state) {
      const st = key.getState(state);
      const w = st && st.current >= 0 ? st.words[st.current] : undefined;
      if (!w || w.from >= w.to) return null;
      // A word edited beyond recognition, or split by something, isn't shown.
      if (state.doc.textBetween(w.from, w.to, '', '￼') !== w.text) return null;
      return DecorationSet.create(state.doc, [Decoration.inline(w.from, w.to, { class: 'karaoke-word' })]);
    },
  },
});

export function setup(ctx: ModuleContext) {
  const reading = ctx.getValue(readingKey);
  let current: { paneId: string; abort: AbortController } | null = null;

  const stop = () => current?.abort.abort();

  ctx.effect(() => () => {
    stop();
    current = null;
    reading.set(null);
  });

  ctx.with(reading, (s) => s.provide(actions.stop, { procedure: () => (stop(), true) }));

  ctx.each(ctx.panes, (p) => {
    p.provide(highlighter);

    const speak = (chunk: Chunk, signal: AbortSignal): Promise<void> =>
      new Promise((resolve) => {
        const s = synth();
        if (!s || signal.aborted) return resolve();
        const u = new SpeechSynthesisUtterance(chunk.text);
        const done = () => (signal.removeEventListener('abort', onAbort), resolve());
        const onAbort = () => (s.cancel(), resolve());
        u.onboundary = (e) => {
          // The word being said is the last one that starts at or before charIndex.
          const at = chunk.words.filter((x) => x.at <= e.charIndex).pop() ?? chunk.words[0];
          if (!signal.aborted) p.run(send({ at: at.idx }));
        };
        u.onend = done;
        u.onerror = done;
        signal.addEventListener('abort', onAbort);
        s.resume?.(); // Chromium can stay paused after a cancel
        s.speak(u);
      });

    const wait = (ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        const done = () => (clearTimeout(timer), signal.removeEventListener('abort', done), resolve());
        const timer = setTimeout(done, ms);
        signal.addEventListener('abort', done);
      });

    const read: Command = (state, dispatch) => {
      if (!synth()) return false;
      const { chunks, words } = plan(state.doc);
      if (chunks.length === 0) return false;
      if (!dispatch) return true;
      stop();
      const session = { paneId: p.id, abort: new AbortController() };
      current = session;
      reading.set(p.id);
      p.run(send({ start: words }));
      const { signal } = session.abort;
      void (async () => {
        for (const c of chunks) {
          if (c.pause) await wait(PARAGRAPH_PAUSE_MS, signal);
          if (signal.aborted) break;
          await speak(c, signal);
          if (signal.aborted) break;
        }
        p.run(send({ end: true }));
        if (current === session) {
          current = null;
          reading.set(null);
        }
      })();
      return true;
    };

    p.provide(actions.read, { command: read });
    // Closing the pane being read ends it.
    p.effect(() => () => {
      if (current?.paneId === p.id) stop();
    });

    const Controls = () => {
      const start = useAction(p, actions.read);
      const halt = useAction(p, actions.stop);
      const who = useStore(reading);
      const available = synth() !== null;
      return who === p.id ? (
        <Button variant="ghost" size="sm" disabled={!halt.enabled} onClick={halt.run} title="Stop reading">
          <Square size={14} /> Stop
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={!start.enabled}
          onClick={start.run}
          title={available ? 'Read the document aloud' : 'Speech is not available on this device'}
        >
          <Volume2 size={14} /> {available ? 'Read' : 'No speech'}
        </Button>
      );
    };
    p.provide(ui.toolbar(Controls));
  });
}

export const styles = `
.karaoke-word { background: var(--accent); color: var(--accent-foreground); border-radius: 2px; }
`;
