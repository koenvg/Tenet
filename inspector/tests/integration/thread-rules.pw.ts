import { expect, test } from '../browser-shell-fixture.js';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const artifacts = resolve('coverage/inspector-artifacts/tenet176-rule-first');
test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

for (const entry of ['panel', 'main']) for (const [width, theme] of [[1440, 'light'], [320, 'light'], [390, 'dark']] as const) {
  test(`${entry} default recorded-rule inventory, keyboard drilldown and stable polling at ${width}px ${theme}`, async ({ page, shellOrigin }) => {
    await page.setViewportSize({ width, height: 1050 });
    await page.clock.install();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${shellOrigin}${entry === 'panel' ? 'overview.preview.html?rules' : `main.preview.html?theme=${theme}#project/proj_synthetic0001/overview/thr_stopped0001`}`);
    if (entry === 'panel' && width === 1440) await page.getByRole('button', { name: 'Toggle 390px panel' }).click();
    if (theme === 'dark') await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.style.setProperty('--background', '#202321'); document.documentElement.style.setProperty('--foreground', '#edeeed'); });
    const workspace = page.locator('.tenet-thread-rules');
    await expect(workspace.getByRole('heading', { name: 'Recorded rules for this thread', exact: true })).toBeVisible();
    await expect(workspace.getByRole('list', { name: 'Recorded rules', exact: true }).getByRole('button')).toHaveCount(5);
    for (const status of ['Violation found', 'No violations found', 'Unclear', 'Not checked']) await expect(workspace.getByText(status, { exact: true }).first()).toBeVisible();
    await expect(workspace.getByLabel('Linked session')).toHaveCount(0);
    await expect(workspace.getByRole('button', { name: 'Summary', exact: true })).toHaveCount(0);
    await expect(workspace.locator('.thread-rule-coverage')).toHaveCount(0);
    await expect(workspace.locator('.thread-rule-footer > [role="status"]')).toHaveCount(0);
    await expect(workspace.getByText('Archive warnings', { exact: true })).toHaveCount(0);
    await expect(workspace.getByText(/^No violations found does not prove complete capture/)).toHaveCount(0);
    const metrics = await workspace.evaluate(element => {
      const background = getComputedStyle(element).backgroundColor;
      const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index]!, 0);
      const contrast = (color: string) => { const values = [luminance(color), luminance(background)].sort((a, b) => b - a); return (values[0]! + .05) / (values[1]! + .05); };
      return { background, statuses: [...element.querySelectorAll('.rule-status')].map(node => ({ color: getComputedStyle(node).color, contrast: contrast(getComputedStyle(node).color) })), overflow: element.scrollWidth > element.clientWidth };
    });
    expect(metrics.background).toBe(theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(32, 35, 33)');
    expect(metrics.overflow).toBe(false);
    for (const status of metrics.statuses) expect(status.contrast).toBeGreaterThanOrEqual(4.5);
    if (theme === 'light') expect(metrics.statuses.slice(0, 4).map(status => status.color)).toEqual(['rgb(161, 59, 52)', 'rgb(63, 101, 75)', 'rgb(128, 96, 30)', 'rgb(98, 102, 95)']);
    await page.screenshot({ path: `${artifacts}/${entry}-${width}-${theme}-inventory.png`, fullPage: true });
    const rule = workspace.getByRole('button', { name: /Ask before publishing changes/ });
    await rule.focus(); await page.keyboard.press('Enter');
    await expect(workspace.getByRole('heading', { name: 'Recorded checks', exact: true })).toBeFocused();
    await workspace.getByRole('button', { name: 'View recorded call', exact: true }).press('Enter');
    await expect(workspace.getByRole('heading', { name: 'Recorded call summary', exact: true })).toBeFocused();
    const disclosure = workspace.getByText('Why this assessment', { exact: true });
    await disclosure.press('Enter'); await disclosure.focus();
    await page.clock.runFor(10_000);
    await expect(disclosure).toBeFocused();
    await expect(workspace.locator('.why-disclosure')).toHaveAttribute('open', '');
    await workspace.getByRole('button', { name: 'Back to recorded checks', exact: true }).press('Enter');
    await expect(workspace.getByRole('button', { name: 'View recorded call', exact: true })).toBeFocused();
    await workspace.getByRole('button', { name: 'Back to recorded rules', exact: true }).press('Enter');
    await expect(rule).toBeFocused();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await workspace.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await workspace.locator('button').all()) if (await button.isVisible()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `${artifacts}/${entry}-${width}-${theme}-200pct.png`, fullPage: true });
    expect(errors).toEqual([]);
    expect(await workspace.innerHTML()).not.toMatch(/RAW[_-](?:EVIDENCE|PROVIDER|SENTINEL)/);
  });
}
