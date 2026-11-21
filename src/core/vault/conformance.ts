// Framework-free because vitest (the memory vault) and
// Playwright (OPFS) both run it. Adapt with
//   for (const c of VAULT_CONFORMANCE) it(c.name, () => c.run(harness()));

import type { Vault } from './vault.js';

export interface VaultHarness {
  vault: Vault;
  // A fresh vault over the same storage, as after a restart: durable writes
  // are there, anything unflushed may not be.
  reopen(): Promise<Vault>;
}

export interface VaultConformanceCase {
  name: string;
  run(harness: VaultHarness): Promise<void>;
}

function eq(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

async function rejects(p: Promise<unknown>, what: string): Promise<void> {
  try {
    await p;
  } catch {
    return;
  }
  throw new Error(`${what}: expected a rejection`);
}

const sorted = (xs: string[]): string[] => [...xs].sort();

export const VAULT_CONFORMANCE: readonly VaultConformanceCase[] = [
  {
    name: 'read of an absent path is null',
    async run({ vault }) {
      eq(await vault.read('project.json'), null, 'read');
    },
  },
  {
    name: 'reads see a write before it is flushed',
    async run({ vault }) {
      await vault.write('project.json', 'one');
      eq(await vault.read('project.json'), 'one', 'read after write');
      await vault.write('project.json', 'two');
      eq(await vault.read('project.json'), 'two', 'read after overwrite');
    },
  },
  {
    name: 'write creates parent directories',
    async run({ vault, reopen }) {
      await vault.write('modules/foo/deep/state.json', '{}');
      await vault.flush();
      eq(await (await reopen()).read('modules/foo/deep/state.json'), '{}', 'reopened read');
    },
  },
  {
    name: 'flush(path) makes that write durable',
    async run({ vault, reopen }) {
      await vault.write('documents/a.json', 'A');
      await vault.flush('documents/a.json');
      eq(await (await reopen()).read('documents/a.json'), 'A', 'reopened read');
    },
  },
  {
    name: 'flush() makes every write durable',
    async run({ vault, reopen }) {
      await vault.write('documents/a.json', 'A');
      await vault.write('documents/b.json', 'B');
      await vault.write('project.json', 'P');
      await vault.flush();
      const again = await reopen();
      eq(await again.read('documents/a.json'), 'A', 'a');
      eq(await again.read('documents/b.json'), 'B', 'b');
      eq(await again.read('project.json'), 'P', 'project');
    },
  },
  {
    name: 'flush with nothing pending resolves',
    async run({ vault }) {
      await vault.flush();
      await vault.flush('never-written.json');
    },
  },
  {
    name: 'delete removes a durable entry',
    async run({ vault, reopen }) {
      await vault.write('documents/a.json', 'A');
      await vault.flush();
      await vault.delete('documents/a.json');
      eq(await vault.read('documents/a.json'), null, 'read after delete');
      eq(await (await reopen()).read('documents/a.json'), null, 'reopened read');
    },
  },
  {
    name: 'delete discards a pending write',
    async run({ vault, reopen }) {
      await vault.write('documents/a.json', 'A');
      await vault.delete('documents/a.json');
      await vault.flush();
      eq(await vault.read('documents/a.json'), null, 'read');
      eq(await (await reopen()).read('documents/a.json'), null, 'reopened read');
    },
  },
  {
    name: 'delete of an absent path resolves',
    async run({ vault }) {
      await vault.delete('documents/never.json');
    },
  },
  {
    name: 'list returns every path under a directory prefix, pending included',
    async run({ vault }) {
      await vault.write('modules/foo/a.json', '1');
      await vault.write('modules/foo/sub/b.json', '2');
      await vault.flush();
      await vault.write('modules/foo/c.json', '3'); // pending
      await vault.write('modules/foobar/x.json', 'x');
      await vault.write('project.json', 'p');
      eq(
        sorted(await vault.list('modules/foo/')),
        ['modules/foo/a.json', 'modules/foo/c.json', 'modules/foo/sub/b.json'],
        'list',
      );
    },
  },
  {
    name: 'list matches a partial final segment',
    async run({ vault }) {
      await vault.write('documents/abc.json', '1');
      await vault.write('documents/abd.json', '2');
      await vault.write('documents/xyz.json', '3');
      eq(
        sorted(await vault.list('documents/ab')),
        ['documents/abc.json', 'documents/abd.json'],
        'list',
      );
    },
  },
  {
    name: "list('') lists everything, and omits deleted paths",
    async run({ vault }) {
      await vault.write('project.json', 'p');
      await vault.write('documents/a.json', 'A');
      await vault.write('documents/b.json', 'B');
      await vault.flush();
      await vault.delete('documents/b.json');
      eq(sorted(await vault.list('')), ['documents/a.json', 'project.json'], 'list');
    },
  },
  {
    name: 'list of a missing prefix is empty',
    async run({ vault }) {
      eq(await vault.list('modules/nothing/'), [], 'list');
    },
  },
  {
    name: 'content round-trips exactly',
    async run({ vault, reopen }) {
      const text = 'naïve — “quotes”, 日本語, emoji 🪶\nline two\r\n\ttab ';
      await vault.write('documents/u.json', text);
      eq(await vault.read('documents/u.json'), text, 'read');
      await vault.flush();
      eq(await (await reopen()).read('documents/u.json'), text, 'reopened read');
      await vault.write('documents/empty.json', '');
      eq(await vault.read('documents/empty.json'), '', 'empty is not absent');
    },
  },
  {
    name: 'paths that escape the root, or are malformed, are rejected',
    async run({ vault }) {
      for (const bad of ['', '/abs.json', '../up.json', 'a/../b.json', 'a//b.json', './a.json', 'a/', 'a\\b.json']) {
        await rejects(vault.read(bad), `read ${JSON.stringify(bad)}`);
        await rejects(vault.write(bad, 'x'), `write ${JSON.stringify(bad)}`);
        await rejects(vault.delete(bad), `delete ${JSON.stringify(bad)}`);
      }
      for (const bad of ['/abs', '../', 'a/../', 'a//b']) {
        await rejects(vault.list(bad), `list ${JSON.stringify(bad)}`);
      }
    },
  },
];
