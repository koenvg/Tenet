import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { sessionKey } from '../../../src/recording/archive.js';
import { closeBrowser, launchBrowser, withInspector } from './fixture.js';
import { hostileCommand, previewSession, seedPreview } from './preview-fixture.js';
import { openRecordedData } from '../ui-navigation.js';

beforeAll(launchBrowser);
afterAll(closeBrowser);

test('fictional command and file previews remain inert, private and usable at desktop and mobile widths', async () => {
  await withInspector('recorded-action-preview', async ({ page, app, externalRequests }) => {
    await page.locator('.decision-summary').waitFor();
    const list = page.getByRole('navigation', { name: 'Invocations' });
    for (const label of ['src/billing/format.ts', 'src/billing/totals.ts', 'bun test test/format.test.ts', 'Action preview unavailable', 'Preview shortened']) {
      await expect(list.getByText(label, { exact: true }).isVisible()).resolves.toBe(true);
    }
    expect(await list.locator('script, a, img').count()).toBe(0);
    const hostile = list.locator('.call-row').filter({ hasText: 'https://invalid.example/private' });
    expect(await hostile.count()).toBe(1);
    await hostile.click();
    expect(page.url()).toContain('invocation=' + sessionKey('hostile'));
    expect(page.url()).not.toContain('invalid.example');
    await openRecordedData(page);
    const action = page.locator('.evidence-section').filter({ hasText: 'state.action' }).locator('pre');
    expect(JSON.parse((await action.textContent())!).arguments.command).toBe(hostileCommand);
    const response = await fetch(app.origin + '/api/sessions/' + sessionKey(previewSession));
    const data = await response.json();
    expect(data.invocations.every((row: any) => row.actionPreview.value === null || Buffer.byteLength(row.actionPreview.value) <= 512)).toBe(true);
    expect(JSON.stringify(data)).not.toContain('fictional old value');
    await mkdir('coverage/inspector-artifacts', { recursive: true });
    await page.screenshot({ path: 'coverage/inspector-artifacts/preview-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Calls', exact: true }).click();
    await page.screenshot({ path: 'coverage/inspector-artifacts/preview-mobile-calls.png' });
    await list.getByText('src/billing/totals.ts', { exact: true }).click();
    expect(page.url()).toContain('invocation=' + sessionKey('totals'));
    await page.screenshot({ path: 'coverage/inspector-artifacts/preview-mobile-detail.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(externalRequests).toEqual([]);
  }, { base: false, seed: seedPreview, path: '/?session=' + sessionKey(previewSession) + '&invocation=' + sessionKey('format') });
});
