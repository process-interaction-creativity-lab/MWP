// Properties of scopes and Cordis's rule, through the module API only.

import fc from 'fast-check';
import type { ModuleContext, Scope, Value } from 'mwps';
import { nonEmpty, valueKey } from 'mwps';
import { expect, it, vi } from 'vitest';
import type { ModuleDef } from '../src/core/host.js';
import { startDoc } from './edits.js';
import { bootHeadless } from './headless.js';

// Records which of its scopes are live, and the order its cleanups run in.
function witness() {
  const live = { panes: new Set<string>(), documents: new Set<string>(), placed: false };
  const stops: string[] = [];
  let toggle: Value<boolean> | null = null;
  const def: ModuleDef = {
    id: 'witness',
    exports: {
      setup(ctx: ModuleContext) {
        toggle = ctx.getValue(valueKey('toggle', { default: false }));
        ctx.with(nonEmpty(ctx.panes), (s) => {
          s.effect(() => {
            live.placed = true;
            return () => (live.placed = false);
          });
        });
        ctx.each(ctx.panes, (p) => {
          p.effect(() => {
            live.panes.add(p.id);
            return () => {
              live.panes.delete(p.id);
              stops.push(`${p.id}:a`);
            };
          });
          p.with(toggle!, (w) => w.effect(() => () => stops.push(`${p.id}:w`)));
          p.effect(() => () => stops.push(`${p.id}:b`));
        });
        ctx.each(ctx.documents, (d) => {
          d.effect(() => {
            live.documents.add(d.id);
            return () => live.documents.delete(d.id);
          });
        });
      },
    },
  };
  return { def, live, stops, toggle: () => toggle!, started: () => toggle !== null };
}

// Throws whenever `next()` says so, at every kind of entry point; counts its
// live scopes by their signals, which abort even when a cleanup throws.
function chaos(next: () => boolean, revision: number, thrown: string[]) {
  const counter = { live: 0 };
  const track = (s: Scope) => {
    counter.live++;
    s.signal.addEventListener('abort', () => counter.live--);
  };
  const maybe = (where: string) => {
    if (!next()) return;
    thrown.push(where);
    throw new Error(`chaos at ${where} (revision ${revision})`);
  };
  const def: ModuleDef = {
    id: 'chaos',
    exports: {
      setup(ctx) {
        track(ctx);
        maybe('setup');
        const v = ctx.getValue(valueKey('v', { default: 1 }));
        ctx.with(v, (s) => {
          track(s);
          maybe('with');
        });
        ctx.each(ctx.panes, (p) => {
          track(p);
          maybe('pane setup');
          p.effect(() => {
            maybe('pane effect');
            return () => maybe('pane cleanup');
          });
        });
        ctx.each(ctx.documents, (d) => {
          track(d);
          maybe('document setup');
        });
        ctx.effect(() => {
          maybe('effect');
          return () => maybe('cleanup');
        });
      },
    },
  };
  return { def, counter };
}

type Op =
  | { kind: 'addPane'; doc: string | null }
  | { kind: 'removePane'; index: number }
  | { kind: 'place' | 'unplace'; module: 'witness' | 'chaos'; index: number }
  | { kind: 'toggle' }
  | { kind: 'enableChaos' }
  | { kind: 'reinstallChaos' };

const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant('addPane' as const), doc: fc.constantFrom('d1', 'd2', 'd3', null) }),
  fc.record({ kind: fc.constant('removePane' as const), index: fc.nat(5) }),
  fc.record({
    kind: fc.constantFrom('place' as const, 'unplace' as const),
    module: fc.constantFrom('witness' as const, 'chaos' as const),
    index: fc.nat(5),
  }),
  fc.record({ kind: fc.constant('toggle' as const) }),
  fc.record({ kind: fc.constant('enableChaos' as const) }),
  fc.record({ kind: fc.constant('reinstallChaos' as const) }),
);

it('whatever the chaos module does, other modules keep running and the failed one is off', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fc.assert(
    fc.property(fc.array(op, { maxLength: 30 }), fc.infiniteStream(fc.nat(7)), (ops, rolls) => {
      const next = () => rolls.next().value === 0;
      const w = witness();
      let revision = 0;
      const thrown: string[] = [];
      let c = chaos(next, revision, thrown);
      const counters = [c.counter];
      const { host, failures } = bootHeadless([w.def, c.def]);
      let paneCount = 0;
      let failuresSeen = failures.length;

      for (const o of ops) {
        thrown.length = 0;
        const panes = host.paneIds();
        const pick = (i: number) => panes[i % panes.length];
        switch (o.kind) {
          case 'addPane':
            host.addPane({ id: `p${paneCount++}`, documentId: o.doc });
            break;
          case 'removePane':
            if (panes.length) host.removePane(pick(o.index)!);
            break;
          case 'place':
          case 'unplace':
            if (panes.length) host[o.kind](pick(o.index)!, o.module);
            break;
          case 'toggle':
            // Nothing to toggle until the witness first runs (placed somewhere).
            if (w.started()) w.toggle().set((t) => !t);
            break;
          case 'enableChaos':
            host.setEnabled('chaos', true);
            break;
          case 'reinstallChaos':
            c = chaos(next, ++revision, thrown);
            counters.push(c.counter);
            host.install(c.def);
            break;
        }

        // The witness never fails, and its scopes match its placements.
        expect(host.status('witness')).toBe('on');
        const placed = host.paneIds().filter((id) => host.placed(id).includes('witness'));
        expect([...w.live.panes].sort()).toEqual([...placed].sort());
        const docs = new Set(placed.map((id) => host.pane(id).documentId).filter((d) => d !== null));
        expect([...w.live.documents].sort()).toEqual([...docs].sort());
        expect(w.live.placed).toBe(placed.length > 0);

        // A failed chaos module has no live scopes, in any revision; only
        // the current revision may run.
        for (const old of counters.slice(0, -1)) expect(old.live).toBe(0);
        if (host.status('chaos') !== 'on') expect(c.counter.live).toBe(0);

        // A throw outside a cleanup always fails the module. (A cleanup
        // that throws while the module is being turned off is only logged.)
        if (thrown.some((where) => !where.endsWith('cleanup'))) expect(host.status('chaos')).toBe('failed');

        // Each failure is reported once, and only by the chaos module.
        expect(failures.slice(failuresSeen).every((id) => id === 'chaos')).toBe(true);
        if (failures.length > failuresSeen) expect(host.status('chaos')).toBe('failed');
        failuresSeen = failures.length;
      }
    }),
  );
});

it('a scope ends its children and runs its cleanups in reverse order', () => {
  fc.assert(
    fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }), (toggles) => {
      const w = witness();
      const { host } = bootHeadless([w.def]);
      const ids = toggles.map((_, i) => `p${i}`);
      for (const id of ids) {
        host.addPane({ id, documentId: null });
        host.place(id, 'witness');
      }
      for (const [i, on] of toggles.entries()) {
        w.toggle().set(on);
        w.stops.length = 0;
        host.removePane(ids[i]!);
        const expected = on ? [`p${i}:b`, `p${i}:w`, `p${i}:a`] : [`p${i}:b`, `p${i}:a`];
        expect(w.stops).toEqual(expected);
      }
    }),
  );
});

it('p.isLastFocused: a scope under it lives in exactly the focused pane the module is placed on', () => {
  const ids = ['a', 'b', 'c'] as const;
  fc.assert(
    fc.property(
      fc.array(
        fc.oneof(
          fc.record({ kind: fc.constant('focus' as const), pane: fc.constantFrom<string | null>(...ids, null) }),
          fc.record({ kind: fc.constantFrom('place' as const, 'unplace' as const), pane: fc.constantFrom(...ids) }),
          fc.record({ kind: fc.constant('close' as const), pane: fc.constantFrom(...ids) }),
        ),
        { maxLength: 30 },
      ),
      (steps) => {
        const live = new Set<string>();
        const { host, failures } = bootHeadless([
          {
            id: 'focus',
            exports: {
              setup(ctx: ModuleContext) {
                ctx.each(ctx.panes, (p) =>
                  p.with(p.isLastFocused, (s) => s.effect(() => (live.add(p.id), () => live.delete(p.id)))),
                );
              },
            },
          },
        ]);
        const open = new Set<string>(ids);
        const placed = new Set<string>();
        for (const id of ids) host.addPane({ id, documentId: 'd' });
        for (const step of steps) {
          if (step.pane !== null && !open.has(step.pane)) continue;
          if (step.kind === 'focus') host.focus(step.pane);
          else if (step.kind === 'place') (host.place(step.pane, 'focus'), placed.add(step.pane));
          else if (step.kind === 'unplace') (host.unplace(step.pane, 'focus'), placed.delete(step.pane));
          else (host.removePane(step.pane), open.delete(step.pane), placed.delete(step.pane));
          const focused = host.lastFocusedPane.get();
          expect([...live]).toEqual(focused !== null && placed.has(focused) ? [focused] : []);
        }
        expect(failures).toEqual([]);
      },
    ),
  );
});

it("a document's value is one instance from its panes and its scope, and a pane's from every each, whichever runs first", () => {
  fc.assert(
    fc.property(fc.array(fc.constantFrom('pane', 'document', 'pane2'), { minLength: 1, maxLength: 4 }), fc.boolean(), (order, twoPanes) => {
      const docKey = valueKey('count', { default: 0 });
      const paneKey = valueKey('open', { default: false });
      const seen = { doc: new Map<string, Set<unknown>>(), pane: new Map<string, Set<unknown>>() };
      const note = (m: Map<string, Set<unknown>>, id: string, v: unknown) => m.set(id, (m.get(id) ?? new Set()).add(v));
      const def: ModuleDef = {
        id: 'shared',
        exports: {
          setup(ctx) {
            for (const what of order) {
              if (what === 'document') ctx.each(ctx.documents, (d) => note(seen.doc, d.id, d.getValue(docKey)));
              else
                ctx.each(ctx.panes, (p) => {
                  if (what === 'pane') note(seen.doc, p.documentId!, p.document!.getValue(docKey));
                  note(seen.pane, p.id, p.getValue(paneKey));
                });
            }
          },
        },
      };
      const { host, failures } = bootHeadless([def]);
      host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
      if (twoPanes) host.addPane({ id: 'b', documentId: 'd' });
      host.place('a', 'shared');
      if (twoPanes) host.place('b', 'shared');
      expect(failures).toEqual([]);
      for (const set of [...seen.doc.values(), ...seen.pane.values()]) expect(set.size).toBe(1);
      if (twoPanes && seen.pane.size === 2) expect(seen.pane.get('a')).not.toEqual(seen.pane.get('b'));
    }),
  );
});

it('two value keys with one name turn the module off; a value ends with its pane', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const twin: ModuleDef = {
    id: 'twin',
    exports: { setup: (ctx) => void [valueKey('x', { default: 1 }), valueKey('x', { default: 2 })].map((k) => ctx.getValue(k)) },
  };
  const key = valueKey('n', { default: 0 });
  let held: Value<number> | null = null;
  const holder: ModuleDef = { id: 'holder', exports: { setup: (ctx) => ctx.each(ctx.panes, (p) => void (held = p.getValue(key))) } };
  const { host, failures } = bootHeadless([twin, holder]);
  host.addPane({ id: 'a', documentId: 'd' }, { doc: startDoc(), error: null });
  host.place('a', 'twin');
  host.place('a', 'holder');
  expect(failures).toEqual(['twin']);
  const first = held!;
  first.set(5);
  host.unplace('a', 'holder');
  first.set(6);
  expect(first.get()).toBe(5);
  host.place('a', 'holder');
  expect(held).not.toBe(first);
  expect(held!.get()).toBe(0);
});
