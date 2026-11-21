import { expect, test } from '@playwright/test';
import { documentPicker, editor, isPlaced, newDocument, openApp, setModule, tab } from './app.js';


test('a module placed on the pane runs, and stops when unplaced', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-marker', true);
  await expect(page.locator('body')).toHaveAttribute('data-e2e-marker', '1');
  await setModule(page, 'e2e-marker', false);
  await expect(page.locator('body')).toHaveAttribute('data-e2e-marker', '0');
  expect(errors).toEqual([]);
});

test('a throwing module is turned off with a toast; the others keep running', async ({ page }) => {
  await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-marker', true);
  await setModule(page, 'e2e-thrower', true);

  await expect(page.getByText('e2e-thrower stopped working and was turned off')).toBeVisible();
  // The pane's tab offers to turn it back on.
  await tab(page).click();
  await expect(page.getByRole('button', { name: 'Turn on' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-e2e-marker', '1');

  // Writing still works.
  await editor(page).click();
  await page.keyboard.type('still writing');
  await expect(editor(page)).toHaveText('still writing');
});

test('an error thrown from a module timer is traced to that module', async ({ page }) => {
  await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-marker', true);
  await setModule(page, 'e2e-async-thrower', true);
  await expect(page.getByText('e2e-async-thrower stopped working and was turned off')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-e2e-marker', '1');
});

test("a pane plugin view that edits is turned off, and the edit doesn't happen", async ({ page }) => {
  await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-marker', true);
  await setModule(page, 'e2e-view-editor', true);
  await editor(page).click();
  await page.keyboard.type('edit me');
  await expect(page.getByText('e2e-view-editor stopped working and was turned off')).toBeVisible();
  await expect(editor(page)).toHaveText('edit me');
  await expect(page.locator('body')).toHaveAttribute('data-e2e-marker', '1');
});

test('placements are remembered across a reload', async ({ page }) => {
  await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-marker', true);
  await page.reload();
  expect(await isPlaced(page, 'e2e-marker')).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-e2e-marker', '1');
});

test('?modules= opens a scratch tab with only those modules, kept over a reload, apart from the real project', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('real writing');
  await setModule(page, 'e2e-marker', true);

  // Only the named modules load, in a project of the tab's own.
  await page.goto('/?modules=e2e-highlight,no-such-module');
  await expect(page.locator('.mwps-app')).toBeVisible();
  await expect(page.getByText('no-such-module could not load')).toBeVisible();
  await tab(page).click();
  await expect(page.locator('[data-module="e2e-highlight"]')).toBeVisible();
  await expect(page.locator('[data-module="e2e-marker"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await documentPicker(page).click();
  await expect(page.locator('[data-document]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The scratch tab keeps its writing and placements over a reload, without asking.
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('scratch writing');
  await setModule(page, 'e2e-highlight', true);
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    void dialog.accept();
  });
  await page.reload();
  await expect(editor(page)).toHaveText('scratch writing');
  expect(await isPlaced(page, 'e2e-highlight')).toBe(true);
  expect(dialogs).toEqual([]);

  // Another module set starts over.
  await page.goto('/?modules=e2e-highlight,e2e-marker');
  await expect(page.locator('.mwps-app')).toBeVisible();
  await documentPicker(page).click();
  await expect(page.locator('[data-document]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The real project is as it was.
  await page.goto('/');
  await expect(editor(page)).toHaveText('real writing');
  expect(await isPlaced(page, 'e2e-marker')).toBe(true);
  expect(await isPlaced(page, 'e2e-highlight')).toBe(false);
  expect(errors.filter((e) => !e.includes('no-such-module'))).toEqual([]);
});
