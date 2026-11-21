// The headless host: the core with no views, driven from tests through the
// same calls the web host makes.

import { Host, type ModuleDef } from '../src/core/host.js';

export interface Headless {
  host: Host;
  // Module ids, one entry per failure, in order.
  failures: string[];
}

export function bootHeadless(modules: readonly ModuleDef[]): Headless {
  const failures: string[] = [];
  const host = new Host({ onFailure: (id) => failures.push(id) });
  for (const m of modules) host.install(m);
  return { host, failures };
}
