import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, test } from '../playwright-fixture.js';
import { sessionKey, qualifiedSessionKey, recordInvocationKey } from '../../../src/recording/archive.js';
import { FixtureArchiveWriter as ArchiveWriter } from '../../../test/archive-fixture.js';
import { recordFailureFixture } from '../../../test/failure-fixture.js';
import { openRecordedData, reveal } from '../ui-navigation.js';


const call = async (page: import('playwright').Page, id: string) => {
  const session = new URL(page.url()).searchParams.get('session');
  const data = await (await page.request.get(`/api/sessions/${session}?limit=100`)).json();
  const row = data.invocations.find((item: { callId: string }) => item.callId === id);
  expect(row?.id).toMatch(/^[a-f0-9]{64}$/);
  await page.goto(`/?session=${session}&invocation=${row.id}`);
  await page.locator('.decision-summary').waitFor();
};

const openPicker = async (page: import('playwright').Page) => {
  if (await page.locator('dialog[open]').count()) await page.getByRole('button', { name: 'Close', exact: true }).click();
  await reveal(page, '.recording-issues');
  await page.getByRole('textbox', { name: 'Project directory' }).waitFor({ state: 'visible' });
};

test('project filters and cursor pagination retain a safe deep link through background refresh', async ({ withInspector }) => {
  const arbitrary = '../雪 ?#%';
  await withInspector('filtered-pagination', async ({ page, open }) => {
    await page.getByRole('heading', { name: 'Did this session follow the rules?' }).waitFor();
    await openPicker(page);
    await page.getByRole('textbox', { name: 'Project directory' }).fill('/second-project');
    await page.getByRole('button', { name: 'Filter projects' }).click();
    await page.locator('.rule-session-toggle').click();
    await expect.poll(() => page.getByRole('radio').count()).toBe(1);
    await page.getByRole('radio').click();
    await expect.poll(() => new URL(page.url()).searchParams.get('session')).toBe(sessionKey(arbitrary));
    const rows = await (await page.request.get(`/api/sessions/${sessionKey(arbitrary)}?limit=50`)).json();
    expect(rows.invocations).toHaveLength(50);
    expect(typeof rows.next).toBe('string');
    const next = await (await page.request.get(`/api/sessions/${sessionKey(arbitrary)}?cursor=${rows.next}`)).json();
    expect(next.invocations).toHaveLength(5);
    await call(page, 'reused');
    const selectedLink = page.url();
    expect(new URL(selectedLink).searchParams.get('session')).toBe(sessionKey(arbitrary));
    expect(new URL(selectedLink).searchParams.get('invocation')).toMatch(/^[a-f0-9]{64}$/);
    expect(selectedLink).not.toContain('window.hostile');
    let polls = 0;
    page.on('response', response => { if (response.url().includes('/rules')) polls++; });
    await expect.poll(() => polls, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(page.url()).toBe(selectedLink);
    await page.goto(`/?session=${sessionKey(arbitrary)}&invocation=${sessionKey('page-0')}`);
    await page.locator('dialog[open] .invocation').waitFor();
    await reveal(page, '.recorded-disclosure'); await reveal(page, '.recording-details'); await reveal(page, '.record-identifiers');
    expect(await page.getByLabel('Recorded invocation ID', { exact: true }).inputValue()).toBe('page-0');
    expect(await page.getByLabel('Recorded session ID', { exact: true }).inputValue()).toBe(arbitrary);
    await page.goto('/?session=../../unsafe&invocation=bad');
    await expect.poll(() => page.getByRole('alert').textContent()).toContain('Invalid');
    await page.goto('/'); await page.locator('.rule-session-toggle').waitFor();
    await openPicker(page);
    await page.getByRole('textbox', { name: 'Project directory' }).fill('/no-recordings');
    await page.getByRole('button', { name: 'Filter projects' }).click();
    await page.locator('.rule-session-toggle').click();
    await expect.poll(() => page.getByRole('radio').count()).toBe(0);
    expect(await page.locator('.rule-session-menu').textContent()).toContain('No recorded sessions.');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'All projects' }).click();
    await page.locator('.rule-session-toggle').click();
    await expect.poll(() => page.getByRole('radio').count()).toBe(2);
    const linked = await open(`/?session=${sessionKey(arbitrary)}&invocation=${sessionKey('page-0')}`);
    await reveal(linked, '.recorded-disclosure'); await reveal(linked, '.recording-details'); await reveal(linked, '.record-identifiers');
    expect(await linked.getByLabel('Recorded invocation ID', { exact: true }).inputValue()).toBe('page-0');
    await linked.close();
  }, { base: false, seed: async directory => {
    const writer = new ArchiveWriter({ enabled: true, directory });
    for (let n = 0; n < 55; n++) writer.bindHistorical({ sessionId: arbitrary, invocationId: `page-${n}`, callId: 'reused', toolName: 'edit', cwd: '/second-project', mode: 'observe' }, 1)('begin', {});
    writer.bindHistorical({ sessionId: 'fork', invocationId: 'fork-call', callId: 'reused', toolName: 'edit', cwd: '/third-project', mode: 'observe' }, 1)('begin', {});
    await writer.complete();
  } });
});

test('fresh link opens an older session omitted from the first picker page', async ({ withInspector }) => {
  const oldKey = sessionKey('older-session');
  await withInspector('older-session-link', async ({ page, app }) => {
    const firstPage = await (await fetch(`${app.origin}/api/sessions`)).json();
    expect(firstPage.sessions).toHaveLength(50);
    expect(firstPage.sessions.some((item: { sessionId: string }) => item.sessionId === 'older-session')).toBe(false);
    await page.getByText('Waiting for recorded rules in this session.', { exact: true }).waitFor();
    expect(await page.locator('.invocation').count()).toBe(0);
    expect(await page.locator('.rule-session-toggle').textContent()).toContain('Selected session');
  }, { base: false, path: `/?session=${oldKey}`, seed: async directory => {
    const writer = new ArchiveWriter({ enabled: true, directory });
    writer.bindHistorical({ sessionId: 'older-session', invocationId: 'older-call', callId: 'older-call', toolName: 'read', mode: 'observe', cwd: '/old-project' }, 1)('begin', {});
    await writer.settle();
    await new Promise(resolve => setTimeout(resolve, 25)); // Distinct sort timestamp for the first page.
    for (let n = 0; n < 52; n++) writer.bindHistorical({ sessionId: `new-${n}`, invocationId: `new-${n}`, callId: `new-${n}`, toolName: 'read', mode: 'observe', cwd: '/new-project' }, 1)('begin', {});
    await writer.complete();
  } });
});

test('unrecorded linked session waits without borrowing another session’s calls', async ({ withInspector }) => {
  const emptyKey = sessionKey('not-yet-recorded');
  await withInspector('empty-linked-session', async ({ page }) => {
    await page.getByText('Waiting for recorded rules in this session.', { exact: true }).waitFor();
    expect(new URL(page.url()).searchParams.get('session')).toBe(emptyKey);
    expect(await page.locator('.invocation, .rule-trigger').count()).toBe(0);
    expect(await page.locator('.rule-session-toggle').textContent()).toContain('Selected session');
    await page.locator('.rule-session-toggle').click();
    await page.locator(`input[value="${qualifiedSessionKey('pi', 's', 'main')}"]`).click();
    expect(new URL(page.url()).searchParams.get('session')).toBe(qualifiedSessionKey('pi', 's', 'main'));
  }, { path: `/?session=${emptyKey}` });
});

test('corrupt and interrupted captures remain unavailable, and archive errors recover', async ({ withInspector }) => {
  await withInspector('failure-history', async ({ page }) => {
    await page.getByRole('heading', { name: 'Did this session follow the rules?' }).waitFor();
    await page.goto(`/?session=${qualifiedSessionKey('pi', 'failure-history', 'main')}`);
    await page.getByRole('heading', { name: 'Did this session follow the rules?' }).waitFor();
    const rows = await (await page.request.get(`/api/sessions/${qualifiedSessionKey('pi', 'failure-history', 'main')}`)).json();
    expect(rows.invocations).toHaveLength(8);
    const issues = page.locator('.recording-issues');
    await issues.locator('summary').click();
    for (const reason of ['temporary-record', 'corrupt-record', 'unsupported-schema', 'Writer-wide capture health']) {
      expect(await issues.textContent()).toContain(reason);
    }
    for (const kind of ['missing-credentials', 'provider-error', 'invalid-response', 'interrupted', 'truncated-response', 'unavailable-response', 'missing-payload', 'capture-loss']) {
      await call(page, kind);
      const detail = await page.locator('.invocation').textContent();
      if (kind === 'interrupted' || kind === 'capture-loss') {
        expect(await page.locator('[data-fact="assessment"]').textContent()).toBe('Incomplete');
        expect(detail).toContain('unknown');
        expect(JSON.parse((await page.locator('.exact-rule-data pre').textContent())!).rules.every((rule: { result: unknown }) => rule.result === null)).toBe(true);
      } else expect(await page.locator('[data-fact="assessment"]').textContent()).toBe('Unavailable');
      if (kind === 'missing-credentials') expect(detail).toContain('not submitted');
      if (kind === 'missing-payload') expect(detail).toContain('submitted; payload unavailable');
      if (kind === 'truncated-response') expect(detail).toContain('Response truncated');
      if (kind === 'unavailable-response') expect(detail).toContain('Response snapshot unavailable');
      expect(await page.locator('.invocation script').count()).toBe(0);
    }
    await openPicker(page);
    await page.goto(`/?session=${sessionKey('historical-incomplete')}`);
    await call(page, 'incomplete');
    expect(await page.locator('.decision-explanation').textContent()).toMatch(/timeout.*not recorded/);
    expect(JSON.parse((await page.locator('.exact-rule-data pre').textContent())!).rules.every((rule: { gateIds: unknown }) => rule.gateIds === null)).toBe(true);
    await openRecordedData(page);
    expect(await page.locator('.submitted-evidence').textContent()).toContain('Submitted evidence unavailable');
    await reveal(page, '.recorded-response');
    expect(await page.locator('.recorded-response').textContent()).toContain('2000000');
    expect(await page.locator('.recorded-response').textContent()).toContain('"truncated": true');
    expect(await page.locator('.invocation script').count()).toBe(0);
    expect(await page.locator('body').textContent()).not.toContain('fixture-transport-secret');
    await page.route('**/api/sessions?*', route => route.fulfill({ status: 503, body: '{}' }));
    await openPicker(page);
    await page.getByRole('button', { name: 'Refresh archive' }).click();
    await expect.poll(() => page.getByRole('alert').textContent()).toContain('503');
    await page.unroute('**/api/sessions?*');
    await page.getByRole('button', { name: 'Refresh archive' }).click();
    await expect.poll(() => page.getByRole('alert').count()).toBe(0);
    await call(page, 'incomplete');
    expect(await page.locator('.invocation').count()).toBe(1);
  }, { base: false, seed: async directory => {
    await recordFailureFixture(directory);
    const writer = new ArchiveWriter({ enabled: true, directory });
    const sink = writer.bindHistorical({ sessionId: 'historical-incomplete', invocationId: 'incomplete', callId: 'incomplete', toolName: 'edit', mode: 'enforce', cwd: '/historical' }, 1);
    sink('begin', { policy: { rules: [{ id: 'old-rule', line: 7, text: 'Historical rule', enforcement: 'BLOCK' }] } });
    sink('decision', { decision: 'BLOCK', reason: 'timeout' });
    sink('response', { preview: '<script>window.hostile=true</script>', truncated: true, bytes: 2000000 });
    await writer.complete();
  } });
});

test('mixed schema-1 Pi and host-qualified Pi/Claude links keep evidence and outcomes separate', async ({ withInspector }) => {
  await withInspector('mixed-host-archive', async ({ page, app, open }) => {
    const sessions = (await (await fetch(`${app.origin}/api/sessions`)).json()).sessions as Array<{ id: string; host: string; contextId: string }>;
    expect(sessions).toHaveLength(4);
    expect(new Set(sessions.map(session => session.id)).size).toBe(4);
    expect(sessions.filter(session => session.host === 'claude-code')).toHaveLength(2);
    const legacy = await open(`/?session=${sessionKey('same')}&invocation=${sessionKey('same')}`);
    await legacy.locator('.decision-summary').waitFor();
    expect(await legacy.locator('.recording-details').textContent()).toContain('pi / main');
    expect(await legacy.locator('.recording-details').textContent()).toContain('legacy-pi-coverage-not-recorded');
    expect(await legacy.locator('.exact-rule-data pre').textContent()).toContain('Historical rule');
    await legacy.close();
    const child = sessions.find(session => session.host === 'claude-code' && session.contextId === 'child')!;
    const calls = (await (await fetch(`${app.origin}/api/sessions/${child.id}`)).json()).invocations;
    expect(calls).toHaveLength(1);
    await page.goto(`${app.origin}/?session=${child.id}&invocation=${calls[0].id}`);
    await page.locator('.decision-summary').waitFor();
    expect(await page.locator('.recording-details').textContent()).toContain('actual-host-unverified');
    expect(await page.locator('.primary-status').textContent()).toContain('Failed');
    await reveal(page, '.recorded-disclosure');
    await page.locator('.recording-details > summary').click();
    expect(await page.locator('.recording-details').textContent()).toMatch(/Would decide.*ALLOW.*Permission.*released.*Execution.*failed/s);
    expect(await page.locator('.recording-details').textContent()).toContain('approval-unavailable');
    const parent = sessions.find(session => session.host === 'claude-code' && session.contextId === 'main')!;
    const parentCalls = (await (await fetch(`${app.origin}/api/sessions/${parent.id}`)).json()).invocations;
    expect(parentCalls[0].execution).toBe('unknown');
    expect((await fetch(`${app.origin}/api/sessions/${child.id}`, { method: 'POST' })).status).toBe(405);
  }, { base: false, seed: async directory => {
    const writer = new ArchiveWriter({ enabled: true, directory });
    const identity = { sessionId: 'same', invocationId: 'same', callId: 'same', toolName: 'Bash', cwd: '/historical', mode: 'observe' as const };
    const legacy = writer.bindHistorical(identity, 1);
    legacy('begin', { policy: { rules: [{ id: 'old', text: 'Historical rule', line: 1, enforcement: 'BLOCK' }] }, config: { effectThreshold: 0.83 } });
    legacy('decision', { decision: 'BLOCK' });
    for (const [host, contextId] of [['pi', 'main'], ['claude-code', 'main'], ['claude-code', 'child']] as const) {
      const sink = writer.bindHistorical({ ...identity, host, contextId }, 4);
      sink('begin', { adapterCoverage: { version: null, limitations: ['actual-host-unverified', 'approval-unavailable'] } });
      sink('decision', { decision: 'ALLOW' }); sink('permission', { outcome: 'released' });
      if (contextId === 'child') sink('execution', { outcome: 'failed' });
    }
    await writer.complete();
  } });
});

test('real archive preserves group API, direct category filtering, individual links and newer-record notices', async ({ withInspector }) => {
  const key = sessionKey('triage-browser');
  await withInspector('triage-browser', async ({ page, app, open }) => {
    await page.getByRole('heading', { name: 'Did this session follow the rules?' }).waitFor();
    const status = await (await fetch(`${app.origin}/api/status`)).json();
    expect(status.reader.supportedSchemas).toEqual([1, 2, 3, 4, 5]);
    expect(status.reader.unsupported).toBe(1);
    expect(status.reader.newerUnsupported).toBe(1);
    expect(status.reader.build).toMatch(/^tenet-reader-/);
    const data = await (await fetch(`${app.origin}/api/sessions/${key}?category=uncertainty`)).json();
    expect(data.invocations).toHaveLength(3);
    expect(data.groups).toBeUndefined();
    const grouped = await (await fetch(`${app.origin}/api/sessions/${key}/groups`)).json();
    expect(grouped.groups.items).toHaveLength(2);
    expect(grouped.groups.items.find((g: { count: number }) => g.count === 2)?.invocations).toHaveLength(2);
    expect(new Set(grouped.groups.items.map((g: { policyIdentity: string }) => g.policyIdentity)).size).toBe(2);
    for (const group of grouped.groups.items) {
      expect(group.ruleId).toBe('r');
      expect(group.gate).toBe('evidence-confidence-below-threshold');
      expect(group.policyIdentity).toContain('/triage/');
      expect(group.first).toBeLessThanOrEqual(group.last);
      expect(group.invocations.every((ref: { id: string }) => /^[a-f0-9]{64}$/.test(ref.id))).toBe(true);
    }
    expect((await fetch(`${app.origin}/api/sessions/${key}?category=not-a-category`)).status).toBe(400);
    await page.locator('.recording-issues > summary').click();
    await expect.poll(() => page.locator('.reader-coverage').textContent()).toContain('1 unsupported schema records (1 newer)');
    expect(await page.locator('.issues-body').textContent()).toContain('A rebuild alone does not update a running reader.');
    expect(await page.locator('.issues-body').textContent()).toContain('supported recording schemas 1, 2, 3');
    expect((await (await page.request.get(`/api/sessions/${key}?category=approval`)).json()).invocations).toHaveLength(1);
    expect((await (await page.request.get(`/api/sessions/${key}?category=violation`)).json()).invocations).toHaveLength(0);
    expect(await page.locator('.repeated-uncertainty, .uncertainty-group, #finding-category').count()).toBe(0);
    await call(page, 'first');
    expect(await page.locator('.decision-title h2 span').textContent()).toBe('first');
    await page.setViewportSize({ width: 390, height: 844 });
    const link = page.url();
    expect(new URL(link).searchParams.get('session')).toBe(key);
    const reopened = await open(new URL(link).pathname + new URL(link).search);
    expect(await reopened.locator('.decision-title h2 span').textContent()).toBe('first');
    await reopened.close();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await reveal(page, '.recording-issues');
    expect(await page.locator('.issues-body').textContent()).toContain('A rebuild alone does not update a running reader.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }, { base: false, path: `/?session=${key}`, seed: async directory => {
    const writer = new ArchiveWriter({ enabled: true, directory });
    for (const [id, target] of [['first', '/triage/TENET.md'], ['second', '/triage/TENET.md'], ['third', '/triage/alternate/TENET.md']] as const) {
      const sink = writer.bindHistorical({ sessionId: 'triage-browser', invocationId: id, callId: id, toolName: 'read', cwd: '/triage', mode: 'observe' }, 1);
      const policy = { source: '/triage/TENET.md', digest: 'A', target, rules: [{ id: 'r', text: 'Rule', line: 1, enforcement: 'BLOCK' }] };
      sink('begin', { policy, config: { assessmentProfile: 'legacy' } });
      if (id === 'second') sink('validation', { valid: true, assessment: { model: 'offline', rules: [{ ruleId: 'r', outcome: { choice: 'APPROVAL_REQUIRED' } }] } });
      else sink('assessment', { assessment: { model: 'offline', rules: [{ ruleId: 'r', outcome: { choice: 'PASS' } }] } });
      sink('decision', { decision: 'BLOCK', reason: 'insufficient-evidence', contributions: [{ ruleId: 'r', gates: ['evidence-confidence-below-threshold'] }] });
      sink('permission', { outcome: 'released' });
      sink('execution', { outcome: 'executed' });
    }
    await writer.complete();
    await writeFile(join(directory, key, 'newer.json'), JSON.stringify({ schemaVersion: 999 }), { mode: 0o600 });
  } });
});

test('schema 3 lifecycle deep links keep pending and dropped apart from permission and execution', async ({ withInspector }) => {
  const key = qualifiedSessionKey('pi', 'lifecycle-browser', 'main');
  await withInspector('lifecycle-browser', async ({ page, app, open }) => {
    await page.getByRole('heading', { name: 'Did this session follow the rules?' }).waitFor();
    const rows = (await (await fetch(`${app.origin}/api/sessions/${key}`)).json()).invocations;
    expect(rows).toHaveLength(3);
    for (const status of ['pending', 'dropped']) {
      const row = rows.find((r: { callId: string }) => r.callId === status);
      expect(row.categories).toEqual(['pending']);
      const linked = await open(`/?session=${key}&invocation=${row.id}`);
      await expect.poll(() => linked.locator('[data-fact="assessment"]').textContent()).toBe(status[0]!.toUpperCase() + status.slice(1));
      await expect.poll(() => linked.locator('[data-fact="assessment"]').textContent()).toBe(status[0]!.toUpperCase() + status.slice(1));
    await reveal(linked, '.recorded-disclosure');
      await linked.locator('.recording-details > summary').click();
      expect(await linked.locator('.recording-details').textContent()).toContain('Recording schemas3');
      expect(await linked.locator('.recording-details').textContent()).toContain('Assessment profilelegacy');
      expect(await linked.locator('.recording-details').textContent()).toContain('Would decideunavailable');
      await linked.close();
    }
  }, { base: false, path: `/?session=${key}`, seed: async directory => {
    const writer = new ArchiveWriter({ enabled: true, directory });
    writer.bindHistorical({ sessionId: 'lifecycle-browser', invocationId: 'old', callId: 'old', toolName: 'read', cwd: '/p', mode: 'observe', host: 'pi', contextId: 'main' }, 4)('begin', {});
    await writer.complete();
    const folder = join(directory, key), base = JSON.parse(await readFile(join(folder, (await readdir(folder))[0]!), 'utf8'));
    for (const [id, status] of [['pending', 'pending'], ['dropped', 'dropped']] as const) {
      const record = { ...base, schemaVersion: 3, invocationId: id, callId: id, eventId: randomUUID(),
        stage: 'assessment-status', data: { status, reason: status === 'dropped' ? 'queue-capacity' : 'not-started', profile: 'legacy' } };
      const idHash = recordInvocationKey(record);
      expect(idHash).toMatch(/^[a-f0-9]{64}$/);
      await writeFile(join(folder, `${id}.json`), JSON.stringify(record), { mode: 0o600 });
    }
  } });
});

test('schema 3 pending deep link is ready after a delayed archive response', async ({ withInspector }) => {
  const key = qualifiedSessionKey('pi', 'delayed-lifecycle', 'main');
  await withInspector('delayed-lifecycle', async ({ page, app, open }) => {
    await page.getByRole('heading', { name: 'Did this session follow the rules?' }).waitFor();
    const rows = (await (await fetch(`${app.origin}/api/sessions/${key}`)).json()).invocations;
    expect(rows).toHaveLength(1);
    expect(rows[0].categories).toEqual(['pending']);
    await page.context().route(`**/api/sessions/${key}/invocations/${rows[0].id}`, async route => {
      const response = await route.fetch();
      const body = await response.json();
      expect(body.view.assessmentStatus).toBe('pending');
      expect(body.view.categories).toEqual(['pending']);
      // Isolate page-load versus archive-readiness ordering beyond Vitest's existing poll deadline.
      await new Promise(resolve => setTimeout(resolve, 1200));
      await route.fulfill({ response });
    });
    const linked = await open(`/?session=${key}&invocation=${rows[0].id}`);
    await expect.poll(() => linked.locator('[data-fact="assessment"]').textContent()).toBe('Pending');
    expect(await linked.locator('[data-fact="assessment"]').textContent()).toBe('Pending');
    await reveal(linked, '.recorded-disclosure');
    await linked.locator('.recording-details > summary').click();
    const details = await linked.locator('.recording-details').textContent();
    expect(details).toContain('Recording schemas3');
    expect(details).toContain('Would decideunavailable');
    expect(details).toContain('Permissionunknown');
    expect(details).toContain('Executionunknown');
    await linked.close();
  }, { base: false, path: `/?session=${key}`, seed: async directory => {
    const writer = new ArchiveWriter({ enabled: true, directory });
    writer.bindHistorical({ sessionId: 'delayed-lifecycle', invocationId: 'pending', callId: 'pending', toolName: 'read',
      cwd: '/p', mode: 'observe', host: 'pi', contextId: 'main' }, 3)('assessment-status', { status: 'pending', reason: 'not-started', profile: 'legacy' });
    await writer.complete();
  } });
});
