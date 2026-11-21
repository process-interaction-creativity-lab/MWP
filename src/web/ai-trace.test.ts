import fc from 'fast-check';
import { expect, it } from 'vitest';
import type { AiCall } from '../core/host.js';
import { TRACE_BARS, TRACE_BUCKET_MS, traceBars } from './ai-trace.js';

const call = (started: number, ended: number | null, arrivals: number[]): AiCall => ({
  id: 0,
  moduleId: 'm',
  path: '/chat/completions',
  started,
  state: ended === null ? 'receiving' : 'done',
  arrivals,
  ended,
});

it('a finished bucket keeps its bar as time passes, and every piece in view is counted once', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 60_000 }), { maxLength: 40 }),
      fc.integer({ min: 30_000, max: 60_000 }),
      fc.integer({ min: 1, max: 20_000 }),
      (times, now, later) => {
        const sorted = [...times].sort((a, b) => a - b).filter((t) => t <= now);
        const calls = [call(0, null, sorted)];
        const bars = traceBars(calls, now);
        expect(bars).toHaveLength(TRACE_BARS + 1);
        const first = bars[0]!.from;
        expect(bars.reduce((n, b) => n + b.pieces, 0)).toBe(sorted.filter((t) => t >= first).length);
        // The same buckets, seen later, unless they've scrolled out.
        const after = new Map(traceBars(calls, now + later).map((b) => [b.from, b]));
        for (const b of bars.slice(0, -1)) if (after.has(b.from)) expect(after.get(b.from)).toEqual(b);
      },
    ),
  );
});

it('a bucket is open while a call is out in it, and quiet before and after', () => {
  const now = 10 * TRACE_BUCKET_MS + 100;
  const bars = traceBars([call(7 * TRACE_BUCKET_MS + 10, 8 * TRACE_BUCKET_MS + 10, [])], now);
  expect(bars.map((b) => b.open)).toEqual([false, false, true, true, false, false]);
  expect(bars.every((b) => b.pieces === 0)).toBe(true);
});
