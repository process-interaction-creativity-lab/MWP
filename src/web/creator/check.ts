// The module creator's `check`: what `npm run check` does, in the page: the
// description's summary, the typecheck (in a worker), the bundle (which
// refuses imports outside the module), the source warnings, and an install
// in a host with no panes, so what the app would refuse at load fails here;
// then, beyond `npm run check`, a trial run of the fuzzer's scenario in a
// hidden frame (trial.ts), so what fails once placed fails here too.
// A module that passes is installed in the page's host, replacing the one
// before, as dev's hot reload does: the writer can place it at once.

import { lintSource } from '../../bundle/lint.js';
import { summaryOf } from '../../bundle/summary.js';
import { Host } from '../../core/host.js';
import { host } from '../host.js';
import { moduleFromCode } from '../load-modules.js';
import { bundleModule } from './bundle.js';
import { trialRun } from './trial.js';
import { typecheck } from './typecheck.js';

export interface CheckResult {
  ok: boolean;
  /** What `npm run check` would print, ending `<id>: ok` or `<id>: failed`. */
  report: string;
}

export async function checkAndInstall(id: string, files: ReadonlyMap<string, string>): Promise<CheckResult> {
  const lines: string[] = [];
  let ok = true;
  const problem = (text: string) => {
    lines.push(text);
    ok = false;
  };

  const description = files.get('description.md');
  const found = description === undefined ? { problem: 'it has no description.md' } : summaryOf(description);
  if ('problem' in found) problem(`description.md: ${found.problem}`);
  const help = files.get('help.md') ?? null;
  if (help !== null && !help.startsWith(`# ${id}: help\n`)) problem(`help.md must start with its title, "# ${id}: help"`);
  if (!files.has('index.tsx')) problem('there is no index.tsx');

  try {
    const { errors, warnings } = await typecheck(id, files);
    if (errors) problem(errors);
    if (warnings) lines.push(warnings.replaceAll(': error TS', ': warning TS'));
  } catch (error) {
    problem(error instanceof Error ? error.message : String(error));
  }
  for (const [file, text] of files) if (/\.[jt]sx?$/.test(file)) lines.push(...lintSource(file, text));

  if (files.has('index.tsx')) {
    try {
      const code = await bundleModule(id, files, { summary: 'summary' in found ? found.summary : null, help });
      const def = moduleFromCode(id, code);
      // A host of its own first: a schema ProseMirror refuses throws there,
      // not in the page's host.
      new Host({ onFailure: () => {} }).install(def);
      // Then a trial run, in a frame of its own, as a writer would use it.
      if (ok) {
        const trial = await trialRun(id, code);
        if (trial.ok) lines.push(`trial run: ok\n${indent(trial.report)}`);
        else problem(`trial run: it went wrong\n${indent(trial.report)}`);
      }
      // Then the page's host, which refuses a clash with the modules it has.
      if (ok) {
        host.install(def);
        lines.push(`installed in the app as ${id}`);
      }
    } catch (error) {
      problem(error instanceof Error ? error.message : String(error));
    }
  }
  lines.push(ok ? `${id}: ok` : `${id}: failed`);
  return { ok, report: lines.join('\n') };
}

const indent = (text: string) => text.split('\n').map((line) => `  ${line}`).join('\n');
