import { afterAll, beforeAll, expect, test } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
let server: ViteDevServer, browser: Browser, origin: string;
const artifacts = resolve('coverage/inspector-artifacts/tenet52');
beforeAll(async () => {
  server = await createServer({ configFile: false, root: resolve('bb-plugin-tenet-status'), server: { host: '127.0.0.1', port: 0 } });
  await server.listen(); origin = server.resolvedUrls!.local[0]!;
  browser = await chromium.launch({ headless: true }); await mkdir(artifacts, { recursive: true });
});
afterAll(async () => { await browser?.close(); await server?.close(); });
for (const width of [1440, 390]) test(`synthetic BB panel is compact at 390px inside ${width}px window, keyboard-safe and host-isolated`, async () => {
  const page = await browser.newPage({ viewport: { width, height: 1050 } });
  const errors: string[] = [], unexpected: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(origin).origin && !url.pathname.startsWith('/api/')) return route.continue();
    unexpected.push(route.request().url()); return route.abort();
  });
  try {
    await page.goto(`${origin}overview.preview.html`);
    await page.locator('.call-row').first().waitFor();
    expect(await page.locator('.conversation').isVisible()).toBe(true);
    expect(await page.getByRole('button', { name: 'Calls', exact: true }).isVisible()).toBe(true);
    await page.getByRole('button', { name: 'Summary', exact: true }).focus(); await page.keyboard.press('Enter');
    expect(await page.locator('.inspection').isVisible()).toBe(true);
    expect(await page.locator('.explorer').isVisible()).toBe(false);
    expect(await page.locator('.assessment-state').first().innerText()).toBe('Recorded assessment: unavailable · provider-error.');
    expect(await page.locator('.primary-status').innerText()).toContain('Ran');
    expect(await page.locator('.session-counts').innerText()).toContain('0 selected FAIL · 2 evaluator failures');
    await page.locator('.why-disclosure > summary').press('Enter');
    expect(await page.locator('.decision-map').isVisible()).toBe(true);
    expect(await page.locator('.panel').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator('.action-preview, .evidence-dock, .question-json').count()).toBe(0);
    await page.screenshot({ path: `${artifacts}/panel-${width}-summary.png`, fullPage: true });
    await page.getByRole('button', { name: 'Calls', exact: true }).press('Enter');
    expect(await page.locator('.explorer').isVisible()).toBe(true);
    await page.getByRole('button', { name: 'Open or focus overview' }).click();
    expect(await page.locator('.panel').count()).toBe(1); // Synthetic shell only, not native tab focus.
    await page.getByRole('button', { name: 'Toggle host disconnect' }).click();
    await expect.poll(() => page.locator('.archive-messages').innerText()).toContain('Host or archive unavailable. No current result.');
    expect(await page.locator('.call-row').count()).toBe(0); expect(await page.locator('.common-summary').count()).toBe(0);
    await page.screenshot({ path: `${artifacts}/panel-${width}-disconnected.png`, fullPage: true });
    await page.getByRole('button', { name: 'Close overview' }).click();
    expect(await page.locator('.tenet-summary-workspace').count()).toBe(0);
    await page.getByRole('button', { name: 'Toggle host disconnect' }).click();
    await page.getByRole('button', { name: 'Open or focus overview' }).click();
    await page.locator('.call-row').first().waitFor();
    await page.locator('.panel').evaluate(el => (el as HTMLElement).style.setProperty('--foreground', '#eeeeee'));
    await page.locator('.panel').evaluate(el => (el as HTMLElement).style.setProperty('--background', '#161918'));
    expect(await page.locator('.tenet-summary-workspace').evaluate(el => getComputedStyle(el).getPropertyValue('--tenet-ink').trim())).toBe('#eeeeee');
    expect(await page.locator('.conversation').evaluate(el => getComputedStyle(el).color)).toBe('rgb(23, 25, 24)');
    expect(errors).toEqual([]); expect(unexpected).toEqual([]);
  } finally { await page.close(); }
});
test('desktop BB shared composition has the same common fields and no raw extensions', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  try {
    await page.goto(`${origin}overview.preview.html`); await page.locator('.call-row').first().waitFor();
    await page.getByRole('button', { name: 'Toggle 390px panel' }).click();
    expect(await page.getByRole('button', { name: 'Calls', exact: true }).isVisible()).toBe(false);
    expect(await page.locator('.inspection').isVisible()).toBe(true); expect(await page.locator('.explorer').isVisible()).toBe(true);
    expect(await page.locator('.recorded-context').innerText()).toContain('Contract 4 · Questions synthetic-v1');
    expect(await page.locator('.common-summary').innerText()).not.toContain('RAW-SENTINEL');
    await page.screenshot({ path: `${artifacts}/panel-desktop.png`, fullPage: true });
  } finally { await page.close(); }
});
