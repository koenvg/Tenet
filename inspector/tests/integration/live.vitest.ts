import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionKey } from '../../../src/recording/archive.js';
import { ArchiveWriter } from '../../../test/legacy-recording-fixture.js';
import { closeBrowser, launchBrowser, withInspector } from './fixture.js';

beforeAll(launchBrowser);
afterAll(closeBrowser);

const assets = { base: true, seed: async (directory: string) => {
  const unrelated = join(directory, sessionKey('unrelated-session'));
  await mkdir(unrelated, { mode: 0o700 });
  await writeFile(join(unrelated, 'pending.tmp'), 'in progress', { mode: 0o600 });
} };

test('fresh visits select the latest call without displaying another session’s warning', async () => {
  await withInspector('fresh-selection', async ({ page, app }) => {
    await page.locator('.decision-summary').waitFor();
    expect(await page.locator('.call-row[aria-pressed="true"]').count()).toBe(1);
    expect(await page.locator('.call-row[aria-pressed="true"] .call-id').textContent()).toBe(await page.locator('.call-row .call-id').first().textContent());
    expect(await page.getByRole('region', { name: 'Recording issues' }).count()).toBe(0);
    const response = await (await fetch(`${app.origin}/api/sessions`)).json();
    expect(response.issues.some((issue: { reason: string }) => issue.reason === 'temporary-record')).toBe(true);
    expect(await page.getByRole('button', { name: 'Refresh archive' }).count()).toBe(1);
  }, assets);
});

test('polling discovers another session and delayed execution without losing the selected rule or evidence scroll', async () => {
  await withInspector('live-updates', async ({ page, directory, recorded }) => {
    const concerning = recorded!.records.find(record => record.callId === 'concerning')!;
    await page.locator('.call-row').filter({ has: page.locator('.call-id', { hasText: 'concerning' }) }).waitFor();
    const row = page.locator('.call-row').filter({ has: page.locator('.call-id', { hasText: 'concerning' }) });
    await row.click();
    await expect.poll(() => page.locator('.call-row[aria-pressed="true"] .call-id').textContent()).toBe('concerning');
    await page.getByRole('button', { name: 'View shared evidence' }).click();
    const evidence = page.locator('#panel-Evidence');
    const scroll = await evidence.evaluate(el => { el.scrollTop = 37; return el.scrollTop; });
    expect(scroll).toBeGreaterThan(0);
    const selectedRule = await page.locator('.rule-row[aria-pressed="true"]').textContent();
    const discovered = new ArchiveWriter({ enabled: true, directory });
    const sink = discovered.bind({ sessionId: 'live-session', invocationId: 'live-invocation', callId: 'live-call', toolName: 'edit', cwd: '/live-project', mode: 'observe' });
    sink('begin', {}); sink('decision', { decision: 'ALLOW', reason: 'all-rules-pass' });
    sink('permission', { outcome: 'released' }); await discovered.close();
    await expect.poll(() => page.locator('.session-row strong').allTextContents(), { timeout: 10_000 }).toContain('live-session');
    expect(await page.locator('.call-row[aria-pressed="true"] .call-id').textContent()).toBe('concerning');
    const delayed = new ArchiveWriter({ enabled: true, directory });
    delayed.bind({ host: concerning.host, contextId: concerning.contextId, sessionId: concerning.sessionId, invocationId: concerning.invocationId, callId: concerning.callId,
      toolName: concerning.toolName, cwd: concerning.cwd, mode: concerning.mode })('execution', { outcome: 'executed', origin: 'pi-tool-result' });
    await delayed.close();
    await expect.poll(() => page.locator('.lifecycle').textContent(), { timeout: 10_000 }).toContain('executed');
    expect(await page.locator('.rule-row[aria-pressed="true"]').textContent()).toBe(selectedRule);
    expect(await evidence.evaluate(el => el.scrollTop)).toBe(scroll);
    expect(await page.locator('.call-row[aria-pressed="true"] .call-id').textContent()).toBe('concerning');
    expect(await page.getByRole('region', { name: 'Recording issues' }).count()).toBe(0);
  }, assets);
});

test('polling reconnects after transient failures without changing selection or showing unrelated warnings', async () => {
  await withInspector('poll-reconnection', async ({ page }) => {
    await page.locator('.decision-summary').waitFor();
    const id = await page.locator('.call-row[aria-pressed="true"] .call-id').textContent();
    let failures = 3;
    await page.route('**/api/sessions?*', route => failures-- > 0
      ? route.fulfill({ status: 503, body: '{}' }) : route.continue());
    await expect.poll(() => page.getByRole('alert').textContent(), { timeout: 12_000 }).toContain('reconnecting automatically');
    await expect.poll(() => page.getByRole('alert').count(), { timeout: 12_000 }).toBe(0);
    expect(await page.locator('.call-row[aria-pressed="true"] .call-id').textContent()).toBe(id);
    expect(await page.getByRole('region', { name: 'Recording issues' }).count()).toBe(0);
    expect(await page.locator('.decision-summary').count()).toBe(1);
  }, assets);
});
