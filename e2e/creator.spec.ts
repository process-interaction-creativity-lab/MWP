import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { editor, isPlaced, newDocument, openApp } from './app.js';

// The module creator's harness, with a scripted model behind the writer's
// endpoint: its tools, the check (typechecking and bundling in the page, refusing an import
// it can't supply, a trial run), installing, turning on, a failure sent back to the agent,
// and the download. What a real model builds is not tested here.

type Call = { type: 'function'; function: { name: string; arguments: string } };
const call = (name: string, args: object): Call => ({ type: 'function', function: { name, arguments: JSON.stringify(args) } });
// A reply of one or more tool calls, run in order.
const calls = (...list: Call[]) => ({ tool_calls: list.map((c, i) => ({ id: `call-${i}`, ...c })) });
const read = (...paths: string[]) => call('read_files', { paths });
const write = (files: Record<string, string>) => call('write_module', { id: 'very-marker', files: Object.entries(files).map(([path, content]) => ({ path, content })) });
// The same, with the list sent as a JSON string, as some models do.
const writeEncoded = (files: Record<string, string>) =>
  call('write_module', { id: 'very-marker', files: JSON.stringify(Object.entries(files).map(([path, content]) => ({ path, content }))) });
// A draft that passes its check ends the turn with `reply`; a question ends it too.
const submit = (reply = '') => call('submit_draft', { reply });
const ask = (question: string) => call('ask_writer', { question });
const exact = (path: string, old: string, replacement: string) => call('edit_files_exact', { edits: [{ path, old, new: replacement }] });
const find = (text: string, everywhere: boolean) => call('search_files', { text, everywhere });
const replace = (text: string, ...replacements: string[]) => call('replace_search_matches', { text, replacements });

const DESCRIPTION = `# very-marker: description

Marks every "very" in your text, so you can see how often you lean on it.

**Kind:** extension.

- Each "very" is underlined in orange.
`;
const QA = '# QA: very-marker\n\n1. Type "a very good day". Confirm "very" is marked.\n';
const GOOD = `import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { ModuleContext } from 'mwps';
import { WORD } from './word';

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.provide(new Plugin({
      props: {
        decorations(state) {
          const decos: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (!node.isText) return;
            for (const m of node.text!.matchAll(new RegExp('\\\\b' + WORD + '\\\\b', 'gi'))) decos.push(Decoration.inline(pos + m.index!, pos + m.index! + m[0].length, { class: 'very-marker' }));
          });
          return DecorationSet.create(state.doc, decos);
        },
      },
    }));
  });
}

export const styles = '.very-marker { text-decoration: underline orange; }';
`;

// Passes the trial run, then throws once the writer types "explode".
const FRAGILE = `import { Plugin } from 'prosemirror-state';
import type { ModuleContext } from 'mwps';

export function setup(ctx: ModuleContext) {
  ctx.each(ctx.panes, (p) => {
    p.provide(new Plugin({ view: () => ({ update(view) { if (view.state.doc.textContent.includes('explode')) throw new Error('boom'); } }) }));
  });
}
`;

// Each reply, by how many requests came before it.
const SCRIPT = [
  calls(read('modules/sentence-spacing/index.tsx', 'modules/no-such/index.tsx')),
  calls(ask('Underlined, or highlighted?')),
  // After the writer's answer.
  calls(write({ 'description.md': DESCRIPTION, 'qa.md': QA, 'index.tsx': "import _ from 'lodash';\nexport function setup() { _.noop(); }\n" }), submit()),
  calls(exact('index.tsx', "import _ from 'lodash';\nexport function setup() { _.noop(); }", "import type { ModuleContext } from 'mwps';\nexport function setup(ctx: ModuleContext) {\n  ctx.each(ctx.panes, () => { throw new Error('boom'); });\n}"), submit()),
  calls(write({ 'index.tsx': FRAGILE }), submit('Done: every "very" is underlined. Turn it on from the pane\'s tab menu.')),
  // After "Ask to fix": an edit that misses, a write with a type error, a
  // replace before searching, a search, the replace that fixes it, a reply
  // in plain text (held back: the app asks for a tool), and the submit.
  calls(exact('index.tsx', 'nowhere in the file', 'x')),
  calls(writeEncoded({ 'index.tsx': GOOD, 'word.ts': "export const WORD: number = 'very';\n" }), submit()),
  calls(replace(': number', '')),
  calls(find(': NUMBER', true)),
  calls(replace(': NUMBER', '')),
  { content: 'All done.' },
  calls(submit('Fixed: it marks "very" again.')),
];

async function scriptedModel(page: Page) {
  const requests: { messages: { role: string; content: string | null }[]; tools: unknown[] }[] = [];
  await page.route('https://ai.invalid/**', (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    return route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: null, ...SCRIPT[requests.length - 1] } }] } });
  });
  await page.evaluate(
    (s) => (window as never as { mwpsE2E: { saveSettings(s: unknown): Promise<void> } }).mwpsE2E.saveSettings(s),
    { ai: { key: 'sk-test', url: 'https://ai.invalid/v1', model: 'scripted' }, modules: {} },
  );
  return requests;
}

test('the module creator builds a module with the writer’s model, installs it, sends a failure back to fix, and downloads it', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('a very good day');

  await page.getByRole('button', { name: 'Create a module' }).click();
  const panel = page.getByRole('complementary', { name: 'Create a module' });
  await expect(panel.getByRole('button', { name: 'Open Settings' })).toBeVisible();
  const requests = await scriptedModel(page);
  await expect(panel.getByText('Describe a new tool or interface design')).toBeVisible();

  await panel.getByRole('textbox').fill('Mark every "very"');
  await panel.getByRole('button', { name: 'Create' }).click();
  // A question ends the turn; the writer's answer starts the next.
  await expect(panel.getByText('Underlined, or highlighted?')).toBeVisible({ timeout: 30_000 });
  await panel.getByRole('textbox').fill('Underlined');
  await panel.getByRole('button', { name: 'Send' }).click();
  // The first check loads TypeScript, and each check runs a trial: slow on a busy machine.
  await expect(panel.getByText('Done: every "very" is underlined.')).toBeVisible({ timeout: 30_000 });
  // The model had the guide, the contract and the template, and could read
  // the other modules.
  expect(requests[0]!.messages[0]!.content).toContain('# Writing an mwps module');
  expect(requests[0]!.messages[0]!.content).toContain('export interface ModuleContext');
  expect(requests[0]!.messages[0]!.content).toContain('## The module template');
  expect(requests[0]!.tools).toHaveLength(7);
  // Only OpenRouter is sent a session id; another endpoint may refuse the field.
  expect(requests[0]).not.toHaveProperty('session_id');
  expect(requests[2]!.messages.filter((m) => m.role === 'user').at(-1)!.content).toBe('Underlined');
  expect(requests[1]!.messages.at(-1)!.content).toMatch(/=== modules\/sentence-spacing\/index\.tsx ===\n[\s\S]*export function setup[\s\S]*=== modules\/no-such\/index\.tsx ===\nError: there is no such file/);
  // The first check refused the import; the model was told why.
  await expect(panel.getByText('Check failed')).toHaveCount(2);
  expect(requests[3]!.messages.at(-1)!.content).toMatch(/index\.tsx\(1,15\): error TS2307: Cannot find module 'lodash'[\s\S]*"lodash" isn't available[\s\S]*very-marker: failed/);
  // The second, which throws once placed, failed its trial run.
  expect(requests[4]!.messages.at(-1)!.content).toMatch(/trial run: it went wrong[\s\S]*FAILED: turning it on[\s\S]*boom/);
  await expect(panel.getByText('Check passed: installed in the app')).toBeVisible();

  // Turned on, it throws at a word the writer types: the panel offers to
  // send the error back.
  await panel.getByRole('button', { name: 'Turn on' }).click();
  await editor(page).click();
  await page.keyboard.type(' explode');
  await expect(panel.getByRole('alert')).toContainText('very-marker stopped working: boom');
  await panel.getByRole('button', { name: 'Ask to fix' }).click();
  await expect(panel.getByText('Fixed: it marks "very" again.')).toBeVisible({ timeout: 30_000 });
  expect(requests[5]!.messages.filter((m) => m.role === 'user').at(-1)!.content).toContain('boom');
  // The edit that missed was refused before any check, and said why.
  expect(requests[6]!.messages.at(-1)!.content).toMatch(/^Error in edit 1 \(index\.tsx\): `old` was not found/);
  await expect(panel.getByText('Edit failed: index.tsx')).toBeVisible();
  expect(requests[7]!.messages.at(-1)!.content).toMatch(/word\.ts\(1,14\): error TS2322/);
  // A replace answers a search the model has seen; the search ignores case,
  // numbers the module's matches and lists others' after them.
  expect(requests[8]!.messages.at(-1)!.content).toBe('Error: search for ": number" first with search_files, then give one replacement per match');
  expect(requests[9]!.messages.at(-1)!.content).toMatch(/^": NUMBER" in very-marker: 1 match\n1 {2}word\.ts:1 {2}export const WORD«: number» = 'very';\n\nElsewhere, read only: \d+ matches in \d+ files\n/);
  // An edit shows the lines it changed and leaves checking to check_module.
  expect(requests[10]!.messages.at(-1)!.content).toBe("word.ts: replaced 1 place:\n  1: export const WORD = 'very';\n\nNot checked yet.");
  // A reply in plain text is held back, and the model asked to end with a tool.
  expect(requests[11]!.messages.at(-1)).toMatchObject({ role: 'user', content: expect.stringContaining('end your turn with submit_draft') });
  await expect(panel.getByText('All done.')).toHaveCount(0);
  await expect(panel.getByRole('alert')).toHaveCount(0);

  // Reinstalled, it runs where it was placed.
  expect(await isPlaced(page, 'very-marker')).toBe(true);
  await expect(editor(page).locator('.very-marker')).toHaveText('very');
  // The trial frames are gone.
  await expect(page.locator('iframe')).toHaveCount(0);

  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: '.zip' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('very-marker.zip');
  const dir = mkdtempSync(path.join(tmpdir(), 'mwps-creator-'));
  try {
    await file.saveAs(path.join(dir, 'm.zip'));
    execFileSync('unzip', ['-q', 'm.zip'], { cwd: dir });
    expect(readFileSync(path.join(dir, 'very-marker/description.md'), 'utf8')).toBe(DESCRIPTION);
    expect(readFileSync(path.join(dir, 'very-marker/word.ts'), 'utf8')).toBe("export const WORD = 'very';\n");
  } finally {
    rmSync(dir, { recursive: true });
  }
  // The thrown error is logged as the module is turned off.
  expect(errors.filter((e) => !e.includes('boom'))).toEqual([]);
});
