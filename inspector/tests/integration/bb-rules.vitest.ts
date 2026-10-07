import { afterAll, beforeAll, expect, test } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
let server: ViteDevServer, browser: Browser, origin: string;
const artifacts = resolve('coverage/inspector-artifacts/tenet53');
beforeAll(async () => {
  server = await createServer({ configFile: false, root: resolve('bb-plugin-tenet-status'), server: { host: '127.0.0.1', port: 0 } });
  await server.listen(); origin = server.resolvedUrls!.local[0]!;
  browser = await chromium.launch({ headless: true }); await mkdir(artifacts, { recursive: true });
});
afterAll(async () => { await browser?.close(); await server?.close(); });
for (const [width, wide] of [[390, false], [1440, false], [1600, true]] as const) test(`offline selected rule pages at ${width}px, wide=${wide}`, async () => {
  const page = await browser.newPage({ viewport: { width, height: 1050 } });
  const errors: string[] = [], unexpected: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(origin).origin && !url.pathname.startsWith('/api/')) return route.continue();
    unexpected.push(url.pathname); return route.abort();
  });
  try {
    await page.goto(`${origin}overview.preview.html?rules`); await page.locator('.call-row').first().waitFor();
    if (wide) await page.getByRole('button', { name: 'Toggle 390px panel' }).click();
    else { await page.getByRole('button', { name: 'Summary', exact: true }).focus(); await page.keyboard.press('Enter'); }
    expect(await page.locator('.recorded-context').innerText()).toContain('Contract 3 · Questions recorded-v3');
    expect(await page.locator('.primary-status').innerText()).toContain('Released');
    expect(await page.locator('.common-summary').innerText()).toContain('Execution unknown. Released permission does not prove dispatch or execution.');
    await page.locator('.why-disclosure > summary').press('Enter'); await page.locator('.other-rules > summary').press('Enter');
    expect(await page.locator('.rule-row').count()).toBe(16);
    await page.getByRole('button', { name: /^Line 2 / }).click();
    expect(await page.locator('.rule-detail').innerText()).toContain('Rule text truncated to 2,048 characters.');
    await page.getByRole('button', { name: /^Line 3 / }).click();
    expect(await page.locator('.rule-detail').innerText()).toContain('No rule text snapshot recorded.');
    await page.getByRole('button', { name: 'More rules', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('.other-rules').innerText()).toContain('Recorded rules 17–19 of 19.');
    expect(await page.locator('.rule-row').count()).toBe(3);
    await page.getByRole('button', { name: /^Built-in integrity/ }).click();
    expect(await page.locator('.rule-detail').innerText()).toContain('Built-in integrity');
    await page.locator('.rule-technical > summary').press('Enter');
    expect(await page.locator('.rule-technical').innerText()).toContain('0.65');
    expect(await page.locator('.rule-technical').innerText()).toContain('0.75');
    await page.screenshot({ path: `${artifacts}/rules-${width}-page2.png`, fullPage: true });
    for (const name of ['FAIL', 'WARN', 'integrity', 'approval', 'uncertainty', 'provider failure']) {
      if (!wide) await page.getByRole('button', { name: 'Calls', exact: true }).click();
      await page.locator('.call-row').filter({ hasText: `synthetic-${name}` }).click();
      if (!wide) await page.getByRole('button', { name: 'Summary', exact: true }).click();
      await expect.poll(() => page.locator('.recorded-context').innerText()).toContain(`Call synthetic-${name}`);
      await page.locator('.why-disclosure > summary').press('Enter'); await page.locator('.other-rules > summary').press('Enter');
      expect(await page.locator('.other-rules').innerText()).toContain('Recorded rules 1–16 of 19.');
      if (name === 'WARN') { await page.locator('.rule-row').first().click(); expect(await page.locator('.rule-detail').innerText()).toContain('WARN'); }
      if (name === 'provider failure') expect(await page.locator('.assessment-state').first().innerText()).toBe('Recorded assessment: unavailable · provider-error.');
    }
    expect(await page.locator('.action-preview, .evidence-dock, .question-json, .panel script').count()).toBe(0);
    expect(await page.evaluate(() => (window as any).archiveExecuted)).toBeUndefined();
    expect(await page.locator('.panel').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `${artifacts}/rules-${width}-provider-failure.png`, fullPage: true });
    await page.getByRole('button', { name: 'Close overview' }).click(); expect(await page.locator('.tenet-summary-workspace').count()).toBe(0);
    expect(errors).toEqual([]); expect(unexpected).toEqual([]);
  } finally { await page.close(); }
});
