// The module creator's typecheck, run in a worker (typecheck-worker.ts),
// which loads TypeScript and the type files on the first check.

let worker: Worker | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** TypeScript's errors for the module, and its warnings (names never used),
 *  each as `tsc` prints them, or '' when there are none. */
export function typecheck(id: string, files: ReadonlyMap<string, string>): Promise<{ errors: string; warnings: string }> {
  const run = queue.then(
    () =>
      new Promise<{ errors: string; warnings: string }>((resolve, reject) => {
        worker ??= new Worker(new URL('./typecheck-worker.ts', import.meta.url), { type: 'module' });
        const w = worker;
        w.onmessage = ({ data }: MessageEvent<{ errors: string; warnings: string }>) => resolve(data);
        w.onerror = (e) => {
          worker = null;
          w.terminate();
          reject(new Error(`the typecheck didn't run: ${e.message}`));
        };
        w.postMessage({ id, files: [...files] });
      }),
  );
  queue = run.catch(() => {});
  return run;
}
