import { expect, test } from '../playwright-fixture.js';
import { mkdir } from 'node:fs/promises';
import { seedPreview, previewSession } from './preview-fixture.js';
import { sessionKey } from '../../../src/recording/archive.js';
test('fictional named facts fit the desktop and mobile first view', async ({ withInspector }) => {
  await withInspector('named-facts-preview', async ({ page }) => {
    await page.locator('.decision-summary').waitFor();
    await mkdir('coverage/inspector-artifacts', { recursive: true });
    expect(await page.locator('[data-fact="permission"]').textContent()).toBe('Not blocked by Tenet');
    expect(await page.locator('[data-fact="result"]').textContent()).toBe('Unknown / not recorded');
    expect(await page.locator('[data-fact="assessment"]').textContent()).toBe('Incomplete');
    await page.screenshot({ path: 'coverage/inspector-artifacts/tenet-59-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'coverage/inspector-artifacts/tenet-59-mobile.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('[data-fact="assessment"]').isVisible()).toBe(true);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.screenshot({ path: 'coverage/inspector-artifacts/tenet-59-mobile-calls.png' });
  }, { base: false, seed: seedPreview, path: `/?session=${sessionKey(previewSession)}&invocation=${sessionKey('format')}` });
});
