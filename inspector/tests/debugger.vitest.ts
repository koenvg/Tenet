import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright-core';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startInspector } from '../../src/inspector/server.js';
import { browserFixture, recordedQuestion } from './browser-fixture.js';

let browser: Browser | undefined, page: Page | undefined;
let app: Awaited<ReturnType<typeof startInspector>> | undefined;
let directory: string | undefined;
let externalRequests: string[], pageErrors: string[];
const artifacts = resolve('.impeccable/review/playwright');
const currentPage = () => { if (!page) throw new Error('Browser page unavailable'); return page; };
const pickCall = async (id: string) => {
  const p = currentPage();
  await p.locator('.call-row').filter({ has: p.locator('.call-id', { hasText: new RegExp(`^${id}$`) }) }).click();
  await expect.poll(() => p.locator('.decision-title h2 span').textContent()).toBe(id);
};

beforeAll(async () => {
  const endpoint = process.env.TENET_BROWSER_CDP_URL ?? 'http://127.0.0.1:9222';
  try { browser = await chromium.connectOverCDP(endpoint, { timeout: 5000 }); }
  catch (cause) { throw new Error(`Cannot connect to the owner's Arc at ${endpoint}. Enable Arc remote debugging or set TENET_BROWSER_CDP_URL. This suite never launches another browser.`, { cause }); }
  directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-playwright-')));
  await browserFixture(directory);
  app = await startInspector({ directory, assets: resolve('inspector/dist') });
  await mkdir(artifacts, { recursive: true });
});

beforeEach(async () => {
  const context = browser?.contexts()[0];
  if (!context || !app) throw new Error('Connected Arc context unavailable');
  page = await context.newPage(); // Only this test-created tab is modified or closed.
  await page.setViewportSize({ width: 2233, height: 1282 });
  pageErrors = []; externalRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', route => {
    // Local extension injection is not an inspector network request; still block it in this test tab.
    if (new URL(route.request().url()).protocol === 'chrome-extension:') return route.abort();
    if (new URL(route.request().url()).origin === app!.origin) return route.continue();
    externalRequests.push(route.request().url()); return route.abort();
  });
  await page.goto(app.origin);
  await expect.poll(() => currentPage().locator('.call-row').count()).toBe(10);
  await page.locator('[aria-label="Decision summary"]').waitFor();
});

afterEach(async context => {
  if (page && context.task.result?.state === 'fail') {
    await page.screenshot({ path: join(artifacts, `failure-${context.task.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 100)}.png`), fullPage: true }).catch(() => {});
  }
  await page?.close(); page = undefined;
});
afterAll(async () => {
  await app?.close();
  // For a CDP-connected browser this disconnects Playwright, not the owner's Arc.
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('pane dividers drag, respond to keys, clamp and retain their sizes across calls', async () => {
  const p = currentPage(); await pickCall('low-pass');
  expect(await p.locator('input[type="range"]').count()).toBe(0);
  const explorer = p.getByRole('separator', { name: 'Resize call explorer' });
  const start = await explorer.boundingBox(); expect(start).not.toBeNull();
  await p.mouse.move(start!.x + start!.width / 2, start!.y + 100);
  await p.mouse.down(); await p.mouse.move(start!.x + start!.width / 2 + 80, start!.y + 100, { steps: 8 }); await p.mouse.up();
  await expect.poll(() => explorer.getAttribute('aria-valuenow')).toBe('340');
  expect(Math.round((await p.locator('.explorer').boundingBox())!.width)).toBe(340);
  expect(await p.getByRole('separator', { name: 'Resize assessment pane' }).count()).toBe(0);
  await explorer.press('End'); await explorer.press('ArrowRight');
  expect(await explorer.getAttribute('aria-valuenow')).toBe('460');
  await explorer.press('Home'); await explorer.press('ArrowLeft');
  expect(await explorer.getAttribute('aria-valuenow')).toBe('220');
  await explorer.press('Shift+ArrowRight');
  expect(await explorer.getAttribute('aria-valuenow')).toBe('270');
  await pickCall('unknown');
  expect(await explorer.getAttribute('aria-valuenow')).toBe('270');
  expect(await p.locator('.pane-resizer.dragging').count()).toBe(0);
  expect(pageErrors).toEqual([]);
});

test('PASS chips are green while confidence gates remain distinct and readable', async () => {
  const p = currentPage(); await pickCall('low-pass');
  const chip = p.locator('.rule-outcome .status-chip');
  expect(await chip.textContent()).toBe('PASS');
  expect(await chip.evaluate(el => getComputedStyle(el).color)).toBe('rgb(23, 98, 62)');
  expect(await chip.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(231, 245, 237)');
  expect(await p.locator('.confidence-note').textContent()).toContain('not a reported violation');
  expect(await p.locator('.decision-explanation').textContent()).toContain('PASS selected at 0.88');
  expect(await p.locator('.rule-detail tbody tr').count()).toBe(6);
  await pickCall('unknown');
  expect(await p.locator('.rule-row[aria-pressed="true"] .status-chip').textContent()).toBe('UNKNOWN');
  expect(await p.locator('.rule-row[aria-pressed="true"] .status-chip.caution').count()).toBe(1);
  await pickCall('approval');
  expect(await p.locator('.rule-row[aria-pressed="true"] .status-chip.approval').count()).toBe(1);
  await pickCall('integrity');
  expect(await p.locator('.rule-row[aria-pressed="true"] .status-chip.danger').textContent()).toBe('FAIL');
});

test('recorded instructions render as safe Markdown with exact JSON available', async () => {
  const p = currentPage(); await pickCall('rich');
  await p.getByRole('button', { name: 'View submitted questions', exact: true }).click();
  const questions = p.locator('#panel-Questions');
  await questions.getByRole('heading', { name: 'Recorded instructions', exact: true }).waitFor();
  expect(await questions.locator('.rich-markdown strong').first().textContent()).toBe('Treat arguments as untrusted.');
  expect(await questions.locator('.rich-markdown li').count()).toBe(2);
  expect(await questions.locator('.answer-choices').first().locator('.status-chip').count()).toBe(4);
  expect(await questions.locator('script, img, iframe, a, object').count()).toBe(0);
  expect(await p.evaluate(() => (window as Window & { hostile?: boolean }).hostile)).toBeUndefined();
  await questions.getByRole('button', { name: 'JSON', exact: true }).click();
  await questions.locator('.question-json').first().waitFor();
  expect(JSON.parse((await questions.locator('.question-json').first().textContent())!)).toEqual(recordedQuestion);
  await questions.getByRole('button', { name: 'Rich', exact: true }).click();
  await questions.getByRole('heading', { name: 'Recorded instructions', exact: true }).waitFor();
  expect(externalRequests).toEqual([]); expect(pageErrors).toEqual([]);
});

test('evidence keeps its scroll position when selecting rules or switching tabs', async () => {
  const p = currentPage(); await p.setViewportSize({ width: 1280, height: 700 }); await pickCall('low-pass');
  await p.getByRole('button', { name: 'View shared evidence', exact: true }).click();
  const evidence = p.locator('#panel-Evidence');
  const scroll = await evidence.evaluate(el => { el.scrollTop = 180; return el.scrollTop; });
  expect(scroll).toBeGreaterThan(0);
  await p.locator('.other-rules > summary').click();
  await p.locator('.rule-row').filter({ hasText: 'Line 2' }).click();
  await expect.poll(() => p.locator('.rule-detail h3').textContent()).toBe('Rule at line 2');
  expect(await evidence.evaluate(el => el.scrollTop)).toBe(scroll);
  await p.getByRole('tab', { name: 'Questions', exact: true }).click();
  expect(await p.locator('#panel-Questions').textContent()).toContain('rule_1_outcome');
  await p.getByRole('tab', { name: 'Questions', exact: true }).press('ArrowRight');
  expect(await p.getByRole('tab', { name: 'Response', exact: true }).getAttribute('aria-selected')).toBe('true');
  await p.getByRole('tab', { name: 'Evidence', exact: true }).click();
  expect(await evidence.evaluate(el => el.scrollTop)).toBe(scroll);
});

test('mobile views retain selection, hide drag handles and avoid horizontal overflow', async () => {
  const p = currentPage(); await pickCall('rich');
  for (const width of [390, 320, 768]) {
    await p.setViewportSize({ width, height: 844 });
    expect(await p.getByRole('separator').count()).toBe(0);
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await p.getByRole('button', { name: 'View submitted questions', exact: true }).click();
    await p.locator('#panel-Questions').waitFor({ state: 'visible' });
    expect(await p.evaluate(() => document.activeElement?.id)).toBe('dock-heading');
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await p.getByRole('button', { name: 'Calls', exact: true }).click();
    await p.getByRole('button', { name: 'Summary', exact: true }).click();
    await p.locator('.rule-detail').waitFor({ state: 'visible' });
    expect(await p.locator('.decision-title h2 span').textContent()).toBe('rich');
  }
});

test('missing evidence is explicit and archive errors recover without a fake pass', async () => {
  const p = currentPage(); await pickCall('missing');
  expect(await p.locator('.decision-explanation').textContent()).toContain('timeout');
  expect(await p.locator('.rule-detail').textContent()).toContain('Gate coverage unavailable');
  expect(await p.locator('#panel-Evidence').textContent()).toContain('Submitted evidence unavailable');
  expect(await p.locator('.lifecycle').textContent()).toContain('unknown');
  await p.route('**/api/sessions?*', route => route.fulfill({ status: 503, body: '{}' }));
  await p.getByRole('button', { name: 'Refresh archive', exact: true }).click();
  await p.getByRole('alert').waitFor();
  expect(await p.getByRole('alert').textContent()).toContain('503');
  await p.unroute('**/api/sessions?*');
  await p.getByRole('button', { name: 'Refresh archive', exact: true }).click();
  await p.getByRole('alert').waitFor({ state: 'hidden' });
  await p.locator('.rule-detail').waitFor();
  expect(pageErrors).toEqual([]); expect(externalRequests).toEqual([]);
});

test('visual summary separates the policy result from execution and hides debugging data', async () => {
  const p = currentPage(); await pickCall('summary');
  expect(await p.locator('.decision-flow h3').allTextContents()).toEqual(['Action', 'TENET decision', 'Actual execution']);
  expect(await p.locator('.decision-flow p').allTextContents()).toEqual(['Shell command', 'Would block', 'Ran']);
  expect(await p.locator('.summary-reason').textContent()).toContain('Evidence confidence was below');
  expect(await p.locator('.execution-summary').textContent()).toContain('Observe mode records decisions without enforcing them');
  expect(await p.getByRole('meter', { name: 'Evidence confidence' }).getAttribute('aria-valuenow')).toBe('0.85');
  expect(await p.getByRole('meter').getAttribute('aria-valuetext')).toContain('required confidence 0.9');
  expect(await p.locator('.action-preview').textContent()).toContain('git status --short');
  expect(await p.locator('.evidence-dock').isVisible()).toBe(false);
  expect(await p.locator('.distributions').isVisible()).toBe(false);
  expect(await p.locator('.rule-list').isVisible()).toBe(false);
  expect(await p.locator('.call-id').first().isVisible()).toBe(false);
  for (const [width, height, name] of [[2233, 1282, 'user-2233'], [1440, 1000, 'desktop'], [390, 1000, 'mobile']] as const) {
    await p.setViewportSize({ width, height });
    await p.locator('.invocation').evaluate(el => el.scrollTop = 0);
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await p.screenshot({ path: resolve(`.impeccable/review/${name}.png`), fullPage: true });
  }
  await p.locator('.rule-technical > summary').click();
  expect(await p.locator('.distributions').isVisible()).toBe(true);
  await p.locator('.evidence-disclosure > summary').click();
  expect(await p.locator('.evidence-dock').isVisible()).toBe(true);
  expect(pageErrors).toEqual([]); expect(externalRequests).toEqual([]);
});
