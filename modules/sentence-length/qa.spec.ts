// Walks qa.md steps 2 and 4: kept with the module,
// edited by hand for small changes, rewritten or deleted when qa.md moves on.
import { expect, test } from '@playwright/test';
import { editor, newDocument, openApp, setModule } from '../../e2e/app.js';

test('2, 4: the strip counts sentences, names its shortest, median and longest swatches, and reads 0 with none', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await setModule(page, 'sentence-length', true);
  await editor(page).click();
  await page.keyboard.type('Go now. The dog runs home fast. A much longer sentence keeps going for quite a while here.');

  // 2: the total, then each swatch named on hover with its word count.
  const legend = page.getByRole('group', { name: 'Sentence length legend' });
  await expect(legend).toContainText('Sentences 3');
  for (const name of ['Shortest: 2 words', 'Median: 5 words', 'Longest: 11 words']) {
    await expect(legend.getByRole('img', { name })).toHaveAttribute('title', name);
  }
  // Typing updates it.
  await page.keyboard.type(' One.');
  await expect(legend).toContainText('Sentences 4');
  await expect(legend.getByRole('img', { name: 'Shortest: 1 word' })).toBeVisible();

  // 4: with everything deleted, the strip reads "Sentences 0".
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await expect(page.getByText('Sentences 0')).toBeVisible();
  expect(errors).toEqual([]);
});
