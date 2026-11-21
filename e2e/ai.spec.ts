import { expect, test, type Page } from '@playwright/test';
import { editor, openApp, setModule, newDocument } from './app.js';

const suggest = (page: Page) => page.getByRole('option', { name: /Suggest/ });

async function palette(page: Page) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+/');
  // A search shows the action whether or not it can run (greyed ones fold away otherwise).
  await page.getByRole('dialog').getByRole('combobox').fill('Suggest');
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByRole('option', { name: 'Settings…' }).click();
  return page.getByRole('dialog', { name: 'Settings' });
}

test('AI is set in Settings: an AI module’s action works once a key is saved, with its own model and address, and the settings outlast a reload', async ({ page }) => {
  const { errors } = await openApp(page);
  // Every call the e2e-ai module makes, as the endpoint sees it.
  const calls: { url: string; auth: string | null }[] = [];
  await page.route('https://*.invalid/**', (route) => {
    calls.push({ url: route.request().url(), auth: route.request().headers()['authorization'] ?? null });
    return route.fulfill({ json: {} });
  });
  await newDocument(page);
  await setModule(page, 'e2e-ai', true);
  await palette(page);
  await expect(suggest(page)).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  // The default endpoint; the module asked for AI, so it is listed.
  let dialog = await openSettings(page);
  await dialog.getByLabel('Key', { exact: true }).first().fill('sk-test');
  await dialog.getByLabel('Address', { exact: true }).first().fill('https://default.invalid/v1');
  await dialog.getByLabel('Model', { exact: true }).fill('default-model');
  await dialog.getByLabel('Transcription model', { exact: true }).first().fill('openai/whisper-1');
  const row = dialog.locator('[data-settings-module="e2e-ai"]');
  await row.getByLabel('Model for e2e-ai').fill('its-model');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await palette(page);
  await suggest(page).click();
  await expect(editor(page)).toHaveText('suggested by its-model');
  await expect.poll(() => calls.at(-1)).toEqual({ url: 'https://default.invalid/v1/chat/completions', auth: 'Bearer sk-test' });

  // Its own key, address, models and extra fields.
  dialog = await openSettings(page);
  await row.getByText('Its own key, address, models and extra fields').click();
  await row.getByLabel('Key').fill('sk-own');
  await row.getByLabel('Address').fill('https://own.invalid/v1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await palette(page);
  await suggest(page).click();
  await expect.poll(() => calls.at(-1)).toEqual({ url: 'https://own.invalid/v1/chat/completions', auth: 'Bearer sk-own' });
  // The default transcription model is kept, and is the module's unless it names its own.
  dialog = await openSettings(page);
  await expect(dialog.getByLabel('Transcription model', { exact: true }).first()).toHaveValue('openai/whisper-1');
  await expect(row.getByLabel('Transcription model')).toHaveAttribute('placeholder', 'Default (openai/whisper-1)');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Turned off for this module: greyed again; Cancel changes nothing.
  dialog = await openSettings(page);
  await row.getByRole('switch', { name: 'AI' }).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await palette(page);
  await expect(suggest(page)).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  dialog = await openSettings(page);
  await row.getByRole('switch', { name: 'AI' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await palette(page);
  await expect(suggest(page)).toHaveAttribute('aria-disabled', 'true');
  expect(errors).toEqual([]);
});

test('project access is set per module in Settings', async ({ page }) => {
  const { errors } = await openApp(page);
  const project = page.getByRole('button', { name: 'Project' });
  await project.click();
  await page.locator('[data-module="e2e-project"]').click();
  await page.keyboard.press('Escape');
  const count = async () => {
    await project.click();
    await page.locator('[data-action="Count documents…"]').click();
  };
  const counted = page.getByRole('dialog', { name: 'Documents' });
  await count();
  await expect(counted).toBeVisible();
  await page.keyboard.press('Escape');

  const dialog = await openSettings(page);
  await dialog.locator('[data-settings-module="e2e-project"]').getByRole('switch', { name: 'Project' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await count();
  await expect(counted).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a tab shows a dot while its modules have AI calls out, their last half minute in its menu, and a button there that stops them', async ({ page }) => {
  const { errors } = await openApp(page);
  let answer: () => void = () => {};
  await page.route('https://*.invalid/**', async (route) => {
    await new Promise<void>((resolve) => (answer = resolve));
    await route.fulfill({ json: {} });
  });
  await newDocument(page);
  await setModule(page, 'e2e-ai', true);
  await page.evaluate(
    (s) => (window as never as { mwpsE2E: { saveSettings(s: unknown): Promise<void> } }).mwpsE2E.saveSettings(s),
    { ai: { key: 'k', url: 'https://slow.invalid/v1', model: 'm' }, modules: {} },
  );
  const dot = page.locator('[data-tab="main"] [role="status"]');
  await expect(dot).toHaveCount(0);
  await palette(page);
  await suggest(page).click();
  await expect(dot).toHaveAttribute('aria-label', 'AI working (1)');
  await page.locator('[data-tab="main"]').click();
  const trace = page.getByRole('img', { name: 'AI activity over the last 30 seconds' });
  await expect(trace).toHaveAttribute('data-out', '1');
  await expect(page.getByText('AI Usage')).toBeVisible();
  answer();
  await expect(dot).toHaveCount(0);
  await expect(page.getByText('Request finished')).toBeVisible();
  await expect(trace).toHaveCount(0);
  await expect(page.getByText('AI Usage')).toBeVisible();
  await page.keyboard.press('Escape');

  // A call the writer stops ends at once, without an answer.
  await palette(page);
  await suggest(page).click();
  await expect(dot).toHaveAttribute('aria-label', 'AI working (1)');
  await page.locator('[data-tab="main"]').click();
  await page.getByRole('button', { name: 'Stop AI calls' }).click();
  await expect(dot).toHaveCount(0);
  await expect(page.getByText('Request cancelled')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop AI calls' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an endpoint that is down when AI comes on: once it is back, a module’s AI feature works without a reload', async ({ page }) => {
  const { errors } = await openApp(page);
  let up = false;
  let refused = 0;
  await page.route('https://*.invalid/**', (route) => {
    if (!up) {
      refused++;
      return route.fulfill({ status: 503, json: { error: { message: 'down' } } });
    }
    if (route.request().url().endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'm', supported_parameters: ['tools'] }] } });
    return route.fulfill({ json: { choices: [{ message: { content: 'the endpoint is back' } }] } });
  });
  await newDocument(page);
  await setModule(page, 'e2e-ai-tools', true);
  await page.evaluate(
    (s) => (window as never as { mwpsE2E: { saveSettings(s: unknown): Promise<void> } }).mwpsE2E.saveSettings(s),
    { ai: { key: 'k', url: 'https://flaky.invalid/v1', model: 'm' }, modules: {} },
  );
  // The module has asked the endpoint what it can do, and been turned away.
  await expect.poll(() => refused).toBeGreaterThanOrEqual(2);
  up = true;

  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+/');
  await page.getByRole('dialog').getByRole('combobox').fill('Ask with tools');
  const ask = page.getByRole('option', { name: /Ask with tools/ });
  await expect(ask).not.toHaveAttribute('aria-disabled', 'true');
  await ask.click();
  await expect(editor(page)).toHaveText('the endpoint is back');
  // The 503s the browser logs are the endpoint being down, not the app failing.
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});
