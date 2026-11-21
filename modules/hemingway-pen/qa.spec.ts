// Walks qa.md: kept with the module, edited by hand
// for small changes, rewritten or deleted when qa.md moves on.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { caretToEnd, editor, newDocument, openApp, pickDocument, setModule } from '../../e2e/app.js';

const SENTENCE = 'The very old dog quickly ran across the wide field.';

/** Centre of the first occurrence of `text` in `root`, in page coordinates. */
async function centreOf(root: Locator, text: string) {
  return root.evaluate((el, needle) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode() as Text | null; t; t = walk.nextNode() as Text | null) {
      const at = t.data.indexOf(needle);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(t, at);
      range.setEnd(t, at + needle.length);
      const r = range.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    throw new Error('no such text');
  }, text);
}

async function stroke(page: Page, root: Locator, word: string) {
  const { x, y } = await centreOf(root, word);
  await page.mouse.move(x - 6, y);
  await page.mouse.down();
  await page.mouse.move(x + 2, y, { steps: 3 });
  await page.mouse.up();
}

/** Two panes on one document, hemingway-pen in both. */
async function twoPanes(page: Page) {
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type(SENTENCE);
  await setModule(page, 'resizable-split', true);
  const panes = page.locator('.resizable-split-child');
  await expect(panes).toHaveCount(2);
  for (const i of [0, 1]) {
    await panes.nth(i).locator('.ProseMirror, .mwps-empty').first().click();
    await pickDocument(page, 'Untitled 1');
  }
  for (const i of [1, 2]) {
    await setModule(page, 'hemingway-pen', true, (await page.getByRole('tab').nth(i).getAttribute('data-tab'))!);
  }
  return { left: panes.nth(0).locator('.ProseMirror'), right: panes.nth(1).locator('.ProseMirror') };
}

test('words struck in one pane come back with Cmd-Z after typing in the other (step 5)', async ({ page }) => {
  const { errors } = await openApp(page);
  const { left, right } = await twoPanes(page);

  await left.click();
  await caretToEnd(left);
  await page.keyboard.type(' LEFTEDIT');
  await expect(right).toContainText('LEFTEDIT');

  await page.getByRole('button', { name: 'Pen' }).click();
  await stroke(page, right, 'old');
  await stroke(page, right, 'quickly');
  await expect(right).not.toContainText('old');
  await expect(right).not.toContainText('quickly');
  await page.keyboard.press('Escape');
  await expect(page.locator('.hemingway-pen-layer')).toHaveCount(0);
  await page.waitForTimeout(100);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(right).toContainText('quickly');
  await expect(right).not.toContainText('old');
  await expect(right).toContainText('LEFTEDIT');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(right).toContainText('old');
  await expect(left).toContainText('LEFTEDIT');
  expect(errors).toEqual([]);
});
