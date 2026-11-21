import { expect, test } from '@playwright/test';
import { editor, newDocument, openApp, setModule } from './app.js';

// word-processor is an anchor fixture: its control names change only
// together with this journey.
test('a writer formats a short piece with the toolbar and keys, and undoes a change', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await setModule(page, 'word-processor', true);
  await editor(page).click();
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const select = (name: string) => page.getByRole('combobox', { name });

  // A heading, chosen before typing; the select hands focus back.
  await select('Heading level').selectOption('Heading 1');
  await page.keyboard.type('Notes');
  await expect(editor(page).locator('h1')).toHaveText('Notes');
  await expect(select('Heading level')).toHaveValue('1');

  // Bold from the button shapes what is typed next, and shows pressed;
  // its key turns it off, and the button follows.
  await page.keyboard.press('Enter');
  await expect(select('Heading level')).toHaveValue('0');
  await page.keyboard.type('One ');
  await button('Bold').click();
  await expect(button('Bold')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('loud');
  await page.keyboard.press('ControlOrMeta+b');
  await expect(button('Bold')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.type(' word.');
  await expect(editor(page).locator('p strong')).toHaveText('loud');
  await expect(editor(page).locator('p')).toHaveText('One loud word.');

  // A selection takes a size; the caret inside shows it.
  await editor(page).locator('p').click({ clickCount: 3 });
  await select('Font size').selectOption('24');
  await expect(editor(page).locator('p [style*="font-size: 24px"]').first()).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(select('Font size')).toHaveValue('24');

  // A list from the button, nested with Tab; undo takes the nesting back
  // in one step.
  await page.keyboard.press('Enter');
  await button('Bullet list').click();
  await expect(button('Bullet list')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  await page.keyboard.press('Tab');
  await expect(editor(page).locator('ul ul li')).toHaveText('second');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor(page).locator('ul ul')).toHaveCount(0);
  await expect(editor(page).locator('ul > li')).toHaveText(['first', 'second']);

  // Focus never left the text.
  await expect(editor(page)).toBeFocused();
  expect(errors).toEqual([]);
});
