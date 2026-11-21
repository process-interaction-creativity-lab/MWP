import { useState } from 'react';
import { PluginKey } from 'prosemirror-state';
import { documentPlugin, ui, useAction, useStore, valueKey } from 'mwps';
import type { ActionDeclaration, ModuleContext } from 'mwps';
import { reader } from 'mwps/changes';
import { Check, Copy, Lightbulb, LoaderCircle } from 'mwps/icons';
import { Button, Popover, PopoverAnchor, PopoverContent } from 'mwps/ui';
import { EMPTY, activityState, add, describe, footer, revisited, type ActivityState, type Totals } from './activity';
import { excerptOf, proseOf, suggest, type Suggestion } from './recommend';

export const actions = {
  suggest: { title: 'Suggest modules from how I write' } satisfies ActionDeclaration,
};

/** What was asked of one pane, and what came back. */
type Ask =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'error'; message: string }
  | { phase: 'done'; items: readonly Suggestion[] };

/** The writer's totals: theirs, across documents and sessions. */
const totalsKey = valueKey<Totals>('totals', { default: EMPTY, persist: true });
/** Paragraphs returned to, per open document, for this session only. */
const revisitsKey = valueKey<Record<string, { count: number; peak: number }>>('revisits', { default: {} });
const askKey = valueKey<Ask>('ask', { default: { phase: 'idle' } });
const openKey = valueKey<boolean>('open', { default: false });

const stateKey = new PluginKey<ActivityState>('module-recommender-activity');

export function setup(ctx: ModuleContext) {
  const totals = ctx.getValue(totalsKey);
  const revisits = ctx.getValue(revisitsKey);
  /** One per open document: forget its visits so far. */
  const forgetters = new Set<() => void>();

  const sumRevisits = () => {
    const all = Object.values(revisits.get());
    return { count: all.reduce((n, r) => n + r.count, 0), peak: Math.max(0, ...all.map((r) => r.peak)) };
  };

  ctx.each(ctx.documents, (d) => {
    let baseline: Record<number, number> = {};
    const report = (state: Parameters<typeof stateKey.getState>[0]) => {
      const r = revisited(stateKey.getState(state)!.blocks, baseline);
      const old = revisits.get()[d.id];
      if (old?.count !== r.count || old?.peak !== r.peak) revisits.set((all) => ({ ...all, [d.id]: r }));
    };
    d.effect(() => {
      const forget = () => {
        baseline = Object.fromEntries(stateKey.getState(d.state.get())!.blocks.map((b) => [b.id, b.visits]));
      };
      forgetters.add(forget);
      return () => void forgetters.delete(forget);
    });
    d.provide(
      documentPlugin({
        key: stateKey,
        state: activityState,
        view: (v) => {
          baseline = {};
          const read = reader((s) => stateKey.getState(s)!.log, v.state);
          return {
            update: (v) => {
              const fresh = read(v.state);
              if (fresh.length > 0) totals.set((t) => add(t, fresh, Date.now()));
              report(v.state);
            },
          };
        },
      }),
    );
  });

  ctx.each(ctx.panes, (p) => {
    const ask = p.getValue(askKey);
    const open = p.getValue(openKey);

    async function run() {
      open.set(true);
      if (ask.get().phase === 'working') return;
      const ai = ctx.ai.get();
      if (!ai) {
        ask.set({ phase: 'error', message: 'AI is off for this module. Turn it on, with a key, in Settings, then press again.' });
        return;
      }
      const doc = p.state.get()?.doc;
      const excerpt = doc ? excerptOf(proseOf(doc)) : '';
      const { count, peak } = sumRevisits();
      const t = totals.get();
      if (!excerpt && t.edits === 0) {
        ask.set({ phase: 'error', message: 'Nothing to read yet. Write something first.' });
        return;
      }
      ask.set({ phase: 'working' });
      try {
        const items = await suggest(ai, excerpt, describe(t, count, peak), p.signal);
        if (p.signal.aborted) return;
        ask.set({ phase: 'done', items });
      } catch (e) {
        if (p.signal.aborted) return;
        const m = e instanceof Error ? e.message : '';
        ask.set({
          phase: 'error',
          message: m.startsWith('AI request failed') || m.startsWith('The reply')
            ? m.endsWith('.') ? m : `${m}. Try again.`
            : 'Could not reach the AI service. Check the connection and try again.',
        });
      }
      open.set(true);
    }

    p.provide(actions.suggest, { procedure: () => (void run(), true) });

    const Card = ({ s }: { s: Suggestion }) => {
      const [copied, setCopied] = useState(false);
      return (
        <div className="module-recommender-card">
          <div className="module-recommender-title">
            {s.title} <span className="module-recommender-kind">{s.kind}</span>
          </div>
          <div className="module-recommender-evidence">{s.evidence}</div>
          <div>{s.pitch}</div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(s.brief).then(
                () => (setCopied(true), setTimeout(() => setCopied(false), 1500)),
                () => {},
              );
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy brief'}
          </Button>
        </div>
      );
    };

    const Suggest = () => {
      const a = useAction(p, actions.suggest);
      const st = useStore(ask);
      const isOpen = useStore(open);
      const t = useStore(totals);
      const rev = useStore(revisits);
      const count = Object.values(rev).reduce((n, r) => n + r.count, 0);
      const working = st.phase === 'working';
      return (
        <Popover open={isOpen} onOpenChange={open.set}>
          <PopoverAnchor asChild>
            <Button
              size="sm"
              variant="ghost"
              disabled={working || !a.enabled}
              aria-label="Suggest modules"
              title={working ? 'Reading your document and notes...' : 'Suggest modules from your text and how you edit'}
              onClick={a.run}
            >
              {working ? <LoaderCircle size={16} className="module-recommender-spin" /> : <Lightbulb size={16} />}
            </Button>
          </PopoverAnchor>
          <PopoverContent align="end" className="module-recommender-pop">
            {working && <div className="module-recommender-note">Reading your document and notes...</div>}
            {st.phase === 'error' && <div className="module-recommender-note module-recommender-error">{st.message}</div>}
            {st.phase === 'done' && st.items.map((s, i) => <Card key={i} s={s} />)}
            <div className="module-recommender-foot">
              <span>{footer(t, count)}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  forgetters.forEach((f) => f());
                  totals.set(EMPTY);
                  revisits.set({});
                }}
              >
                Forget recorded activity
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      );
    };
    p.provide(ui.toolbar(Suggest));
  });
}

export const styles = `
.module-recommender-pop { width: 420px; max-height: 70vh; overflow: auto; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.module-recommender-card { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; border: 1px solid var(--border); border-radius: 6px; padding: 8px; }
.module-recommender-title { font-weight: 600; }
.module-recommender-kind { font-weight: 400; font-size: 11px; color: var(--muted-foreground); margin-left: 4px; }
.module-recommender-evidence { font-style: italic; color: var(--muted-foreground); }
.module-recommender-note { color: var(--muted-foreground); }
.module-recommender-error { color: var(--destructive); }
.module-recommender-foot { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; font-size: 12px; color: var(--muted-foreground); }
.module-recommender-spin { animation: module-recommender-turn 1s linear infinite; }
@keyframes module-recommender-turn { to { transform: rotate(360deg); } }
`;
