// Walks qa.md steps 1 and 2: kept with the module, edited by hand
// for small changes, rewritten or deleted when qa.md moves on.
import { expect, test, type Page } from '@playwright/test';
import { caretToEnd, editor, newDocument, openApp, pickDocument, setModule } from '../../e2e/app.js';

const COMMENTED = ['Paragraph 1 opens the essay', 'paragraph 15 has a quiet sentence', 'paragraph 28 has a quiet sentence'];

/** A long essay, pasted: far down the page is where a misplaced margin note shows. */
async function essay(page: Page) {
  const paras = Array.from({ length: 30 }, (_, i) =>
    i === 0
      ? `${COMMENTED[0]}. Many companies now allow staff to work from home, and this long sentence keeps going so that the paragraph wraps onto a second line.`
      : `Paragraph ${i + 1} has a quiet sentence here. It goes on for a while so that the paragraph is long enough to wrap onto more than one line, which is what real paragraphs do.`,
  );
  for (const i of [14, 27]) paras[i] = paras[i]!.replace('Paragraph', 'paragraph');
  await editor(page).click();
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    document.querySelector('.ProseMirror')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, paras.join('\n\n'));
  await expect(editor(page)).toContainText('Paragraph 30');
}

test('an add-note control beside each paragraph', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await essay(page);
  await setModule(page, 'glas-columns', true);

  // Step 1: an "add note" control beside each paragraph, in the page's margin.
  const adds = page.getByRole('button', { name: 'Add note' });
  await expect(adds).toHaveCount(30);
  const para = editor(page).locator('p').nth(1);
  await para.scrollIntoViewIfNeeded();
  const [p, b] = [(await para.boundingBox())!, (await adds.nth(1).boundingBox())!];
  expect(b.x).toBeGreaterThanOrEqual(p.x + p.width - 2);
  expect(Math.abs(b.y - p.y)).toBeLessThan(12);

  // Step 2: adding puts the caret in the new note, level with its paragraph.
  await adds.nth(1).click();
  await page.keyboard.type('A gloss');
  await expect(editor(page)).toContainText('A gloss');
  const note = editor(page).getByText('A gloss');
  expect(Math.abs((await note.boundingBox())!.y - (await para.boundingBox())!.y)).toBeLessThan(12);

  expect(errors).toEqual([]);
});

test('an added note is one undo step on the pane it was added in, after typing in the other pane (steps 2, 6)', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('Alpha paragraph\nBeta paragraph');
  await setModule(page, 'resizable-split', true);
  const panes = page.locator('.resizable-split-child');
  await expect(panes).toHaveCount(2);
  for (const i of [0, 1]) {
    await panes.nth(i).locator('.ProseMirror, .mwps-empty').first().click();
    await pickDocument(page, 'Untitled 1');
  }
  const left = panes.nth(0).locator('.ProseMirror');
  const right = panes.nth(1).locator('.ProseMirror');
  await setModule(page, 'glas-columns', true, (await page.getByRole('tab').nth(2).getAttribute('data-tab'))!);

  await left.locator('p').nth(1).click();
  await caretToEnd(left);
  await page.keyboard.type(' LEFTEDIT');
  await expect(right).toContainText('Beta paragraph LEFTEDIT');

  await right.getByRole('button', { name: 'Add note' }).first().click();
  await expect(right.locator('.glas-columns-notes')).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(right.locator('.glas-columns-notes')).toHaveCount(0);
  await expect(right).toContainText('Beta paragraph LEFTEDIT');
  expect(errors).toEqual([]);
});
