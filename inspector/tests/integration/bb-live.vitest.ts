import { afterAll, beforeAll, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

let server: ViteDevServer, browser: Browser, origin: string;
const artifacts = resolve('coverage/inspector-artifacts/tenet55');
beforeAll(async () => {
  server = await createServer({ configFile: false, root: resolve('bb-plugin-tenet-status'), server: { host: '127.0.0.1', port: 0 } });
  await server.listen(); origin = server.resolvedUrls!.local[0]!;
  // Readiness is checked before Chromium starts, not inferred from a process ID.
  expect((await fetch(`${origin}live.preview.html`)).status).toBe(200);
  browser = await chromium.launch({ headless: true }); await mkdir(artifacts, { recursive: true });
});
afterAll(async () => { await browser?.close(); await server?.close(); });
const resources = (page: Page) => page.evaluate(() => (window as any).tenetResources.snapshot());
const reads = (page: Page): Promise<{ threadId: string; selection: unknown; aborted?: boolean }[]> => page.evaluate(() => (window as any).tenetLivePreview.reads.map((r: any) => ({ threadId: r.threadId, selection: r.selection, aborted: r.signal?.aborted })));
async function open(entry: string, width = 1440) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await page.clock.install();
  await page.addInitScript(() => {
    const intervals = new Set<number>(), timeouts = new Set<number>(), observers = new Set<object>();
    const interval = window.setInterval.bind(window), timeout = window.setTimeout.bind(window), clearI = window.clearInterval.bind(window), clearT = window.clearTimeout.bind(window);
    window.setInterval = ((fn: TimerHandler, delay?: number, ...args: any[]) => { const id = interval(fn, delay, ...args); if (delay === 10_000) intervals.add(id); return id; }) as typeof window.setInterval;
    window.clearInterval = id => { if (typeof id === 'number') intervals.delete(id); clearI(id); };
    window.setTimeout = ((fn: TimerHandler, delay?: number, ...args: any[]) => { let id: number; const run = () => { timeouts.delete(id); if (typeof fn === 'function') fn(...args); }; id = timeout(run, delay); if (delay === 8_000) timeouts.add(id); return id; }) as typeof window.setTimeout;
    window.clearTimeout = id => { if (typeof id === 'number') timeouts.delete(id); clearT(id); };
    const Observer = window.ResizeObserver;
    window.ResizeObserver = class extends Observer {
      observe(target: Element, options?: ResizeObserverOptions) { observers.add(this); super.observe(target, options); }
      disconnect() { observers.delete(this); super.disconnect(); }
    };
    Object.assign(window, { tenetResources: { snapshot: () => ({ intervals: intervals.size, timeouts: timeouts.size, observers: observers.size }) } });
  });
  await page.goto(`${origin}live.preview.html?entry=${entry}`);
  await page.locator('.call-row').first().waitFor();
  return page;
}
async function rulePage(page: Page) {
  await page.getByText('Why this assessment', { exact: true }).click();
  await page.getByText(/Browse all rules/).click();
  await page.getByRole('button', { name: 'More rules', exact: true }).press('Enter');
  await page.getByRole('button', { name: /Built-in integrity/ }).press('Enter');
  await page.getByText('Recorded rules 17–19 of 19. At most 16 rules per page.', { exact: true }).waitFor();
}
for (const entry of ['panel', 'main']) for (const width of [390, 1440]) test(`${entry} live history and rules at ${width}px viewport / 390px container`, async () => {
  const page = await open(entry, width);
  try {
    await page.getByRole('button', { name: 'More sessions', exact: true }).press('Enter');
    await expect.poll(() => page.getByLabel('Linked session').locator('option').count()).toBe(55);
    await page.getByLabel('Linked session').selectOption((1054).toString(16).padStart(64, '0'));
    await page.getByRole('button', { name: 'More invocations', exact: true }).press('Enter');
    await expect.poll(() => page.locator('.call-row').count()).toBe(70);
    await page.getByText('live-1', { exact: true }).click();
    await page.getByRole('button', { name: 'Summary', exact: true }).waitFor();
    await rulePage(page);
    const before = await resources(page);
    expect(before).toEqual({ intervals: 1, timeouts: 0, observers: 0 });
    await page.getByRole('button', { name: 'Append recorded stage', exact: true }).click();
    await page.clock.runFor(10_000);
    await expect.poll(() => page.locator('.call-row').count()).toBe(71);
    expect(await page.locator('.call-label').innerText()).toBe('Call live-1');
    expect(await page.getByRole('button', { name: /Built-in integrity/ }).getAttribute('aria-pressed')).toBe('true');
    expect(await page.getByLabel('Linked session').locator('option').count()).toBe(55);
    expect(await page.getByRole('button', { name: 'More invocations', exact: true }).count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.preview-container').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const sentinel = await page.locator('.host-sentinel').evaluate(el => getComputedStyle(el).color);
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--foreground', 'rgb(225,235,230)');
      document.documentElement.style.setProperty('--background', 'rgb(25,30,27)');
      document.documentElement.style.setProperty('--muted', 'rgb(35,42,38)');
      document.documentElement.style.setProperty('--muted-foreground', 'rgb(174,190,181)');
      document.documentElement.style.setProperty('--border', 'rgb(95,112,102)');
    });
    expect(await page.locator('.host-sentinel').evaluate(el => getComputedStyle(el).color)).toBe(sentinel);
    expect(await page.locator('.rule-row strong').first().evaluate(el => getComputedStyle(el).color)).toBe('rgb(225, 235, 230)');
    expect(await page.locator('.tenet-summary-workspace').locator('script, .action-preview, .evidence-dock').count()).toBe(0);
    await page.screenshot({ path: resolve(artifacts, `${entry}-${width}-rules.png`), fullPage: true });
    if (entry === 'main') {
      await page.getByRole('button', { name: 'Calls', exact: true }).press('Enter');
      await page.getByText('live-2', { exact: true }).click();
      await expect.poll(() => page.locator('.call-label').innerText()).toBe('Call live-2');
      await page.goBack(); await expect.poll(() => page.locator('.call-label').innerText()).toBe('Call live-1');
      expect(await page.locator('.call-row').count()).toBe(71);
      await page.goForward(); await expect.poll(() => page.locator('.call-label').innerText()).toBe('Call live-2');
      expect(await page.locator('.call-row').count()).toBe(71);
    }
    await page.getByRole('button', { name: 'Refresh archive', exact: true }).press('Enter');
    await expect.poll(() => page.locator('.call-row').count()).toBe(50);
    expect(await page.locator('.call-label').innerText()).toBe(entry === 'main' ? 'Call live-2' : 'Call live-1');
    await page.getByRole('button', { name: 'Close workspace', exact: true }).press('Enter');
    await expect.poll(() => page.locator('.tenet-summary-workspace').count()).toBe(0);
    expect(await resources(page)).toEqual({ intervals: 0, timeouts: 0, observers: 0 });
    const count = (await reads(page)).length; await page.clock.runFor(30_000); expect(await reads(page)).toHaveLength(count);
  } finally { await page.close(); }
});

for (const entry of ['panel', 'main']) test(`${entry}: rejected cursor, disconnect, timeout, manual retry and pending scope cleanup`, async () => {
  const page = await open(entry);
  try {
    await page.getByRole('button', { name: 'Summary', exact: true }).press('Enter'); await rulePage(page);
    await page.getByRole('button', { name: 'Reject cursors', exact: true }).click(); await page.clock.runFor(10_000);
    await page.getByRole('alert').waitFor(); expect(await page.locator('.common-summary, .call-row').count()).toBe(0);
    const rejectedCount = (await reads(page)).length; await page.clock.runFor(30_000); expect(await reads(page)).toHaveLength(rejectedCount);
    await page.screenshot({ path: resolve(artifacts, `${entry}-rejected.png`), fullPage: true });
    await page.getByRole('button', { name: 'Refresh archive', exact: true }).press('Enter');
    await page.locator('.call-row').first().waitFor({ state: 'attached' });
    await page.getByRole('button', { name: 'Disconnect archive', exact: true }).click(); await page.clock.runFor(10_000);
    await page.getByText('Host or archive unavailable. No current result.', { exact: true }).waitFor();
    expect(await page.locator('.common-summary, .call-row').count()).toBe(0);
    await page.getByRole('button', { name: 'Make archive readable', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh archive', exact: true }).press('Enter'); await page.locator('.call-row').first().waitFor({ state: 'attached' });
    await page.getByRole('button', { name: 'Hang archive read', exact: true }).click(); await page.clock.runFor(10_000);
    await expect.poll(async () => (await reads(page)).at(-1)?.aborted).toBe(false);
    await page.getByRole('button', { name: 'Switch thread scope', exact: true }).click();
    await expect.poll(async () => (await reads(page)).filter(r => r.threadId === 'thr_livefixture01').at(-1)?.aborted).toBe(true);
    await expect.poll(async () => (await resources(page)).timeouts).toBe(1);
    await page.clock.runFor(8_000); await page.getByRole('alert').waitFor();
    expect(await page.locator('.common-summary, .call-row').count()).toBe(0);
    expect((await reads(page)).at(-1)?.aborted).toBe(true);
    await page.getByRole('button', { name: 'Make archive readable', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh archive', exact: true }).press('Enter'); await page.locator('.call-row').first().waitFor({ state: 'attached' });
    await page.getByRole('button', { name: 'Close workspace', exact: true }).click();
    await expect.poll(() => resources(page)).toEqual({ intervals: 0, timeouts: 0, observers: 0 });
    await page.getByRole('button', { name: 'Open workspace', exact: true }).click(); await page.locator('.call-row').first().waitFor({ state: 'attached' });
    expect(await resources(page)).toEqual({ intervals: 1, timeouts: 0, observers: 0 });
    await page.reload(); await page.locator('.call-row').first().waitFor({ state: 'attached' });
    expect(await resources(page)).toEqual({ intervals: 1, timeouts: 0, observers: 0 });
  } finally { await page.close(); }
});
