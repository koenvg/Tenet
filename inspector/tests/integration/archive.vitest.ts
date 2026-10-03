import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { sessionKey, qualifiedSessionKey, recordInvocationKey } from '../../../src/recording/archive.js';
import { FixtureArchiveWriter as ArchiveWriter } from '../../../test/archive-fixture.js';
import { recordFailureFixture } from '../../../test/failure-fixture.js';
import { closeBrowser, launchBrowser, withInspector } from './fixture.js';

beforeAll(launchBrowser);
afterAll(closeBrowser);

const call = async (page: import('playwright').Page, id: string) => {
  await page.locator('.call-row').filter({ has: page.locator('.call-id', { hasText: new RegExp(`^${id}$`) }) }).click();
  await expect.poll(() => page.locator('.call-row[aria-pressed="true"] .call-id').textContent()).toBe(id);
  await page.locator('.decision-summary').waitFor();
};

const openPicker = async (page: import('playwright').Page) => {
  const picker = page.locator('.session-picker');
  await expect.poll(() => picker.getAttribute('open')).toBeNull();
  await picker.locator('summary').click();
  await picker.locator('input[aria-label="Project directory"]').waitFor({ state: 'visible' });
};

test('project filters and cursor pagination retain a safe deep link through background refresh', async () => {
  const arbitrary = '../雪 ?#%';
  await withInspector('filtered-pagination', async ({ page, open }) => {
    await page.locator('.invocation').waitFor();
    await openPicker(page);
    await page.getByRole('combobox', { name: 'Project directory' }).fill('/second-project');
    await page.getByRole('button', { name: 'Filter projects' }).click();
    await expect.poll(() => page.locator('.session-row').count()).toBe(1);
    expect(await page.locator('.session-row strong').textContent()).toBe(arbitrary);
    await page.locator('.session-row').click();
    await expect.poll(() => page.locator('.call-row').count()).toBe(50);
    await page.locator('.call-row').first().click();
    await page.locator('.decision-summary').waitFor();
    const selectedLink = page.url();
    expect(new URL(selectedLink).searchParams.get('session')).toBe(sessionKey(arbitrary));
    expect(new URL(selectedLink).searchParams.get('invocation')).toMatch(/^[a-f0-9]{64}$/);
    expect(selectedLink).not.toContain('window.hostile');
    await page.getByRole('button', { name: 'More invocations' }).click();
    await expect.poll(() => page.locator('.call-row').count()).toBe(55);
    let polls = 0;
    page.on('response', response => { if (response.url().includes(`/api/sessions/${sessionKey(arbitrary)}?`)) polls++; });
    await expect.poll(() => polls, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(await page.locator('.call-row').count()).toBe(55);
    expect(await page.locator('.session-row').count()).toBe(1);
    expect(page.url()).toBe(selectedLink);
    await page.evaluate(([session, invocation]) => {
      history.replaceState(null, '', `/?session=${session}&invocation=${invocation}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, [sessionKey(arbitrary), sessionKey('page-0')]);
    await expect.poll(() => page.locator('.invocation').textContent()).toContain('page-0');
    expect(await page.locator('.invocation').textContent()).toContain(arbitrary);
    await page.evaluate(() => {
      history.replaceState(null, '', '/?session=../../unsafe&invocation=bad');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect.poll(() => page.getByRole('alert').textContent()).toContain('Invalid');
    await page.evaluate(() => { history.replaceState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await expect.poll(() => page.getByRole('alert').count()).toBe(0);
    await page.getByRole('combobox', { name: 'Project directory' }).fill('/no-recordings');
    await page.getByRole('button', { name: 'Filter projects' }).click();
    await expect.poll(() => page.locator('.session-row').count()).toBe(0);
    expect(await page.locator('.session-picker').textContent()).toContain('No recorded sessions for this project.');
    await page.getByRole('button', { name: 'All projects' }).click();
    await expect.poll(() => page.locator('.session-row strong').allTextContents()).toContain(arbitrary);
    const linked = await open(`/?session=${sessionKey(arbitrary)}&invocation=${sessionKey('page-0')}`);
    await expect.poll(() => linked.locator('.invocation').textContent()).toContain('page-0');
    await linked.close();
  }, { base: false, seed: async directory => {
    const writer = new ArchiveWriter({ enabled: true, directory });
    for (let n = 0; n < 55; n++) writer.bind({ sessionId: arbitrary, invocationId: `page-${n}`, callId: 'reused', toolName: 'edit', cwd: '/second-project', mode: 'observe' })('begin', {});
    writer.bind({ sessionId: 'fork', invocationId: 'fork-call', callId: 'reused', toolName: 'edit', cwd: '/third-project', mode: 'observe' })('begin', {});
    await writer.complete();
  } });
});

test('fresh link opens an older session omitted from the first picker page', async () => {
  const oldKey = sessionKey('older-session');
  await withInspector('older-session-link', async ({ page, app }) => {
    const firstPage = await (await fetch(`${app.origin}/api/sessions`)).json();
    expect(firstPage.sessions).toHaveLength(50);
    expect(firstPage.sessions.some((item: { sessionId: string }) => item.sessionId === 'older-session')).toBe(false);
    await expect.poll(() => page.locator('.invocation').textContent()).toContain('older-call');
    expect((await page.locator('.session-picker summary').textContent())?.trim()).toBe('Selected session');
  }, { base: false, path: `/?session=${oldKey}`, seed: async directory => {
    const writer = new ArchiveWriter({ enabled: true, directory });
    writer.bind({ sessionId: 'older-session', invocationId: 'older-call', callId: 'older-call', toolName: 'read', mode: 'observe', cwd: '/old-project' })('begin', {});
    await writer.settle();
    await new Promise(resolve => setTimeout(resolve, 25)); // Distinct sort timestamp for the first page.
    for (let n = 0; n < 52; n++) writer.bind({ sessionId: `new-${n}`, invocationId: `new-${n}`, callId: `new-${n}`, toolName: 'read', mode: 'observe', cwd: '/new-project' })('begin', {});
    await writer.complete();
  } });
});

test('unrecorded linked session waits without borrowing another session’s calls', async () => {
  const emptyKey = sessionKey('not-yet-recorded');
  await withInspector('empty-linked-session', async ({ page }) => {
    await page.getByRole('heading', { name: 'Waiting for recorded calls' }).waitFor();
    expect(new URL(page.url()).searchParams.get('session')).toBe(emptyKey);
    expect(await page.locator('.call-row[aria-pressed="true"]').count()).toBe(0);
    expect((await page.locator('.session-picker summary').textContent())?.trim()).toBe('Selected session');
    await openPicker(page);
    await page.locator('.session-row').filter({ has: page.locator('strong', { hasText: 's' }) }).click();
    await page.locator('.invocation').waitFor();
    expect(new URL(page.url()).searchParams.get('session')).toBe(qualifiedSessionKey('pi', 's', 'main'));
  }, { path: `/?session=${emptyKey}` });
});

test('corrupt and interrupted captures remain unavailable, and archive errors recover', async () => {
  await withInspector('failure-history', async ({ page }) => {
    await page.locator('.invocation').waitFor();
    await openPicker(page);
    await page.locator('.session-row').filter({ has: page.locator('strong', { hasText: 'failure-history' }) }).click();
    await expect.poll(() => page.locator('.call-row').count()).toBe(8);
    const issues = page.getByRole('region', { name: 'Recording issues' });
    await issues.locator('summary').click();
    for (const reason of ['temporary-record', 'corrupt-record', 'unsupported-schema', 'Writer-wide capture health']) {
      expect(await issues.textContent()).toContain(reason);
    }
    for (const kind of ['missing-credentials', 'provider-error', 'invalid-response', 'interrupted', 'truncated-response', 'unavailable-response', 'missing-payload', 'capture-loss']) {
      await call(page, kind);
      const detail = await page.locator('.invocation').textContent();
      if (kind === 'interrupted' || kind === 'capture-loss') {
        expect(detail).toContain('Assessment incomplete');
        expect(detail).toContain('unknown');
        expect(await page.locator('.rule-row .status-chip').allTextContents()).not.toContain('PASS');
      } else expect(detail).toContain('Assessment failed');
      if (kind === 'missing-credentials') expect(detail).toContain('not submitted');
      if (kind === 'missing-payload') expect(detail).toContain('submitted; payload unavailable');
      if (kind === 'truncated-response') expect(detail).toContain('Response truncated');
      if (kind === 'unavailable-response') expect(detail).toContain('Response snapshot unavailable');
      expect(await page.locator('.invocation script').count()).toBe(0);
    }
    await openPicker(page);
    await page.locator('.session-row').filter({ has: page.locator('strong', { hasText: 'historical-incomplete' }) }).click();
    await call(page, 'incomplete');
    expect(await page.locator('.decision-explanation').textContent()).toMatch(/timeout.*not recorded/);
    expect(await page.locator('.rule-detail').textContent()).toContain('Gate coverage unavailable');
    await page.getByRole('button', { name: 'View shared evidence' }).click();
    expect(await page.locator('#panel-Evidence').textContent()).toContain('Submitted evidence unavailable');
    await page.getByRole('tab', { name: 'Response' }).click();
    expect(await page.locator('#panel-Response').textContent()).toContain('2000000');
    expect(await page.locator('#panel-Response').textContent()).toContain('"truncated": true');
    expect(await page.locator('.invocation script').count()).toBe(0);
    expect(await page.locator('body').textContent()).not.toContain('fixture-transport-secret');
    await page.route('**/api/sessions?*', route => route.fulfill({ status: 503, body: '{}' }));
    await page.getByRole('button', { name: 'Refresh archive' }).click();
    await expect.poll(() => page.getByRole('alert').textContent()).toContain('503');
    await page.unroute('**/api/sessions?*');
    await page.getByRole('button', { name: 'Refresh archive' }).click();
    await expect.poll(() => page.getByRole('alert').count()).toBe(0);
    expect(await page.locator('.invocation').count()).toBe(1);
  }, { base: false, seed: async directory => {
    await recordFailureFixture(directory);
    const writer = new ArchiveWriter({ enabled: true, directory });
    const sink = writer.bind({ sessionId: 'historical-incomplete', invocationId: 'incomplete', callId: 'incomplete', toolName: 'edit', mode: 'enforce', cwd: '/historical' });
    sink('begin', { policy: { rules: [{ id: 'old-rule', line: 7, text: 'Historical rule', enforcement: 'BLOCK' }] } });
    sink('decision', { decision: 'BLOCK', reason: 'timeout' });
    sink('response', { preview: '<script>window.hostile=true</script>', truncated: true, bytes: 2000000 });
    await writer.complete();
  } });
});

test('mixed schema-1 Pi and host-qualified Pi/Claude links keep evidence and outcomes separate', async () => {
  await withInspector('mixed-host-archive', async ({ page, app, open }) => {
    const sessions = (await (await fetch(`${app.origin}/api/sessions`)).json()).sessions as Array<{ id: string; host: string; contextId: string }>;
    expect(sessions).toHaveLength(4);
    expect(new Set(sessions.map(session => session.id)).size).toBe(4);
    expect(sessions.filter(session => session.host === 'claude-code')).toHaveLength(2);
    const legacy = await open(`/?session=${sessionKey('same')}&invocation=${sessionKey('same')}`);
    await legacy.locator('.decision-summary').waitFor();
    expect(await legacy.locator('.session-picker summary').textContent()).toContain('pi / main');
    expect(await legacy.locator('.map-notices').textContent()).toContain('legacy-pi-coverage-not-recorded');
    expect(await legacy.locator('.rule-detail').textContent()).toContain('Historical rule');
    await legacy.close();
    const child = sessions.find(session => session.host === 'claude-code' && session.contextId === 'child')!;
    const calls = (await (await fetch(`${app.origin}/api/sessions/${child.id}`)).json()).invocations;
    expect(calls).toHaveLength(1);
    await page.goto(`${app.origin}/?session=${child.id}&invocation=${calls[0].id}`);
    await page.locator('.decision-summary').waitFor();
    expect(await page.locator('.map-notices').textContent()).toContain('actual-host-unverified');
    expect(await page.locator('.map-execution').textContent()).toContain('Failed');
    await page.locator('.capture-details summary').click();
    expect(await page.locator('.capture-details').textContent()).toMatch(/Would decide.*ALLOW.*Permission.*released.*Execution.*failed/s);
    expect(await page.locator('.capture-details').textContent()).toContain('approval-unavailable');
    const parent = sessions.find(session => session.host === 'claude-code' && session.contextId === 'main')!;
    const parentCalls = (await (await fetch(`${app.origin}/api/sessions/${parent.id}`)).json()).invocations;
    expect(parentCalls[0].execution).toBe('unknown');
    expect((await fetch(`${app.origin}/api/sessions/${child.id}`, { method: 'POST' })).status).toBe(405);
  }, { base: false, seed: async directory => {
    const writer = new ArchiveWriter({ enabled: true, directory });
    const identity = { sessionId: 'same', invocationId: 'same', callId: 'same', toolName: 'Bash', cwd: '/historical', mode: 'observe' as const };
    const legacy = writer.bind(identity);
    legacy('begin', { policy: { rules: [{ id: 'old', text: 'Historical rule', line: 1, enforcement: 'BLOCK' }] }, config: { effectThreshold: 0.83 } });
    legacy('decision', { decision: 'BLOCK' });
    for (const [host, contextId] of [['pi', 'main'], ['claude-code', 'main'], ['claude-code', 'child']] as const) {
      const sink = writer.bind({ ...identity, host, contextId });
      sink('begin', { adapterCoverage: { version: null, limitations: ['actual-host-unverified', 'approval-unavailable'] } });
      sink('decision', { decision: 'ALLOW' }); sink('permission', { outcome: 'released' });
      if (contextId === 'child') sink('execution', { outcome: 'failed' });
    }
    await writer.complete();
  } });
});

test('real archive filters overlapping categories, expands grouped calls and warns about newer records', async () => {
  const key = sessionKey('triage-browser');
  await withInspector('triage-browser', async ({ page, app, open }) => {
    await page.locator('.invocation').waitFor();
    const status = await (await fetch(`${app.origin}/api/status`)).json();
    expect(status.reader.supportedSchemas).toEqual([1, 2, 3, 4]);
    expect(status.reader.unsupported).toBe(1);
    expect(status.reader.newerUnsupported).toBe(1);
    expect(status.reader.build).toMatch(/^tenet-reader-/);
    const data = await (await fetch(`${app.origin}/api/sessions/${key}?category=uncertainty`)).json();
    expect(data.invocations).toHaveLength(3);
    expect(data.groups).toBeUndefined();
    const grouped = await (await fetch(`${app.origin}/api/sessions/${key}/groups`)).json();
    expect(grouped.groups.items).toHaveLength(2);
    expect(grouped.groups.items.find((g: { count: number }) => g.count === 2)?.invocations).toHaveLength(2);
    expect((await fetch(`${app.origin}/api/sessions/${key}?category=not-a-category`)).status).toBe(400);
    await expect.poll(() => page.locator('.compatibility-warning').textContent()).toContain('1 unsupported schema records (1 newer)');
    expect(await page.locator('.reader-status').textContent()).toContain('supported recording schemas 1, 2, 3');
    await page.locator('#finding-category').selectOption('approval');
    await expect.poll(() => page.locator('.call-row').count()).toBe(1);
    expect(await page.locator('.explorer .uncertainty-groups').count()).toBe(0);
    await page.getByRole('button', { name: 'Uncertainty groups' }).click();
    await expect.poll(() => page.getByRole('region', { name: 'Uncertainty groups' }).isVisible()).toBe(true);
    await expect.poll(() => page.locator('.uncertainty-group').count()).toBe(2);
    await mkdir('coverage/inspector-artifacts', { recursive: true });
    expect(new Set(await page.locator('.uncertainty-group > summary small').allTextContents())).toEqual(new Set([
      'Rule r · legacy · Policy A · target /triage/TENET.md',
      'Rule r · legacy · Policy A · target /triage/alternate/TENET.md',
    ]));
    await page.screenshot({ path: 'coverage/inspector-artifacts/triage-groups-desktop.png' });
    await page.locator('.uncertainty-group').filter({ hasText: '2 calls' }).locator('summary').click();
    expect(await page.locator('.uncertainty-group').filter({ hasText: '2 calls' }).locator('.pattern-context').textContent()).toContain('target /triage/TENET.md');
    await page.locator('.uncertainty-group').filter({ hasText: '2 calls' }).getByRole('button', { name: /first/ }).click();
    await expect.poll(() => page.getByRole('region', { name: 'Uncertainty groups' }).isVisible()).toBe(false);
    await expect.poll(() => page.locator('.decision-title h2 span').textContent()).toBe('first');
    await mkdir('coverage/inspector-artifacts', { recursive: true });
    await page.screenshot({ path: 'coverage/inspector-artifacts/triage-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Calls' }).click();
    await expect.poll(() => page.locator('#finding-category').isVisible()).toBe(true);
    expect(await page.locator('.mobile-upgrade').isVisible()).toBe(true);
    await page.screenshot({ path: 'coverage/inspector-artifacts/triage-mobile.png' });
    const link = page.url();
    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Patterns' }).click();
    await expect.poll(() => page.getByRole('region', { name: 'Uncertainty groups' }).isVisible()).toBe(true);
    await page.screenshot({ path: 'coverage/inspector-artifacts/triage-groups-mobile.png' });
    expect(new URL(link).searchParams.get('session')).toBe(key);
    const reopened = await open(new URL(link).pathname + new URL(link).search);
    await expect.poll(() => reopened.locator('.decision-title h2 span').textContent()).toBe('first');
    await reopened.close();
    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Calls' }).click();
    await page.locator('#finding-category').selectOption('violation');
    await expect.poll(() => page.locator('.call-row').count()).toBe(0);
    await page.locator('.session-picker summary').click();
    await page.locator('.session-row').first().click();
    await expect.poll(() => page.locator('.call-list .empty-inline').textContent()).toBe('No calls match this finding category.');
    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Patterns' }).click();
    await page.locator('.uncertainty-group').filter({ hasText: '2 calls' }).locator('summary').click();
    await page.locator('.uncertainty-group').filter({ hasText: '2 calls' }).getByRole('button', { name: /first/ }).click();
    await expect.poll(() => page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Summary' }).evaluate(el => document.activeElement === el)).toBe(true);
  }, { base: false, path: `/?session=${key}`, seed: async directory => {
    const writer = new ArchiveWriter({ enabled: true, directory });
    for (const [id, target] of [['first', '/triage/TENET.md'], ['second', '/triage/TENET.md'], ['third', '/triage/alternate/TENET.md']] as const) {
      const sink = writer.bind({ sessionId: 'triage-browser', invocationId: id, callId: id, toolName: 'read', cwd: '/triage', mode: 'observe' });
      const policy = { source: '/triage/TENET.md', digest: 'A', target, rules: [{ id: 'r', text: 'Rule', line: 1, enforcement: 'BLOCK' }] };
      sink('begin', { policy, config: { assessmentProfile: 'legacy' } });
      if (id === 'second') sink('validation', { valid: true, assessment: { model: 'offline', rules: [{ ruleId: 'r', outcome: { choice: 'APPROVAL_REQUIRED' } }] } });
      else sink('assessment', { assessment: { model: 'offline', rules: [{ ruleId: 'r', outcome: { choice: 'PASS' } }] } });
      sink('decision', { decision: 'BLOCK', reason: 'insufficient-evidence', contributions: [{ ruleId: 'r', gates: ['evidence-confidence-below-threshold'] }] });
      sink('permission', { outcome: 'released' });
      sink('execution', { outcome: 'executed' });
    }
    await writer.complete();
    await writeFile(join(directory, key, 'newer.json'), JSON.stringify({ schemaVersion: 5 }), { mode: 0o600 });
  } });
});

test('schema 3 lifecycle deep links keep pending and dropped apart from permission and execution', async () => {
  const key = qualifiedSessionKey('pi', 'lifecycle-browser', 'main');
  await withInspector('lifecycle-browser', async ({ page, app, open }) => {
    await page.locator('.invocation').waitFor();
    const rows = (await (await fetch(`${app.origin}/api/sessions/${key}`)).json()).invocations;
    expect(rows).toHaveLength(3);
    for (const status of ['pending', 'dropped']) {
      const row = rows.find((r: { callId: string }) => r.callId === status);
      expect(row.categories).toEqual(['pending']);
      const linked = await open(`/?session=${key}&invocation=${row.id}`);
      await expect.poll(() => linked.locator('.finding-tags').textContent()).toContain('Observation pending or incomplete');
      await expect.poll(() => linked.locator('.assessment-status').textContent()).toContain(status);
      await linked.locator('.capture-details summary').click();
      expect(await linked.locator('.capture-details').textContent()).toContain('Recording schemas3');
      expect(await linked.locator('.capture-details').textContent()).toContain('Assessment profilelegacy');
      expect(await linked.locator('.capture-details').textContent()).toContain('Would decideunavailable');
      await linked.close();
    }
  }, { base: false, path: `/?session=${key}`, seed: async directory => {
    const writer = new ArchiveWriter({ enabled: true, directory });
    writer.bind({ sessionId: 'lifecycle-browser', invocationId: 'old', callId: 'old', toolName: 'read', cwd: '/p', mode: 'observe', host: 'pi', contextId: 'main' })('begin', {});
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

test('schema 3 pending deep link is ready after a delayed archive response', async () => {
  const key = qualifiedSessionKey('pi', 'delayed-lifecycle', 'main');
  await withInspector('delayed-lifecycle', async ({ page, app, open }) => {
    await page.locator('.invocation').waitFor();
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
    await expect.poll(() => linked.locator('.finding-tags').textContent()).toContain('Observation pending or incomplete');
    expect(await linked.locator('.assessment-status').textContent()).toContain('Assessment pending');
    await linked.locator('.capture-details summary').click();
    const details = await linked.locator('.capture-details').textContent();
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
