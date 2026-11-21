// The module creator's trial run, inside its hidden frame (trial.ts): the
// fuzzer's scenario (fuzz/scenario.ts) without a keyboard. The module goes
// on a pane over some writing; the writing is typed into, edited, undone
// and redone; each of its actions runs once; the pane switches documents
// and back; the module comes off. What goes wrong is reported: the host
// turning it off, and errors nothing caught.

import { redo, undo } from 'prosemirror-history';
import { TextSelection, type Command } from 'prosemirror-state';
import { host, lastFailure, openProjectNow } from '../host.js';
import { moduleFromCode } from '../load-modules.js';

const ROOT = 'main';
const TEXT = [
  'The lighthouse keeper climbed the stairs slowly. She lit the lamp at dusk.',
  '"Will the storm wait?" he asked quietly, watching the grey sea.',
  'Nobody answered him.',
];

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(ready: () => boolean, what: string, ms = 5000): Promise<void> {
  for (const start = Date.now(); !ready(); await pause(25)) if (Date.now() - start > ms) throw new Error(`the trial timed out waiting for ${what}`);
}

const text = (words: string): Command => (state, dispatch) => {
  dispatch?.(state.tr.insertText(words));
  return true;
};
const toEnd: Command = (state, dispatch) => {
  dispatch?.(state.tr.setSelection(TextSelection.atEnd(state.doc)));
  return true;
};
const deleteBack = (n: number): Command => (state, dispatch) => {
  const { from } = state.selection;
  if (from - n < 1) return false;
  dispatch?.(state.tr.delete(from - n, from));
  return true;
};
const split: Command = (state, dispatch) => {
  dispatch?.(state.tr.split(state.selection.from));
  return true;
};

/** The trial's report: what it did, one line each, and whether all went well. */
export async function runTrial(id: string, code: string): Promise<{ ok: boolean; report: string }> {
  const lines: string[] = [];
  const problems: string[] = [];
  const say = (line: string) => lines.push(line);
  const describe = (error: unknown) => (error instanceof Error ? `${error.message}${error.stack ? `\n    ${error.stack.split('\n').slice(1, 3).join('\n    ')}` : ''}` : String(error));
  const onError = (e: ErrorEvent) => problems.push(`an uncaught error: ${describe(e.error ?? e.message)}`);
  const onRejection = (e: PromiseRejectionEvent) => problems.push(`an unhandled rejection: ${describe(e.reason)}`);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  const stopWatching = lastFailure.subscribe(() => {
    const failure = lastFailure.get();
    if (failure?.id === id) problems.push(`the app turned it off after it threw: ${describe(failure.error)}`);
  });
  const step = async (what: string, run: () => unknown) => {
    const before = problems.length;
    try {
      await run();
      await pause(150);
    } catch (error) {
      problems.push(`${what} threw: ${describe(error)}`);
    }
    say(`${problems.length > before ? 'FAILED' : 'ok'}: ${what}`);
    if (problems.length > before) say(problems.slice(before).map((p) => `  ${p}`).join('\n'));
  };

  try {
    await until(() => !!openProjectNow() && host.paneIds().includes(ROOT), 'the app to open');
    const project = openProjectNow()!;
    const first = await project.createDocument(host.schema, 'Trial');
    const second = await project.createDocument(host.schema, 'Another');
    host.showDocument(ROOT, first.id);
    await until(() => host.paneInfo(ROOT)?.status === 'ready' && host.paneInfo(ROOT)?.documentId === first.id, 'the document');
    for (const [i, line] of TEXT.entries()) {
      if (i) host.run(ROOT, split);
      host.run(ROOT, text(line));
    }

    host.install(moduleFromCode(id, code));
    const type = host.moduleType(id);
    await step(`turning it on (${type})`, () => (type === 'project' ? host.placeInProject(id) : host.place(ROOT, id)));
    await pause(400);
    await step('typing, deleting, undo and redo', async () => {
      host.run(ROOT, toEnd);
      host.run(ROOT, text(' Then she smiled, very slowly.'));
      await pause(100);
      host.run(ROOT, deleteBack(7));
      host.run(ROOT, undo);
      host.run(ROOT, redo);
      host.run(ROOT, split);
      host.run(ROOT, text('A new paragraph.'));
    });
    for (const action of host.actions(ROOT).filter((a) => a.moduleId === id)) {
      if (action.enabled) await step(`its action "${action.title}"`, () => host.runAction(ROOT, id, action.name));
      else say(`skipped: its action "${action.title}" (not enabled here)`);
    }
    await step('another document and back', async () => {
      host.showDocument(ROOT, second.id);
      await until(() => host.paneInfo(ROOT)?.documentId === second.id && host.paneInfo(ROOT)?.status === 'ready', 'the other document');
      host.showDocument(ROOT, first.id);
      await until(() => host.paneInfo(ROOT)?.documentId === first.id && host.paneInfo(ROOT)?.status === 'ready', 'the first document');
    });
    await step('turning it off', () => (type === 'project' ? host.unplaceFromProject(id) : host.unplace(ROOT, id)));
  } catch (error) {
    problems.push(describe(error));
    say(`FAILED: ${describe(error)}`);
  } finally {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    stopWatching();
  }
  return { ok: problems.length === 0, report: lines.join('\n') };
}
