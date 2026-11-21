// Journeys through layouts, using resizable-split (an anchor fixture: see
// its description.md before changing its action names).
import { expect, test, type Page } from '@playwright/test';
import { documentPicker, newDocument, openApp, pickDocument, setModule, tab } from './app.js';

// Run an action from a pane tab's menu.
async function tabAction(page: Page, paneTab: ReturnType<typeof tab>, title: string): Promise<void> {
  await paneTab.click();
  await page.locator(`[data-action="${title}"]`).click();
}

test('a split shows a document in each pane, edits each, and closes one', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await newDocument(page);
  await expect(page.getByRole('tab')).toHaveCount(1);
  await setModule(page, 'resizable-split', true);

  const panes = page.locator('.resizable-split-child');
  await expect(panes).toHaveCount(2);
  const left = panes.nth(0);
  const right = panes.nth(1);
  // The split's tab, then one per child: the writer's own panes.
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveText(['resizable-split', 'Text Editor', 'Text Editor']);
  await expect(left.getByText("No document. Pick one at the toolbar's left.")).toBeVisible();
  // Hovering the split's tab marks its panes' tabs too.
  await tabs.nth(0).hover();
  await expect(tabs.nth(1)).toHaveAttribute('data-inside', 'true');
  await expect(tabs.nth(2)).toHaveAttribute('data-inside', 'true');
  // Choosing a tab focuses its pane. The split shows no document of its
  // own, so there's no picker there.
  // Its menu offers no add-ons: they would run in neither pane.
  await tabs.nth(0).click();
  await expect(page.locator('[data-no-add-ons]')).toBeVisible();
  await expect(page.locator('[data-module="e2e-highlight"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(tabs.nth(0)).toHaveAttribute('data-state', 'active');
  await expect(documentPicker(page)).toHaveCount(0);
  await tabs.nth(1).click();
  await page.keyboard.press('Escape');
  await expect(tabs.nth(1)).toHaveAttribute('data-state', 'active');
  await expect(documentPicker(page)).toBeVisible();
  await pickDocument(page, 'Untitled 1');
  await expect(left.locator('.ProseMirror')).toBeVisible();
  // Focus stays in the pane that switched, so the picker still shows it.
  await expect(documentPicker(page)).toHaveText('Untitled 1');

  // The picker switches the pane last focused; clicking an empty pane focuses it.
  for (const [pane, name, text] of [
    [left, 'Untitled 1', 'left text'],
    [right, 'Untitled 2', 'right text'],
  ] as const) {
    await pane.locator('.ProseMirror, .mwps-empty').first().click();
    await pickDocument(page, name);
    await pane.locator('.ProseMirror').click();
    await page.keyboard.type(text);
    await expect(pane.locator('.ProseMirror')).toHaveText(text);
  }
  // Tabs are named by what draws the pane, not by its document.
  await expect(tabs).toHaveText(['resizable-split', 'Text Editor', 'Text Editor']);

  // Both panes on one document: an edit in one appears in the other.
  await expect(documentPicker(page)).toHaveText('Untitled 2');
  await pickDocument(page, 'Untitled 1');
  await expect(right.locator('.ProseMirror')).toHaveText('left text');
  await right.locator('.ProseMirror').click();
  await page.keyboard.type('!');
  await expect(left.locator('.ProseMirror')).toHaveText('left text!');

  // The orientation and Add pane are in the split's tab; Close pane in each
  // child's, offered above two panes.
  await tabs.nth(0).click();
  await page.getByRole('radio', { name: 'Stacked' }).click();
  await expect(page.getByRole('radio', { name: 'Stacked' })).toHaveAttribute('data-state', 'on');
  await page.keyboard.press('Escape');
  const [top, bottom] = [await left.boundingBox(), await right.boundingBox()];
  expect(bottom!.y).toBeGreaterThan(top!.y + top!.height - 2);
  await tabs.nth(1).click();
  await expect(page.locator('[data-action="Close pane"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await tabAction(page, tabs.nth(0), 'Add pane');
  await expect(panes).toHaveCount(3);
  await expect(panes.nth(2).getByText("No document. Pick one at the toolbar's left.")).toBeVisible();
  await tabAction(page, tabs.nth(1), 'Close pane');
  await expect(panes).toHaveCount(2);
  await expect(panes.nth(0).locator('.ProseMirror')).toHaveText('left text!');
  await tabs.nth(1).click();
  await expect(page.locator('[data-action="Close pane"]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // A reload brings the split back as it was: its panes, their documents,
  // and the orientation.
  await page.reload();
  await expect(panes).toHaveCount(2);
  await expect(panes.nth(0).locator('.ProseMirror')).toHaveText('left text!');
  await expect(panes.nth(1).getByText("No document. Pick one at the toolbar's left.")).toBeVisible();
  await tabs.nth(0).click();
  await expect(page.getByRole('radio', { name: 'Stacked' })).toHaveAttribute('data-state', 'on');
  await page.keyboard.press('Escape');

  // The text editor comes back in the split's own tab.
  await tab(page).click();
  await page.getByRole('option', { name: 'Text editor' }).click();
  await page.keyboard.press('Escape');
  await expect(panes).toHaveCount(0);
  await expect(page.locator('[data-pane="main"] > .mwps-page .ProseMirror')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a margin wider than a split pane is reached by scrolling the pane sideways', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await setModule(page, 'resizable-split', true);
  const left = page.locator('.resizable-split-child').nth(0);
  await left.locator('.mwps-empty').click();
  await pickDocument(page, 'Untitled 1');
  await left.locator('.ProseMirror').click();
  await page.keyboard.type('some text');
  await setModule(page, 'e2e-margin', true,(await page.getByRole('tab').nth(1).getAttribute('data-tab'))!);

  const scroller = page.locator('.mwps-child').first();
  const note = left.getByText('Margin note');
  const paneBox = (await scroller.boundingBox())!;
  // The page is wider than the pane, the text starts in view, the note is past its edge.
  await expect.poll(() => scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBe(0);
  const text = (await left.locator('.ProseMirror p').first().boundingBox())!;
  expect(text.x).toBeGreaterThanOrEqual(paneBox.x);
  expect(text.x + 100).toBeLessThan(paneBox.x + paneBox.width);
  expect((await note.boundingBox())!.x).toBeGreaterThanOrEqual(paneBox.x + paneBox.width);
  // Scrolling sideways brings the note into view.
  await scroller.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  const after = (await note.boundingBox())!;
  expect(after.x + after.width).toBeLessThanOrEqual(paneBox.x + paneBox.width + 1);
  expect(errors).toEqual([]);
});
