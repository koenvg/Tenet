import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { closeBrowser, launchBrowser, withInspector } from './fixture.js';

beforeAll(launchBrowser);
afterAll(closeBrowser);

for (const width of [1280, 390]) test(`bundled wordmark font loads without network access at ${width}px`, async () => {
  await withInspector(`wordmark-font-${width}`, async ({ page, externalRequests }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.reload();
    await page.locator('.app-bar h1').waitFor();
    const fonts = await page.evaluate(async () => {
      const loaded = await document.fonts.load('700 34px "Kode Mono"', 'TENET');
      await document.fonts.ready;
      return {
        loaded: loaded.map(face => ({ family: face.family, status: face.status })),
        failed: [...document.fonts].filter(face => face.status === 'error').map(face => face.family),
        wordmarkFamily: getComputedStyle(document.querySelector('.app-bar h1')!).fontFamily,
      };
    });
    expect(fonts.loaded).toEqual([{ family: 'Kode Mono', status: 'loaded' }]);
    expect(fonts.failed).toEqual([]);
    expect(fonts.wordmarkFamily).toMatch(/^"Kode Mono", monospace$/);
    expect(externalRequests).toEqual([]);
    const artifacts = resolve('coverage/inspector-artifacts/playwright');
    await mkdir(artifacts, { recursive: true });
    await writeFile(resolve(artifacts, `wordmark-font-${width}.json`), JSON.stringify({ width, ...fonts, externalRequests }, null, 2));
    await page.screenshot({ path: resolve(artifacts, `wordmark-font-${width}.png`) });
  }, { base: false });
});

test('reader font policy blocks remote fonts before a network request', async () => {
  await withInspector('remote-font-policy', async ({ page, externalRequests }) => {
    const result = await page.evaluate(async () => {
      const violations: Array<{ directive: string; blockedURI: string }> = [];
      const record = (event: SecurityPolicyViolationEvent) => violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      document.addEventListener('securitypolicyviolation', record);
      const font = new FontFace('Forbidden remote font', 'url(https://font.invalid/remote.ttf)');
      let rejected = false;
      try { await font.load(); } catch { rejected = true; }
      await new Promise(resolve => setTimeout(resolve, 0));
      document.removeEventListener('securitypolicyviolation', record);
      return { rejected, violations };
    });
    expect(result.rejected).toBe(true);
    expect(result.violations).toEqual([{ directive: 'font-src', blockedURI: 'https://font.invalid/remote.ttf' }]);
    expect(externalRequests).toEqual([]);
  }, { base: false });
});
