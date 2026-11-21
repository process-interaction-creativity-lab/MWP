import { expect, test, type Page } from '@playwright/test';
import { editor, openApp, setModule, newDocument } from './app.js';

async function start(page: Page) {
  const app = await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-keys', true);
  await editor(page).click();
  return app;
}

async function retype(page: Page, text: string) {
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

test('a key two actions apply to opens the palette at the caret with just those two', async ({ page }) => {
  const { errors } = await start(page);
  await page.keyboard.type('+a +b');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('option')).toHaveText([/Key A/, /Key B/]);
  // Under the line the caret is on, not centred: measured once its opening
  // zoom is over, against the text's own box (the caret's height), since the
  // paragraph's box adds the line spacing below it.
  await dialog.evaluate((d) => Promise.all(d.getAnimations().map((a) => a.finished)));
  const text = await editor(page)
    .locator('p')
    .first()
    .evaluate((p) => {
      const range = document.createRange();
      range.selectNodeContents(p);
      const r = range.getBoundingClientRect();
      return { bottom: r.bottom };
    });
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(text.bottom);
  expect(box.y).toBeLessThan(text.bottom + 40);
  await page.screenshot({ path: 'test-results/ambiguity-palette.png' });

  // Escape closes it and runs nothing; Enter in it runs the one picked.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(editor(page)).toHaveText('+a +b[B]');
  expect(errors).toEqual([]);
});

test('Tab offers Indent, Continue and Allude in a paragraph; with ai-llude off it indents a list item', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.route('https://*.invalid/**', (route) => route.fulfill({ json: {} }));
  await newDocument(page);
  await setModule(page, 'word-processor', true);
  await setModule(page, 'ai-llude', true);
  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByRole('option', { name: 'Settings…' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByLabel('Key', { exact: true }).first().fill('sk-test');
  await settings.getByLabel('Address', { exact: true }).first().fill('https://default.invalid/v1');
  await settings.getByLabel('Model', { exact: true }).fill('default-model');
  await settings.getByRole('button', { name: 'Save' }).click();
  await expect(settings).toHaveCount(0);

  await editor(page).click();
  await page.keyboard.type('The rain had not stopped for three days, and the river was already over the lower road by the mill. Nobody in the village spoke of it.');
  await page.keyboard.press('Tab');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('option')).toHaveText([/Indent/, /Continue with AI/, /Allude with AI/]);
  // Once its opening animation is over.
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/ambiguity-palette-tab.png' });
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeFocused();

  await setModule(page, 'ai-llude', false);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('first');
  await page.keyboard.press('ControlOrMeta+Shift+8');
  // The first item can't nest, so Tab does nothing (not an indent).
  await page.keyboard.press('Tab');
  await expect(editor(page).locator('ul li p')).not.toHaveAttribute('style', /margin-left/);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  await page.keyboard.press('Tab');
  await expect(editor(page).locator('ul ul li')).toHaveText('second');
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('one applying action runs by its key, none lets the key through, and a raw handler comes first', async ({ page }) => {
  const { errors } = await start(page);
  await page.keyboard.type('+a');
  await page.keyboard.press('Enter');
  await expect(editor(page)).toHaveText('+a[A]');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // No action applies: Enter splits the paragraph.
  await retype(page, 'plain');
  await page.keyboard.press('Enter');
  await expect(editor(page).locator('p')).toHaveCount(2);

  // A module's raw handler takes the key before the actions bound to it.
  await retype(page, '+a +b +raw');
  await page.keyboard.press('Enter');
  await expect(editor(page)).toHaveText('+a +b +raw[raw]');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});
