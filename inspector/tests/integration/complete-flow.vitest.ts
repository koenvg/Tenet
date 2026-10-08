import { afterAll, beforeAll, expect, test } from 'vitest';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { launchBrowser, closeBrowser, withInspector } from './fixture.js';
import { seedRuleExplanations, ruleExplanationLink } from './rule-explanation-fixture.js';
import { seedNavigation, navigationPath } from './navigation-fixture.js';

beforeAll(launchBrowser);
afterAll(closeBrowser);

// Authored fictional archives only. Exercise real native keyboard scrolling, not assigned scrollTop.
test('390px complete flow keeps native filtering, issues and every compact/exact rule usable', async () => {
  await withInspector('complete-flow-native-mobile', async ({ page, app, directory }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.decision-summary').waitFor();
    expect(await page.locator('.story-action').textContent()).toBe('publish --dry-run fictional-release');
    expect(await page.locator('.decision-summary').textContent()).not.toContain('Recording incomplete');
    expect(await page.locator('.archive-state > p').textContent()).toBe('Supported records');

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
    await page.waitForResponse(response => /\/api\/sessions\/[a-f0-9]{64}\/invocations\//.test(response.url()));
    expect(await exact.evaluate(el => el.scrollTop)).toBe(innerScroll);
    expect(await exact.evaluate(el => document.activeElement === el)).toBe(true);

    await seedNavigation(directory, true);
    await page.goto(app.origin + navigationPath);
    await page.locator('.decision-summary').waitFor();
    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Calls', exact: true }).click();
    const category = page.getByRole('combobox', { name: 'Finding category' });
    await category.focus(); await page.keyboard.press('s');
    await expect.poll(() => category.inputValue()).toBe('violation');
    await expect.poll(() => page.locator('.call-row').count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Clear filter' }).isVisible()).toBe(true);
    expect(await page.locator('.archive-state > p').textContent()).toBe('Partial archive · capture issues');
    await page.getByRole('button', { name: 'Clear filter' }).click();
    await expect.poll(() => page.locator('.call-row').count()).toBe(4);

    const issues = page.locator('.recording-issues');
    await issues.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
    await page.keyboard.press('End');
    await expect.poll(() => issues.evaluate(el => el.scrollTop === el.scrollHeight - el.clientHeight)).toBe(true);
    expect(await issues.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    const scroll = await issues.evaluate(el => el.scrollTop);
    expect(await issues.textContent()).toContain('Cumulative counters per writer, not per call');
    expect(await issues.textContent()).toContain('fictional-unsupported.json');
    await page.waitForResponse(response => response.url().includes('/api/sessions?'));
    expect(await issues.evaluate(el => el.scrollTop)).toBe(scroll);
    expect(await page.locator('.archive-state > p').textContent()).toBe('Partial archive · capture issues');
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
