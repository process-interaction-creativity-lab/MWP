// Properties of `ctx.ai`: the writer's AI settings as a condition per module.

import fc from 'fast-check';
import type { AiSettings } from 'mwps';
import { expect, it } from 'vitest';
import type { ModuleDef } from '../src/core/host.js';
import { aiFor, type Settings } from '../src/web/settings-data.js';
import { Plugin } from 'prosemirror-state';
import { startDoc } from './edits.js';
import { bootHeadless } from './headless.js';

// Its live `with(ctx.ai, …)` scope's settings, how many started, and
// whether every ended one's signal was aborted.
function asker(id: string) {
  const seen = { live: null as AiSettings | null, started: 0, abortedOnEnd: true };
  const def: ModuleDef = {
    id,
    exports: {
      setup(ctx) {
        ctx.with(ctx.ai, (s, ai) => {
          seen.live = ai;
          seen.started++;
          s.effect(() => () => {
            seen.live = null;
            queueMicrotask(() => void (seen.abortedOnEnd &&= s.signal.aborted));
          });
        });
      },
    },
  };
  return { def, seen };
}

const GRANT = { key: 'k', url: 'u', model: 'm', transcriptionModel: 't', imageModel: 'i' };

const op = fc.oneof(
  fc.record({
    kind: fc.constant('global' as const),
    key: fc.constantFrom('', 'k1', 'k2'),
    url: fc.constantFrom('u1', 'u2/'),
    model: fc.constantFrom('m1', 'm2'),
    transcriptionModel: fc.constantFrom(undefined, 't1'),
  }),
  fc.record({
    kind: fc.constant('module' as const),
    which: fc.constantFrom('a', 'b'),
    on: fc.boolean(),
    model: fc.constantFrom(null, 'm1', 'm3'),
    key: fc.constantFrom(null, 'k3'),
    url: fc.constantFrom(null, 'u3'),
    transcriptionModel: fc.constantFrom(null, 't2'),
  }),
);

type Mine = { on: boolean; model: string | null; key: string | null; url: string | null; transcriptionModel: string | null };

// Every request ai.fetch sends, as the endpoint sees it.
const sent: { url: string; auth: string | null }[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  sent.push({ url, auth: new Headers(init?.headers).get('Authorization') });
  return new Response('{}');
}) as typeof fetch;

it("a module's ctx.ai calls the writer's endpoint for it while a key is set and AI is on for it, and restarts only when that changes", async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(op, { maxLength: 20 }), async (ops) => {
      const a = asker('a');
      const b = asker('b');
      const { host, failures } = bootHeadless([a.def, b.def]);
      host.addPane({ id: 'p', documentId: null });
      host.place('p', 'a');
      host.place('p', 'b');

      // The model of the settings: the endpoint each module should reach.
      let global: { key: string; url: string; model: string; transcriptionModel?: string } = { key: '', url: '', model: '' };
      const off: Mine = { on: true, model: null, key: null, url: null, transcriptionModel: null };
      const mod: Record<'a' | 'b', Mine> = { a: off, b: off };
      const stored = (): Settings => ({ ai: global, modules: { a: { ai: mod.a.on, ...mod.a }, b: { ai: mod.b.on, ...mod.b } } });
      const expected = (id: 'a' | 'b') => {
        const m = mod[id];
        const key = m.key || global.key;
        if (!key || !m.on) return null;
        const transcriptionModel = m.transcriptionModel || global.transcriptionModel || 'whisper-1';
        return { key, url: (m.url || global.url).replace(/\/+$/, ''), model: m.model || global.model, transcriptionModel };
      };

      for (const o of ops) {
        const before = { a: expected('a'), b: expected('b') };
        const started = { a: a.seen.started, b: b.seen.started };
        const old = { a: a.seen.live, b: b.seen.live };
        if (o.kind === 'global') global = { key: o.key, url: o.url, model: o.model, transcriptionModel: o.transcriptionModel };
        else mod[o.which] = { on: o.on, model: o.model, key: o.key, url: o.url, transcriptionModel: o.transcriptionModel };
        const now = stored();
        host.setGrants((id) => ({ project: true, ai: aiFor(now, id) }));
        for (const [id, m] of [['a', a], ['b', b]] as const) {
          const want = expected(id);
          const changed = JSON.stringify(before[id]) !== JSON.stringify(want);
          expect(m.seen.started - started[id]).toBe(changed && want ? 1 : 0);
          expect(m.seen.live?.model ?? null).toBe(want?.model ?? null);
          expect(m.seen.live?.transcriptionModel ?? null).toBe(want?.transcriptionModel ?? null);
          if (want) {
            sent.length = 0;
            await m.seen.live!.fetch('/chat/completions', { method: 'POST', body: '{}' });
            expect(sent).toEqual([{ url: `${want.url}/chat/completions`, auth: `Bearer ${want.key}` }]);
          }
          // Settings that ended no longer reach any endpoint.
          if (changed && old[id]) await expect(old[id]!.fetch('/x')).rejects.toThrow();
        }
      }
      await Promise.resolve();
      expect(a.seen.abortedOnEnd && b.seen.abortedOnEnd).toBe(true);
      expect(failures).toEqual([]);
    }),
    { numRuns: 200 },
  );
});

it("the host times a streamed reply's pieces as they arrive, and marks a call stopped when its module aborts it", async () => {
  const a = asker('a');
  const { host, failures } = bootHeadless([a.def]);
  host.addPane({ id: 'p', documentId: null });
  host.place('p', 'a');
  host.setGrants(() => ({ project: true, ai: GRANT }));
  const ai = a.seen.live!;
  const call = () => host.aiCalls.get()[0];

  let push: (text: string) => void = () => {};
  let finish = () => {};
  globalThis.fetch = (async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const enc = new TextEncoder();
        push = (t) => c.enqueue(enc.encode(t));
        finish = () => c.close();
      },
    });
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
  }) as typeof fetch;

  const reader = (await ai.fetch('/chat/completions', { method: 'POST', body: '{}' })).body!.getReader();
  expect(call()).toMatchObject({ moduleId: 'a', path: '/chat/completions', state: 'receiving', arrivals: [] });
  push('data: {"x":1}\n\ndata: {"x":2}\n\n');
  await reader.read();
  expect(call()).toMatchObject({ state: 'receiving' });
  expect(call().arrivals).toHaveLength(2);
  push('data: [DONE]\n\n');
  finish();
  while (!(await reader.read()).done);
  expect(call()).toMatchObject({ state: 'done' });
  expect(call().arrivals).toHaveLength(3);

  const second = (await ai.fetch('/chat/completions')).body!.getReader();
  await second.cancel();
  expect(call()).toMatchObject({ state: 'aborted' });
  expect(host.aiCalls.get().filter((c) => c.ended === null)).toEqual([]);
  expect(failures).toEqual([]);
});

it('turning AI on or off redraws the panes, so a plugin reading ctx.ai sees it', () => {
  let seen: boolean[] = [];
  const def: ModuleDef = {
    id: 'reader',
    exports: {
      setup(ctx) {
        const plugin = new Plugin({ state: { init: () => null, apply: () => void seen.push(ctx.ai.get() !== null) } });
        ctx.each(ctx.panes, (p) => p.provide(plugin));
      },
    },
  };
  const { host, failures } = bootHeadless([def]);
  host.addPane({ id: 'p', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('p', 'reader');
  seen = [];
  host.setGrants(() => ({ project: true, ai: GRANT }));
  expect(seen.at(-1)).toBe(true);
  host.setGrants(() => ({ project: true, ai: null }));
  expect(seen.at(-1)).toBe(false);
  expect(failures).toEqual([]);
});

it("the writer's extra fields go into a module's chat requests under its own, and nowhere else", async () => {
  const a = asker('a');
  const { host, failures } = bootHeadless([a.def]);
  host.addPane({ id: 'p', documentId: null });
  host.place('p', 'a');
  const settings: Settings = {
    ai: { key: 'k', url: 'u', model: 'm', extra: { reasoning: { effort: 'none' }, temperature: 1 } },
    modules: { a: { extra: { temperature: 0.5 } } },
  };
  host.setGrants((id) => ({ project: true, ai: aiFor(settings, id) }));
  const bodies: Record<string, unknown> = {};
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    bodies[url] = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    return new Response('{}');
  }) as typeof fetch;

  const ai = a.seen.live!;
  await ai.fetch('/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'm', temperature: 0 }) });
  await ai.fetch('/audio/speech', { method: 'POST', body: JSON.stringify({ input: 'hi' }) });
  expect(bodies['u/chat/completions']).toEqual({ reasoning: { effort: 'none' }, temperature: 0, model: 'm' });
  expect(bodies['u/audio/speech']).toEqual({ input: 'hi' });
  expect(failures).toEqual([]);
});
