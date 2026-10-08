import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionKey, qualifiedSessionKey } from '../../../src/recording/archive.js';
import { HistoricalArchiveWriter as ArchiveWriter } from '../../../test/legacy-recording-fixture.js';
import { SCHEMA_VERSION } from '../../../src/recording/contract.js';
import { closeBrowser, launchBrowser, withInspector } from './fixture.js';
import { openRecordedData, reveal } from '../ui-navigation.js';

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
    expect(await page.getByRole('region', { name: 'Recording issues' }).count()).toBe(1);
    expect(await page.locator('.archive-state > p').textContent()).toBe('Partial archive');
    expect(await page.locator('.issues-body').textContent()).not.toContain('Capture may be incomplete.');
    expect(await page.locator('.issues-body').textContent()).not.toContain('temporary-record');
    const response = await (await fetch(`${app.origin}/api/sessions`)).json();
    expect(response.issues.some((issue: { reason: string }) => issue.reason === 'temporary-record')).toBe(true);
    expect(await page.getByRole('button', { name: 'Refresh archive' }).count()).toBe(0);
    await reveal(page, '.session-picker');
    expect(await page.getByRole('button', { name: 'Refresh archive' }).count()).toBe(1);
  }, assets);
});

test('polling discovers another session and delayed execution without losing the selected rule or evidence scroll', async () => {
  await withInspector('live-updates', async ({ page, directory, recorded }) => {
    const concerning = recorded!.records.find(record => record.callId === 'concerning')!;
    if (concerning.schemaVersion !== SCHEMA_VERSION) throw new Error('Current capture requires the current recording schema');
    await page.locator('.call-row').filter({ has: page.locator('.call-id', { hasText: 'concerning' }) }).waitFor();
    const row = page.locator('.call-row').filter({ has: page.locator('.call-id', { hasText: 'concerning' }) });
    await row.click();
    await expect.poll(() => page.locator('.call-row[aria-pressed="true"] .call-id').textContent()).toBe('concerning');
    await openRecordedData(page);
    const evidence = page.locator('.submitted-evidence');
    const scroll = await evidence.evaluate(el => { el.scrollTop = 37; return el.scrollTop; });
    expect(scroll).toBeGreaterThan(0);
    const selectedRule = JSON.parse((await page.locator('.exact-rule-data pre').textContent())!).rules.map((rule: { text: string }) => rule.text);
    const discovered = new ArchiveWriter({ enabled: true, directory });
    const sink = discovered.bindHistorical({ sessionId: 'live-session', invocationId: 'live-invocation', callId: 'live-call', toolName: 'edit', cwd: '/live-project', mode: 'observe' }, 1);
    sink('begin', {}); sink('decision', { decision: 'ALLOW', reason: 'all-rules-pass' });
    sink('permission', { outcome: 'released' }); await discovered.close();
    await expect.poll(() => page.locator('.session-row strong').allTextContents(), { timeout: 10_000 }).toContain('live-session');
    expect(await page.locator('.call-row[aria-pressed="true"] .call-id').textContent()).toBe('concerning');
    const delayed = new ArchiveWriter({ enabled: true, directory });
    delayed.bindHistorical({ host: concerning.host, contextId: concerning.contextId, sessionId: concerning.sessionId, invocationId: concerning.invocationId, callId: concerning.callId,
      toolName: concerning.toolName, cwd: concerning.cwd, mode: concerning.mode }, 4)('execution', { outcome: 'executed', origin: 'pi-tool-result' });
    await delayed.close();
    await expect.poll(() => page.locator('.lifecycle').textContent(), { timeout: 10_000 }).toContain('executed');
    expect(JSON.parse((await page.locator('.exact-rule-data pre').textContent())!).rules.map((rule: { text: string }) => rule.text)).toEqual(selectedRule);
    expect(await evidence.evaluate(el => el.scrollTop)).toBe(scroll);
    expect(await page.locator('.call-row[aria-pressed="true"] .call-id').textContent()).toBe('concerning');
    const mixed = new ArchiveWriter({ enabled: true, directory });
    const claude = mixed.bindHistorical({ host: 'claude-code', contextId: 'child', sessionId: 'live-session', invocationId: 'mixed-invocation',
      callId: 'mixed-call', toolName: 'Bash', cwd: '/historical', mode: 'observe' }, 4);
    claude('begin', { adapterCoverage: { version: null, limitations: ['actual-host-unverified', 'approval-unavailable'] } });
    claude('decision', { decision: 'ALLOW', reason: 'all-rules-pass' });
    claude('permission', { outcome: 'released' });
    await mixed.close();
    await expect.poll(() => page.locator('.session-row').allTextContents(), { timeout: 10_000 })
      .toEqual(expect.arrayContaining([expect.stringContaining('claude-code / child')]));
    await page.locator('.session-picker summary').click();
    await page.locator('.session-row').filter({ hasText: 'claude-code / child' }).click();
    await expect.poll(() => page.locator('.recording-details').textContent()).toContain('claude-code / child');
    expect(new URL(page.url()).searchParams.get('session')).toBe(qualifiedSessionKey('claude-code', 'live-session', 'child'));
    expect(await page.locator('.recording-details').textContent()).toContain('actual-host-unverified');
    await openRecordedData(page);
    await page.locator('.recording-details > summary').click();
    expect(await page.locator('.recording-details').textContent()).toMatch(/Would decide.*ALLOW.*Permission.*released.*Execution.*unknown/s);
    expect(await page.locator('.recording-details').textContent()).toContain('approval-unavailable');
    expect(await page.getByRole('region', { name: 'Recording issues' }).count()).toBe(1);
    expect(await page.locator('.issues-body').textContent()).not.toContain('Capture may be incomplete.');
    expect(await page.locator('.issues-body').textContent()).not.toContain('Writer-wide capture health');
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
    expect(await page.getByRole('region', { name: 'Recording issues' }).count()).toBe(1);
    expect(await page.locator('.issues-body').textContent()).not.toContain('Capture may be incomplete.');
    expect(await page.locator('.issues-body').textContent()).not.toContain('temporary-record');
    expect(await page.locator('.decision-summary').count()).toBe(1);
  }, assets);
});
