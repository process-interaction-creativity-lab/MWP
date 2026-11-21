import fc from 'fast-check';
import { expect, it } from 'vitest';
import { streamParser } from './ai.ts';

const event = (piece: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`;

it('reads the same pieces however the network splits the stream', () => {
  fc.assert(
    fc.property(fc.array(fc.string({ minLength: 1 }), { maxLength: 8 }), fc.array(fc.nat(), { maxLength: 10 }), (pieces, cuts) => {
      const whole = `: keep-alive\n\n${pieces.map(event).join('')}data: [DONE]\n\n${event('after the end')}`;
      const at = [...new Set(cuts.map((c) => c % (whole.length + 1)))].sort((a, b) => a - b);
      const chunks = [0, ...at, whole.length].slice(1).map((end, i, ends) => whole.slice(i ? ends[i - 1] : 0, end));
      const parse = streamParser();
      const got: string[] = [];
      let finished = false;
      for (const chunk of [...chunks, '\n']) {
        const r = parse(chunk);
        got.push(...r.pieces);
        finished ||= r.finished;
        if (r.finished) break;
      }
      expect(got).toEqual(pieces);
      expect(finished).toBe(true);
    }),
  );
});
