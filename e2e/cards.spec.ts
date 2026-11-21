// Journeys through cards (part panes), using the test-only e2e-cards.
import { expect, test } from '@playwright/test';
import { editor, newDocument, openApp, setModule, tab } from './app.js';

test('cards show one block each, edit it, split on Enter, refuse a join, and Cmd-A selects one block', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('one two');
  await page.keyboard.press('Enter');
  await page.keyboard.type('three');
  await setModule(page, 'e2e-cards', true);

  const cards = page.locator('.e2e-card .ProseMirror');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveText('one two');
  await expect(cards.nth(1)).toHaveText('three');

  // Typing in a card edits its block; Enter splits it, and the caret goes
  // into the new card the second half makes.
  await cards.nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.press('Enter');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(1)).toHaveText('three!');
  await page.keyboard.type('four');
  await expect(cards.nth(2)).toHaveText('four');

  // Backspace at a card's start would join it to the card before: refused.
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(1)).toHaveText('three!');

  // Cmd-A then typing replaces this block's text, not the document.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('five');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toHaveText('one two');
  await expect(cards.nth(1)).toHaveText('three!');
  await expect(cards.nth(2)).toHaveText('five');

  // A layout's component in its tab's menu takes its own keys: Enter adds
  // a card rather than choosing a menu row.
  await tab(page).click();
  await page.getByLabel('New card').fill('six');
  await page.keyboard.press('Enter');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(3)).toHaveText('six');
  await page.keyboard.press('Escape');

  // Undo is the pane's: Cmd-Z in the first card undoes the card added last,
  // outside it, and redo brings it back.
  await cards.nth(0).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(cards).toHaveCount(3);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(cards).toHaveCount(4);

  // Turned off, the editor shows the document the cards edited.
  await setModule(page, 'e2e-cards', false);
  await expect(editor(page)).toHaveText('one twothree!fivesix');
  expect(errors).toEqual([]);
});

// Cards are input surfaces of their pane: the pane's modules work in them in
// the document's positions, as if the layout weren't on.
test('other modules work inside the second card as in the plain editor', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('first mwps card');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second mwps card');
  await setModule(page, 'e2e-surface', true);
  await setModule(page, 'word-processor', true);
  await setModule(page, 'e2e-cards', true);

  const cards = page.locator('.e2e-card .ProseMirror');
  await expect(cards).toHaveCount(2);
  // A decoration computed on the whole document lands on the right words.
  await expect(cards.nth(0).locator('.e2e-surface-deco')).toHaveText('mwps');
  await expect(cards.nth(1).locator('.e2e-surface-deco')).toHaveText('mwps');
  // A widget at the document's start shows only in the card that holds it.
  await expect(cards.nth(0).locator('.e2e-surface-start')).toHaveCount(1);
  await expect(cards.nth(1).locator('.e2e-surface-start')).toHaveCount(0);

  // A key action of another module, on the card's selection.
  await cards.nth(1).locator('p').click({ clickCount: 3 });
  await page.keyboard.press('ControlOrMeta+b');
  await expect(cards.nth(1).locator('strong')).toHaveText('second mwps card');
  await expect(cards.nth(0).locator('strong')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(cards.nth(1).locator('strong')).toHaveCount(0);

  // A text-input hook reading the pane's state.
  await cards.nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type('--');
  await expect(cards.nth(1)).toHaveText('second mwps card—');

  // p.document.edit with the card's selection marks the right text.
  await cards.nth(1).locator('p').click({ clickCount: 3 });
  await page.keyboard.press('ControlOrMeta+Shift+m');
  await expect(cards.nth(1).locator('strong')).toHaveText('second mwps card—');
  await expect(cards.nth(0).locator('strong')).toHaveCount(0);

  // A hook asking the view where the caret is gets the right card's answer.
  await cards.nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+Shift+c');
  const box = (await cards.nth(1).boundingBox())!;
  const [x, y] = (await page.evaluate(() => document.body.dataset.e2eCoords!)).split(',').map(Number);
  expect(x).toBeGreaterThanOrEqual(box.x);
  expect(y).toBeGreaterThanOrEqual(box.y);
  expect(y).toBeLessThanOrEqual(box.y + box.height);
  expect(await page.evaluate(() => document.body.dataset.e2eEnd)).toBe('true');

  // Undo in a card is the pane's: the module's mark isn't on it, so the
  // writer's last step, the dash, goes.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(cards.nth(1)).toHaveText('second mwps card');
  expect(errors).toEqual([]);
});

test("the pane's overlay and selection bubble follow the caret's card", async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('first card');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second card');
  await setModule(page, 'e2e-ui', true);
  await setModule(page, 'e2e-cards', true);

  const cards = page.locator('.e2e-card');
  await expect(cards).toHaveCount(2);

  // The bubble shows over a selection in the second card, and edits it there.
  await cards.nth(1).locator('p').click({ clickCount: 3 });
  const bubble = page.locator('.mwps-selection-bubble');
  await expect(bubble).toBeVisible();
  await expect(page.locator('.mwps-selection-bubble')).toHaveCount(1);
  await bubble.getByRole('button', { name: 'Shout' }).click();
  await expect(cards.nth(1).locator('.ProseMirror')).toHaveText('SECOND CARD');
  await expect(cards.nth(0).locator('.ProseMirror')).toHaveText('first card');

  // The overlay is drawn in the card the writer is in, and moves with them.
  await page.getByRole('button', { name: 'Panel' }).click();
  await expect(cards.nth(1).locator('.mwps-overlay .e2e-ui-panel')).toBeVisible();
  await cards.nth(0).locator('.ProseMirror').click();
  await expect(cards.nth(0).locator('.mwps-overlay .e2e-ui-panel')).toBeVisible();
  await expect(page.locator('.e2e-ui-panel')).toHaveCount(1);

  // On a card's first line the bubble isn't clipped by the card: it is inside
  // the viewport and its button is what a click there reaches.
  await cards.nth(0).locator('p').click({ clickCount: 3 });
  await expect(bubble).toBeVisible();
  const shout = bubble.getByRole('button', { name: 'Shout' });
  await expect(shout).toBeVisible();
  const box = (await shout.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  const hit = await shout.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const points = [[r.width / 4, r.height / 4], [(r.width * 3) / 4, r.height / 4], [r.width / 4, (r.height * 3) / 4], [(r.width * 3) / 4, (r.height * 3) / 4]];
    return points.every(([x, y]) => el.contains(document.elementFromPoint(r.x + x, r.y + y)));
  });
  expect(hit).toBe(true);
  await shout.click();
  await expect(cards.nth(0).locator('.ProseMirror')).toHaveText('FIRST CARD');
  expect(errors).toEqual([]);
});

test("clicking into a card moves the pane's selection there, even where the card's own caret already was", async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('one');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('three');
  await setModule(page, 'e2e-cards', true);
  const cards = page.locator('.e2e-card .ProseMirror');
  await expect(cards).toHaveCount(3);
  const caretCard = page.locator('.e2e-cards');

  await cards.nth(0).click();
  await expect(caretCard).toHaveAttribute('data-caret-card', '0');
  // The empty card's editor parks its caret at its start, where the click lands.
  await cards.nth(1).click();
  await expect(caretCard).toHaveAttribute('data-caret-card', '1');
  expect(errors).toEqual([]);
});
