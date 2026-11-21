import { expect, test, type Page } from '@playwright/test';
import { editor, openApp, pickDocument, setModule, newDocument, tab } from './app.js';

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Modules' });

async function start(page: Page) {
  const app = await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-ui', true);
  await editor(page).click();
  return app;
}

test('a toolbar component reads the pane and edits it on the undo stack, keeping focus in the text', async ({ page }) => {
  const { errors } = await start(page);
  await page.keyboard.type('abc');
  await expect(toolbar(page).getByText('3 characters')).toBeVisible();
  await toolbar(page).getByRole('button', { name: 'Insert' }).click();
  await expect(editor(page)).toHaveText('abchi');
  await expect(toolbar(page).getByText('5 characters')).toBeVisible();
  // The click left the caret in the text.
  await page.keyboard.type('!');
  await expect(editor(page)).toHaveText('abchi!');
  // The insert is its own undo step, apart from the typing before and after it.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor(page)).toHaveText('abchi');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor(page)).toHaveText('abc');
  expect(errors).toEqual([]);
});

test('a control that takes focus hands it back with p.focus()', async ({ page }) => {
  const { errors } = await start(page);
  await page.keyboard.type('ab');
  const box = toolbar(page).getByRole('textbox', { name: 'Text to insert' });
  await box.click();
  await box.fill('yo');
  await box.press('Enter');
  await page.keyboard.type('!');
  await expect(editor(page)).toHaveText('abyo!');
  expect(errors).toEqual([]);
});

test('an overlay provided in with() comes and goes with its value, with list defaults', async ({ page }) => {
  await start(page);
  const panel = page.locator('.mwps-overlay .e2e-ui-panel');
  await expect(panel).toHaveCount(0);
  await toolbar(page).getByRole('button', { name: 'Panel' }).click();
  await expect(panel).toBeVisible();
  // The defaults sheet gives module lists their bullets back.
  await expect(panel).toHaveCSS('list-style-type', 'disc');
  await toolbar(page).getByRole('button', { name: 'Panel' }).click();
  await expect(panel).toHaveCount(0);
});

test('the selection bubble shows only when a component renders, and edits the selection', async ({ page }) => {
  await start(page);
  await page.keyboard.type('hello world');
  // The host has the typing before the keys that extend the selection arrive.
  await expect(toolbar(page).getByText('11 characters')).toBeVisible();
  const bubble = page.locator('.mwps-selection-bubble');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(bubble).toBeHidden();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft');
  await expect(bubble).toBeVisible();
  await bubble.getByRole('button', { name: 'Shout' }).click();
  await expect(editor(page)).toHaveText('hello WORLD');
  await page.keyboard.type('!');
  await expect(editor(page)).toHaveText('hello WORLD!');
});

test('a component that throws turns its module off; writing goes on', async ({ page }) => {
  await start(page);
  await toolbar(page).getByRole('button', { name: 'Crash' }).click();
  await expect(page.getByText('e2e-ui stopped working and was turned off')).toBeVisible();
  await expect(toolbar(page).getByRole('button', { name: 'Insert' })).toHaveCount(0);
  await editor(page).click();
  await page.keyboard.type('still writing');
  await expect(editor(page)).toHaveText('still writing');
});

test("a module's CSS applies where it is placed, and to its portaled kit parts", async ({ page }) => {
  await start(page);
  await page.keyboard.type('styled');
  const paragraph = editor(page).locator('p').first();
  await expect(paragraph).toHaveCSS('color', 'rgb(200, 0, 0)');

  await toolbar(page).getByRole('button', { name: 'Panel' }).click();
  await expect(page.locator('.e2e-ui-panel li').first()).toHaveCSS('color', 'rgb(0, 0, 200)');

  // The kit portals the popover to body; it stays in the module's scope.
  await toolbar(page).getByRole('button', { name: 'More' }).click();
  const pop = page.getByText('Popover text');
  await expect(pop).toHaveCSS('color', 'rgb(0, 150, 0)');
  await page.keyboard.press('Escape');

  // Unplaced, its CSS no longer reaches the pane.
  await setModule(page, 'e2e-ui', false);
  await expect(paragraph).not.toHaveCSS('color', 'rgb(200, 0, 0)');
});

const sideTabs = (page: Page) => page.getByRole('toolbar', { name: 'Side views' });
const sideTab = (page: Page, id: string) => sideTabs(page).getByRole('button', { name: id, exact: true });
const sideView = (page: Page, id: string) => page.locator(`.mwps-side-view[data-side="${id}"]`);

test('side tabs open beside the panes, at most two at once, keep focus in the text and remember what was closed', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  // The strip is there before any module has a view, empty.
  await expect(sideTabs(page)).toBeVisible();
  await expect(sideTabs(page).getByRole('button')).toHaveCount(0);
  await setModule(page, 'e2e-side', true);
  await editor(page).click();
  await page.keyboard.type('abc');
  // Each view is a tab, named after its title; new tabs open, beside the page, not over it.
  await expect(sideTabs(page).getByRole('button')).toHaveText(['e2e-side: Notes', 'e2e-side']);
  await expect(sideTab(page, 'e2e-side')).toHaveAttribute('aria-pressed', 'true');
  await expect(sideTab(page, 'e2e-side: Notes')).toHaveAttribute('aria-pressed', 'true');
  await expect(sideView(page, 'e2e-side').getByText('Text: abc')).toBeVisible();
  const page_ = (await page.locator('.mwps-page').boundingBox())!;
  const view = (await sideView(page, 'e2e-side').boundingBox())!;
  expect(view.x).toBeGreaterThanOrEqual(page_.x + page_.width);
  // A button there edits the pane and leaves the caret in the text.
  await sideView(page, 'e2e-side').getByRole('button', { name: 'Bang' }).click();
  await page.keyboard.type('x');
  await expect(editor(page)).toHaveText('abc!x');
  // A text box there takes focus without taking the side tabs away.
  await sideView(page, 'e2e-side').getByRole('textbox', { name: 'Side note' }).fill('note');
  await expect(sideView(page, 'e2e-side').getByText('Text: abc!x')).toBeVisible();

  // A third view opens below and closes the one opened longest ago.
  await setModule(page, 'e2e-ui', true);
  await editor(page).click();
  await expect(sideTabs(page).getByRole('button')).toHaveText(['e2e-side: Notes', 'e2e-side', 'e2e-ui']);
  await expect(sideTab(page, 'e2e-side: Notes')).toHaveAttribute('aria-pressed', 'false');
  await expect(sideView(page, 'e2e-side: Notes')).toHaveCount(0);
  const upper = (await sideView(page, 'e2e-side').boundingBox())!;
  const lower = (await sideView(page, 'e2e-ui').boundingBox())!;
  expect(lower.y).toBeGreaterThanOrEqual(upper.y + upper.height);
  // A long view scrolls inside its slot.
  expect(lower.y + lower.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  // Reopening one closes the oldest open one.
  await sideTab(page, 'e2e-side: Notes').click();
  await expect(sideView(page, 'e2e-side: Notes')).toBeVisible();
  await expect(sideView(page, 'e2e-side')).toHaveCount(0);
  await expect(sideView(page, 'e2e-ui')).toBeVisible();

  // Closed tabs stay closed after a reload.
  await page.reload();
  await editor(page).click();
  await expect(sideTab(page, 'e2e-side')).toHaveAttribute('aria-pressed', 'false');
  await expect(sideView(page, 'e2e-side: Notes')).toBeVisible();
  await expect(sideView(page, 'e2e-ui')).toBeVisible();
  // Closing a tab hides its view.
  await sideTab(page, 'e2e-ui').click();
  await expect(sideView(page, 'e2e-ui')).toHaveCount(0);
  // An action that answers in a view reveals it, and focus stays in the text.
  await expect(sideTab(page, 'e2e-side')).toHaveAttribute('aria-pressed', 'false');
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+/');
  await page.getByRole('option', { name: /Reveal side view/ }).click();
  await expect(sideTab(page, 'e2e-side')).toHaveAttribute('aria-pressed', 'true');
  await expect(sideView(page, 'e2e-side')).toBeVisible();
  await page.keyboard.type('?');
  await expect(editor(page)).toContainText('?');
  expect(errors).toEqual([]);
});

test('side views follow the pane the writer is in', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await newDocument(page);
  await setModule(page, 'e2e-side', true);
  await setModule(page, 'resizable-split', true);
  const panes = page.locator('.resizable-split-child');
  for (const [i, name, text] of [
    [0, 'Untitled 1', 'left text'],
    [1, 'Untitled 2', 'right text'],
  ] as const) {
    await panes.nth(i).locator('.ProseMirror, .mwps-empty').first().click();
    await pickDocument(page, name);
    await panes.nth(i).locator('.ProseMirror').click();
    await page.keyboard.type(text);
  }
  await expect(sideView(page, 'e2e-side').getByText('Text: right text')).toBeVisible();
  await panes.nth(0).locator('.ProseMirror').click();
  await expect(sideView(page, 'e2e-side').getByText('Text: left text')).toBeVisible();
  expect(errors).toEqual([]);
});

test("a React widget in the text keeps its own input and state, its kit parts keep the module's CSS, and a throwing one turns its module off", async ({ page }) => {
  await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-widget', true);
  await editor(page).click();
  await page.keyboard.type('abc');
  const note = editor(page).getByRole('textbox', { name: 'Widget note' });
  await note.click();
  // Keys in the widget are its own: Cmd-Z there undoes the box's Backspace,
  // not the writer's text.
  await page.keyboard.type('xyz');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(note).toHaveValue('xyz');
  // The text, then the widget's button face.
  await expect(editor(page)).toHaveText('abc+');
  // An edit keeps the widget, and so its state, while its key stays.
  await editor(page).locator('p').first().click({ position: { x: 1, y: 5 } });
  await page.keyboard.type('d');
  await expect(editor(page)).toHaveText('dabc+');
  await expect(note).toHaveValue('xyz');
  // Its kit parts portaled to body stay in the module's CSS scope.
  await editor(page).getByRole('button', { name: 'Widget more' }).click();
  await expect(page.getByText('Widget popover')).toHaveCSS('color', 'rgb(0, 150, 0)');
  await page.keyboard.press('Escape');
  await editor(page).locator('p').first().click({ position: { x: 1, y: 5 } });
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('boom');
  await expect(page.getByText('e2e-widget stopped working and was turned off')).toBeVisible();
  await expect(editor(page)).toHaveText('boom');
});

test("the tab menu shows the highlighted module's summary beside it", async ({ page }) => {
  await openApp(page);
  await newDocument(page);
  await tab(page).click();
  const summary = page.locator('.mwps-module-summary');
  await page.locator('[data-module="e2e-highlight"]').hover();
  await expect(summary).toHaveText('Marks every "mwps" in the text, so a test can see a module\'s drawing come and go.');
  // A row whose module has no summary shows none.
  await page.locator('[data-module="e2e-marker"]').hover();
  await expect(summary).toHaveCount(0);
  // The keyboard highlight counts too.
  await page.keyboard.type('e2e-highlight');
  await expect(summary).toBeVisible();
});

test('the toolbar stays one row; arrows at its ends reach items past the edge', async ({ page }) => {
  const { errors } = await start(page);
  await setModule(page, 'word-processor', true);
  const bar = toolbar(page);
  const wide = (await bar.boundingBox())!.height;
  await page.setViewportSize({ width: 520, height: 700 });
  await editor(page).click();
  // Narrow, it is still one row: the same height, with a way to the rest.
  expect((await bar.boundingBox())!.height).toBe(wide);
  const right = bar.getByRole('button', { name: 'Scroll toolbar right' });
  const left = bar.getByRole('button', { name: 'Scroll toolbar left' });
  await expect(right).toBeVisible();
  await expect(left).toHaveCount(0);
  await right.click();
  await expect(left).toBeVisible();
  // The click left the caret in the text.
  await page.keyboard.type('x');
  await expect(editor(page)).toContainText('x');
  await left.click();
  await expect(left).toHaveCount(0);
  // Wide again, everything fits and the arrows go.
  await page.setViewportSize({ width: 1600, height: 700 });
  await expect(right).toHaveCount(0);
  expect(errors).toEqual([]);
});
