// Bundled into the page by opfs-conformance.spec.ts: the shared Vault
// conformance cases, run against the real OpfsVault in the browser.

import { VAULT_CONFORMANCE } from '../../src/core/vault/conformance.js';
import { OpfsVault } from '../../src/web/opfs-vault.js';

async function runCase(index: number): Promise<{ name: string; error: string | null }> {
  const c = VAULT_CONFORMANCE[index]!;
  const dir = `conformance-${index}`;
  const origin = await navigator.storage.getDirectory();
  await origin.removeEntry(dir, { recursive: true }).catch(() => {});
  localStorage.removeItem(`mwps:vault-journal:${dir}`);
  // A long debounce, so "durable" in these cases can only mean "flushed".
  const vault = await OpfsVault.open(dir, 60_000);
  try {
    await c.run({ vault, reopen: async () => OpfsVault.open(dir) });
    await vault.flush();
    return { name: c.name, error: null };
  } catch (err) {
    return { name: c.name, error: err instanceof Error ? err.message : String(err) };
  }
}

(globalThis as unknown as Record<string, unknown>).__vaultConformance = {
  names: VAULT_CONFORMANCE.map((c) => c.name),
  run: runCase,
};
