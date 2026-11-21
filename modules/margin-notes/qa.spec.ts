// Walks qa.md: kept with the module, edited by hand for
// small changes, rewritten or deleted when qa.md moves on. Covers the steps
// that have bitten so far (adding a note, leaving it by a click).
import { expect, test, type Page } from '@playwright/test';
import { editor, newDocument, openApp, setModule } from '../../e2e/app.js';

const ID = 'margin-notes';
const field = (page: Page) => page.getByRole('textbox', { name: 'Margin note' });

async function setup(page: Page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  const { errors } = await openApp(page);
  await newDocument(page);
  await setModule(page, ID, true);
  await editor(page).click();
  await page.keyboard.type('First paragraph with words in it.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second paragraph is down here.');
  return errors;
}

test('leaving a note by a click into another paragraph puts the caret there on the first click', async ({ page }) => {
  const errors = await setup(page);

  // 1. Select a word, add a note: the caret is in the new card.
  await editor(page).getByText('First paragraph').dblclick({ position: { x: 150, y: 5 } });
  // The note is added for the selection ProseMirror holds: wait until the bubble over it shows.
  await expect(page.locator('.mwps-selection-bubble')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Alt+KeyM');
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('check this');

  // 2. Click into the other paragraph and type: the words land where the click was.
  const second = editor(page).locator('p', { hasText: 'Second paragraph' });
  const box = (await second.boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  await page.keyboard.type('ZZ');
  await expect(editor(page).locator('p').nth(1)).toContainText('ZZ');
  await expect(editor(page).locator('p').first()).not.toContainText('ZZ');
  await expect(editor(page).locator('p').first()).toContainText('First paragraph');

  // The note kept what was typed in it, written when it was left.
  await expect(field(page)).toHaveValue('check this');
  expect(errors).toEqual([]);
});

test('a note body typed and left by a click is one undo step, then the note itself is one', async ({ page }) => {
  const errors = await setup(page);
  await editor(page).getByText('First paragraph').dblclick({ position: { x: 150, y: 5 } });
  // The note is added for the selection ProseMirror holds: wait until the bubble over it shows.
  await expect(page.locator('.mwps-selection-bubble')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Alt+KeyM');
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('check this');
  const second = editor(page).locator('p', { hasText: 'Second paragraph' });
  const box = (await second.boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  await expect(field(page)).not.toBeFocused();

  await page.keyboard.press('ControlOrMeta+KeyZ');
  await expect(field(page)).toHaveValue('');
  await expect(field(page)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+KeyZ');
  await expect(field(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+KeyZ');
  await expect(field(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});
