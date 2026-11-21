// node scripts/measure-memory.ts [--rebuild] [--snapshot] [--per-module] [--stress] [--screenshots] [--only=a,b]
//
// Measures the web build's memory through a fixed scenario: (a) empty app,
// (b) one document with word-processor, (c) every ported module on one pane,
// (d) plus a split with a second pane, (e) after typing and undoing. Records
// forced-GC JS heap, DOM node count and the summed RSS of the browser's
// processes. --snapshot also takes a heap snapshot at (d) and summarises it;
// --per-module loads the app afresh per module and records the heap delta.
// Output: a table, and scripts/.memory/latest.json. AI calls never leave the
// machine: every request off localhost is answered locally.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'scripts/.memory');
const dist = path.join(root, 'dist/memory');
const PORT = 5310;
const url = `http://localhost:${PORT}/`;
const args = new Set(process.argv.slice(2));
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');

const modules = readdirSync(path.join(root, 'modules'))
  .filter((id) => existsSync(path.join(root, 'modules', id, 'index.tsx')))
  .filter((id) => !only || only.includes(id));
// Layouts replace the pane's editor, so they go in the split step, not (c).
const layouts = ['resizable-split'];

function build(): void {
  if (existsSync(path.join(dist, 'index.html')) && !args.has('--rebuild')) return;
  console.log('building…');
  // The same build as the app's (no test modules), in its own folder.
  execFileSync('npx', ['vite', 'build', '--outDir', dist], { cwd: root, stdio: 'inherit' });
}

async function serve(): Promise<ChildProcess> {
  const server = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return server;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('preview server did not start');
}

// RSS of the browser's processes, summed and by type (browser, renderer,
// GPU, utility), from the pids Chromium reports.
async function rssByType(browser: Browser): Promise<Record<string, number>> {
  const session = await browser.newBrowserCDPSession();
  const { processInfo } = (await session.send('SystemInfo.getProcessInfo' as never)) as { processInfo: { id: number; type: string }[] };
  await session.detach();
  const rss = new Map(execFileSync('ps', ['-axo', 'pid=,rss=']).toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number) as [number, number]));
  const out: Record<string, number> = { total: 0 };
  for (const { id, type } of processInfo) {
    const mb = (rss.get(id) ?? 0) / 1024;
    out[type] = (out[type] ?? 0) + mb;
    out.total += mb;
  }
  return out;
}

type Stage = { stage: string; heapMb: number; totalHeapMb: number; domNodes: number; documents: number; listeners: number; rssMb: number; rssByType: Record<string, number> };

async function boot() {
  const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // Nothing leaves the machine: anything off localhost is answered here.
  await context.route((u) => u.hostname !== 'localhost', (route) => route.fulfill({ json: {} }));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  page.setDefaultTimeout(8000);
  return { browser, context, page, cdp, };
}

async function measure(cdp: CDPSession, browser: Browser, stage: string): Promise<Stage> {
  await new Promise((r) => setTimeout(r, 500));
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
  const usage = await cdp.send('Runtime.getHeapUsage');
  const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  return {
    stage,
    heapMb: usage.usedSize / 2 ** 20,
    totalHeapMb: usage.totalSize / 2 ** 20,
    domNodes: metrics.Nodes,
    documents: metrics.Documents,
    listeners: metrics.JSEventListeners,
    rssMb: (await rssByType(browser)).total,
    rssByType: await rssByType(browser),
  };
}

const tab = (page: Page, id = 'main') => page.locator(`[data-tab="${id}"]`);
const editorEl = (page: Page) => page.locator('.mwps-pane .ProseMirror');

async function setModule(page: Page, id: string, on = true, paneId = 'main') {
  const opener = tab(page, paneId);
  await opener.click();
  const item = page.locator(`[data-module="${id}"]`);
  await item.scrollIntoViewIfNeeded();
  if ((await item.getAttribute('data-placed')) !== String(on)) await item.click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

async function newDocument(page: Page) {
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  await page.getByRole('option', { name: 'New document' }).click();
}

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.locator('.mwps-app').waitFor();
  return errors;
}

async function scenario(): Promise<{ stages: Stage[]; errors: string[]; snapshot?: unknown; extra: Record<string, unknown> }> {
  const { browser, page, cdp } = await boot();
  const errors = await open(page);
  const stages: Stage[] = [];
  const extra: Record<string, unknown> = {};
  const snap = async (name: string) => {
    stages.push(await measure(cdp, browser, name));
    console.log('  ' + name);
    if (args.has('--screenshots')) await page.screenshot({ path: path.join(outDir, `stage-${name[0]}.png`) });
  };
  await snap('a empty app');

  await newDocument(page);
  await setModule(page, 'word-processor');
  await editorEl(page).waitFor();
  await snap('b document + word-processor');

  const exclusive: string[] = [];
  for (const id of modules.filter((m) => m !== 'word-processor' && !layouts.includes(m))) {
    try {
      await setModule(page, id);
      // A module that draws the pane itself (an editor or a layout) takes
      // the text editor's place and the menu offers no add-ons after it:
      // take it back off.
      if (!(await editorEl(page).count())) {
        exclusive.push(id);
        await setModule(page, id, false);
      }
    } catch (e) {
      errors.push(`placing ${id}: ${String(e).split('\n')[0]}`);
      await page.keyboard.press('Escape');
    }
  }
  if (exclusive.length) console.log('  not add-ons (own the pane), left off: ' + exclusive.join(', '));
  extra.exclusive = exclusive;
  await snap('c every add-on module on one pane');
  let summary: unknown;
  if (args.has('--snapshot')) summary = await heapSnapshot(cdp, 'c');

  // A split with a second pane: the split takes the main pane's place.
  await newDocument(page);
  await setModule(page, 'resizable-split');
  await page.locator('.resizable-split-child').nth(1).waitFor();
  await snap('d + split with a second pane');
  if (args.has('--snapshot')) summary = { c: summary, d: await heapSnapshot(cdp, 'd') };

  const panes = page.locator('.resizable-split-child');
  for (const [i, name] of ['Untitled 1', 'Untitled 2'].entries()) {
    await panes.nth(i).locator('.mwps-empty, .ProseMirror').first().click();
    await page.getByRole('button', { name: 'Document', exact: true }).click();
    await page.locator(`[data-document="${name}"]`).click();
    await panes.nth(i).locator('.ProseMirror').waitFor();
  }
  const ed = panes.first().locator('.ProseMirror');
  if (await ed.count()) {
    await ed.click();
    const sentence = 'The quick brown fox jumps over the lazy dog while the writer keeps going. ';
    await page.keyboard.type(sentence.repeat(27).slice(0, 2000), { delay: 0 });
    for (let i = 0; i < 40; i++) await page.keyboard.press('ControlOrMeta+z');
  } else errors.push('no editor to type in at stage e');
  await snap('e after typing 2000 chars + 40 undos');
  if (args.has('--stress') && (await ed.count())) {
    // 400 000 characters in 50 paragraphs, into the left pane.
    const para = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(140);
    await ed.click();
    await page.keyboard.press('ControlOrMeta+End');
    for (let i = 0; i < 50; i++) {
      await page.keyboard.insertText(para);
      await page.keyboard.press('Enter');
    }
    await snap('f stress: +400k characters');
  }
  await browser.close();
  return { stages, errors, snapshot: summary, extra };
}

// Summarise a heap snapshot: self size by constructor / node type, detached DOM.
async function heapSnapshot(cdp: CDPSession, label: string) {
  const chunks: string[] = [];
  const on = (e: { chunk: string }) => chunks.push(e.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', on);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', on);
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `heap-${label}.heapsnapshot`);
  writeFileSync(file, chunks.join(''));
  chunks.length = 0;
  const { summarise } = await import('./heap-summary.ts');
  return summarise(file);
}

async function perModule() {
  const rows: { id: string; deltaMb: number; domDelta: number; rssDelta: number }[] = [];
  const { browser, page, cdp } = await boot();
  // One fresh page per module, so each starts from the same baseline.
  const run = async (id: string | null) => {
    const p = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await p.context().route((u) => u.hostname !== 'localhost', (r) => r.fulfill({ json: {} }));
    const c = await p.context().newCDPSession(p);
    await c.send('Performance.enable');
    await p.goto(url);
    await p.locator('.mwps-app').waitFor();
    await newDocument(p);
    await setModule(p, 'word-processor');
    if (id) await setModule(p, id);
    await p.waitForTimeout(300);
    const m = await measure(c, browser, id ?? 'base');
    await p.context().close();
    return m;
  };
  void page, void cdp;
  const base = await Promise.all([run(null), run(null)]).catch(() => [] as Stage[]);
  const b = base.length ? base : [await run(null)];
  const baseline = b[0];
  for (const id of modules.filter((m) => m !== 'word-processor')) {
    const m = await run(id);
    rows.push({ id, deltaMb: m.heapMb - baseline.heapMb, domDelta: m.domNodes - baseline.domNodes, rssDelta: m.rssMb - baseline.rssMb });
    console.log(`  ${id.padEnd(30)} ${rows.at(-1)!.deltaMb.toFixed(2)} MB`);
  }
  await browser.close();
  rows.sort((a, z) => z.deltaMb - a.deltaMb);
  return { baseline, rows };
}

build();
const server = await serve();
try {
  mkdirSync(outDir, { recursive: true });
  const result: Record<string, unknown> = { when: new Date().toISOString(), modules: modules.length };
  if (!args.has('--per-module') || args.has('--all')) {
    console.log('scenario…');
    const { stages, errors, snapshot, extra } = await scenario();
    if (snapshot) console.log('note: --snapshot inflates RSS in the stages after it; read RSS from a run without it.');
    console.table(stages.map((s) => ({ stage: s.stage, 'heap MB': +s.heapMb.toFixed(1), 'heap total MB': +s.totalHeapMb.toFixed(1), 'DOM nodes': s.domNodes, documents: s.documents, listeners: s.listeners, 'RSS MB (all procs)': +s.rssMb.toFixed(0), 'renderer': +(s.rssByType.renderer ?? 0).toFixed(0), 'GPU': +(s.rssByType.gpu ?? 0).toFixed(0), 'browser': +(s.rssByType.browser ?? 0).toFixed(0) })));
    if (errors.length) console.log('errors:\n' + errors.slice(0, 20).join('\n'));
    Object.assign(result, { stages, errors, snapshot, ...extra });
  }
  if (args.has('--per-module')) {
    console.log('per module…');
    const pm = await perModule();
    console.table(pm.rows.slice(0, 15).map((r) => ({ module: r.id, 'heap delta MB': +r.deltaMb.toFixed(2), 'DOM delta': r.domDelta, 'RSS delta MB': +r.rssDelta.toFixed(0) })));
    result.perModule = pm;
  }
  writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(result, null, 2));
  console.log('wrote scripts/.memory/latest.json');
} finally {
  server.kill();
}
process.exit(0);
