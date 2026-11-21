import type { EditorState } from 'prosemirror-state';
import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ModuleContext } from 'mwps';
import { transcribe } from 'mwps/ai';
import { Toggle } from 'mwps/ui';
import { Loader2, Mic, MicOff } from 'mwps/icons';

/** `error` is the last failure: a microphone problem while idle, or a failed call while listening. */
type Status = { kind: 'idle' | 'waiting' | 'listening'; error?: string };
/** Where an utterance goes: the pane the writer last used. */
type Target = { insert(text: string): void };

const statusKey = valueKey<Status>('status', { default: { kind: 'idle' } });
const targetKey = valueKey<Target | null>('target', { default: null });

export const actions = {
  dictate: { title: 'Toggle dictation' },
};

// ---- Pure helpers -----------------------------------------------------------

/** Capitalise the first letter of `text` (the text may open with a quote). */
export function capitalize(text: string): string {
  const m = /\p{L}/u.exec(text);
  if (!m) return text;
  const ch = m[0];
  return text.slice(0, m.index) + ch.toUpperCase() + text.slice(m.index + ch.length);
}

/** At the start of a block, or after . ! ? (and a closing quote or bracket) and spaces. */
export function atSentenceStart(state: EditorState): boolean {
  const $from = state.selection.$from;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
  return /(^|[.!?]["'”’)\]]?\s*)$/u.test(before);
}

// ---- Recognition ------------------------------------------------------------
// Each utterance is cut at a pause and sent to the writer's endpoint.

const SPEECH_RMS = 0.015; // above this a chunk counts as speech
const SILENCE_MS = 700; // this much quiet closes an utterance
const MIN_SPEECH_MS = 250; // shorter bursts are noise

const hasMicrophone = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function' &&
  typeof AudioContext !== 'undefined';

const rms = (a: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * a[i]!;
  return a.length ? Math.sqrt(s / a.length) : 0;
};

/** 16-bit mono PCM in a WAV container. */
export function encodeWav(samples: Float32Array, rate: number): Blob {
  const out = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, t: string) => [...t].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  out.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, 1, true); // mono
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  text(36, 'data');
  out.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => out.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 0x7fff), true));
  return new Blob([out], { type: 'audio/wav' });
}

type Capture = { stop(): void };

/** Open the microphone and call `onUtterance` with a WAV once per pause. */
async function capture(onUtterance: (wav: Blob) => void): Promise<Capture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  let stopped = false;
  let buffered: Float32Array[] = [];
  let inSpeech = false;
  let speechMs = 0;
  let silenceMs = 0;

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
    const ms = (chunk.length / context.sampleRate) * 1000;
    const speech = rms(chunk) >= SPEECH_RMS;
    if (!inSpeech) {
      if (!speech) return;
      inSpeech = true;
      speechMs = 0;
      silenceMs = 0;
    }
    buffered.push(chunk);
    if (speech) {
      speechMs += ms;
      silenceMs = 0;
      return;
    }
    silenceMs += ms;
    if (silenceMs < SILENCE_MS) return;
    const chunks = buffered;
    const enough = speechMs >= MIN_SPEECH_MS;
    buffered = [];
    inSpeech = false;
    if (!enough) return;
    const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) (all.set(c, at), (at += c.length));
    onUtterance(encodeWav(all, context.sampleRate));
  };

  // onaudioprocess runs only while connected to a destination; muted so the
  // microphone doesn't play out of the speakers.
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);

  return {
    stop() {
      stopped = true;
      processor.onaudioprocess = null;
      processor.disconnect();
      source.disconnect();
      mute.disconnect();
      for (const t of stream.getTracks()) t.stop();
      void context.close();
    },
  };
}

const describe = (e: unknown) => {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone permission was denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found';
  return String((e as Error)?.message ?? e);
};

// ---- Module -----------------------------------------------------------------

export function setup(ctx: ModuleContext) {
  const status = ctx.getValue(statusKey);
  const target = ctx.getValue(targetKey);

  // Everything that listens lives inside `with(ai)`: AI off, or new settings,
  // ends it and releases the microphone.
  ctx.with(ctx.ai, (s, ai) => {
    /** The one session; callbacks of an older one see it isn't theirs. */
    let session: { mic: Capture | null } | null = null;

    const stop = () => {
      session?.mic?.stop();
      session = null;
      status.set({ kind: 'idle' });
    };

    const start = () => {
      const mine: { mic: Capture | null } = { mic: null };
      session = mine;
      status.set({ kind: 'waiting' });
      capture((wav) => {
        transcribe(ai, wav).then(
          (text) => {
            if (session !== mine) return;
            if (status.get().error) status.set({ kind: 'listening' });
            if (text) target.get()?.insert(text);
          },
          (e) => {
            if (session === mine) status.set({ kind: 'listening', error: describe(e) });
          },
        );
      }).then(
        (mic) => {
          if (session !== mine) return mic.stop(); // stopped while the permission prompt was open
          mine.mic = mic;
          status.set({ kind: 'listening' });
        },
        (e) => {
          if (session !== mine) return;
          session = null;
          status.set({ kind: 'idle', error: describe(e) });
        },
      );
    };

    s.effect(() => () => {
      session?.mic?.stop();
      session = null;
      status.set({ kind: 'idle' });
    });

    s.provide(actions.dictate, {
      procedure: () => {
        const kind = status.get().kind;
        if (kind !== 'idle') return (stop(), true); // stopping is always allowed
        if (!hasMicrophone() || !target.get()) return false;
        start();
        return true;
      },
      active: () => status.get().kind === 'listening',
    });
  });

  const Control = () => {
    const st = useStore(status);
    const aiOn = useStore(ctx.ai) !== null;
    const hasPane = useStore(target) !== null;
    const act = useAction(ctx, actions.dictate);
    const busy = st.kind !== 'idle';
    const title = !hasMicrophone()
      ? 'Dictation is unavailable: this browser has no microphone support'
      : !aiOn
        ? 'Dictation needs AI: turn it on in Settings, with an endpoint that offers transcription'
        : !hasPane && !busy
          ? 'Click into a document to dictate into'
          : st.error
            ? `Dictation error: ${st.error}${busy ? '' : '. Press to retry'}`
            : st.kind === 'waiting'
              ? 'Waiting for the microphone. Press to cancel'
              : st.kind === 'listening'
                ? 'Stop dictation'
                : 'Start dictation';
    const Icon = st.kind === 'waiting' ? Loader2 : st.error ? MicOff : Mic;
    return (
      <span className="speech-to-text" title={title}>
        <Toggle
          size="sm"
          aria-label={st.kind === 'listening' ? 'Stop dictation' : 'Start dictation'}
          data-status={st.kind}
          pressed={st.kind === 'listening'}
          disabled={!hasMicrophone() || !aiOn || (!hasPane && !busy)}
          onPressedChange={() => act.run()}
        >
          <Icon size={16} />
        </Toggle>
        {st.error && <span className="speech-to-text-error">{st.error}</span>}
      </span>
    );
  };
  ctx.provide(ui.toolbar(Control));

  ctx.each(ctx.panes, (p) => {
    if (!p.document) return;
    const insert = (text: string) => {
      p.run((state, dispatch) => {
        if (dispatch) {
          const t = atSentenceStart(state) ? capitalize(text) : text;
          // insertText takes on the active marks, as typing does.
          dispatch(state.tr.insertText(t).scrollIntoView());
        }
        return true;
      });
      p.focus();
    };
    const me: Target = { insert };
    // The pane the writer last used, until it closes or they use another.
    p.with(p.isLastFocused, (s) =>
      s.effect(() => {
        target.set(me);
        return () => {
          if (target.get() === me) target.set(null);
        };
      }),
    );
  });
}

export const styles = `
.speech-to-text { display: inline-flex; align-items: center; gap: 4px; }
.speech-to-text [data-status='waiting'] svg { animation: speech-to-text-spin 1s linear infinite; }
.speech-to-text-error { color: var(--destructive); font-size: 12px; max-width: 24ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@keyframes speech-to-text-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .speech-to-text [data-status='waiting'] svg { animation: none; } }
`;
