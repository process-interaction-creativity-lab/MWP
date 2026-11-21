import { useEffect, useState } from 'react';
import type { Node } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ModuleContext } from 'mwps';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'mwps/ui';
import { Square, Volume2 } from 'mwps/icons';
import { splitSentences, textOf, writing } from 'mwps/text';

/** The chosen voice's `voiceURI`; '' is the device's default voice. */
const voiceKey = valueKey<string>('voice', { default: '', persist: true });
const speakingKey = valueKey<boolean>('speaking', { default: false });

export const actions = {
  read: { title: 'Read aloud from cursor', keys: 'Mod-Shift-s' },
  stop: { title: 'Stop reading' },
};

const DEFAULT_VOICE = 'default';
const PARAGRAPH_PAUSE_MS = 450;

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' ? window.speechSynthesis ?? null : null;

/** What to say, in order, from `from` to the end: one chunk per sentence, and
 *  `pause` on a chunk that opens a new block. Inline notes are left out. */
function chunksFrom(doc: Node, from: number): { text: string; pause: boolean }[] {
  const chunks: { text: string; pause: boolean }[] = [];
  writing(doc).descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (pos + node.nodeSize <= from || node.type.spec.code) return false;
    const t = textOf(node, pos);
    let start = 0;
    while (start < t.text.length && t.pos(start) < from) start++;
    let first = true;
    for (const s of splitSentences(t.text.slice(start))) {
      const text = s.text.trim();
      if (!text) continue;
      chunks.push({ text, pause: first && chunks.length > 0 });
      first = false;
    }
    return false;
  });
  return chunks;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const done = () => (clearTimeout(timer), signal.removeEventListener('abort', done), resolve());
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done);
  });

function say(text: string, voiceURI: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const s = synth();
    if (!s || signal.aborted) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    // A voice that has gone leaves the default.
    const voice = voiceURI ? s.getVoices().find((v) => v.voiceURI === voiceURI) : undefined;
    if (voice) u.voice = voice;
    const done = () => (signal.removeEventListener('abort', done), resolve());
    u.onend = done;
    u.onerror = done;
    signal.addEventListener('abort', () => (s.cancel(), done()));
    s.resume?.(); // Chromium can stay paused after a cancel
    s.speak(u);
  });
}

/** The device's voices; they arrive late in some engines. */
function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => synth()?.getVoices() ?? []);
  useEffect(() => {
    const s = synth();
    if (!s) return;
    const update = () => setVoices(s.getVoices());
    update();
    s.addEventListener?.('voiceschanged', update);
    return () => s.removeEventListener?.('voiceschanged', update);
  }, []);
  return voices;
}

export function setup(ctx: ModuleContext) {
  const speaking = ctx.getValue(speakingKey);
  const voice = ctx.getValue(voiceKey);
  // One reading at a time, whichever pane it came from.
  let current: { paneId: string; abort: AbortController } | null = null;

  const stop = () => {
    current?.abort.abort();
  };

  const read = (paneId: string, state: EditorState) => {
    stop();
    const chunks = chunksFrom(state.doc, state.selection.from);
    if (chunks.length === 0) return;
    const session = { paneId, abort: new AbortController() };
    current = session;
    speaking.set(true);
    const { signal } = session.abort;
    const startedAt = performance.now();
    // Any real key press stops it; the press that started it (stamped before
    // now), a bare modifier and auto-repeat don't.
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.timeStamp <= startedAt) return;
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      session.abort.abort();
    };
    window.addEventListener('keydown', onKey, true);
    void (async () => {
      const voiceURI = voice.get();
      for (const c of chunks) {
        if (c.pause) await wait(PARAGRAPH_PAUSE_MS, signal);
        if (signal.aborted) break;
        await say(c.text, voiceURI, signal);
        if (signal.aborted) break;
      }
      window.removeEventListener('keydown', onKey, true);
      if (current === session) {
        current = null;
        speaking.set(false);
      }
    })();
  };

  ctx.effect(() => () => {
    stop();
    current = null;
  });

  // Stop is live only while something speaks.
  ctx.with(speaking, (s) => s.provide(actions.stop, { procedure: () => (stop(), true) }));

  ctx.each(ctx.panes, (p) => {
    p.provide(actions.read, {
      command: (state, dispatch) => {
        if (!synth()) return false;
        if (dispatch) read(p.id, state);
        return true;
      },
    });
    // A pane that closes while it is the one being read stops the reading.
    p.effect(() => () => {
      if (current?.paneId === p.id) stop();
    });

    const Controls = () => {
      const start = useAction(p, actions.read);
      const halt = useAction(p, actions.stop);
      const isSpeaking = useStore(speaking);
      const chosen = useStore(voice);
      const voices = useVoices();
      const available = synth() !== null;
      const known = voices.some((v) => v.voiceURI === chosen);
      return (
        <span className="read-aloud-controls">
          {isSpeaking ? (
            <Button variant="ghost" size="sm" disabled={!halt.enabled} onClick={halt.run} title="Stop reading">
              <Square size={14} /> Stop
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={!start.enabled}
              onClick={start.run}
              title={available ? 'Read aloud from cursor' : 'Speech is not available on this device'}
            >
              <Volume2 size={14} /> {available ? 'Read aloud' : 'No speech'}
            </Button>
          )}
          {available && (
            <Select
              value={known ? chosen : DEFAULT_VOICE}
              onValueChange={(v) => {
                voice.set(v === DEFAULT_VOICE ? '' : v);
                p.focus();
              }}
            >
              <SelectTrigger size="sm" aria-label="Voice" className="read-aloud-voice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_VOICE}>default voice</SelectItem>
                {voices.map((v) => (
                  <SelectItem key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </span>
      );
    };
    p.provide(ui.toolbar(Controls));
  });
}

export const styles = `
.read-aloud-controls { display: inline-flex; align-items: center; gap: 4px; }
.read-aloud-voice { max-width: 12rem; }
`;
