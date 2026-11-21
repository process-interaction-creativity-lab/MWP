import { expect, test } from '@playwright/test';
import { caretToEnd, documentPicker, editor, newDocument, openApp, pickDocument } from './app.js';

test('typed text is still there after a reload', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('Written in a browser, kept by OPFS.');

  // Past the vault's debounce, so this is the steady state.
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(editor(page)).toHaveText('Written in a browser, kept by OPFS.');
  await expect(documentPicker(page)).toHaveText('Untitled 1');
  expect(errors).toEqual([]);
});

test('an edit made just before a reload is saved on the way out', async ({ page }) => {
  await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('no time to wait');
  // Inside the debounce window: only the flush on hide can save this.
  await page.reload();
  await expect(editor(page)).toHaveText('no time to wait');
});

test('documents in two projects stay apart', async ({ page }) => {
  await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('first project');

  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByPlaceholder('Search, or name a new project…').fill('Second');
  await page.getByRole('option', { name: 'Create project “Second”' }).click();
  await expect(page.getByText("No document. Pick one at the toolbar's left.")).toBeVisible();
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('second project');

  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByRole('option', { name: 'My project' }).click();
  await expect(editor(page)).toHaveText('first project');
});

test('the document picker renames and deletes; deleting the shown document empties its pane', async ({ page }) => {
  await openApp(page);
  await newDocument(page);
  await newDocument(page);

  await documentPicker(page).click();
  await page.getByRole('button', { name: 'Rename Untitled 1' }).click();
  await page.getByLabel('Document name').fill('Chapter one');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-document="Chapter one"]')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(documentPicker(page)).toHaveText('Untitled 2');
  await documentPicker(page).click();
  await page.getByRole('button', { name: 'Delete Untitled 2' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(documentPicker(page)).toHaveText('Select a document');
  await expect(editor(page)).toHaveCount(0);

  await pickDocument(page, 'Chapter one');
  await expect(editor(page)).toBeVisible();
  await documentPicker(page).click();
  await expect(page.locator('[data-document]')).toHaveCount(1);
});

test('a project opens in one tab at a time; a second tab takes it over with every word', async ({ page, context }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  // Inside the debounce window: handing over must write this out.
  await page.keyboard.type('Written in the first tab.');

  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByText('“My project” is open in another tab.', { exact: false })).toBeVisible();
  await expect(second.locator('.mwps-pane .ProseMirror')).toHaveCount(0);

  await second.getByRole('button', { name: 'Use it in this tab' }).click();
  await expect(editor(second)).toHaveText('Written in the first tab.');
  await expect(page.getByText('was opened in another tab', { exact: false })).toBeVisible();
  await expect(editor(page)).toHaveCount(0);

  // Writing in the second tab, then taking the project back, keeps it too.
  await editor(second).click();
  await caretToEnd(editor(second).first());
  await second.keyboard.type(' And in the second.');
  await page.getByRole('button', { name: 'Use it in this tab' }).click();
  await expect(editor(page)).toHaveText('Written in the first tab. And in the second.');
  expect(errors).toEqual([]);
});
