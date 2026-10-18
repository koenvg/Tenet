import { expect, test } from '../browser-shell-fixture.js';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const artifacts = resolve('coverage/inspector-artifacts/tenet176');
test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

test('panel preview conversation wraps wider heading glyphs at 320px and 200% text', async ({ page, shellOrigin }) => {
  await page.setViewportSize({ width: 320, height: 1050 });
  await page.goto(`${shellOrigin}overview.preview.html`);
  const heading = page.getByRole('heading', { name: 'Pi conversation', exact: true });
  await expect(heading).toBeVisible();
  await heading.evaluate(el => {
    document.documentElement.style.fontSize = '200%';
    (el as HTMLElement).style.fontFamily = 'monospace';
    (el as HTMLElement).style.fontSize = '1.5rem';
  });
  await expect(heading).toHaveText('Pi conversation');
  await expect(heading).toBeVisible();
  const metrics = await heading.evaluate(el => ({
    heading: { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth },
    page: { scrollWidth: document.documentElement.scrollWidth, innerWidth },
  }));
  console.log(`Preview conversation overflow ${JSON.stringify(metrics)}`);
  expect(metrics.heading.scrollWidth).toBeLessThanOrEqual(metrics.heading.clientWidth);
  expect(metrics.page.scrollWidth).toBeLessThanOrEqual(metrics.page.innerWidth);
});

for (const entry of ['panel', 'main']) {
  test(`${entry} no-history overview has one unknown presentation and one recovery action`, async ({ page, shellOrigin }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto(`${shellOrigin}${entry === 'panel' ? 'overview.preview.html?empty' : 'main.preview.html#project/proj_synthetic0001/overview/thr_nohistory01'}`);
    const workspace = page.locator('.tenet-summary-workspace');
    await expect(workspace.getByRole('status')).toHaveText('No recordings linked to this thread. Assessment unknown, not pass.');
    expect(await workspace.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    await page.screenshot({ path: `${artifacts}/${entry}-empty-${process.env.TENET176_BASELINE ? 'baseline' : 'after'}.png`, fullPage: true });
    await expect(workspace.getByRole('button', { name: 'Refresh archive' })).toHaveCount(1);
    await expect(workspace.getByRole('navigation', { name: 'Workspace views' })).toHaveCount(0);
    await expect(workspace.getByRole('combobox', { name: 'Finding category' })).toHaveCount(0);
    await expect(workspace.getByText('Choose a call to investigate')).toHaveCount(0);
    await expect(workspace.getByText('No recorded invocations in this session.')).toHaveCount(0);
    await workspace.getByRole('button', { name: 'Refresh archive' }).press('Enter');
    await expect(workspace.getByRole('status')).toHaveText('No recordings linked to this thread. Assessment unknown, not pass.');
    expect(await workspace.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}

for (const entry of ['panel', 'main']) for (const width of [320, 1440]) {
  test(`${entry} populated overview keeps compact keyboard controls at ${width}px and enlarged text`, async ({ page, shellOrigin }) => {
    await page.setViewportSize({ width, height: 1050 });
    await page.goto(`${shellOrigin}${entry === 'panel' ? 'overview.preview.html' : 'main.preview.html#project/proj_synthetic0001/overview/thr_stopped0001'}`);
    const workspace = page.locator('.tenet-summary-workspace');
    await workspace.getByRole('button', { name: 'Browse calls', exact: true }).click();
    await expect(workspace.locator('.call-row').first()).toBeVisible();
    if (entry === 'panel' && width === 1440) await page.getByRole('button', { name: 'Toggle 390px panel' }).click();
    const narrow = width === 320;
    const navigation = workspace.getByRole('navigation', { name: 'Workspace views' });
    if (narrow) {
      const calls = navigation.getByRole('button', { name: 'Calls', exact: true });
      const summary = navigation.getByRole('button', { name: 'Summary', exact: true });
      await calls.focus(); await page.keyboard.press('Tab'); await expect(summary).toBeFocused();
      expect(await summary.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
      await page.keyboard.press('Enter');
      await expect(workspace.locator('.inspection')).toBeVisible();
      const bounds = await summary.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.width).toBeLessThan(130);
      await calls.press('Enter');
    } else await expect(navigation).toBeHidden();
    await expect(workspace.locator('.session-counts')).toBeHidden();
    await workspace.getByText('Session recording details', { exact: true }).press('Enter');
    await expect(workspace.locator('.session-counts')).toContainText('0 selected FAIL · 2 evaluator failures');
    await workspace.getByText('Session recording details', { exact: true }).press('Enter');
    await workspace.getByText('Archive warnings', { exact: true }).press('Enter');
    await expect(workspace.getByText('These warnings can include records from other threads. They are not assessment failures.')).toBeVisible();
    await expect(workspace.getByText('corrupt-record', { exact: true })).toBeVisible();
    await workspace.getByRole('combobox', { name: 'Finding category' }).selectOption('violation');
    await expect(workspace.getByText('No calls match this finding category.')).toBeVisible();
    await expect(workspace.getByRole('combobox', { name: 'Finding category' })).toHaveValue('violation');
    await workspace.getByRole('button', { name: 'Clear filter', exact: true }).press('Enter');
    await expect(workspace.locator('.call-row')).toHaveCount(3);
    const selected = await workspace.locator('.call-row[aria-pressed="true"]').getAttribute('data-call-id');
    await workspace.getByRole('button', { name: 'Refresh archive' }).press('Enter');
    await expect(workspace.locator(`.call-row[data-call-id="${selected}"]`)).toHaveAttribute('aria-pressed', 'true');
    for (const [size, label] of [['100%', 'normal'], ['200%', 'enlarged']]) {
      await page.evaluate(size => { document.documentElement.style.fontSize = size!; }, size);
      for (const control of await workspace.locator('.archive-messages button, .archive-messages select, .archive-messages summary, .triage-tools select, .mobile-nav button').all()) {
        if (await control.isVisible()) {
          expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          expect(await control.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        }
      }
      expect(await workspace.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${artifacts}/${entry}-${width}-${label}.png`, fullPage: true });
    }
  });
}

for (const theme of ['light', 'dark']) test(`overview toolbar uses ${theme} host tokens with readable contrast`, async ({ page, shellOrigin }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(`${shellOrigin}main.preview.html?narrow=1&theme=${theme}#project/proj_synthetic0001/overview/thr_stopped0001`);
  const workspace = page.locator('.tenet-summary-workspace');
  await workspace.getByRole('button', { name: 'Browse calls', exact: true }).click();
  await expect(workspace.locator('.call-row').first()).toBeVisible();
  const metrics = await workspace.evaluate(el => {
    const style = getComputedStyle(el), status = getComputedStyle(el.querySelector('[role="status"]')!), select = getComputedStyle(el.querySelector('select')!);
    const warning = getComputedStyle(el.querySelector('.call-concern.caution')!);
    const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i]!, 0);
    const contrast = (a: string, b: string) => { const values = [luminance(a), luminance(b)].sort((a, b) => b - a); return (values[0]! + .05) / (values[1]! + .05); };
    return { workspaceBackground: style.backgroundColor, selectedBackground: getComputedStyle(el.querySelector('.call-row[aria-pressed="true"]')!).backgroundColor,
      color: select.color, background: select.backgroundColor, mutedContrast: contrast(status.color, style.backgroundColor), controlContrast: contrast(select.color, select.backgroundColor), statusSize: status.fontSize,
      warningColor: warning.color, warningContrast: contrast(warning.color, style.backgroundColor),
      toolbarPadding: getComputedStyle(el.querySelector('.archive-messages')!).padding, navigationGap: getComputedStyle(el.querySelector('.mobile-nav')!).gap };
  });
  expect(metrics.color).toBe(theme === 'dark' ? 'rgb(237, 238, 237)' : 'rgb(23, 25, 24)');
  expect(metrics.background).toBe(theme === 'dark' ? 'rgb(32, 35, 33)' : 'rgb(255, 255, 255)');
  expect(metrics.workspaceBackground).toBe(metrics.background);
  expect(metrics.selectedBackground).toBe(theme === 'dark' ? 'rgb(48, 54, 49)' : 'rgb(239, 240, 237)');
  expect(metrics.mutedContrast).toBeGreaterThanOrEqual(4.5);
  expect(metrics.controlContrast).toBeGreaterThanOrEqual(4.5);
  expect(metrics.warningColor).toBe(metrics.color);
  expect(metrics.warningContrast).toBeGreaterThanOrEqual(4.5);
  expect(metrics.statusSize).toBe('14px');
  console.log(`${theme} overview computed styles ${JSON.stringify(metrics)}`);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await workspace.getByRole('status').evaluate(el => getComputedStyle(el).fontSize)).toBe('28px');
  expect(await workspace.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `${artifacts}/main-${theme}-390-in-wide.png`, fullPage: true });
  const warningToken = theme === 'dark' ? 'rgb(240, 195, 110)' : 'rgb(121, 86, 23)';
  await workspace.evaluate((el, color) => (el as HTMLElement).style.setProperty('--warning-text', color), warningToken);
  expect(await workspace.locator('.call-concern.caution').first().evaluate(el => getComputedStyle(el).color)).toBe(warningToken);
  await expect(workspace.getByRole('navigation', { name: 'Invocations' }).getByText('Evaluator unavailable', { exact: true })).toHaveCount(2);
});

for (const entry of ['panel', 'main']) test(`${entry} unavailable overview has one status and recovers without redundant empty UI`, async ({ page, shellOrigin }) => {
  await page.clock.install();
  await page.goto(`${shellOrigin}live.preview.html?entry=${entry}`);
  const workspace = page.locator('.tenet-summary-workspace');
  await workspace.getByRole('button', { name: 'Browse calls', exact: true }).click();
  await expect(workspace.locator('.call-row').first()).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect archive', exact: true }).click();
  await page.clock.runFor(10_000);
  await expect(workspace.getByRole('status')).toHaveText('Host or archive unavailable. No current result.');
  await expect(workspace.getByRole('button', { name: 'Refresh archive' })).toHaveCount(1);
  await expect(workspace.locator('.mobile-nav, .explorer, .inspection')).toHaveCount(0);
  await page.screenshot({ path: `${artifacts}/${entry}-unavailable.png`, fullPage: true });
  await page.getByRole('button', { name: 'Make archive readable', exact: true }).click();
  await workspace.getByRole('button', { name: 'Refresh archive' }).press('Enter');
  await expect(workspace.locator('.call-row').first()).toBeVisible();
});

for (const width of [390, 1440]) test(`expanded overview decision map keeps round controls at ${width}px`, async ({ page, shellOrigin }) => {
  await page.setViewportSize({ width, height: 1050 });
  await page.goto(`${shellOrigin}overview.preview.html`);
  const workspace = page.locator('.tenet-summary-workspace');
  await workspace.getByRole('button', { name: 'Browse calls', exact: true }).click();
  await expect(workspace.locator('.call-row').first()).toBeVisible();
  if (width === 1440) await page.getByRole('button', { name: 'Toggle 390px panel' }).click();
  else await workspace.getByRole('button', { name: 'Summary', exact: true }).press('Enter');
  await workspace.getByText('Why this assessment', { exact: true }).press('Enter');
  const symbols = workspace.locator('.decision-map .map-symbol');
  expect(await symbols.count()).toBeGreaterThan(2);
  for (const symbol of await symbols.all()) {
    await expect(symbol).toBeVisible();
    const box = (await symbol.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(Math.abs(box.height - box.width)).toBeLessThan(1);
  }
  await page.screenshot({ path: `${artifacts}/panel-${width}-expanded-map.png`, fullPage: true });
});
