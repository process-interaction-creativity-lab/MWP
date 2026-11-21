import { expect, test, type Page } from '@playwright/test';
import { editor, openApp, setModule, newDocument } from './app.js';


async function start(page: Page) {
  const app = await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-actions', true);
  await editor(page).click();
  return app;
}

test('an action runs from the palette, and by its key in either letter case', async ({ page }) => {
  const { errors } = await start(page);
  await page.keyboard.press('ControlOrMeta+/');
  await page.getByRole('dialog').getByRole('combobox').fill('stam');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(editor(page)).toHaveText('stamp');

  // The palette put focus back in the pane, so typing goes on.
  await page.keyboard.type(' ');
  await page.keyboard.press('ControlOrMeta+Shift+s');
  await page.keyboard.press('ControlOrMeta+Shift+S');
  await expect(editor(page)).toHaveText('stamp stampstamp');
  expect(errors).toEqual([]);
});

test('a greyed action does nothing, from the palette or by key', async ({ page }) => {
  await start(page);
  await page.keyboard.press('ControlOrMeta+/');
  // Runnable actions show; greyed ones fold into a row that opens them.
  await expect(page.getByRole('option')).toHaveText([/Stamp/, /Ping/, /Loud/, /1 unavailable/]);
  await page.getByRole('option', { name: /1 unavailable/ }).click();
  const never = page.getByRole('option', { name: /Never/ });
  await expect(never).toHaveAttribute('aria-disabled', 'true');
  await never.click({ force: true });
  // A search finds greyed actions without opening the fold.
  await page.keyboard.press('Escape');
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+/');
  await page.getByRole('dialog').getByRole('combobox').fill('never');
  await expect(page.getByRole('option')).toHaveText([/Never/]);
  await page.keyboard.press('Escape');
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Shift+e');
  await expect(page.locator('body')).not.toHaveAttribute('data-e2e-never-ran', 'yes');
});

test('a module procedure runs from the palette', async ({ page }) => {
  await start(page);
  await page.keyboard.press('ControlOrMeta+/');
  await page.getByRole('option', { name: /Ping/ }).click();
  await expect(page.locator('body')).toHaveAttribute('data-e2e-pings', '1');
});

test("a module's own button runs its action and shows what the palette shows", async ({ page }) => {
  const { errors } = await start(page);
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await expect(button('Never')).toBeDisabled();
  await expect(button('Stamp')).toHaveAttribute('aria-pressed', 'false');

  // A click runs the command, and the button follows the pane's state.
  await button('Stamp').click();
  await expect(editor(page)).toHaveText('stamp');
  await expect(button('Stamp')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('!');
  await expect(button('Stamp')).toHaveAttribute('aria-pressed', 'false');

  // Run from the palette, the button shows it; clicked, it runs it back.
  await page.keyboard.press('ControlOrMeta+/');
  await page.getByRole('option', { name: /Loud/ }).click();
  await expect(button('Loud')).toHaveAttribute('aria-pressed', 'true');
  await button('Loud').click();
  await expect(button('Loud')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('a project module placed in the project tab opens a dialog from the project menu, and stays with its project', async ({ page }) => {
  await start(page);
  const project = page.getByRole('button', { name: 'Project' });
  await project.click();
  await expect(page.locator('[data-action="Count documents…"]')).toHaveCount(0);
  await page.locator('[data-module="e2e-project"]').click();
  await expect(page.locator('[data-module="e2e-project"]')).toHaveAttribute('data-placed', 'true');
  await page.keyboard.press('Escape');
  await project.click();
  await page.locator('[data-action="Count documents…"]').click();
  const dialog = page.getByRole('dialog', { name: 'Documents' });
  await expect(dialog).toContainText('This project has 1 documents.');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+/');
  await page.getByRole('option', { name: /Count documents/ }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');

  // Kept in the project's files: back after a reload, not in another project.
  await page.reload();
  await project.click();
  await expect(page.locator('[data-module="e2e-project"]')).toHaveAttribute('data-placed', 'true');
  await page.getByPlaceholder('Search, or name a new project…').fill('Other');
  await page.getByRole('option', { name: 'Create project “Other”' }).click();
  await expect(project).toHaveText(/Other/);
  await project.click();
  await expect(page.locator('[data-module="e2e-project"]')).toHaveAttribute('data-placed', 'false');
});
