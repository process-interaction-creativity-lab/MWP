import { describe, it } from 'vitest';
import { VAULT_CONFORMANCE } from '../src/core/vault/conformance.js';
import { KeyedVault, memoryKeyStore } from '../src/core/vault/keyed.js';
import { MemoryVault } from '../src/core/vault/memory.js';

describe('MemoryVault conformance', () => {
  for (const c of VAULT_CONFORMANCE) {
    it(c.name, async () => {
      const vault = new MemoryVault();
      await c.run({ vault, reopen: async () => vault.reopen() });
    });
  }
});

describe('KeyedVault conformance', () => {
  for (const c of VAULT_CONFORMANCE) {
    it(c.name, async () => {
      const store = memoryKeyStore();
      // Another vault in the same store, which must stay invisible.
      await new KeyedVault(store, 'other/').write('project.json', 'theirs');
      await c.run({ vault: new KeyedVault(store, 'mine/'), reopen: async () => new KeyedVault(store, 'mine/') });
    });
  }
});
