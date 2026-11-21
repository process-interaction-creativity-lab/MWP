import { describe, expect, it } from 'vitest';
import { SUMMARY_MAX_WORDS, summaryOf } from './summary.ts';

describe('summaryOf', () => {
  it('takes the first paragraph under the title, joined into one line', () => {
    const md = '# x: description\n\nGrey text appears\nafter your caret.\n\nFrom *a paper*.\n\n## 1. Brief\n';
    expect(summaryOf(md)).toEqual({ summary: 'Grey text appears after your caret.' });
  });

  it('is missing when a heading, list or quote comes first', () => {
    for (const first of ['## 1. Brief', '- a list', '> a note', '1. a step']) {
      expect(summaryOf(`# x: description\n\n${first}\n`)).toHaveProperty('problem');
    }
    expect(summaryOf('# x: description\n')).toHaveProperty('problem');
  });

  it('is plain text, without code, links or emphasis', () => {
    for (const text of ['Uses `ui.side`.', 'See [this](/x.md).', 'From *a paper*.', 'An _aside_.']) {
      expect(summaryOf(`# x: description\n\n${text}\n`)).toHaveProperty('problem');
    }
    expect(summaryOf("# x: description\n\nA writer's file_name, with commas.\n")).toHaveProperty('summary');
  });

  it(`has at most ${SUMMARY_MAX_WORDS} words`, () => {
    const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
    expect(summaryOf(`# x: description\n\n${words(SUMMARY_MAX_WORDS)}\n`)).toHaveProperty('summary');
    expect(summaryOf(`# x: description\n\n${words(SUMMARY_MAX_WORDS + 1)}\n`)).toHaveProperty('problem');
  });

  it('needs the title first', () => {
    expect(summaryOf('Some text\n')).toHaveProperty('problem');
  });
});
