import { expect, test } from '../browser-shell-fixture.js';
import type { Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { syntheticOverview } from '../../../bb-plugin-tenet-status/overview.preview-fixture.js';
const stopped = 'thr_stopped0001';
const stoppedPath = `project/proj_synthetic0001/overview/${stopped}/calls`;
const noHistoryPath = 'project/proj_synthetic0001/overview/thr_nohistory01';
const artifacts = resolve('coverage/inspector-artifacts/tenet54');
test.beforeAll(async ({}, testInfo) => { testInfo.setTimeout(30_000); await mkdir(artifacts, { recursive: true }); });
const reads = (page: Page) => page.evaluate(() => (window as any).tenetPreview.reads as { threadId: string; machine: string; selection: unknown }[]);

for (const width of [900, 390]) test(`crowded project picker and dashboard scroll inside a constrained host at ${width}px`, async ({ page, shellOrigin: origin }) => {
  await page.setViewportSize({ width, height: 460 });
  await page.goto(`${origin}main.preview.html?crowded=1&host=constrained&case=paging`);
  const main = page.getByRole('region', { name: 'TENET main page', exact: true });
  const projects = page.getByRole('region', { name: 'Projects', exact: true });
  const rows = projects.getByRole('listitem').getByRole('button');
  const first = page.getByRole('button', { name: 'Synthetic local project', exact: true });
  const last = page.getByRole('button', { name: 'Synthetic remote project', exact: true });
  await expect(rows).toHaveCount(50);
  await expect(first).toBeInViewport({ ratio: 1 });
  await expect(last).not.toBeInViewport();
  await page.mouse.move(width / 2, 260);
  await page.mouse.wheel(0, 100_000);
  await expect(last).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Next projects', exact: true })).toBeInViewport({ ratio: 1 });
  expect(await reads(page)).toEqual([]);
  expect(await page.evaluate(() => (window as any).tenetPreview.dashboardReads)).toEqual([]);
  await main.focus(); await page.keyboard.press('Home');
  await expect(page.getByRole('heading', { name: 'TENET', exact: true })).toBeInViewport({ ratio: 1 });
  await first.focus();
  for (let index = 1; index < 50; index++) await page.keyboard.press('Tab');
  await expect(last).toBeFocused(); await expect(last).toBeInViewport({ ratio: 0.99 });
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(1);
  await expect(first).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'First page / Retry', exact: true }).press('Enter');
  await expect(rows).toHaveCount(50);
  await last.press('Enter');
  await expect(page.getByRole('heading', { name: 'Synthetic remote project', exact: true })).toBeInViewport({ ratio: 1 });
  expect(await main.evaluate(element => element.scrollTop)).toBe(0);
  const headingTop = await page.getByRole('heading', { name: 'Synthetic remote project', exact: true }).evaluate(element => element.getBoundingClientRect().top);
  const mainTop = await main.evaluate(element => element.getBoundingClientRect().top);
  expect(headingTop - mainTop).toBeLessThan(160);
  const rules = page.getByRole('table', { name: 'Project rules', exact: true });
  await main.focus(); await page.keyboard.press('Home');
  await expect.poll(() => main.evaluate(element => element.scrollTop)).toBe(0);
  await page.mouse.move(width / 2, 260); await page.mouse.wheel(0, 100_000);
  await expect(rules.getByRole('button', { name: 'Run offline tests.', exact: true })).toBeInViewport({ ratio: 1 });
  await rules.getByRole('button', { name: 'Ask before publishing.', exact: true }).press('Enter');
  await expect(page.getByRole('link', { name: 'Open call' })).toHaveCount(50);
  await expect(page.getByRole('heading', { name: 'Failures', exact: true })).toBeFocused();
  await page.mouse.move(width / 2, 260); await page.mouse.wheel(0, 100_000);
  const next = page.getByRole('button', { name: 'Next failures', exact: true });
  await expect(next).toBeInViewport({ ratio: 1 });
  await next.press('Enter');
  await expect(page.getByText('Showing 51–51 of 51 failures', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous failures', exact: true }).press('Enter');
  await expect(page.getByRole('link', { name: 'Open call' })).toHaveCount(50);
  await page.getByRole('link', { name: 'Open call' }).first().press('Enter');
  await expect(page.getByRole('button', { name: 'Back to project rules', exact: true })).toBeVisible();
  await expect(page.locator('.call-row').first()).toBeAttached();
  await main.focus(); await page.keyboard.press('Home');
  await expect(page.getByRole('button', { name: 'Choose project', exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Choose project', exact: true }).press('Enter');
  await expect(rows).toHaveCount(50);
  expect(await page.evaluate(() => ({ y: window.scrollY, height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth }))).toEqual({ y: 0, height: 460, width });
});

for (const theme of ['light', 'dark']) for (const width of [900, 390]) test(`project cards have honest details and responsive columns at ${width}px in ${theme}`, async ({ page, shellOrigin: origin }) => {
  await page.setViewportSize({ width, height: 460 });
  await page.goto(`${origin}main.preview.html?crowded=1&host=constrained&theme=${theme}`);
  const projects = page.getByRole('region', { name: 'Projects', exact: true });
  const list = projects.getByRole('list');
  const cards = list.getByRole('button');
  await expect(cards).toHaveCount(50);
  await expect(projects.getByText('Recorded history loads when you open a project. This picker does not scan histories.', { exact: true })).toHaveCount(1);
  await expect(cards.first()).toHaveAccessibleName('Synthetic local project');
  await expect(cards.first().locator('time')).toHaveAttribute('datetime', '2025-01-02T00:00:00.000Z');
  await expect(cards.first()).toContainText('BB project updated Jan 2, 2025');
  await expect(cards.nth(1)).toContainText('BB project update unavailable');
  await expect(projects.getByText('View rule history', { exact: true })).toHaveCount(50);
  await expect(projects.getByText('Recorded rule checks and their results.', { exact: true })).toHaveCount(50);
  expect(await projects.innerText()).not.toMatch(/\d+%|all.clear|enabled|Tenet activity|assessment time/i);
  const metrics = await list.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
      cards: Array.from(element.querySelectorAll('button')).map(button => {
        const rect = button.getBoundingClientRect(), style = getComputedStyle(button);
        const title = button.querySelector('.tenet-project-title')!;
        return { tag: button.tagName, width: rect.width, height: rect.height, listWidth: bounds.width,
          textAlign: style.textAlign, overflow: button.scrollWidth > button.clientWidth, color: style.color,
          x: rect.x, y: rect.y, titleHeight: title.getBoundingClientRect().height };
      }) };
  });
  expect(metrics.columns).toBe(width === 900 ? 2 : 1);
  for (const card of metrics.cards) {
    expect(card.tag).toBe('BUTTON');
    expect(card.width).toBeCloseTo(width === 900 ? (card.listWidth - 16) / 2 : card.listWidth, 0);
    expect(card.height).toBeGreaterThanOrEqual(44);
    expect(card.textAlign).toBe('left'); expect(card.overflow).toBe(false);
    expect(card.color).toBe(theme === 'dark' ? 'rgb(237, 238, 237)' : 'rgb(23, 25, 24)');
  }
  expect(metrics.cards[1]!.titleHeight).toBeGreaterThan(metrics.cards[0]!.titleHeight);
  if (width === 900) {
    expect(metrics.cards[0]!.y).toBe(metrics.cards[1]!.y);
    expect(metrics.cards[1]!.x).toBeGreaterThan(metrics.cards[0]!.x);
  } else expect(metrics.cards[1]!.y).toBeGreaterThan(metrics.cards[0]!.y);
  expect(await reads(page)).toEqual([]);
  expect(await page.evaluate(() => ({ dashboard: (window as any).tenetPreview.dashboardReads, picker: (window as any).tenetPreview.pickerReads }))).toEqual({ dashboard: [], picker: [null] });
  await cards.first().focus(); await page.keyboard.press('Tab');
  await expect(cards.nth(1)).toBeFocused();
  const focus = await cards.nth(1).evaluate(element => { const style = getComputedStyle(element); return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor, foreground: style.color }; });
  expect(focus.style).toBe('solid'); expect(focus.width).toBe('2px'); expect(focus.color).toBe(focus.foreground);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await cards.first().press('Space');
  await expect(page.getByRole('heading', { name: 'Synthetic local project', exact: true })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => (window as any).tenetPreview.dashboardReads)).toEqual(['start', 'advance']);
  if (theme === 'light') {
    await page.setViewportSize({ width, height: 820 });
    await page.goto(`${origin}main.preview.html?cards=1&host=constrained&theme=${theme}`);
    await expect(page.getByRole('button', { name: 'Field Notes', exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/tenet-cards-work/cards-${width}.png`, fullPage: true });
  }
});
for (const width of [1440, 390]) test(`project rules to flat failures at ${width}px supports keyboard, exact links and Back`, async ({ page, shellOrigin: origin }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${origin}main.preview.html?host-query=keep`);
  await page.getByRole('heading', { name: 'Choose a project' }).waitFor();
  expect(await reads(page)).toHaveLength(0);
  expect(await page.getByRole('button', { name: /scan|dashboard/i }).count()).toBe(0);
  await page.getByRole('button', { name: 'Synthetic local project', exact: true }).press('Enter');
  const rules = page.getByRole('table', { name: 'Project rules' });
  await rules.waitFor();
  expect(await rules.getByRole('columnheader').allTextContents()).toEqual(['Rule', 'Passing', 'Failing']);
  expect(await rules.getByRole('row').nth(1).innerText()).toContain('90%');
  expect(await rules.getByRole('row').nth(1).innerText()).toContain('10%');
  expect(await rules.getByRole('row').nth(2).innerText()).toContain('100%');
  expect(await rules.getByRole('row').nth(5).innerText()).toContain('Not checked');
  expect(await reads(page)).toHaveLength(0);
  expect(await page.getByText('History details', { exact: true }).count()).toBe(0);
  expect(await page.locator('details').count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const metrics = await rules.evaluate(element => {
    const cell = element.querySelector('td')!, header = element.querySelector('th')!;
    const style = getComputedStyle(cell), headerStyle = getComputedStyle(header);
    return { fontSize: style.fontSize, padding: style.padding, numerals: style.fontVariantNumeric,
      color: style.color, secondary: headerStyle.color, width: element.getBoundingClientRect().width };
  });
  expect(metrics.fontSize).toBe('14px'); expect(metrics.numerals).toBe('tabular-nums');
  console.log(`Project rules ${width}px computed styles ${JSON.stringify(metrics)}`);
  await rules.getByRole('button', { name: 'Ask before publishing.' }).press('Enter');
  const failures = page.getByRole('table', { name: 'Failures' });
  await failures.waitFor();
  expect(await failures.getByRole('columnheader').allTextContents()).toEqual(['Thread', 'Tool', 'When', 'Open']);
  expect(await failures.getByRole('row').count()).toBe(2);
  expect(await failures.innerText()).toContain('Prepare release notes');
  expect(await failures.innerText()).toContain('bash');
  expect(await rules.count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await failures.getByRole('link', { name: 'Open call' }).press('Enter');
  if (width === 390) await page.getByRole('button', { name: 'Summary', exact: true }).click();
  await page.locator('.recorded-call').waitFor();
  const callPath = new URL(page.url()).hash;
  expect(callPath).toMatch(/^#project\/proj_synthetic0001\/overview\/thr_stopped0001\/calls\/session\/[a-f0-9]{64}\/call\/[a-f0-9]{64}$/);
  expect((await reads(page)).at(-1)?.threadId).toBe(stopped);
  expect(await page.locator('.action-preview, .evidence-dock, .question-json').count()).toBe(0);
  await page.goBack(); await failures.waitFor();
  await expect(failures.getByRole('link', { name: 'Open call' })).toBeFocused();
  expect(await page.evaluate(() => (window as any).tenetPreview.dashboardReads)).toEqual(['start', 'advance', 'results']);
  await page.getByRole('button', { name: 'Back to rules' }).press('Enter'); await rules.waitFor();
  await expect(rules.getByRole('button', { name: 'Ask before publishing.' })).toBeFocused();
  await rules.getByRole('button', { name: 'Keep credentials private.' }).click();
  await page.getByText('No recorded failures for this rule.').waitFor();
  await page.getByRole('button', { name: 'Back to rules' }).press('Enter'); await rules.waitFor();
  expect(await page.getByText('History details', { exact: true }).count()).toBe(0);
  expect(await page.getByText(/Recorded rules, not a live inventory|Unknown, not applicable|Capture is best-effort/).count()).toBe(0);
  await page.getByRole('button', { name: 'Change project' }).press('Enter');
  await page.getByRole('button', { name: 'Next projects' }).click();
  await page.getByRole('button', { name: 'Synthetic remote project', exact: true }).click();
  await page.getByRole('heading', { name: 'Synthetic remote project' }).waitFor();
  expect(new URL(page.url()).search).toBe('?host-query=keep');
});
for (const width of [1440, 390]) test(`51 failures preserve backward paging and keyboard focus at ${width}px`, async ({ page, shellOrigin: origin }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${origin}main.preview.html?case=paging`);
  await page.getByRole('button', { name: 'Synthetic local project', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Ask before publishing.', exact: true }).press('Enter');
  const failures = page.getByRole('table', { name: 'Failures', exact: true });
  const calls = failures.getByRole('link', { name: 'Open call' });
  const heading = page.getByRole('heading', { name: 'Failures', exact: true });
  await expect(page.getByText('Showing 1–50 of 51 failures', { exact: true })).toBeVisible();
  await expect(calls).toHaveCount(50);
  const firstCall = await calls.first().getAttribute('href');
  const next = page.getByRole('button', { name: 'Next failures', exact: true });
  await next.press('Enter');
  await expect(page.getByText('Showing 51–51 of 51 failures', { exact: true })).toBeVisible();
  await expect(calls).toHaveCount(1);
  await expect(next).toHaveCount(0);
  await expect(heading).toBeFocused();
  await page.screenshot({ path: `${artifacts}/tenet166-last-failure-${width}.png`, fullPage: true });
  await page.keyboard.press('Tab');
  await expect(calls).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Previous failures', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Showing 1–50 of 51 failures', { exact: true })).toBeVisible();
  await expect(calls).toHaveCount(50);
  await expect(calls.first()).toHaveAttribute('href', firstCall!);
  await next.press('Enter');
  await expect(heading).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'First failures', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Showing 1–50 of 51 failures', { exact: true })).toBeVisible();
  await expect(calls).toHaveCount(50);
  await expect(calls.first()).toHaveAttribute('href', firstCall!);
});
test('main call history restores scope/call/filter across simulated machines', async ({ page, shellOrigin: origin }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  try {
    await page.goto(`${origin}main.preview.html?host-query=keep#${stoppedPath}`);
    await page.locator('.call-row').first().waitFor();
    await page.getByText('Session recording details', { exact: true }).press('Enter');
    expect(await page.locator('.session-counts').innerText()).toContain('2 evaluator failures');
    await page.getByText('Session recording details', { exact: true }).press('Enter');
    await page.getByLabel('Finding category').selectOption('unavailable');
    await expect.poll(() => page.locator('.call-row').count()).toBe(2);
    await page.locator(`[data-call-id="${syntheticOverview.calls[2]!.id}"]`).click();
    await expect.poll(() => page.locator('.recording-details dd').first().textContent()).toContain('synthetic-provider-error-2');
    const selectionPath = new URL(page.url()).hash;
    await page.evaluate(() => (window as any).tenetPreview.navigate('project/proj_synthetic0002/overview/thr_remote00001/calls'));
    await expect.poll(() => page.locator('.recording-details dd').first().textContent()).toContain('remote-synthetic');
    expect((await reads(page)).map(r => r.machine)).toContain('synthetic-machine-b');
    await page.goBack();
    await expect.poll(() => page.locator('.recording-details dd').first().textContent()).toContain('synthetic-provider-error-2');
    expect(new URL(page.url()).hash).toBe(selectionPath);
    await page.goForward(); await expect.poll(() => page.locator('.recording-details dd').first().textContent()).toContain('remote-synthetic');
    expect(new URL(page.url()).search).toBe('?host-query=keep');
  } finally { await page.close(); }
});
for (const [width, narrow] of [[1440, false], [1440, true], [390, false]] as const)
  test(`shared main summary at ${width}px window / ${narrow ? '390px' : 'full'} container is keyboard-safe, inert and raw-free`, async ({ page, shellOrigin: origin }) => {
    await page.setViewportSize({ width, height: 1100 });
    const errors: string[] = [], unexpected: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(origin).origin && !url.pathname.startsWith('/api/')) return route.continue();
      unexpected.push(url.href); return route.abort();
    });
    try {
      await page.goto(`${origin}main.preview.html${narrow ? '?narrow=1' : ''}#${stoppedPath}`);
      await page.locator('.call-row').first().waitFor();
      const compact = narrow || width === 390;
      expect(await page.getByRole('button', { name: 'Calls', exact: true }).isVisible()).toBe(compact);
      if (compact) {
        await page.locator(`[data-call-id="${syntheticOverview.calls[2]!.id}"]`).click();
        await expect.poll(() => page.locator('.recording-details dd').first().textContent()).toContain('synthetic-provider-error-2');
        expect(await page.locator('.inspection').isVisible()).toBe(true);
        expect(await page.locator('.explorer').isVisible()).toBe(false);
      }
      expect(await page.locator('.assessment-state').first().isVisible()).toBe(false);
      expect(await page.locator('.recorded-call').innerText()).toContain('Reported violations unavailable. No validated complete assessment.');
      await page.getByText('Recording details', { exact: true }).press('Enter');
      expect(await page.locator('.assessment-state').first().innerText()).toContain('unavailable · provider-error');
      await page.getByText('Recording details', { exact: true }).press('Enter');
      await page.getByText('Archive warnings', { exact: true }).press('Enter');
      expect(await page.getByText('Archive warnings', { exact: true }).locator('..').innerText()).toContain('corrupt-record');
      await page.screenshot({ path: `${artifacts}/main-${width}-${narrow ? 'narrow' : 'full'}-failure.png`, fullPage: true });
      await page.getByLabel('Linked session').selectOption('a'.repeat(64));
      await page.getByText('Session recording details', { exact: true }).press('Enter');
      await expect.poll(() => page.locator('.session-counts').innerText()).toContain('1 selected FAIL');
      await page.getByText('Session recording details', { exact: true }).press('Enter');
      if (compact) await page.getByRole('button', { name: 'Summary', exact: true }).press('Enter');
      await page.locator('.why-disclosure > summary').press('Enter');
      await page.getByText('Selected check details', { exact: true }).press('Enter');
      expect(await page.getByText('<script>window.archiveExecuted=true</script>', { exact: true }).count()).toBeGreaterThan(0);
      expect(await page.locator('.main-container script').count()).toBe(0);
      expect(await page.evaluate(() => (window as any).archiveExecuted)).toBeUndefined();
      expect(await page.locator('.primary-status').isVisible()).toBe(false);
      expect(await page.locator('.primary-status').textContent()).toContain('Ran');
      expect(await page.locator('.main-container').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.locator('.action-preview, .evidence-dock, .question-json').count()).toBe(0);
      await page.locator('.why-disclosure > summary').press('Enter');
      expect(await page.locator('.recorded-call').innerText()).toContain('<script>window.archiveExecuted=true</script>');
      expect(await page.locator('.decision-map').isVisible()).toBe(false);
      await page.screenshot({ path: `${artifacts}/main-${width}-${narrow ? 'narrow' : 'full'}-selected-fail.png`, fullPage: true });
      await page.getByRole('button', { name: 'Choose project', exact: true }).press('Enter');
      await page.getByRole('button', { name: 'Synthetic local project', exact: true }).waitFor();
      expect(await page.locator('.tenet-summary-workspace').count()).toBe(0);
      expect(errors).toEqual([]); expect(unexpected).toEqual([]);
    } finally { await page.close(); }
  });
test('unlinked, unsupported, deleted, changed-scope, forged links and old findings never show prior clean-looking data', async ({ page, shellOrigin: origin }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  try {
    await page.goto(`${origin}main.preview.html#${stoppedPath}`);
    await page.locator('.call-row').first().waitFor();
    await page.getByRole('button', { name: 'View flagged rules', exact: true }).click();
    await page.getByRole('heading', { name: 'Focused flagged rules' }).waitFor();
    expect(new URL(page.url()).hash).toBe(`#${stopped}`);
    const before = (await reads(page)).length;
    for (const [path, message] of [['project/proj_synthetic0001/overview/thr_nonpi000001', /supports Pi threads only/], ['project/proj_synthetic0001/overview/thr_deleted0001', /unavailable or deleted/],
      ['project/proj_synthetic0002/overview/thr_stopped0001', /project changed/]] as const) {
      await page.evaluate(path => (window as any).tenetPreview.navigate(path), path); await page.getByText(message).waitFor();
      expect(await page.locator('.call-row, .common-summary').count()).toBe(0); expect(await reads(page)).toHaveLength(before);
    }
    await page.evaluate(path => (window as any).tenetPreview.navigate(path), `${stoppedPath}/session/${'f'.repeat(64)}/call/${'e'.repeat(64)}`);
    await page.getByText(/Read unavailable or selection rejected/).waitFor();
    expect(await page.locator('.call-row, .common-summary').count()).toBe(0);
    await page.evaluate(path => (window as any).tenetPreview.navigate(path), noHistoryPath);
    await page.getByText('No recordings linked to this thread. Assessment unknown, not pass.').waitFor();
  } finally { await page.close(); }
});


test('51 failures restore the final range and originating call after browser Back', async ({ page, shellOrigin: origin }) => {
  await page.goto(`${origin}main.preview.html?case=paging#project/proj_synthetic0001`);
  await page.getByRole('button', { name: 'Ask before publishing.' }).click();
  await page.getByText('Showing 1–50 of 51 failures', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next failures' }).press('Enter');
  await page.getByText('Showing 51–51 of 51 failures', { exact: true }).waitFor();
  await expect(page.getByRole('heading', { name: 'Failures', exact: true })).toBeFocused();
  const link = page.getByRole('link', { name: 'Open call' });
  const href = await link.getAttribute('href');
  await link.press('Enter');
  await page.getByRole('button', { name: 'Back to project rules' }).waitFor();
  await page.goBack();
  await page.getByText('Showing 51–51 of 51 failures', { exact: true }).waitFor();
  await expect(link).toBeFocused(); expect(await link.getAttribute('href')).toBe(href);
  await page.getByRole('button', { name: 'Previous failures' }).click();
  await page.getByText('Showing 1–50 of 51 failures', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next failures' }).click();
  await page.getByText('Showing 51–51 of 51 failures', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'First failures' }).click();
  await page.getByText('Showing 1–50 of 51 failures', { exact: true }).waitFor();
  expect(await page.getByRole('link', { name: 'Open call' }).count()).toBe(50);
  expect(await page.evaluate(() => (window as any).tenetPreview.dashboardReads)).toEqual(['start', 'advance', 'results']);
});

test('expired dashboard return clears retained rates and failures without a hidden rescan', async ({ page, shellOrigin: origin }) => {
  await page.goto(`${origin}main.preview.html?case=expired-return#project/proj_synthetic0001`);
  await page.getByRole('button', { name: 'Ask before publishing.' }).click();
  await page.getByRole('link', { name: 'Open call' }).click();
  await page.getByRole('button', { name: 'Back to project rules' }).waitFor();
  await page.goBack();
  await page.getByRole('alert').filter({ hasText: 'Results cleared' }).waitFor();
  expect(await page.getByRole('table').count()).toBe(0);
  expect(await page.evaluate(() => (window as any).tenetPreview.dashboardReads)).toEqual(['start', 'advance', 'results']);
});


test('dashboard ergonomic targets and readable reflow use real light and dark tokens', async ({ page, shellOrigin: origin }) => {
  test.setTimeout(30_000);
  const measurements: unknown[] = [];
  for (const theme of ['light', 'dark']) {
    for (const [name, width, scale] of [['desktop', 1440, 1], ['mobile', 390, 1], ['text200', 390, 2]] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${origin}main.preview.html?theme=${theme}&view=${name}#project/proj_synthetic0001`);
      const rules = page.getByRole('table', { name: 'Project rules' }); await rules.waitFor();
      if (scale === 2) await page.addStyleTag({ content: '.tenet-dashboard, .tenet-dashboard p, .tenet-dashboard h2, .tenet-dashboard h3, .tenet-dashboard button { font-size:28px !important; }' });
      for (const stage of ['rules', 'failures']) {
        const table = page.getByRole('table', { name: stage === 'rules' ? 'Project rules' : 'Failures' });
        await table.waitFor();
        expect(await table.getByRole('columnheader').allTextContents()).toEqual(stage === 'rules' ? ['Rule', 'Passing', 'Failing'] : ['Thread', 'Tool', 'When', 'Open']);
        if (stage === 'failures') {
          const head = await table.locator('thead').evaluate(el => { const css = getComputedStyle(el); return { clipPath: css.clipPath, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }; });
          if (width === 390) expect(head).toEqual({ clipPath: 'inset(50%)', width: 1, height: 1 });
          expect(await table.innerText()).toContain('Prepare release notes'); expect(await table.innerText()).toContain('bash');
          expect(await table.locator('time').getAttribute('datetime')).toBe('2023-11-14T22:13:20.000Z');
          expect(await table.getByRole('link', { name: 'Open call' }).getAttribute('href')).toContain('/session/');
        }
        const metrics = await table.evaluate(el => {
          const targets = Array.from(el.querySelectorAll<HTMLElement>('.dashboard-target')).map(target => {
            const rect = target.getBoundingClientRect(); return { width: rect.width, height: rect.height, label: target.textContent };
          });
          const cells = Array.from(el.querySelectorAll<HTMLElement>('th, td')).filter(cell => { const head = cell.closest('thead'); return !head || getComputedStyle(head).clipPath === 'none'; }).map(cell => {
            const rect = cell.getBoundingClientRect(); return { text: cell.textContent, width: rect.width, fontSize: getComputedStyle(cell).fontSize, wordBreak: getComputedStyle(cell).overflowWrap };
          });
          const root = getComputedStyle(document.documentElement);
          return { overflow: document.documentElement.scrollWidth > innerWidth, targets, cells, foreground: root.getPropertyValue('--foreground'), background: root.getPropertyValue('--background'), muted: root.getPropertyValue('--muted-foreground') };
        });
        expect(metrics.overflow).toBe(false);
        for (const target of metrics.targets) { expect(target.height).toBeGreaterThanOrEqual(44); expect(target.width).toBeGreaterThanOrEqual(44); }
        expect(metrics.foreground.trim()).toBe(theme === 'dark' ? '#edeeed' : '#171918');
        expect(metrics.background.trim()).toBe(theme === 'dark' ? '#202321' : '#fff');
        if (scale === 2) {
          expect(metrics.cells.every(cell => cell.fontSize === '28px')).toBe(true);
          expect(metrics.cells.every(cell => cell.width >= 140)).toBe(true);
        }
        measurements.push({ theme, name, stage, ...metrics });
        if (process.env.TENET_AUDIT_VISUAL === '1') await page.screenshot({ path: `/tmp/tenet-audit-fixed-${theme}-${name}-${stage}.png`, fullPage: true });
        if (stage === 'rules') await page.getByRole('button', { name: 'Ask before publishing.' }).click();
      }
    }
    await page.setViewportSize({ width: 390, height: 240 });
    await page.goto(`${origin}main.preview.html?icons=1&theme=${theme}`);
    await page.getByRole('region', { name: 'T icon sizes' }).waitFor();
    for (const size of [16, 20, 24, 32]) {
      const icon = page.getByRole('img', { name: `TENET ${size}px`, exact: true });
      const bounds = await icon.boundingBox(); expect(bounds?.width).toBe(size); expect(bounds?.height).toBe(size);
      expect(await icon.evaluate(el => getComputedStyle(el).maskImage)).toContain('/icons/tenet.svg');
    }
    expect((await page.request.get(`${origin}icons/tenet.svg`)).status()).toBe(200);
    if (process.env.TENET_AUDIT_VISUAL === '1') await page.screenshot({ path: `/tmp/tenet-audit-fixed-${theme}-icons.png`, fullPage: true });
  }
  if (process.env.TENET_AUDIT_VISUAL === '1') await writeFile('/tmp/tenet-audit-fixed-measurements.json', JSON.stringify(measurements, null, 2));
});
