// The module creator's trial run: a hidden frame holding the app in a
// scratch page of its own (`?modules=&trial`, nothing kept), where the
// module's bundle runs through the fuzzer's scenario (trial-runner.ts)
// before it is installed in the writer's app. A fresh frame each time.

const TIMEOUT = 30_000;

type TrialWindow = Window & { mwpsTrial?: { runTrial(id: string, code: string): Promise<{ ok: boolean; report: string }> } };

export async function trialRun(id: string, code: string): Promise<{ ok: boolean; report: string }> {
  const frame = document.createElement('iframe');
  frame.title = 'Module trial';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Off screen but laid out, so the module draws as it would.
  Object.assign(frame.style, { position: 'fixed', left: '-12000px', top: '0', width: '1200px', height: '800px', border: '0' });
  frame.src = `./?modules=&trial`;
  document.body.append(frame);
  try {
    const started = Date.now();
    let w: TrialWindow | null = null;
    while (!(w = frame.contentWindow as TrialWindow | null)?.mwpsTrial) {
      if (Date.now() - started > TIMEOUT) throw new Error("the trial frame didn't start");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const result = w.mwpsTrial!.runTrial(id, code);
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`the trial didn't finish in ${TIMEOUT / 1000} seconds`)), TIMEOUT));
    return await Promise.race([result, timeout]);
  } catch (error) {
    return { ok: false, report: `FAILED: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    frame.remove();
  }
}
