import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, zip } from './zip.ts';

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes an archive unzip reads back', () => {
    const files = new Map([
      ['word-goal/index.tsx', 'export function setup() {}\n'],
      ['word-goal/description.md', '# word-goal: description\n\nCounts words — “toward a goal”.\n'],
    ]);
    const dir = mkdtempSync(path.join(tmpdir(), 'mwps-zip-'));
    try {
      writeFileSync(path.join(dir, 'm.zip'), zip(files));
      execFileSync('unzip', ['-q', 'm.zip'], { cwd: dir });
      for (const [name, text] of files) expect(readFileSync(path.join(dir, name), 'utf8')).toBe(text);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
