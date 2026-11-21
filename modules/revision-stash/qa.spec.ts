// Walks qa.md: kept with the module, edited by hand for
// small changes, rewritten or deleted when qa.md moves on. Covers the step
// that has bitten so far (the panel covering the text it manages).
import { expect, test, type Page } from '@playwright/test';
import { editor, newDocument, openApp, setModule } from '../../e2e/app.js';

const ID = 'revision-stash';

async function setup(page: Page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  const { errors } = await openApp(page);
  await newDocument(page);
  await setModule(page, ID, true);
  await editor(page).click();
  // Sentences long enough to run the full width of the page, as prose does.
  await page.keyboard.type(
    'Alpha comes first here and goes on for long enough to fill a line of the page. ' +
      'Beta comes second there and also goes on for long enough to fill more than one line of the page. ' +
      'Gamma comes last of all and closes the paragraph with a few more words.',
  );
  return errors;
}

test('the panel opened from a badge sits beside the text, not over the stashed sentence', async ({ page }, info) => {
  const errors = await setup(page);

  // 2. Stash the three sentences, keeping the middle one live.
  await page.keyboard.press('ControlOrMeta+KeyA');
  await page.getByRole('button', { name: 'Stash alternatives' }).click();
  await page.getByRole('button', { name: /^Beta comes second/ }).click();
  const live = editor(page).locator('.revision-stash-live');
  await expect(live).toContainText('Beta comes second');

  // 3. Click the badge: the panel opens.
  await editor(page).locator('.revision-stash-badge').click();
  const panel = page.getByRole('region', { name: 'Stash alternatives' });
  await expect(panel).toBeVisible();
  await page.screenshot({ path: info.outputPath('panel-open.png') });

  // It sits beside the live text: no overlap with the text, and it is
  // still inside the viewport.
  const p = (await panel.boundingBox())!;
  const t = (await live.boundingBox())!;
  const apart = p.x >= t.x + t.width || t.x >= p.x + p.width || p.y >= t.y + t.height || t.y >= p.y + p.height;
  expect(apart, `panel ${JSON.stringify(p)} overlaps live text ${JSON.stringify(t)}`).toBe(true);
  expect(p.x + p.width).toBeLessThanOrEqual(1400);

  // The text is still clickable with the panel open.
  await live.click();
  await expect(panel).toBeVisible();
  expect(errors).toEqual([]);
});
