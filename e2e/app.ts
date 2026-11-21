import { expect, type Locator, type Page } from '@playwright/test';

/** Where a walk saves the screenshot `name`: `pr-screenshots/` when the run is
 *  for a PR (`PR_SCREENSHOTS=1 npm run test:modules -- <id>`), else
 *  `test-results/screenshots/`, so an ordinary run leaves nothing in the tree.
 *  (`process` is read through `globalThis`: `npm run check` typechecks walks
 *  without Node's types.) */
export function screenshotPath(name: string): string {
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
  return `${env?.PR_SCREENSHOTS ? 'pr-screenshots' : 'test-results/screenshots'}/${name}`;
}

/** Open the app, collecting page errors and console errors. */
export async function openApp(page: Page): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await expect(page.locator('.mwps-app')).toBeVisible();
  return { errors };
}

export const editor = (page: Page) => page.locator('.mwps-pane .ProseMirror');

// Keys in tests, by what the test is about:
// - an app shortcut: `ControlOrMeta+…`, as ProseMirror's `Mod-` means it;
// - the OS's own editing keys, when the keystroke is the point (a writer's
//   word-delete beside a module's widget, the fuzzer imitating a writer):
//   `keys` below, by what they do;
// - just putting the caret somewhere: caretToEnd and selectLeft, which use no
//   shortcut at all.
// So no test asks which platform it is on.

const mac = process.platform === 'darwin';
/** The OS's editing keys, by what they do. The macOS ones were checked in
 *  Playwright's Chromium; the others are Chromium's Windows and Linux keys. */
export const keys = mac
  ? {
      docStart: 'Meta+ArrowUp', docEnd: 'Meta+ArrowDown', lineStart: 'Meta+ArrowLeft', lineEnd: 'Meta+ArrowRight',
      wordLeft: 'Alt+ArrowLeft', wordRight: 'Alt+ArrowRight', selectWordLeft: 'Alt+Shift+ArrowLeft', selectWordRight: 'Alt+Shift+ArrowRight',
      deleteWordBack: 'Alt+Backspace', deleteWordForward: 'Alt+Delete',
    }
  : {
      docStart: 'Control+Home', docEnd: 'Control+End', lineStart: 'Home', lineEnd: 'End',
      wordLeft: 'Control+ArrowLeft', wordRight: 'Control+ArrowRight', selectWordLeft: 'Control+Shift+ArrowLeft', selectWordRight: 'Control+Shift+ArrowRight',
      deleteWordBack: 'Control+Backspace', deleteWordForward: 'Control+Delete',
    };

/** The caret at the end of the last line of text in `ed`, as a click there puts
 *  it: the editor's own text, not a non-editable block or a nested editor. */
export async function caretToEnd(ed: Locator): Promise<void> {
  await ed.focus();
  await ed.evaluate((root) => {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.textContent && n.parentElement?.closest('[contenteditable]') === root ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    let last: Node | null = null;
    for (let n = walk.nextNode(); n; n = walk.nextNode()) last = n;
    if (last) getSelection()!.collapse(last, last.textContent!.length);
  });
}

/** Extend the selection `n` characters to the left. */
export async function selectLeft(page: Page, n: number): Promise<void> {
  for (let i = 0; i < n; i++) await page.keyboard.press('Shift+ArrowLeft');
}

/** The document picker, at the toolbar's left. */
export const documentPicker = (page: Page) => page.getByRole('button', { name: 'Document', exact: true });

/** Make a document through the picker; it opens in the pane the picker switches. */
export async function newDocument(page: Page): Promise<void> {
  await documentPicker(page).click();
  await page.getByRole('option', { name: 'New document' }).click();
}

/** Show a document in the pane the picker switches. */
export async function pickDocument(page: Page, name: string): Promise<void> {
  await documentPicker(page).click();
  await page.locator(`[data-document="${name}"]`).click();
}

/** A pane's tab; the root pane's by default. */
export const tab = (page: Page, paneId = 'main') => page.locator(`[data-tab="${paneId}"]`);

/** Place (or unplace) a module on a pane, through its tab's menu. */
export async function setModule(page: Page, id: string, on: boolean, paneId = 'main'): Promise<void> {
  const opener = tab(page, paneId);
  await opener.click();
  const item = page.locator(`[data-module="${id}"]`);
  if ((await item.getAttribute('data-placed')) !== String(on)) await item.click();
  // Placing a layout moves focus into its first child, which closes the
  // menu (a moment later): reopen it to check.
  await expect(async () => {
    if (!(await item.isVisible())) await opener.click();
    await expect(item).toHaveAttribute('data-placed', String(on), { timeout: 500 });
  }).toPass();
  await page.keyboard.press('Escape');
}

/** Whether a module is ticked in a pane's tab menu. */
export async function isPlaced(page: Page, id: string, paneId = 'main'): Promise<boolean> {
  await tab(page, paneId).click();
  const placed = await page.locator(`[data-module="${id}"]`).getAttribute('data-placed');
  await page.keyboard.press('Escape');
  return placed === 'true';
}
