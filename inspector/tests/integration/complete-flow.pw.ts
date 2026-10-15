import { expect, test } from '../playwright-fixture.js';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { seedRuleExplanations, ruleExplanationLink } from './rule-explanation-fixture.js';
import { seedNavigation, navigationPath } from './navigation-fixture.js';


// Authored fictional archives only. Exercise real native keyboard scrolling, not assigned scrollTop.
test('390px complete flow keeps native filtering, issues and every compact/exact rule usable', async ({ withInspector }) => {
  await withInspector('complete-flow-native-mobile', async ({ page, app, directory }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.decision-summary').waitFor();
    expect(await page.locator('.story-action').textContent()).toBe('publish --dry-run fictional-release');
    expect(await page.locator('.decision-summary').textContent()).not.toContain('Recording incomplete');
    expect(await page.locator('.rule-main-footer > p[role=status]').textContent()).toBe('Supported records');

    const why = page.locator('.why-disclosure > summary');
    await why.focus(); await page.keyboard.press('Enter');
    expect(await page.locator('.rule-detail').count()).toBe(6);
    await page.locator('.rule-detail').last().scrollIntoViewIfNeeded();
    expect(await page.locator('.rule-detail').last().isVisible()).toBe(true);
    expect(await page.locator('.rule-detail').last().textContent()).toContain('Built-in integrity');
    expect(await page.locator('.rule-detail').first().textContent()).toContain('Below required confidence');

    const recorded = page.locator('.recorded-disclosure > summary');
    await recorded.focus(); await page.keyboard.press('Enter');
    const exactToggle = page.locator('.exact-rules > summary');
    await exactToggle.focus(); await page.keyboard.press('Enter');
    const exact = page.locator('.exact-rule-data');
    await exact.focus();
    await page.keyboard.press('End');
    await expect.poll(() => exact.evaluate(el => el.scrollTop === el.scrollHeight - el.clientHeight)).toBe(true);
    expect(await exact.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    const innerScroll = await exact.evaluate(el => el.scrollTop);
    const response = await fetch(`${app.origin}/api/sessions/${new URL(page.url()).searchParams.get('session')}/invocations/${new URL(page.url()).searchParams.get('invocation')}`);
    const view = (await response.json()).view;
    expect(JSON.parse((await exact.locator('pre').textContent())!)).toEqual({ questionVersion: view.questionVersion, rules: view.rules });
    const rulesURL = new URL(`/api/sessions/${new URL(page.url()).searchParams.get('session')}/rules`, app.origin);
    await page.waitForResponse(async response => {
      const url = new URL(response.url());
      return url.origin === rulesURL.origin && url.pathname === rulesURL.pathname && response.status() === 200 && await response.finished() === null;
    });
    expect(await exact.evaluate(el => el.scrollTop)).toBe(innerScroll);
    expect(await exact.evaluate(el => document.activeElement === el)).toBe(true);

    await seedNavigation(directory, true);
    await page.goto(app.origin + navigationPath);
    await page.locator('.rule-trigger').first().waitFor();
    expect(await page.locator('#finding-category, .call-row').count()).toBe(0);
    await expect.poll(() => page.locator('.rule-main-footer > p[role=status]').textContent()).toBe('Partial archive · capture issues');
    const issuesDisclosure = page.locator('.recording-issues');
    await issuesDisclosure.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
    const issues = page.locator('.issues-body');
    await issues.focus(); await page.keyboard.press('End');
    await expect.poll(() => issues.evaluate(el => el.scrollTop === el.scrollHeight - el.clientHeight)).toBe(true);
    expect(await issues.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    const scroll = await issues.evaluate(el => el.scrollTop);
    expect(await issues.textContent()).toContain('Cumulative counters per writer, not per call');
    expect(await issues.textContent()).toContain('fictional-unsupported.json');
    await page.waitForResponse(response => response.url().includes('/api/sessions?'));
    expect(await issues.evaluate(el => el.scrollTop)).toBe(scroll);
    expect(await page.locator('.rule-main-footer > p[role=status]').textContent()).toBe('Partial archive · capture issues');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => performance.getEntriesByType('resource').some(e => new URL(e.name).pathname.endsWith('/groups')))).toBe(false);
  }, { base: false, path: ruleExplanationLink, seed: async directory => {
    await seedRuleExplanations(directory);
    const folder = join(directory, new URL('http://fictional' + ruleExplanationLink).searchParams.get('session')!);
    const record = JSON.parse(await readFile(join(folder, (await readdir(folder))[0]!), 'utf8'));
    for (const [offset, stage, data] of [[1000, 'validation', { valid: true }], [1001, 'execution', { outcome: 'unknown' }]] as const) {
      await writeFile(join(folder, `fictional-complete-${stage}.json`), JSON.stringify({ ...record, stage, sequence: record.sequence + offset, eventId: randomUUID(), data }), { mode: 0o600 });
    }
  } });
});
