import { expect, test } from '../browser-shell-fixture.js';

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const artifacts = resolve('coverage/inspector-artifacts/tenet53');
test.beforeAll(async ({}, testInfo) => { testInfo.setTimeout(30_000); await mkdir(artifacts, { recursive: true }); });
test('offline adapter rule paging and call resets in a 390px panel inside a 1440px window', async ({ page, shellOrigin: origin }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  const errors: string[] = [], unexpected: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(origin).origin && !url.pathname.startsWith('/api/')) return route.continue();
    unexpected.push(url.pathname); return route.abort();
  });
  try {
    await page.goto(`${origin}overview.preview.html?rules`); await page.locator('.call-row').first().waitFor();
    await page.getByRole('button', { name: 'Summary', exact: true }).focus(); await page.keyboard.press('Enter');
    expect(await page.locator('.recorded-context').innerText()).toContain('Contract 3 · Questions recorded-v3');
    expect(await page.locator('.primary-status').innerText()).toContain('Released');
    expect(await page.locator('.common-summary').innerText()).toContain('Execution unknown. Released permission does not prove dispatch or execution.');
    await page.locator('.why-disclosure > summary').press('Enter'); await page.locator('.other-rules > summary').press('Enter');
    await page.getByRole('button', { name: 'More rules', exact: true }).click();
    await expect.poll(() => page.locator('.other-rules').innerText()).toContain('Recorded rules 17–19 of 19.');
    await page.screenshot({ path: `${artifacts}/adapter-narrow-panel-page2.png`, fullPage: true });
    await page.getByRole('button', { name: 'First rule page', exact: true }).click();
    await expect.poll(() => page.locator('.other-rules').innerText()).toContain('Recorded rules 1–16 of 19.');
    for (const name of ['FAIL', 'WARN', 'integrity', 'approval', 'uncertainty', 'provider failure']) {
      await page.getByRole('button', { name: 'More rules', exact: true }).click();
      await expect.poll(() => page.locator('.other-rules').innerText()).toContain('Recorded rules 17–19 of 19.');
      await page.getByRole('button', { name: 'Calls', exact: true }).focus(); await page.keyboard.press('Enter');
      await page.locator('.call-row').filter({ hasText: `synthetic-${name}` }).click();
      await page.getByRole('button', { name: 'Summary', exact: true }).focus(); await page.keyboard.press('Enter');
      await expect.poll(() => page.locator('.recorded-context').innerText()).toContain(`Call synthetic-${name}`);
      await page.locator('.why-disclosure > summary').press('Enter'); await page.locator('.other-rules > summary').press('Enter');
      expect(await page.locator('.other-rules').innerText()).toContain('Recorded rules 1–16 of 19.');
      if (name === 'provider failure') expect(await page.locator('.assessment-state').first().innerText()).toBe('Recorded assessment: unavailable · provider-error.');
    }
    expect(await page.locator('.action-preview, .evidence-dock, .question-json, .panel script').count()).toBe(0);
    expect(await page.evaluate(() => (window as any).archiveExecuted)).toBeUndefined();
    expect(await page.locator('.panel').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `${artifacts}/adapter-narrow-panel-provider-failure-reset.png`, fullPage: true });
    await page.getByRole('button', { name: 'Close overview' }).click(); expect(await page.locator('.tenet-summary-workspace').count()).toBe(0);
    expect(errors).toEqual([]); expect(unexpected).toEqual([]);
  } finally { await page.close(); }
});
