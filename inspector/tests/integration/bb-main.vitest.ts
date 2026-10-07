import { afterAll, beforeAll, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const stopped = 'thr_stopped0001';
const stoppedPath = `project/proj_synthetic0001/overview/${stopped}`;
const noHistoryPath = 'project/proj_synthetic0001/overview/thr_nohistory01';
let server: ViteDevServer, browser: Browser, origin: string;
const artifacts = resolve('coverage/inspector-artifacts/tenet54');
beforeAll(async () => {
  server = await createServer({ configFile: false, root: resolve('bb-plugin-tenet-status'), server: { host: '127.0.0.1', port: 0 } });
  await server.listen(); origin = server.resolvedUrls!.local[0]!;
  browser = await chromium.launch({ headless: true }); await mkdir(artifacts, { recursive: true });
});
afterAll(async () => { await browser?.close(); await server?.close(); });
const reads = (page: Page) => page.evaluate(() => (window as any).tenetPreview.reads as { threadId: string; machine: string; selection: unknown }[]);

test('main picker reads no archives until selection; history restores scope/call/filter across simulated machines', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  try {
    await page.goto(`${origin}main.preview.html?host-query=keep`);
    await page.getByRole('button', { name: 'Synthetic local project', exact: true }).press('Enter');
    await page.getByRole('button', { name: /Stopped Pi/ }).waitFor();
    expect(await reads(page)).toHaveLength(0);
    await page.getByRole('button', { name: /Stopped Pi/ }).press('Enter');
    await page.locator('.call-row').first().waitFor();
    expect(await page.locator('.session-counts').innerText()).toContain('2 evaluator failures');
    await page.getByLabel('Finding category').selectOption('unavailable');
    await expect.poll(() => page.locator('.call-row').count()).toBe(2);
    await page.getByText('synthetic-provider-error-2', { exact: true }).click();
    await expect.poll(() => page.locator('.call-label').innerText()).toContain('synthetic-provider-error-2');
    const selectionPath = new URL(page.url()).hash;
    await page.getByRole('button', { name: 'Choose project', exact: true }).click();
    await page.getByRole('button', { name: 'Next projects' }).click();
    await page.getByRole('button', { name: 'Synthetic remote project', exact: true }).click();
    await page.getByRole('button', { name: /Remote Pi/ }).click();
    await expect.poll(() => page.locator('.call-label').innerText()).toContain('remote-synthetic');
    expect((await reads(page)).map(r => r.machine)).toContain('synthetic-machine-b');
    await page.goBack(); await page.getByRole('heading', { name: 'Choose a Pi thread' }).waitFor();
    await page.goBack(); await page.getByRole('heading', { name: 'Choose a project' }).waitFor();
    await page.goBack();
    await expect.poll(() => page.locator('.call-label').innerText()).toContain('synthetic-provider-error-2');
    expect(new URL(page.url()).hash).toBe(selectionPath);
    await page.goForward(); await page.getByRole('heading', { name: 'Choose a project' }).waitFor();
    expect(new URL(page.url()).search).toBe('?host-query=keep');
  } finally { await page.close(); }
});
for (const [width, narrow] of [[1440, false], [1440, true], [390, false]] as const)
  test(`shared main summary at ${width}px window / ${narrow ? '390px' : 'full'} container is keyboard-safe, inert and raw-free`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    const errors: string[] = [], unexpected: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(origin).origin && !url.pathname.startsWith('/api/')) return route.continue();
      unexpected.push(url.href); return route.abort();
    });
    try {
      await page.goto(`${origin}main.preview.html#${stoppedPath}`);
      await page.locator('.call-row').first().waitFor();
      if (narrow) await page.getByRole('button', { name: 'Toggle 390px container' }).click();
      const compact = narrow || width === 390;
      expect(await page.getByRole('button', { name: 'Calls', exact: true }).isVisible()).toBe(compact);
      if (compact) {
        await page.getByText('synthetic-provider-error-2', { exact: true }).click();
        await expect.poll(() => page.locator('.call-label').innerText()).toContain('synthetic-provider-error-2');
        expect(await page.locator('.inspection').isVisible()).toBe(true);
        expect(await page.locator('.explorer').isVisible()).toBe(false);
      }
      expect(await page.locator('.assessment-state').first().innerText()).toContain('unavailable · provider-error');
      await page.getByText('Archive warnings', { exact: true }).press('Enter');
      expect(await page.locator('.archive-messages details').innerText()).toContain('corrupt-record');
      await page.screenshot({ path: `${artifacts}/main-${width}-${narrow ? 'narrow' : 'full'}-failure.png`, fullPage: true });
      await page.getByLabel('Linked session').selectOption('a'.repeat(64));
      await expect.poll(() => page.locator('.session-counts').innerText()).toContain('1 selected FAIL');
      if (compact) await page.getByRole('button', { name: 'Summary', exact: true }).press('Enter');
      await page.locator('.why-disclosure > summary').press('Enter');
      await page.getByText('Selected check details', { exact: true }).press('Enter');
      expect(await page.getByText('<script>window.archiveExecuted=true</script>', { exact: true }).count()).toBeGreaterThan(0);
      expect(await page.locator('.main-container script').count()).toBe(0);
      expect(await page.evaluate(() => (window as any).archiveExecuted)).toBeUndefined();
      expect(await page.locator('.primary-status').innerText()).toContain('Ran');
      expect(await page.locator('.main-container').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.locator('.action-preview, .evidence-dock, .question-json').count()).toBe(0);
      await page.screenshot({ path: `${artifacts}/main-${width}-${narrow ? 'narrow' : 'full'}-selected-fail.png`, fullPage: true });
      await page.getByRole('button', { name: 'Choose project', exact: true }).press('Enter');
      await page.getByRole('button', { name: 'Synthetic local project', exact: true }).waitFor();
      expect(await page.locator('.tenet-summary-workspace').count()).toBe(0);
      expect(errors).toEqual([]); expect(unexpected).toEqual([]);
    } finally { await page.close(); }
  });
test('unlinked, unsupported, deleted, changed-scope, forged links and old findings never show prior clean-looking data', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  try {
    await page.goto(`${origin}main.preview.html#${stoppedPath}`);
    await page.locator('.call-row').first().waitFor();
    await page.getByRole('button', { name: 'View flagged rules', exact: true }).click();
    await page.getByRole('heading', { name: 'Focused flagged rules' }).waitFor();
    expect(new URL(page.url()).hash).toBe(`#${stopped}`);
    const before = (await reads(page)).length;
    for (const [button, message] of [['Non-Pi link', /supports Pi threads only/], ['Deleted link', /unavailable or deleted/],
      ['Changed-scope link', /project changed/]] as const) {
      await page.getByRole('button', { name: button, exact: true }).click(); await page.getByText(message).waitFor();
      expect(await page.locator('.call-row, .common-summary').count()).toBe(0); expect(await reads(page)).toHaveLength(before);
    }
    await page.getByRole('button', { name: 'Forged record link' }).click();
    await page.getByText(/Read unavailable or selection rejected/).waitFor();
    expect(await page.locator('.call-row, .common-summary').count()).toBe(0);
    await page.evaluate(path => (window as any).tenetPreview.navigate(path), noHistoryPath);
    await page.getByText('No recordings linked to this thread. Assessment unknown, not pass.').waitFor();
    await page.screenshot({ path: `${artifacts}/main-unknown.png`, fullPage: true });
  } finally { await page.close(); }
});
