// Papercuts: small regression checks, one short test each, for bugs worth
// keeping fixed that don't deserve a journey of their own. Review the file
// when it feels bloated.
export {};

import { expect, test } from '@playwright/test';
import { caretToEnd, documentPicker, editor, newDocument, openApp, selectLeft, setModule, tab } from './app.js';

test('without OPFS the app runs in memory and asks before the page is left', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', { value: undefined });
  });
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('kept in memory');
  await expect(editor(page)).toContainText('kept in memory');

  const types: string[] = [];
  page.on('dialog', (dialog) => {
    types.push(dialog.type());
    void dialog.accept();
  });
  await page.reload();
  expect(types).toEqual(['beforeunload']);
  expect(errors).toEqual([]);
});

test('typing in the tab menu after clicking a row goes to its search', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.getByRole('tab', { name: 'Text Editor' }).click();
  await page.locator('[data-module="word-processor"]').click();
  await page.keyboard.type('word');
  await expect(page.locator('[cmdk-input]')).toHaveValue('word');
  await expect(page.locator('[cmdk-input]')).toBeFocused();
  expect(errors).toEqual([]);
});

test('a trackpad pinch (a wheel event with Ctrl) does not zoom the page', async ({ page }) => {
  await openApp(page);
  const prevented = await page.evaluate(() => {
    const e = new WheelEvent('wheel', { deltaY: -10, ctrlKey: true, cancelable: true, bubbles: true });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test("a module's imported data file is fetched from beside its bundle", async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-data', true);
  await expect(page.locator('body')).toHaveAttribute('data-e2e-data', 'lexicon loaded');
  await expect(page.locator('body')).toHaveAttribute('data-e2e-data-url', /^modules\/e2e-data\/words-\w+\.txt$/);
  expect(errors).toEqual([]);
});

test('a pane\'s selection is tinted while its editor is not focused', async ({ page }) => {
  const { errors } = await openApp(page);
  await setModule(page, 'e2e-ui', true);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('alpha beta gamma');
  await selectLeft(page, 'gamma'.length);
  // The host has the selection once the bubble over it shows; leaving the editor sooner would tint nothing.
  await expect(page.locator('.mwps-selection-bubble')).toBeVisible();
  const tint = page.locator('.mwps-inactive-selection');
  await expect(tint).toHaveCount(0);
  // Into a module's own text box: the browser hides the selection, the host shows it.
  await page.getByRole('textbox', { name: 'Text to insert' }).click();
  await expect(tint).toHaveText('gamma');
  await editor(page).focus();
  // The editor's own selection shows again. The tint's element stays in the
  // DOM until the next transaction, but paints nothing.
  await expect(editor(page)).toHaveClass(/ProseMirror-focused/);
  await expect
    .poll(() => tint.evaluateAll((els) => els.filter((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)').length))
    .toBe(0);
  expect(errors).toEqual([]);
});

test("the toolbar's ? shows a walkthrough for each module that is on", async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-ui', true);
  await page.getByRole('toolbar').getByRole('button', { name: 'Help' }).click();
  const help = page.getByRole('dialog', { name: 'Help' });
  await expect(help.getByRole('heading', { name: 'e2e-ui' })).toBeVisible();
  await expect(help.locator('strong', { hasText: 'help' })).toBeVisible();
  await expect(help.getByRole('listitem').filter({ hasText: 'Click Insert.' })).toBeVisible();
  await help.getByRole('button', { name: 'Getting started' }).click();
  await expect(help.getByRole('heading', { name: 'Getting started' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  expect(errors).toEqual([]);
});

test("a new document while a module's own child editor has focus shows it there", async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-frame', true);
  const framed = page.locator('.e2e-frame .ProseMirror');
  await framed.click();
  await page.keyboard.type('first');
  await newDocument(page);
  await expect(framed).toBeVisible();
  await expect(framed).not.toContainText('first');
  await framed.click();
  await page.keyboard.type('second');
  await expect(framed).toContainText('second');
  expect(errors).toEqual([]);
});

test('undoing a split in a layout\'s cards leaves the caret in a card, so redo and typing work', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('one two');
  await setModule(page, 'e2e-cards', true);
  const cards = page.locator('.e2e-card');
  await cards.first().locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(cards).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(cards).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(cards).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.type('!');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('!');
  expect(errors).toEqual([]);
});

test('an add-on placed before a layout that shows no text stays listed, and comes off', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await setModule(page, 'e2e-highlight', true);
  await setModule(page, 'resizable-split', true);
  await tab(page).click();
  await expect(page.locator('[data-no-add-ons]')).toBeVisible();
  const item = page.locator('[data-module="e2e-highlight"]');
  await expect(item).toHaveAttribute('data-placed', 'true');
  await item.click();
  await expect(item).toHaveCount(0);
  await page.keyboard.press('Escape');
  await setModule(page, 'resizable-split', false);
  await tab(page).click();
  await expect(page.locator('[data-module="e2e-highlight"]')).toHaveAttribute('data-placed', 'false');
  expect(errors).toEqual([]);
});

test('hovering the document picker outlines the pane it switches, and follows it', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await setModule(page, 'resizable-split', true);
  const right = page.locator('.resizable-split-child').nth(1);
  await right.locator('.mwps-empty').click();
  await documentPicker(page).hover();
  const outline = page.locator('.mwps-pane-outline');
  await expect(outline).toHaveCount(1);
  const fits = async () => {
    const [o, r] = [(await outline.boundingBox())!, (await right.locator('[data-pane]').first().boundingBox())!];
    return Math.abs(o.x - r.x) + Math.abs(o.width - r.width);
  };
  expect(await fits()).toBeLessThan(4);
  // The window narrows while the picker is hovered: the outline moves with the pane.
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width - 300, height: size.height });
  await expect.poll(fits).toBeLessThan(4);
  await page.mouse.move(400, 400);
  await expect(outline).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("pasting from Google Docs or Word keeps bold, italic, headings and links, but not the other app's look", async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await editor(page).click();
  const paste = (html: string) =>
    page.evaluate((html) => {
      const data = new DataTransfer();
      data.setData('text/html', html);
      data.setData('text/plain', 'ignored');
      document.querySelector('.mwps-pane .ProseMirror')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, html);
  const run = 'font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;vertical-align:baseline;';
  // As Google Docs puts it on the clipboard.
  await paste(
    `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b"><h1 dir="ltr"><span style="${run}font-weight:400;">A heading</span></h1>` +
      `<p dir="ltr"><span style="${run}font-weight:400;font-style:normal;">Plain, </span><span style="${run}font-weight:700;">bold</span>` +
      `<span style="${run}font-weight:400;font-style:italic;"> italic</span><span style="${run}"> and </span>` +
      `<a href="https://example.com" style="text-decoration:none;"><span style="${run}color:#1155cc;text-decoration:underline;">a link</span></a></p></b>`,
  );
  const pm = editor(page);
  await expect(pm.locator('h1')).toHaveText('A heading');
  await expect(pm.locator('strong')).toHaveText(['bold']);
  await expect(pm.locator('em')).toHaveText([' italic']);
  await expect(pm.locator('a[href="https://example.com"]')).toHaveText('a link');
  await expect(pm.locator('[style*="font-family"], [style*="font-size"], [style*="color"]')).toHaveCount(0);

  // As Word puts it there.
  await caretToEnd(pm.first());
  await page.keyboard.press('Enter');
  await paste(
    `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><p class=MsoNormal><span style='font-size:12.0pt;font-family:"Calibri",sans-serif;mso-fareast-font-family:Calibri'>From Word, <b>bold</b> and <i>italic</i>.</span></p></body></html>`,
  );
  await expect(pm).toContainText('From Word, bold and italic.');
  await expect(pm.locator('strong')).toHaveText(['bold', 'bold']);
  await expect(pm.locator('em')).toHaveText([' italic', 'italic']);
  await expect(pm.locator('[style*="font-family"], [style*="font-size"], [style*="color"]')).toHaveCount(0);

  // A copy within the app keeps the look the writer set.
  await caretToEnd(pm.first());
  await page.keyboard.press('Enter');
  await paste('<p><span style="color: rgb(200, 0, 0)" data-mwps-style=""><span style="font-size: 20px" data-mwps-style="">Red and large</span></span></p>');
  await expect(pm.locator('[style*="color: rgb(200, 0, 0)"]')).toHaveText('Red and large');
  await expect(pm.locator('[style*="font-size: 20px"]')).toHaveText('Red and large');
  expect(errors).toEqual([]);
});

test("a module list that doesn't load says so, with Reload, not a blank page", async ({ page }) => {
  await page.route('**/modules/index.json', (route) => route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>Not found</h1>' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText("The app couldn't load its modules");
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
});
