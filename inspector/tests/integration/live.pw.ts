import { expect, test } from '../playwright-fixture.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionKey, qualifiedSessionKey, recordSessionKey, recordInvocationKey } from '../../../src/recording/archive.js';
import { HistoricalArchiveWriter as ArchiveWriter } from '../../../test/legacy-recording-fixture.js';
import { SCHEMA_VERSION } from '../../../src/recording/contract.js';
import { openRecordedData, reveal } from '../ui-navigation.js';


const assets = { base: true, seed: async (directory: string) => {
  const unrelated = join(directory, sessionKey('unrelated-session'));
  await mkdir(unrelated, { mode: 0o700 });
  await writeFile(join(unrelated, 'pending.tmp'), 'in progress', { mode: 0o600 });
} };

test('fresh visits select the latest call without displaying another session’s warning', async ({ withInspector }) => {
  await withInspector('fresh-selection', async ({ page, app }) => {
    await page.locator('.rule-trigger').first().waitFor();
    expect(await page.locator('.invocation, .call-row').count()).toBe(0);
    expect(new URL(page.url()).searchParams.has('invocation')).toBe(false);
    expect(await page.locator('.rule-main-footer > p[role=status]').textContent()).toBe('Partial archive');
    expect(await page.locator('.issues-body').textContent()).not.toContain('Capture may be incomplete.');
    expect(await page.locator('.issues-body').textContent()).not.toContain('temporary-record');
    const response = await (await fetch(`${app.origin}/api/sessions`)).json();
    expect(response.issues.some((issue: { reason: string }) => issue.reason === 'temporary-record')).toBe(true);
    expect(await page.getByRole('button', { name: 'Refresh archive' }).isVisible()).toBe(false);
    await reveal(page, '.recording-issues');
    expect(await page.getByRole('button', { name: 'Refresh archive' }).isVisible()).toBe(true);
  }, assets);
});

test('polling discovers another session and delayed execution without losing the selected rule or evidence scroll', async ({ withInspector }) => {
  await withInspector('live-updates', async ({ page, directory, recorded }) => {
    const concerning = recorded!.records.find(record => record.callId === 'concerning')!;
    if (concerning.schemaVersion !== SCHEMA_VERSION) throw new Error('Current capture requires the current recording schema');
    await page.goto(`/?session=${recordSessionKey(concerning)}&invocation=${recordInvocationKey(concerning)}`);
    await page.locator('dialog[open] .invocation').waitFor();
    expect(await page.locator('.decision-title h2 span').textContent()).toBe('concerning');
    await openRecordedData(page);
    const evidence = page.locator('.submitted-evidence');
    const scroll = await evidence.evaluate(el => { el.scrollTop = 37; return el.scrollTop; });
    expect(scroll).toBeGreaterThan(0);
    const selectedRule = JSON.parse((await page.locator('.exact-rule-data pre').textContent())!).rules.map((rule: { text: string }) => rule.text);
    const discovered = new ArchiveWriter({ enabled: true, directory });
    const sink = discovered.bindHistorical({ sessionId: 'live-session', invocationId: 'live-invocation', callId: 'live-call', toolName: 'edit', cwd: '/live-project', mode: 'observe' }, 1);
    sink('begin', {}); sink('decision', { decision: 'ALLOW', reason: 'all-rules-pass' });
    sink('permission', { outcome: 'released' }); await discovered.close();
    await expect.poll(() => page.locator('.rule-session-option input').evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).value)), { timeout: 10_000 }).toContain(sessionKey('live-session'));
    expect(await page.locator('.decision-title h2 span').textContent()).toBe('concerning');
    const delayed = new ArchiveWriter({ enabled: true, directory });
    delayed.bindHistorical({ host: concerning.host, contextId: concerning.contextId, sessionId: concerning.sessionId, invocationId: concerning.invocationId, callId: concerning.callId,
      toolName: concerning.toolName, cwd: concerning.cwd, mode: concerning.mode }, 4)('execution', { outcome: 'executed', origin: 'pi-tool-result' });
    await delayed.close();
    await expect.poll(() => page.locator('.lifecycle').textContent(), { timeout: 10_000 }).toContain('executed');
    expect(JSON.parse((await page.locator('.exact-rule-data pre').textContent())!).rules.map((rule: { text: string }) => rule.text)).toEqual(selectedRule);
    expect(await evidence.evaluate(el => el.scrollTop)).toBe(scroll);
    expect(await page.locator('.decision-title h2 span').textContent()).toBe('concerning');
    const mixed = new ArchiveWriter({ enabled: true, directory });
    const claude = mixed.bindHistorical({ host: 'claude-code', contextId: 'child', sessionId: 'live-session', invocationId: 'mixed-invocation',
      callId: 'mixed-call', toolName: 'Bash', cwd: '/historical', mode: 'observe' }, 4);
    claude('begin', { adapterCoverage: { version: null, limitations: ['actual-host-unverified', 'approval-unavailable'] } });
    claude('decision', { decision: 'ALLOW', reason: 'all-rules-pass' });
    claude('permission', { outcome: 'released' });
    await mixed.close();
    const childKey = qualifiedSessionKey('claude-code', 'live-session', 'child');
    await expect.poll(() => page.locator(`.rule-session-option input[value="${childKey}"]`).count(), { timeout: 10_000 }).toBe(1);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('.rule-session-toggle').click(); await page.locator(`input[value="${childKey}"]`).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('session')).toBe(childKey);
    const rows = await (await page.request.get(`/api/sessions/${childKey}`)).json();
    await page.goto(`/?session=${childKey}&invocation=${rows.invocations[0].id}`);
    await page.locator('dialog[open] .invocation').waitFor();
    expect(await page.locator('.recording-details').textContent()).toContain('claude-code / child');
    expect(new URL(page.url()).searchParams.get('session')).toBe(qualifiedSessionKey('claude-code', 'live-session', 'child'));
    expect(await page.locator('.recording-details').textContent()).toContain('actual-host-unverified');
    await openRecordedData(page);
    await page.locator('.recording-details > summary').click();
    expect(await page.locator('.recording-details').textContent()).toMatch(/Would decide.*ALLOW.*Permission.*released.*Execution.*unknown/s);
    expect(await page.locator('.recording-details').textContent()).toContain('approval-unavailable');
    expect(await page.locator('.recording-issues').count()).toBe(1);
    expect(await page.locator('.issues-body').textContent()).not.toContain('Capture may be incomplete.');
    expect(await page.locator('.issues-body').textContent()).not.toContain('Writer-wide capture health');
  }, assets);
});

test('polling reconnects after transient failures without changing selection or showing unrelated warnings', async ({ withInspector }) => {
  await withInspector('poll-reconnection', async ({ page, app }) => {
    await page.locator('.rule-trigger').first().waitFor();
    const session = new URL(page.url()).searchParams.get('session');
    const rows = await (await fetch(`${app.origin}/api/sessions/${session}`)).json();
    await page.goto(`/?session=${session}&invocation=${rows.invocations[0].id}`);
    await page.locator('dialog[open] .invocation').waitFor();
    const id = await page.locator('.decision-title h2 span').textContent();
    let failures = 3;
    await page.route('**/api/sessions?*', route => failures-- > 0
      ? route.fulfill({ status: 503, body: '{}' }) : route.continue());
    await expect.poll(() => page.getByRole('alert').textContent(), { timeout: 12_000 }).toContain('reconnecting automatically');
    await expect.poll(() => page.getByRole('alert').count(), { timeout: 12_000 }).toBe(0);
    expect(await page.locator('.decision-title h2 span').textContent()).toBe(id);
    expect(await page.locator('.recording-issues').count()).toBe(1);
    expect(await page.locator('.issues-body').textContent()).not.toContain('Capture may be incomplete.');
    expect(await page.locator('.issues-body').textContent()).not.toContain('temporary-record');
    expect(await page.locator('.decision-summary').count()).toBe(1);
  }, assets);
});
