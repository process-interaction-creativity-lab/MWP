// The fuzzers' one scenario, for a module on its own (singles.spec.ts) or
// two together (pairs.spec.ts): place them on one pane, write and edit
// around them, switch documents and reload, take each off again, and check
// what every module should keep true whatever its neighbour does: no page
// errors, the app stays drawn, nothing spills past the window, each module
// is still placed after the reload, and the writing survives. Screenshots
// go to FUZZ_SHOTS (test-results/fuzz/), for a look at what passes but
// looks wrong.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { editor, isPlaced, keys, newDocument, openApp, pickDocument, setModule } from '../e2e/app.js';

export const MODULES = readdirSync('modules').filter((id) => existsSync(`modules/${id}/index.tsx`));
const SHOTS = process.env.FUZZ_SHOTS ?? 'test-results/fuzz';

/** An editor replacement takes the pane's place; placing another replaces it. */
export const replaces = (id: string) => /moduleType\s*=\s*'editorReplacement'/.test(readFileSync(`modules/${id}/index.tsx`, 'utf8'));

/** Any AI call gets a short plausible answer: JSON when the prompt asks for it. */
async function mockAi(page: Page): Promise<void> {
  await page.route('https://*.invalid/**', async (route) => {
    if (route.request().url().endsWith('/models')) return route.fulfill({ json: { data: [] } }).catch(() => {});
    const body = (route.request().postDataJSON() ?? {}) as { messages?: { content: string }[] };
    const prompt = JSON.stringify(body.messages ?? '');
    const reply = /json/i.test(prompt) ? '{"text": "A quiet answer.", "items": ["one", "two"]}' : 'A quiet answer from the model.';
    return route.fulfill({ json: { choices: [{ message: { content: reply } }] } }).catch(() => {});
  });
  await page.evaluate(
    (s) => (window as never as { mwpsE2E: { saveSettings(s: unknown): Promise<void> } }).mwpsE2E.saveSettings(s),
    { ai: { key: 'k', url: 'https://fuzz.invalid/v1', model: 'm' }, modules: {} },
  );
}

const TEXT = [
  'The lighthouse keeper climbed the stairs. She lit the lamp at dusk.',
  '"Will the storm wait?" he asked quietly, watching the grey sea.',
  'Nobody answered him.',
];

/** Checks that hold whatever is placed. */
async function invariants(page: Page, errors: string[], step: string): Promise<void> {
  expect(errors, `page errors after ${step}`).toEqual([]);
  await expect(page.locator('.mwps-app'), `the app is drawn after ${step}`).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow after ${step}`).toBeLessThanOrEqual(1);
}

/** The pane's last editor (a module's own editor where it has one), or null when it shows none. */
async function lastEditor(page: Page) {
  const ed = editor(page).last();
  return (await ed.isVisible()) ? ed : null;
}

/**
 * Runs the scenario with `ids` placed in order. Add-ons go before a layout
 * that may hide them (pairs.spec.ts orders them so); a layout placed after
 * another replaces it, so only the last stays placed.
 */
export async function fuzz(page: Page, ids: readonly string[]): Promise<void> {
  const name = ids.join('+');
  const placed = ids.filter((id, i) => !replaces(id) || !ids.slice(i + 1).some(replaces));

  // Layouts that drift (bubbles) hold still, so clicks land.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { errors } = await openApp(page);
  await mockAi(page);
  await newDocument(page);
  await editor(page).first().click();
  for (const line of TEXT) {
    await page.keyboard.type(line);
    await page.keyboard.press('Enter');
  }
  await invariants(page, errors, 'typing');

  for (const id of ids) {
    await setModule(page, id, true);
    await invariants(page, errors, `placing ${id}`);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/${name}-placed.png` });

  // Edit through whatever editor now shows: type, select a word, delete, undo, redo.
  const ed = await lastEditor(page);
  if (ed) {
    await ed.click({ force: true });
    await page.keyboard.press(keys.docEnd);
    await page.keyboard.type(' Fuzzed words here.');
    await page.keyboard.press(keys.selectWordLeft);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('ControlOrMeta+Shift+Z');
    await page.keyboard.press('Enter');
    await page.keyboard.type('A new paragraph.');
    await page.waitForTimeout(300);
    await invariants(page, errors, `editing with ${name} placed`);
  }

  // Another document and back, with the caret in the pane's last editor; then a reload.
  const again = await lastEditor(page);
  if (again) await again.click({ force: true });
  await newDocument(page);
  await invariants(page, errors, 'a new document');
  await pickDocument(page, 'Untitled 1');
  await invariants(page, errors, 'switching back');
  await page.reload();
  await page.waitForTimeout(500);
  await invariants(page, errors, 'reloading');
  for (const id of placed) expect(await isPlaced(page, id), `${id} still placed after the reload`).toBe(true);

  // Off in reverse: an editor replacement placed last hides the add-ons
  // placed before it.
  for (const id of [...placed].reverse()) {
    await setModule(page, id, false);
    await invariants(page, errors, `removing ${id}`);
  }
  await page.screenshot({ path: `${SHOTS}/${name}-removed.png` });

  // With every module gone, the plain editor shows the writing, which kept its lines.
  await expect(editor(page).first()).toBeVisible();
  await expect(editor(page).first()).toContainText('Nobody answered him.');
}
