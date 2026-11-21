import { describe, expect, it } from 'vitest';
import { editExact, replaceMatches, search, shown } from './edits.js';

const FILE = "const a = 'x';\nconst b = 'y';\nconst c = 'x';\n";

describe('editExact', () => {
  it('replaces the one occurrence and shows its line', () => {
    const r = editExact(FILE, "b = 'y'", "b = 'z'");
    expect(r).toEqual({ ok: true, text: "const a = 'x';\nconst b = 'z';\nconst c = 'x';\n", report: "replaced 1 place:\n  2: const b = 'z';" });
  });

  it('refuses text that occurs more than once, naming the lines', () => {
    const r = editExact(FILE, "'x'", "'w'");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/occurs 2 times[\s\S]*1: const a[\s\S]*3: const c/);
  });

  it('refuses text not found, pointing at its first line when that is there', () => {
    const r = editExact(FILE, "const b = 'y';\nconst c  = 'x';", '');
    expect(!r.ok && r.error).toBe("`old` was not found. Its first line is at line 2, and the file has, from there:\n  2: const b = 'y';\n  3: const c = 'x';\n  4: \nCopy `old` from these lines as they are");
    expect(!r.ok && editExact(FILE, 'nowhere', 'x').ok === false).toBe(true);
  });

  it('refuses an empty or unchanged edit', () => {
    expect(editExact(FILE, '', 'x').ok).toBe(false);
    expect(editExact(FILE, 'const', 'const').ok).toBe(false);
  });
});

const MODULE = new Map([
  ['index.tsx', "type C = 'spatial';\nconst label = 'Spatial (here)'; // spatial\n"],
  ['description.md', 'The spatial group.\n'],
]);

describe('search and replaceMatches', () => {
  it('finds every occurrence, ignoring case, with its line', () => {
    const found = search(MODULE, 'spatial');
    expect(found.map((m) => `${m.file}:${m.line}:${m.text}`)).toEqual(['index.tsx:1:spatial', 'index.tsx:2:Spatial', 'index.tsx:2:spatial', 'description.md:1:spatial']);
    expect(shown(MODULE.get('index.tsx')!, found[1]!)).toBe("const label = '«Spatial» (here)'; // spatial");
  });

  it('replaces each match with its own replacement, leaving one given unchanged', () => {
    const r = replaceMatches(MODULE, search(MODULE, 'spatial'), ['place', 'Place', 'spatial', 'place']);
    expect(r.ok && [...r.files.values()]).toEqual(["type C = 'place';\nconst label = 'Place (here)'; // spatial\n", 'The place group.\n']);
    expect(r.ok && r.report).toBe("index.tsx: replaced 2 places:\n  1: type C = 'place';\n  2: const label = 'Place (here)'; // spatial\ndescription.md: replaced 1 place:\n  1: The place group.");
  });

  it('refuses replacements that are not one per match, or change nothing', () => {
    const found = search(MODULE, 'spatial');
    expect(replaceMatches(MODULE, found, ['place'])).toMatchObject({ ok: false, error: expect.stringMatching(/there are 4 matches, so give 4 replacements[\s\S]*you gave 1/) });
    expect(replaceMatches(MODULE, found, found.map((m) => m.text)).ok).toBe(false);
    expect(replaceMatches(MODULE, [], []).ok).toBe(false);
  });
});
