// One tab at a time has a project open. Each tab keeps its own copy of the
// project's files and writes them whole, so two tabs on one project would
// overwrite each other's writing. The tab with the project open holds a
// Web Lock named for it; a tab that wants the project asks over a
// BroadcastChannel, and the holder closes the project (writing out what it
// has) before it lets go, so the asking tab reads everything.
//
// In memory mode (no OPFS) each tab's files are its own and nothing is
// shared, so there is nothing to lock; nor where the browser has no Web Locks.

import { opfsRoot } from './storage.js';

const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('mwps-projects') : null;
const lockName = (project: string) => `mwps-project:${project}`;

/**
 * Takes the project's lock: at once if no tab holds it, or with `wait`,
 * once the holder has let go. Resolves to a release function, or to null
 * when another tab holds it and `wait` is off. `handOver` runs when another
 * tab asks for the project; the lock goes once it settles.
 */
export async function holdProject(project: string, handOver: () => Promise<void>, wait: boolean): Promise<(() => void) | null> {
  if (!navigator.locks || !(await opfsRoot())) return () => {};
  return new Promise((resolve, reject) => {
    navigator.locks
      .request(lockName(project), { ifAvailable: !wait }, (lock) => {
        if (!lock) return resolve(null);
        return new Promise<void>((released) => {
          let done = false;
          const release = () => {
            if (done) return;
            done = true;
            channel?.removeEventListener('message', onMessage);
            released();
          };
          const onMessage = (e: MessageEvent) => {
            if ((e.data as { want?: string } | null)?.want === project) void handOver().finally(release);
          };
          channel?.addEventListener('message', onMessage);
          resolve(release);
        });
      })
      .catch(reject);
  });
}

/** Asks the tab holding the project to let it go. */
export function askForProject(project: string): void {
  channel?.postMessage({ want: project });
}
