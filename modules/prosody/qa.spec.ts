// Walks the qa.md steps this spec covers: edited by hand
// for small changes, rewritten or deleted when qa.md moves on.
import { expect, test, type Page } from '@playwright/test';
import { editor, newDocument, openApp, setModule } from '../../e2e/app.js';

const stanzaMeter = (page: Page) => page.getByRole('combobox', { name: 'Stanza meter' });

test('3b: a stanza whose first line becomes a heading and back keeps its meter', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('The curfew tolls the knell of parting day');
  await page.keyboard.press('Enter');
  await page.keyboard.type("The lowing herd wind slowly o'er the lea");
  await setModule(page, 'prosody', true);
  await setModule(page, 'word-processor', true);

  const first = editor(page).locator('p').first();
  await first.click({ position: { x: 30, y: 6 } });
  await page.waitForTimeout(200);
  await stanzaMeter(page).click();
  await page.getByRole('option', { name: 'Trochaic tetrameter', exact: true }).click();
  await expect(stanzaMeter(page)).toContainText('Trochaic tetrameter');

  await first.click({ position: { x: 30, y: 6 } });
  await page.waitForTimeout(200);
  await page.keyboard.press('ControlOrMeta+Alt+Digit1');
  await expect(editor(page).locator('h1')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Alt+Digit0');
  await expect(editor(page).locator('h1')).toHaveCount(0);

  await expect(stanzaMeter(page)).toContainText('Trochaic tetrameter');
  expect(errors).toEqual([]);
});
