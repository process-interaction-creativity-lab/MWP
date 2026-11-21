import { expect, test, type Page } from '@playwright/test';
import { editor, openApp, newDocument } from './app.js';

// Reads or replaces the one document's file in the default project's OPFS
// directory, as another install of the app would have written it.
async function documentFile(page: Page, replace?: unknown): Promise<unknown> {
  return page.evaluate(async (next) => {
    const root = await navigator.storage.getDirectory();
    const project = await root.getDirectoryHandle('My project');
    const manifest = JSON.parse(await (await (await project.getFileHandle('project.json')).getFile()).text());
    const docs = await project.getDirectoryHandle('documents');
    const handle = await docs.getFileHandle(`${manifest.documents[0].id}.json`);
    if (next !== undefined) {
      const w = await handle.createWritable();
      await w.write(JSON.stringify(next));
      await w.close();
    }
    return JSON.parse(await (await handle.getFile()).text());
  }, replace);
}

// The e2e build's host, only for what the UI can't do yet: removing and
// installing a module at run time.
const inPage = (page: Page, action: 'install' | 'uninstall', id: string) =>
  page.evaluate(
    async ([action, id]) => {
      const { host, fetchModule } = (window as never as { mwpsE2E: { host: any; fetchModule: any } }).mwpsE2E;
      if (action === 'install') host.install(await fetchModule(id));
      else host.uninstall(id);
    },
    [action, id] as const,
  );

const PART = {
  type: 'prosody_line',
  attrs: { meter: 'iambic' },
  content: [{ type: 'text', text: 'Shall I compare thee' }],
};

// Module data of a module that isn't installed, after the writing.
const DATA = { type: 'gone_data', content: [{ type: 'text', text: 'Kept unseen' }] };

test("a part whose module isn't installed shows as a placeholder and is kept", async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await expect(editor(page)).toBeVisible();
  await page.waitForTimeout(700);
  const after = { type: 'paragraph', content: [{ type: 'text', text: 'After.' }] };
  await documentFile(page, {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { glas_private: true }, content: [{ type: 'text', text: 'Before.' }] },
      PART,
      after,
      DATA,
    ],
  });
  await page.reload();

  const placeholder = page.locator('.mwps-unknown[data-type="prosody_line"]');
  await expect(placeholder).toContainText('Shall I compare thee');
  // What follows the writing's last block counts as module data, unshown.
  await expect(editor(page)).toContainText('After.');
  await expect(page.locator('.mwps-unknown[data-type="gone_data"]')).toHaveCount(0);

  await editor(page).getByText('Before.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Added.');
  await page.waitForTimeout(1_000);

  const saved = (await documentFile(page)) as { content: { attrs?: object; content?: { text: string }[] }[] };
  expect(saved.content[0]!.attrs).toMatchObject({ glas_private: true });
  expect(saved.content[0]!.content![0]!.text).toBe('Before. Added.');
  expect(saved.content[1]).toEqual(PART);
  expect(saved.content[2]!.content).toEqual(after.content);
  // An old file's trailing data moved into the data node.
  expect(saved.content[3]).toEqual({ type: 'mwps_data', content: [DATA] });
  expect(errors).toEqual([]);
});

test("module attributes and ones the schema doesn't know survive cut and paste", async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { errors } = await openApp(page);
  await newDocument(page);
  await expect(editor(page)).toBeVisible();
  await page.waitForTimeout(700);
  const flagged = { e2e_parts_flag: true, glas_private: { kept: 1 } };
  await documentFile(page, {
    type: 'doc',
    content: ['One.', 'Two.', 'Three.'].map((text) => ({
      type: 'paragraph',
      ...(text === 'Two.' ? { attrs: flagged } : {}),
      content: [{ type: 'text', text }],
    })),
  });
  await page.reload();

  await editor(page).getByText('Two.').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+x');
  await expect(editor(page)).not.toContainText('Two.');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(editor(page)).toContainText('Two.');
  await page.waitForTimeout(1_000);

  const saved = (await documentFile(page)) as { content: { attrs?: object; content?: { text: string }[] }[] };
  const two = saved.content.find((b) => b.content?.[0]?.text === 'Two.');
  expect(two?.attrs).toMatchObject(flagged);
  expect(errors).toEqual([]);
});

test("a document that doesn't fit the schema opens read-only with a notice", async ({ page }) => {
  await openApp(page);
  await newDocument(page);
  await expect(editor(page)).toBeVisible();
  await page.waitForTimeout(700);
  // A paragraph inside a heading breaks the base schema's rules.
  await documentFile(page, { type: 'doc', content: [{ type: 'heading', content: [{ type: 'paragraph' }] }] });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('read-only');
  await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
});

test('a region shows its paragraphs while its module is off, and is itself again when it returns', async ({ page }) => {
  const { errors } = await openApp(page);
  await newDocument(page);
  await expect(editor(page)).toBeVisible();
  await page.waitForTimeout(700);
  const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  await documentFile(page, {
    type: 'doc',
    content: [
      para('Before.'),
      { type: 'e2e_parts_region', attrs: { tone: 'loud' }, content: [para('Inside.')] },
      para('After.'),
      { type: 'mwps_data' },
    ],
  });
  await page.reload();
  await expect(editor(page).locator('.e2e-region')).toContainText('Inside.');
  await editor(page).getByText('Inside.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' On!');
  // Backspace inside the region's text deletes a character, as in any paragraph.
  await page.keyboard.press('Backspace');
  await page.keyboard.type('.');
  await expect(editor(page).locator('.e2e-region')).toContainText('Inside. On.');

  // Off: the region's paragraphs are plain writing, not a placeholder, and take an edit.
  await inPage(page, 'uninstall', 'e2e-parts');
  await expect(editor(page).locator('.e2e-region')).toHaveCount(0);
  await expect(editor(page).locator('.mwps-unknown')).toHaveCount(0);
  await expect(editor(page)).toContainText('Inside. On.');
  await editor(page).getByText('Inside. On.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Off.');
  await page.waitForTimeout(1_000);

  // Saved while off: still the region, with its attributes and the edits.
  const saved = (await documentFile(page)) as { content: { type: string; attrs?: object; content?: { content: { text: string }[] }[] }[] };
  expect(saved.content[1]).toMatchObject({ type: 'e2e_parts_region', attrs: { tone: 'loud' } });
  expect(saved.content[1]!.content![0]!.content[0]!.text).toBe('Inside. On. Off.');

  // Back on: the region is its own type again with the text as edited meanwhile.
  await inPage(page, 'install', 'e2e-parts');
  await expect(editor(page).locator('.e2e-region')).toContainText('Inside. On. Off.');
  await page.waitForTimeout(1_000);
  const back = (await documentFile(page)) as typeof saved;
  expect(back.content[1]).toMatchObject({ type: 'e2e_parts_region', attrs: { tone: 'loud' } });
  expect(back.content.at(-1)!.type).toBe('mwps_data');
  expect(errors).toEqual([]);
});
