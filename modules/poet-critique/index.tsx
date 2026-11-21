import { useEffect, useState } from 'react';
import { MessageSquareQuote, X } from 'mwps/icons';
import { ui, useAction, useStore, valueKey } from 'mwps';
import type { ActionDeclaration, ModuleContext, PaneScope } from 'mwps';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'mwps/ui';
import { chat, failure } from 'mwps/ai';
import { CUSTOM_POET_ID, POETS, findPoet } from './poets';
import { MOUTH_ANCHOR, GRID_COLS, GRID_ROWS, PORTRAIT_GRID, colorFor, poetPalette } from './portrait';

/** The writer's choice, kept for every pane and document. */
interface Choice {
  id: string;
  custom: string;
}

/** One pane's companion: the poet asked at the moment of the request. */
interface Companion {
  poet: string;
  excerpt: string;
  status: 'pending' | 'done' | 'error';
  text: string;
  startedAt: number;
  abort(): void;
}

const choiceKey = valueKey<Choice>('choice', { default: { id: POETS[0]!.id, custom: '' }, persist: true });
const companionKey = valueKey<Companion | null>('companion', { default: null });

export const actions = {
  critique: { title: 'Ask a poet for a critique' } satisfies ActionDeclaration,
};

function systemPrompt(name: string, persona: string): string {
  return (
    `You are ${name}. ${persona}\n\n` +
    'A fellow poet has shown you their poem and wants your honest reaction, in your own voice, ' +
    'from your own aesthetic values, not a neutral workshop rubric. Be specific: quote or point at ' +
    "particular lines. Be generous where the poem earns it, but don't flatter what doesn't work. " +
    'Keep it to a few paragraphs. Answer in plain text, without markdown.'
  );
}

const flatten = (s: string) => s.replace(/\s+/g, ' ').trim();
const shorten = (s: string) => (s.length > 120 ? s.slice(0, 117).trimEnd() + '…' : s);

function Portrait({ name }: { name: string }) {
  const palette = poetPalette({ id: '', name, persona: '' });
  return (
    <svg className="poet-critique-portrait" viewBox={`0 0 ${GRID_COLS} ${GRID_ROWS}`} shapeRendering="crispEdges" aria-hidden>
      {PORTRAIT_GRID.flatMap((row, r) =>
        row.map((code, c) => {
          const fill = colorFor(code, palette);
          return fill ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={fill} /> : null;
        }),
      )}
    </svg>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return <>{Math.max(0, Math.floor((now - since) / 1000))}s</>;
}

export function setup(ctx: ModuleContext) {
  const choice = ctx.getValue(choiceKey);
  const poetName = () => {
    const c = choice.get();
    return c.id === CUSTOM_POET_ID ? c.custom.trim() : (findPoet(c.id)?.name ?? '');
  };

  ctx.each(ctx.panes, (p: PaneScope) => {
    const companion = p.getValue(companionKey);

    // Abandon a pending request when the pane or module goes.
    p.effect(() => () => companion.get()?.abort());

    async function ask(ai: Parameters<typeof chat>[0], signal: AbortSignal, excerpt: string) {
      const c = choice.get();
      const name = poetName();
      const persona = c.id === CUSTOM_POET_ID ? `Write as ${name} would, as well as you can infer from the name alone.` : (findPoet(c.id)?.persona ?? '');
      const ctl = new AbortController();
      const stop = () => ctl.abort();
      signal.addEventListener('abort', stop);
      const mine: Companion = { poet: name, excerpt, status: 'pending', text: '', startedAt: Date.now(), abort: stop };
      companion.set(mine);
      const finish = (next: Partial<Companion>) => {
        if (companion.get() === mine) companion.set({ ...mine, ...next });
      };
      try {
        const reply = (
          await chat(
            ai,
            { messages: [{ role: 'system', content: systemPrompt(name, persona) }, { role: 'user', content: excerpt }] },
            ctl.signal,
          )
        ).trim();
        if (ctl.signal.aborted) return;
        if (reply) finish({ status: 'done', text: reply });
        else finish({ status: 'error', text: 'The model sent back an empty reply. Try asking again.' });
      } catch (e) {
        const why = failure(e);
        if (why === null) {
          if (companion.get() === mine) companion.set(null);
          return;
        }
        finish({ status: 'error', text: `The critique could not be fetched (${why}). Try again.` });
      } finally {
        signal.removeEventListener('abort', stop);
      }
    }

    p.with(ctx.ai, (s, ai) => {
      s.provide(actions.critique, {
        command: (state, dispatch) => {
          if (state.selection.empty || !poetName() || companion.get()?.status === 'pending') return false;
          if (dispatch) {
            const { from, to } = state.selection;
            void ask(ai, s.signal, state.doc.textBetween(from, to, '\n', ' '));
          }
          return true;
        },
      });
    });

    function useAsk() {
      const a = useAction(p, actions.critique);
      const aiOn = useStore(ctx.ai) != null;
      const empty = useStore(p.state, (s) => s?.selection.empty ?? true);
      const pending = useStore(companion)?.status === 'pending';
      const hint = !aiOn
        ? 'Turn AI on for this module in Settings to ask for a critique'
        : empty
          ? 'Highlight some lines first'
          : !poetName()
            ? "Type a poet's name first"
            : pending
              ? 'A critique is already on its way'
              : 'Ask the poet for a critique of the highlighted lines';
      return { ...a, hint };
    }

    const AskButton = () => {
      const a = useAsk();
      return (
        <Button size="sm" variant="ghost" disabled={!a.enabled} title={a.hint} aria-label="Critique" onClick={a.run}>
          <MessageSquareQuote size={16} />
        </Button>
      );
    };
    p.provide(ui.toolbar(AskButton));
    p.provide(ui.selection(AskButton));

    const Companion = () => {
      const c = useStore(companion);
      const ch = useStore(choice);
      const a = useAsk();
      return (
        <div className="poet-critique-side">
          <div className="poet-critique-header">
            <Select value={ch.id} onValueChange={(id) => choice.set((v) => ({ ...v, id }))}>
              <SelectTrigger size="sm" aria-label="Poet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POETS.map((poet) => (
                  <SelectItem key={poet.id} value={poet.id}>
                    {poet.name}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_POET_ID}>Custom…</SelectItem>
              </SelectContent>
            </Select>
            {ch.id === CUSTOM_POET_ID && (
              <Input
                aria-label="Poet's name"
                placeholder="Poet's name"
                value={ch.custom}
                onChange={(e) => choice.set((v) => ({ ...v, custom: e.target.value }))}
              />
            )}
            <div className="poet-critique-row">
              <Button size="sm" disabled={!a.enabled} title={a.hint} onClick={() => (a.run(), p.focus())}>
                Critique selection
              </Button>
              {c && (
                <Button size="sm" variant="ghost" aria-label="Dismiss" onClick={() => (c.abort(), companion.set(null), p.focus())}>
                  <X size={16} />
                </Button>
              )}
            </div>
            {!a.enabled && <div className="poet-critique-hint">{a.hint}</div>}
          </div>
          {c && (
            <div className="poet-critique-body">
              <Portrait name={c.poet} />
              <div className="poet-critique-excerpt">“{shorten(flatten(c.excerpt))}”</div>
              <div className="poet-critique-bubble" style={{ '--tail': `${MOUTH_ANCHOR.x * 100}%` } as React.CSSProperties}>
                <div className={'poet-critique-scroll' + (c.status === 'error' ? ' poet-critique-error' : '')}>
                  {c.status === 'pending' ? (
                    <em>
                      {c.poet} is thinking… <Elapsed since={c.startedAt} />
                    </em>
                  ) : (
                    c.text
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    };
    p.provide(ui.side(Companion));
  });
}

export const styles = `
.poet-critique-side { height: 100%; display: flex; flex-direction: column; gap: 8px; padding: 8px; overflow: hidden; }
.poet-critique-header { display: flex; flex-direction: column; gap: 6px; }
.poet-critique-row { display: flex; gap: 6px; align-items: center; }
.poet-critique-hint { font-size: 12px; color: var(--muted-foreground); }
.poet-critique-body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; align-items: center; }
.poet-critique-portrait { width: 72px; height: 84px; flex: none; image-rendering: pixelated; }
.poet-critique-excerpt { align-self: stretch; font-size: 12px; font-style: italic; color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.poet-critique-bubble { position: relative; align-self: stretch; flex: 1; min-height: 0; display: flex; border: 1px solid var(--border); border-radius: 8px; margin-top: 8px; background: var(--muted); }
.poet-critique-scroll { flex: 1; overflow: auto; white-space: pre-wrap; padding: 8px; }
.poet-critique-bubble::before { content: ''; position: absolute; top: -7px; left: var(--tail); width: 12px; height: 12px; background: var(--muted); border-left: 1px solid var(--border); border-top: 1px solid var(--border); transform: translateX(-50%) rotate(45deg); }
.poet-critique-error { color: var(--destructive); }
`;
