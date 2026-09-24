import { afterAll, beforeAll, expect, test } from 'vitest';
import { ArchiveWriter, sessionKey } from '../../../src/recording/archive.js';
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
    await writer.close();
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
    await writer.drain();
    await new Promise(resolve => setTimeout(resolve, 25)); // Distinct sort timestamp for the first page.
    for (let n = 0; n < 52; n++) writer.bind({ sessionId: `new-${n}`, invocationId: `new-${n}`, callId: `new-${n}`, toolName: 'read', mode: 'observe', cwd: '/new-project' })('begin', {});
    await writer.close();
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
    expect(new URL(page.url()).searchParams.get('session')).toBe(sessionKey('s'));
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
    await writer.close();
  } });
});
