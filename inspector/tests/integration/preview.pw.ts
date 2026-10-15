import { expect, test } from '../playwright-fixture.js';
import { mkdir } from 'node:fs/promises';
import { sessionKey } from '../../../src/recording/archive.js';
import { hostileCommand, previewSession, seedPreview } from './preview-fixture.js';
import { openRecordedData } from '../ui-navigation.js';


test('fictional command and file previews remain inert, private and usable at desktop and mobile widths', async ({ withInspector }) => {
  await withInspector('recorded-action-preview', async ({ page, app, externalRequests }) => {
    await page.locator('.decision-summary').waitFor();
    const rows = (await (await page.request.get(`/api/sessions/${sessionKey(previewSession)}`)).json()).invocations;
    const previews = rows.map((row: any) => row.actionPreview.value);
    expect(previews).toEqual(expect.arrayContaining(['src/billing/format.ts', 'src/billing/totals.ts', 'bun test test/format.test.ts', null]));
    expect(rows.some((row: any) => row.actionPreview.shortened)).toBe(true);
    expect(await page.locator('.rule-main script, .rule-main img').count()).toBe(0);
    expect(rows.filter((row: any) => row.actionPreview.value?.includes('https://invalid.example/private'))).toHaveLength(1);
    await page.goto(`/?session=${sessionKey(previewSession)}&invocation=${sessionKey('hostile')}`);
    await page.locator('dialog[open] .invocation').waitFor();
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
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.screenshot({ path: 'coverage/inspector-artifacts/preview-mobile-rules.png' });
    await page.goto(`/?session=${sessionKey(previewSession)}&invocation=${sessionKey('totals')}`);
    await page.locator('dialog[open] .invocation').waitFor();
    expect(page.url()).toContain('invocation=' + sessionKey('totals'));
    await page.screenshot({ path: 'coverage/inspector-artifacts/preview-mobile-detail.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(externalRequests).toEqual([]);
  }, { base: false, seed: seedPreview, path: '/?session=' + sessionKey(previewSession) + '&invocation=' + sessionKey('format') });
});
