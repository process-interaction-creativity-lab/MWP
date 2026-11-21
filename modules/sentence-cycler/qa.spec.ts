// Walks qa.md steps 1 and 7: kept with the module, edited by hand
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

test('hovering a paragraph shows the cycle button', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await essay(page);
  await setModule(page, 'sentence-cycler', true);

  // Step 1: hover a multi-sentence paragraph far down: the button shows beside it; move off: it goes.
  const cycle = page.getByRole('button', { name: 'Cycle sentences' });
  const para = editor(page).locator('p', { hasText: COMMENTED[2]! });
  await para.scrollIntoViewIfNeeded();
  await para.hover();
  await expect(cycle).toBeVisible();
  const [p, b] = [(await para.boundingBox())!, (await cycle.boundingBox())!];
  expect(b.x).toBeGreaterThanOrEqual(p.x + p.width - 2);
  expect(Math.abs(b.y - p.y)).toBeLessThan(12);

  await page.mouse.move(2, 400);
  await expect(cycle).toHaveCount(0);
  expect(errors).toEqual([]);
});

const paragraph = (page: Page) => editor(page).locator('p').first();

/** The tint behind each sentence of the hovered paragraph, in text order. */
const tints = (page: Page) =>
  editor(page)
    .locator('span[style*="background-color"]')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));

async function hover(page: Page) {
  await page.mouse.move(0, 0);
  await paragraph(page).hover({ position: { x: 30, y: 6 } });
}

test('7b: a cycled paragraph turned into a heading and back keeps its text and colours', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('Alpha one. Beta two. Gamma three.');
  await setModule(page, 'sentence-cycler', true);
  await setModule(page, 'word-processor', true);

  await hover(page);
  await page.getByRole('button', { name: 'Cycle sentences' }).click();
  await expect(paragraph(page)).toHaveText('Beta two. Gamma three. Alpha one.');
  const before = await tints(page);
  expect(new Set(before).size).toBe(3);

  await paragraph(page).click({ position: { x: 30, y: 6 } });
  await page.waitForTimeout(200);
  await page.keyboard.press('ControlOrMeta+Alt+Digit1');
  await expect(editor(page).locator('h1')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Alt+Digit0');
  await expect(editor(page).locator('h1')).toHaveCount(0);
  await expect(paragraph(page)).toHaveText('Beta two. Gamma three. Alpha one.');

  await hover(page);
  await expect.poll(() => tints(page)).toEqual(before);
  expect(errors).toEqual([]);
});

/** Two panes on one document, the module in both, the document typed in the first. */
async function twoPanes(page: Page, lines: string[]) {
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type(lines.join('\n'));
  await setModule(page, 'resizable-split', true);
  const panes = page.locator('.resizable-split-child');
  await expect(panes).toHaveCount(2);
  for (const i of [0, 1]) {
    await panes.nth(i).locator('.ProseMirror, .mwps-empty').first().click();
    await pickDocument(page, 'Untitled 1');
  }
  for (const i of [1, 2]) {
    await setModule(page, 'sentence-cycler', true, (await page.getByRole('tab').nth(i).getAttribute('data-tab'))!);
  }
  return { left: panes.nth(0).locator('.ProseMirror'), right: panes.nth(1).locator('.ProseMirror') };
}

test('a cycle clicked in the other pane is undone by Cmd-Z, not the typing in this one (steps 4, 8)', async ({ page }) => {
  const { errors } = await openApp(page);
  const { left, right } = await twoPanes(page, ['Alpha one. Beta two. Gamma three.', 'Tail']);

  await left.locator('p').nth(1).click();
  await caretToEnd(left);
  await page.keyboard.type(' LEFTEDIT');
  await expect(right).toContainText('Tail LEFTEDIT');

  await right.locator('p').first().hover();
  await page.locator('.sentence-cycler-button').first().click();
  await expect(right.locator('p').first()).toHaveText('Beta two. Gamma three. Alpha one.');
  await expect(left.locator('p').first()).toHaveText('Beta two. Gamma three. Alpha one.');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(right.locator('p').first()).toHaveText('Alpha one. Beta two. Gamma three.');
  await expect(right).toContainText('Tail LEFTEDIT');
  expect(errors).toEqual([]);
});
