import { expect, test } from '../playwright-fixture.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionKey } from '../../../src/recording/archive.js';
import { seedSessionRules, ruleSessionLink, ruleSessions } from './session-rules-fixture.js';
import { openRecordedData } from '../ui-navigation.js';

test('native picker uses the server fold for all four states with pointer, keyboard and light dismissal', async ({ withInspector }) => {
  await withInspector('rule-picker', async ({ page, app }) => {
    await page.locator('.rule-trigger').first().waitFor();
    const sessionData = await (await page.request.get('/api/sessions')).json();
    expect(sessionData.sessions.map((s: { status: string }) => s.status).sort()).toEqual(['clear', 'unchecked', 'unclear', 'violation']);
    const labels = ['Violation found', 'No violations found', 'Unclear', 'Not checked'];
    for (const [index, session] of ruleSessions.entries()) {
      await page.locator('.rule-session-toggle').click();
      const option = page.locator(`input[value="${sessionKey(session)}"]`);
      expect(await option.evaluate(el => el.tagName)).toBe('INPUT');
      expect(await option.getAttribute('type')).toBe('radio');
      expect(await option.locator('..').textContent()).toContain(labels[index]);
      await option.click();
      await expect.poll(() => new URL(page.url()).searchParams.get('session')).toBe(sessionKey(session));
      await expect.poll(() => page.locator('.rule-session-outcome').textContent()).toContain(labels[index]);
      expect(await page.locator('#rule-session-menu').evaluate(el => el.matches(':popover-open'))).toBe(false);
      expect(await page.locator('.rule-session-toggle').evaluate(el => document.activeElement === el)).toBe(true);
      expect(await page.locator('.rule-session-toggle').textContent()).toContain(labels[index]);
      const rules = await (await fetch(`${app.origin}/api/sessions/${sessionKey(session)}/rules`)).json();
      expect(rules.status).toBe(sessionData.sessions.find((s: { id: string }) => s.id === sessionKey(session)).status);
      expect(await page.locator('.invocation').count()).toBe(0);
    }
    await page.locator('.rule-session-toggle').focus(); await page.keyboard.press('Enter');
    await page.locator('input:checked').focus(); await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.locator('#rule-session-menu').evaluate(el => el.matches(':popover-open'))).toBe(false);
    expect(await page.locator('.rule-session-toggle').evaluate(el => document.activeElement === el)).toBe(true);
    await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
    expect(await page.locator('#rule-session-menu').evaluate(el => el.matches(':popover-open'))).toBe(false);
    await page.locator('.rule-session-toggle').click(); await page.locator('h1').click();
    expect(await page.locator('#rule-session-menu').evaluate(el => el.matches(':popover-open'))).toBe(false);
  }, { base: false, seed: seedSessionRules, path: ruleSessionLink() });
});

for (const width of [1280, 390, 320]) test(`native rule panel checks pagination, lazy exact actions, focus and independent scroll at ${width}px`, async ({ withInspector }) => {
  await withInspector('rule-panel', async ({ page, app, open }) => {
    await page.setViewportSize({ width, height: 844 });
    const actionRequests: string[] = []; page.on('request', request => { if (request.url().includes('/invocations/')) actionRequests.push(request.url()); });
    const row = page.getByRole('button', { name: /Ask for approval before deploying to production/ });
    await row.waitFor(); expect(actionRequests).toEqual([]);
    await row.locator('svg').first().click();
    const dialog = page.getByRole('dialog', { name: 'Rule details' }); await dialog.waitFor();
    expect(await page.locator('.rule-full-text').textContent()).toBe('Ask for approval before deploying to production.');
    expect(await page.locator('.rule-panel-body > .rule-status').textContent()).toBe('Violation found');
    expect(await page.locator('.rule-check').count()).toBe(50);
    expect(actionRequests).toEqual([]);
    expect(await page.locator('html').evaluate(el => getComputedStyle(el).overflow)).toBe('hidden');
    if (width < 650) expect((await dialog.boundingBox())!.width).toBe(width);
    const backgroundScroll = await page.evaluate(() => scrollY);
    const body = page.locator('.rule-panel-body');
    await body.hover(); await page.mouse.wheel(0, 1200);
    await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => scrollY)).toBe(backgroundScroll);
    await page.getByRole('button', { name: 'More recorded checks' }).click();
    await expect.poll(() => page.locator('.rule-check').count()).toBe(55);
    await page.locator('.rule-action-disclosure > summary').first().click();
    await page.locator('.decision-summary').waitFor();
    expect(actionRequests).toHaveLength(1);
    await openRecordedData(page, 'Questions');
    const exact = page.locator('.exact-rule-data');
    const selectedUrl = page.url(), params = new URL(selectedUrl).searchParams;
    expect(params.get('rule')).toMatch(/^[a-f0-9]{64}$/); expect(params.get('invocation')).toMatch(/^[a-f0-9]{64}$/);
    const data = await (await page.request.get(`/api/sessions/${params.get('session')}/invocations/${params.get('invocation')}`)).json();
    expect(JSON.parse((await exact.locator('pre').textContent())!)).toEqual({ questionVersion: data.view.questionVersion, rules: data.view.rules });
    await exact.evaluate(el => { el.dataset.retained = 'exact'; el.scrollTop = 65; }); await exact.focus();
    const innerScroll = await exact.evaluate(el => el.scrollTop), outerScroll = await body.evaluate(el => el.scrollTop);
    await page.waitForResponse(response => response.url().includes('/rules?'));
    expect(actionRequests).toHaveLength(1);
    expect(await exact.getAttribute('data-retained')).toBe('exact'); expect(await exact.evaluate(el => el.scrollTop)).toBe(innerScroll);
    expect(await body.evaluate(el => el.scrollTop)).toBe(outerScroll); expect(await exact.evaluate(el => document.activeElement === el)).toBe(true); expect(page.url()).toBe(selectedUrl);
    expect(await page.locator('.recorded-disclosure').getAttribute('open')).not.toBeNull();
    const linked = await open(new URL(selectedUrl).pathname + new URL(selectedUrl).search);
    expect(await linked.locator('.rule-full-text').textContent()).toBe('Ask for approval before deploying to production.'); await linked.close();
    await page.keyboard.press('Escape');
    expect(await dialog.count()).toBe(0); expect(await row.evaluate(el => document.activeElement === el)).toBe(true);
    const closedUrl = page.url(); await page.waitForResponse(response => response.url().includes('/api/sessions?'));
    expect(page.url()).toBe(closedUrl); expect(await page.locator('dialog[open]').count()).toBe(0);
    await row.click(); await page.getByRole('button', { name: 'Close', exact: true }).click(); expect(await row.evaluate(el => document.activeElement === el)).toBe(true);
    if (width === 1280) { await row.click(); await page.mouse.click(20, 200); expect(await page.locator('dialog[open]').count()).toBe(0); expect(await row.evaluate(el => document.activeElement === el)).toBe(true); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goBack(); await page.locator('dialog[open]').waitFor();
    expect(new URL(page.url()).searchParams.get('rule')).toBe(params.get('rule'));
    await page.goForward(); await expect.poll(() => page.locator('dialog[open]').count()).toBe(0);
  }, { base: false, seed: seedSessionRules, path: ruleSessionLink() });
});

test('implemented desktop and mobile visual batch', async ({ withInspector }) => {
  if (!process.env.TENET_UI_CAPTURE_DIR) return;
  const directory = process.env.TENET_UI_CAPTURE_DIR; await mkdir(directory, { recursive: true });
  const observations: unknown[] = [];
  await withInspector('implemented-captures', async ({ page }) => {
    await page.locator('.rule-trigger').first().waitFor();
    for (const [name, width, height] of [['desktop', 1280, 1000], ['mobile', 390, 844], ['narrow', 320, 844]] as const) {
      await page.setViewportSize({ width, height }); await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: join(directory, `implemented-overview-${name}.png`), fullPage: true });
      await page.locator('.rule-session-toggle').click();
      await page.screenshot({ path: join(directory, `implemented-picker-${name}.png`) });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /Ask for approval before deploying to production/ }).click();
      await page.locator('.rule-check').first().waitFor();
      await page.screenshot({ path: join(directory, `implemented-panel-${name}.png`) });
      await page.locator('.rule-action-disclosure > summary').first().click();
      await page.locator('.decision-summary').waitFor(); await openRecordedData(page);
      await page.locator('.submitted-evidence').scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(directory, `implemented-long-${name}.png`) });
      observations.push(await page.evaluate(() => ({ width: innerWidth, horizontal: document.documentElement.scrollWidth, panel: document.querySelector('dialog')!.getBoundingClientRect().toJSON(), backgroundOverflow: getComputedStyle(document.documentElement).overflow, panelOverflow: getComputedStyle(document.querySelector('.rule-panel-body')!).overflowY })));
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
  }, { base: false, seed: seedSessionRules, path: ruleSessionLink() });
  await writeFile(join(directory, 'implemented-observations.json'), JSON.stringify(observations, null, 2));
});
