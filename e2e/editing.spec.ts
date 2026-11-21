import { expect, test, type Page } from '@playwright/test';
import { editor, openApp, setModule, newDocument } from './app.js';


// The e2e build's host, only for what the UI can't do yet (installing a
// module at run time); move to the real UI once it exists.
const inPage = (page: Page, action: 'install' | 'uninstall', id: string) =>
  page.evaluate(
    async ([action, id]) => {
      const { host, fetchModule } = (window as never as { mwpsE2E: { host: any; fetchModule: any } }).mwpsE2E;
      if (action === 'install') host.install(await fetchModule(id));
      else host.uninstall(id);
    },
    [action, id] as const,
  );

test("a module's plugin draws in the pane, and its key redraws it", async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-highlight', true);
  await editor(page).click();
  await page.keyboard.type('the mwps editor');
  await expect(editor(page).locator('.e2e-highlight')).toHaveText('mwps');

  await page.keyboard.press('ControlOrMeta+Shift+h');
  await expect(editor(page).locator('.e2e-highlight')).toHaveCount(0);

  // A module value set just before a reload is kept (it defaults to on).
  await page.reload();
  await expect(editor(page)).toHaveText('the mwps editor');
  await expect(editor(page).locator('.e2e-highlight')).toHaveCount(0);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Shift+h');
  await expect(editor(page).locator('.e2e-highlight')).toHaveCount(1);

  await setModule(page, 'e2e-highlight', false);
  await expect(editor(page).locator('.e2e-highlight')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('installing and removing a module with types while writing keeps the text', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('before');

  await inPage(page, 'uninstall', 'e2e-parts');
  await expect(page.getByText('undo history was reset')).toBeVisible();
  await expect(editor(page)).toHaveText('before');
  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' between');

  await inPage(page, 'install', 'e2e-parts');
  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' after');
  await expect(editor(page)).toHaveText('before between after');

  await page.waitForTimeout(700);
  await page.reload();
  await expect(editor(page)).toHaveText('before between after');
  expect(errors).toEqual([]);
});
