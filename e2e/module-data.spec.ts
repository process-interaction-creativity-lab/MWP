// Module data: e2e-cast keeps a cast list after the writing and draws it
// as a card in a side view, where the pane's other modules work too.
import { expect, test } from '@playwright/test';
import { editor, newDocument, openApp, setModule } from './app.js';

test("a module's data card sits in a side view: others' modules and the drop cursor work there, and the main editor can't reach it", async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('one mwps two');
  await setModule(page, 'e2e-cast', true);
  await setModule(page, 'e2e-highlight', true);

  const side = page.locator('.mwps-side-view').filter({ has: page.locator('.e2e-cast-card, button:has-text("Start a cast list")') });
  await side.getByRole('button', { name: 'Start a cast list' }).click();
  const cast = side.locator('.e2e-cast-card .ProseMirror');
  await expect(cast).toHaveText('Ada, a pilot who will not land');
  // The main editor shows the writing alone.
  await expect(editor(page)).toHaveText('one mwps two');

  // Typing in the card, and another module's highlights there.
  await cast.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' (mwps)');
  await expect(cast).toHaveText('Ada, a pilot who will not land (mwps)');
  await expect(cast.locator('.e2e-highlight')).toHaveText('mwps');

  // The pane's overlay stays on the pane while the caret is in the card.
  await expect(page.locator('.e2e-cast-overlay')).toHaveCount(1);
  await expect(side.locator('.e2e-cast-overlay')).toHaveCount(0);
  await expect(page.locator('.mwps-page .mwps-overlay .e2e-cast-overlay')).toBeVisible();

  // The drop cursor shows over the card while something is dragged there.
  const box = (await cast.locator('p').first().boundingBox())!;
  await cast.evaluate((el, at) => {
    const event = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, dataTransfer: new DataTransfer() });
    el.dispatchEvent(event);
  }, { x: box.x + 20, y: box.y + box.height / 2 });
  await expect(side.locator('.prosemirror-dropcursor-inline, .prosemirror-dropcursor-block')).toHaveCount(1);
  await cast.evaluate((el) => el.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body })));

  // Cmd-A then Delete in the main editor empties the writing, not the cast.
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await expect(editor(page)).toHaveText('');
  await expect(cast).toHaveText('Ada, a pilot who will not land (mwps)');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor(page)).toHaveText('one mwps two');

  // Delete at the writing's end doesn't reach the data after it.
  // Undo brought back the whole selection; ProseMirror reads the one an
  // arrow key leaves on the browser's next selectionchange.
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  await page.keyboard.press('Delete');
  await page.keyboard.press('Delete');
  await page.keyboard.type('!');
  await expect(editor(page)).toHaveText('one mwps two!');
  await expect(cast).toHaveText('Ada, a pilot who will not land (mwps)');

  // The caret landing in a card whose side tab is closed opens the tab.
  await page.getByRole('button', { name: 'e2e-cast: Cast' }).click();
  await expect(side).toHaveCount(0);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+/');
  await page.getByRole('dialog').getByRole('combobox').fill('Go to cast');
  await page.keyboard.press('Enter');
  await expect(side).toHaveCount(1);
  await expect(cast).toHaveText('Ada, a pilot who will not land (mwps)');
  expect(errors).toEqual([]);
});
