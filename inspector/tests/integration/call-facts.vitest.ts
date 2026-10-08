import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeBrowser, launchBrowser, withInspector } from './fixture.js';
import { seedCallFacts, statusCases, statusLink } from './call-facts-fixture.js';
beforeAll(launchBrowser);
afterAll(closeBrowser);
test('all fictional lifecycle and overlap facts remain distinct in the built app', async () => {
  await withInspector('call-facts-matrix', async ({ page, open, app }) => {
    for (const item of statusCases) {
      const linked = await open(statusLink(item.id));
      const summary = linked.locator('.decision-summary');
      const text = await summary.innerText();
      expect(await summary.locator('[data-fact="permission"]').textContent()).toBe(['blocked', 'observe-blocked', 'contradiction'].includes(item.id) ? 'Blocked by Tenet' : 'Not blocked by Tenet');
      expect(await summary.locator('[data-fact="result"]').textContent()).toBe(['success', 'contradiction'].includes(item.id) ? 'Successful' : item.id === 'failed-tool' ? 'Failed' : 'Unknown / not recorded');
      if (['pending', 'dropped', 'cancelled', 'unavailable', 'incomplete'].includes(item.id)) {
        expect(await summary.locator('[data-fact="assessment"]').textContent()).toBe(item.id[0]!.toUpperCase() + item.id.slice(1));
        expect(text).not.toContain('Observation pending or incomplete');
        expect(text).not.toMatch(/No blocking issues|No assessment findings|Would allow/);
      }
      if (item.id === 'invalid') {
        expect(await summary.locator('[data-fact="assessment"]').textContent()).toBe('Unavailable');
        const url = new URL(statusLink(item.id), app.origin);
        const session = url.searchParams.get('session');
        const rows = await (await fetch(`${app.origin}/api/sessions/${session}`)).json();
        expect(rows.invocations.find((r: { callId: string }) => r.callId === 'invalid').assessmentInvalid).toBe(true);
        expect(await linked.locator('.call-row').filter({ has: linked.locator('.call-id', { hasText: /^invalid$/ }) }).innerText()).toContain('Assessment invalid');
        expect(text).not.toContain('No blocking issues');
      }
      if (item.id === 'observe-ask') {
        expect(text).toContain('Would ask for approval in enforce mode');
        expect(text).toContain('Approval was not requested in observe mode.');
        expect(await summary.locator('[data-fact="approval"]').count()).toBe(0);
      }
      if (item.id === 'approved') expect(await summary.locator('[data-fact="approval"]').textContent()).toBe('approved');
      if (item.id === 'overlap') {
        expect(await summary.locator('[data-fact="findings"]').textContent()).toBe('Suspected violation · Assessment uncertainty · Approval condition');
        await linked.screenshot({ path: 'coverage/inspector-artifacts/tenet-59-overlap-desktop.png' });
        await linked.setViewportSize({ width: 390, height: 844 });
        await linked.screenshot({ path: 'coverage/inspector-artifacts/tenet-59-overlap-mobile.png' });
        expect(await linked.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      if (item.id === 'observe-blocked') expect(text).toContain('despite observe mode');
      if (item.id === 'contradiction') expect(text).toContain('Inconsistent recording: permission is blocked, but execution is executed');
      await linked.close();
    }
    expect(await page.locator('.displayed-context').count(), 'mixed displayed calls must not share ordinary context').toBe(0);
  }, { base: false, seed: seedCallFacts });
});
