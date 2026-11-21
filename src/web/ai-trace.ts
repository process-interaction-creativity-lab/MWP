// A tab's AI trace: the last half minute of its modules' calls, in buckets
// fixed on the clock, so a finished bucket never changes and the trace
// scrolls as time passes.

import type { AiCall } from '../core/host.js';

export const TRACE_BARS = 5;
export const TRACE_BUCKET_MS = 6000;

export interface TraceBar {
  // When the bucket starts.
  readonly from: number;
  // How many pieces arrived in it.
  readonly pieces: number;
  // Whether a call was open at any time in it.
  readonly open: boolean;
}

// The buckets in view at `now`, oldest first: the `TRACE_BARS` before the
// current one, then the current one, which is still filling.
export function traceBars(calls: readonly AiCall[], now: number): TraceBar[] {
  const current = Math.floor(now / TRACE_BUCKET_MS);
  return Array.from({ length: TRACE_BARS + 1 }, (_, i) => {
    const from = (current - TRACE_BARS + i) * TRACE_BUCKET_MS;
    const to = from + TRACE_BUCKET_MS;
    let pieces = 0;
    let open = false;
    for (const c of calls) {
      if (c.started < to && c.started <= now && (c.ended ?? now) >= from) open = true;
      for (const at of c.arrivals) if (at >= from && at < to && at <= now) pieces++;
    }
    return { from, pieces, open };
  });
}

// A bar's height, 0 to 1: one piece shows, about a hundred fills it.
export const barHeight = (pieces: number) => (pieces ? Math.min(1, 0.2 + 0.4 * Math.log10(pieces)) : 0);
