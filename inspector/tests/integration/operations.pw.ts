import { test as base, expect } from '../playwright-fixture.js';
import type { InspectorTest } from './fixture.js';
import { OperationsRuntime } from '../../../src/runtime/operations.js';
import { diagnosticSafety } from '../../../src/runtime/diagnostic-safety.js';
import { aggregateOperations } from '../../../src/inspector/operations-reader.js';
import { browserFixture } from '../browser-fixture.js';
import { FixtureArchiveWriter } from '../../../test/archive-fixture.js';
const exactId = '00000000-0000-4000-8000-000000000099';
const sample = () => {
  const owner = new OperationsRuntime({ enabled: false, directory: '/unused' }, () => diagnosticSafety([]));
  const a = owner.begin({ host: 'test', sessionId: 'one', contextId: 'main', invocationId: '00000000-0000-4000-8000-000000000001', callId: 'call', toolName: 'Fixture request', cwd: '/fixture/Tenet', mode: 'enforce' });
  a.analyzing(); a.settle('completed', 1400); a.approval('attempt', true);
  return aggregateOperations([{ snapshot: owner.snapshot(), freshness: 'fresh' }], { window: 15 }, Date.now());
};
const test = base.extend<{ withOperations: (run: (fixture: InspectorTest) => Promise<void>) => Promise<void> }>({
  withOperations: async ({ withInspector }, use) => {
    await use(async run => {
      let owner: OperationsRuntime | undefined;
      try {
        await withInspector('operations', async fixture => {
          try { await run(fixture); } finally { await owner?.close(1000); }
        }, { base: false, path: '/', seed: async root => {
          await browserFixture(root);
          const config = { enabled: true, directory: root }, archive = new FixtureArchiveWriter(config);
          const identity = { host: 'test', sessionId: 'operations-session', contextId: 'main', invocationId: exactId, callId: 'exact-call', toolName: 'Exact fixture', cwd: root, mode: 'enforce' as const };
          archive.bind(identity)('execution', { outcome: 'unknown' }); await archive.settle();
          for (let i = 0; i < 55; i++) { archive.bind({ ...identity, invocationId: `later-${i}`, callId: `later-${i}` })('execution', { outcome: 'unknown' }); await archive.settle(); }
          await archive.complete();
          owner = new OperationsRuntime(config, () => diagnosticSafety([]));
          for (let i = 0; i < 121; i++) {
            const a = owner.begin({ ...identity, invocationId: `00000000-0000-4000-8001-${String(i).padStart(12, '0')}`, toolName: `Batch fixture ${i}`, cwd: '/fixture/Other' });
            a.analyzing(); a.settle('completed', i + 1); a.permission('released');
          }
          const target = owner.begin(identity); target.analyzing(); target.settle('completed', 27); target.permission('blocked'); await owner.flush();
        } });
      } finally { await owner?.close(1000); }
    });
  },
});

test('Operations retains mounted detail, focus and disclosures through unchanged polls and delayed joins', async ({ withOperations }) => {
  await withOperations(async ({ page, app }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const data = sample();
  await page.route('**/api/operations?*', route => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: params.get('search') || params.get('state') === 'completed' ? { ...data, requests: [], total: 0 } : data });
  });
  await page.goto(`${app.origin}/?view=operations`);
  await page.getByRole('heading', { name: 'Operations', exact: true }).waitFor();
  const request = page.locator('.op-request-link').first(); await request.click();
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  await dialog.getByText('Coverage and identity', { exact: true }).click();
  await dialog.locator('summary').focus();
  await page.waitForTimeout(2400);
  expect(await dialog.locator('details').getAttribute('open')).not.toBeNull();
  expect(await dialog.locator('summary').evaluate(e => document.activeElement === e)).toBe(true);
  data.requests[0]!.description = { key: 'path', value: 'Joined fixture preview', shortened: false };
  await expect.poll(() => dialog.locator('.op-command').textContent(), { timeout: 4000 }).toBe('Joined fixture preview');
  expect(await dialog.locator('summary').evaluate(e => document.activeElement === e)).toBe(true);
  expect(await dialog.innerText()).toContain('Not queued');
  expect(await page.getByRole('button', { name: /^Approve/ }).count()).toBe(0);
  await dialog.press('Escape');
  await expect.poll(() => request.evaluate(e => document.activeElement === e)).toBe(true);
  await page.getByRole('button', { name: /Completed 1/ }).click();
  await page.getByLabel('Search requests').fill('nothing-matches');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  expect(await page.getByLabel('Search requests').evaluate(e => document.activeElement === e)).toBe(true);
  await page.getByRole('button', { name: 'Queue board', exact: true }).click();
  expect(await page.locator('.op-board').count()).toBe(1);
  });
});

test('hanging HTTP expires live claims independently and resume recovers', async ({ withOperations }) => {
  await withOperations(async ({ page, app }) => {
  const data = { ...sample(), freshForMs: 1200 };
  let reads = 0;
  await page.route('**/api/operations?*', async route => {
    if (++reads > 1) { await new Promise(resolve => setTimeout(resolve, 5500)); await route.abort().catch(() => {}); }
    else await route.fulfill({ json: data });
  });
  await page.goto(`${app.origin}/?view=operations`);
  await page.getByRole('button', { name: /Awaiting approval 1/ }).waitFor();
  await expect.poll(() => page.getByRole('button', { name: /Awaiting approval Unknown/ }).count(), { timeout: 4000 }).toBe(1);
  expect(await page.locator('.op-connection').innerText()).toContain('unknown');
  await page.unroute('**/api/operations?*');
  await page.route('**/api/operations?*', route => route.fulfill({ json: { ...data, freshForMs: 10000 } }));
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.getByRole('button', { name: /Awaiting approval 1/ }).count(), { timeout: 8000 }).toBe(1);
  });
});

test('Operations selection cannot be overwritten by archive discovery and explicit deep links choose Inspector', async ({ withOperations }) => {
  await withOperations(async ({ page, app }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${app.origin}/?view=operations`);
  await page.getByRole('heading', { name: 'Operations', exact: true }).waitFor();
  await page.waitForTimeout(2100); expect(new URL(page.url()).searchParams.get('view')).toBe('operations');
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Did this session follow the rules?', exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.has('session')).toBe(true);
  await page.goBack();
  await page.getByRole('heading', { name: 'Operations', exact: true }).waitFor();
  });
});

test('real Operations filters and pagination aggregate all retained rows, then hand off the exact recording', async ({ withOperations }) => {
  await withOperations(async ({ page, app }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.setDefaultTimeout(5000);
  await page.goto(`${app.origin}/?view=operations`);
  await page.getByRole('button', { name: 'Exact fixture', exact: true }).waitFor();
  await page.getByLabel('Project', { exact: true }).selectOption({ label: 'Other' });
  await expect.poll(() => page.getByRole('button', { name: 'Completed 121', exact: true }).count()).toBe(1);
  expect(await page.locator('.op-request-link').count()).toBe(100);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect.poll(() => page.locator('.op-request-link').count()).toBe(21);
  expect(await page.getByRole('button', { name: 'Completed 121', exact: true }).count()).toBe(1);
  await page.getByLabel('Timing window').selectOption('60');
  await page.getByLabel('Search requests').fill('Batch fixture 120');
  await expect.poll(() => page.locator('.op-request-link').count()).toBe(1);
  await page.getByRole('button', { name: 'Cancelled', exact: true }).click();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  const exact = page.getByRole('button', { name: 'Exact fixture', exact: true }); await exact.click();
  await page.getByRole('button', { name: 'Open in Inspector', exact: true }).click();
  await page.locator('.rule-panel .decision-summary').waitFor();
  expect(new URL(page.url()).searchParams.has('invocation')).toBe(true);
  const response = await page.request.get(`${app.origin}/api/sessions/${new URL(page.url()).searchParams.get('session')}/invocations/${new URL(page.url()).searchParams.get('invocation')}`);
  expect((await response.json()).view.identity.invocationId).toBe(exactId);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Operations', exact: true })).toBeVisible();
  await expect(page.locator('.rule-panel')).not.toBeVisible();
  await page.getByRole('button', { name: 'Queue board', exact: true }).click();
  await expect(page.locator('.op-board')).toBeVisible();
  await page.goForward();
  await expect(page.locator('.rule-panel .decision-summary')).toBeVisible();
  await expect(page.locator('.decision-title h2 span')).toHaveText('exact-call');
  });
});


test('Operations trend data exposes every interval, zero, gaps and sample counts through unchanged polls', async ({ withOperations }) => {
  await withOperations(async ({ page, app }) => {
    const data = sample();
    data.buckets[0] = { ...data.buckets[0]!, analysis: 0, queue: null, analysisCount: 2, queueCount: 0 };
    data.buckets[1] = { ...data.buckets[1]!, analysis: null, queue: 125, analysisCount: 0, queueCount: 3 };
    await page.route('**/api/operations?*', route => route.fulfill({ json: data }));
    await page.goto(`${app.origin}/?view=operations`);
    const disclosure = page.getByText('Trend data', { exact: true });
    await disclosure.click();
    const table = page.getByRole('table', { name: 'Analysis time interval averages' });
    await expect(table.getByRole('columnheader')).toHaveText(['Interval start', 'Average analysis', 'Analysis samples', 'Average queue wait', 'Queue samples']);
    await expect(table.locator('tbody tr')).toHaveCount(15);
    const first = table.locator('tbody tr').nth(0), second = table.locator('tbody tr').nth(1);
    await expect(first.locator('td')).toHaveText(['0 ms', '2', 'No samples', '0']);
    await expect(second.locator('td')).toHaveText(['No samples', '0', '125 ms', '3']);
    expect(await first.locator('time').getAttribute('datetime')).toBe(new Date(data.buckets[0]!.at).toISOString());
    await disclosure.focus();
    const node = await table.elementHandle();
    await page.waitForTimeout(2400);
    expect(await node!.evaluate(e => e.isConnected)).toBe(true);
    await expect(table).toBeVisible();
    await expect(disclosure).toBeFocused();
  });
});

test('Operations selected summaries, layouts and filters have persistent neutral state markers', async ({ withOperations }) => {
  await withOperations(async ({ page, app }) => {
    await page.route('**/api/operations?*', route => route.fulfill({ json: sample() }));
    const summary = page.getByRole('button', { name: 'Awaiting approval 1', exact: true });
    const overview = page.getByRole('button', { name: 'Overview', exact: true });
    const board = page.getByRole('button', { name: 'Queue board', exact: true });
    const filters = page.getByRole('group', { name: 'Filter requests by state' });
    const filter = filters.getByRole('button', { name: 'Awaiting approval', exact: true });
    const all = filters.getByRole('button', { name: 'All', exact: true });
    const controls = [summary, overview, board, filter, all];
    const marker = (button: typeof summary) => button.evaluate(e => {
      const s = getComputedStyle(e, '::after');
      return { content: s.content, width: s.width, height: s.height, color: s.backgroundColor };
    });
    const selectedMarker = { content: '""', width: '24px', height: '2px', color: 'rgb(36, 36, 33)' };
    const expectState = async (selected: typeof controls) => {
      for (const button of controls) {
        const pressed = selected.includes(button);
        await expect(button).toHaveAttribute('aria-pressed', String(pressed));
        if (pressed) expect(await marker(button)).toEqual(selectedMarker);
        else expect((await marker(button)).content).toBe('none');
      }
    };
    const activate = async (button: typeof summary, key: 'Enter' | 'Space') => {
      await button.focus();
      await button.press(key);
      await expect(button).toBeFocused();
      expect(await button.evaluate(e => {
        const s = getComputedStyle(e);
        return { visible: e.matches(':focus-visible'), style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, color: s.outlineColor };
      })).toEqual({ visible: true, style: 'solid', width: '2px', offset: '3px', color: 'rgb(40, 95, 166)' });
    };
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.goto(`${app.origin}/?view=operations`);
      await expect(summary).toBeVisible();
      for (const button of controls) expect(await button.evaluate(e => e.tagName)).toBe('BUTTON');
      await expectState([overview, all]);
      await activate(summary, 'Enter');
      await expectState([summary, overview, filter]);
      await activate(all, 'Space');
      await expectState([overview, all]);
      await activate(summary, 'Space');
      await expectState([summary, overview, filter]);
      await activate(all, 'Enter');
      await expectState([overview, all]);
      await activate(filter, 'Enter');
      await expectState([summary, overview, filter]);
      await activate(all, 'Space');
      await expectState([overview, all]);
      await activate(filter, 'Space');
      await expectState([summary, overview, filter]);
      const contrasts: number[] = [];
      const expectPersistent = async (selected: typeof controls) => {
        await page.getByLabel('Project', { exact: true }).focus();
        await page.mouse.move(0, 0);
        for (const button of selected) {
          await button.evaluate(e => e.scrollIntoView({ block: 'center' }));
          await expect(button).not.toBeFocused();
          expect(await button.evaluate(e => e.matches(':hover'))).toBe(false);
          expect(await marker(button)).toEqual(selectedMarker);
          const adjacent = await button.evaluate(e => {
            const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
            const luminance = (color: number[]) => color.map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i]!, 0);
            const s = getComputedStyle(e, '::after'), bounds = e.getBoundingClientRect(), style = getComputedStyle(e);
            const x = bounds.left + parseFloat(style.borderLeftWidth) + parseFloat(s.left) + parseFloat(s.width) / 2;
            const top = bounds.top + parseFloat(style.borderTopWidth) + parseFloat(s.top);
            const a = luminance(rgb(s.backgroundColor));
            return [top - 1, top + parseFloat(s.height) + 1].map(y => {
              const surface = document.elementsFromPoint(x, y).map(node => getComputedStyle(node).backgroundColor).find(color => color !== 'rgba(0, 0, 0, 0)')!;
              const b = luminance(rgb(surface));
              return { surface, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
            });
          });
          for (const { surface, contrast } of adjacent) {
            expect(surface).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
            expect(contrast).toBeGreaterThanOrEqual(3);
            contrasts.push(contrast);
          }
        }
      };
      await expectPersistent([summary, overview, filter]);
      await board.click();
      await expect(board).toBeFocused();
      await expectState([summary, board, filter]);
      await expect(page.locator('.op-board')).toBeVisible();
      await activate(overview, 'Space');
      await expectState([summary, overview, filter]);
      await expect(page.locator('.op-table')).toBeVisible();
      await activate(board, 'Enter');
      await expectState([summary, board, filter]);
      await expect(page.locator('.op-board')).toBeVisible();
      await expectPersistent([summary, board, filter]);
      console.log(JSON.stringify({ width, minimumMarkerContrast: Math.min(...contrasts) }));
      await page.screenshot({ path: `coverage/inspector-artifacts/tenet-159/${width === 1440 ? 'desktop' : 'mobile'}.png`, fullPage: true });
    }
  });
});

test('Operations scope controls reflow with full long project options at 320px and 390px', async ({ withOperations }) => {
  await withOperations(async ({ page, app }) => {
    const data = sample(), label = 'Long project identity for a permitted local Operations fixture';
    data.projects.push({ key: 'f'.repeat(64), label });
    await page.route('**/api/operations?*', route => route.fulfill({ json: data }));
    await page.goto(`${app.origin}/?view=operations`);
    const project = page.getByLabel('Project', { exact: true });
    await expect(project.locator('option', { hasText: label })).toHaveText(label);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const value of ['', 'f'.repeat(64)]) {
        await project.selectOption(value);
        for (const control of [project, page.getByLabel('Timing window')]) {
          const bounds = await control.boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        }
        expect(await page.locator('.operations-workspace').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
      }
    }
  });
});

test('Operations axis labels retain readable rendered size at narrow, tablet and desktop widths', async ({ withOperations }) => {
  await withOperations(async ({ page, app }) => {
    await page.route('**/api/operations?*', route => route.fulfill({ json: sample() }));
    await page.goto(`${app.origin}/?view=operations`);
    await page.getByRole('button', { name: 'Awaiting approval 1', exact: true }).waitFor();
    for (const width of [800, 320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(() => page.locator('.op-chart svg text').evaluateAll(nodes => nodes.every(e => {
        const matrix = (e as SVGGraphicsElement).getScreenCTM()!;
        return parseFloat(getComputedStyle(e).fontSize) * Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)) >= 12;
      }))).toBe(true);
    }
  });
});


test('Operations coarse-pointer controls provide 44px targets without changing desktop density', async ({ withOperations }) => {
  await withOperations(async ({ page, app }) => {
    const touch = await page.context().newCDPSession(page);
    try {
      await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.route('**/api/operations?*', route => route.fulfill({ json: sample() }));
      await page.goto(`${app.origin}/?view=operations`);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      await page.getByRole('button', { name: 'Awaiting approval 1', exact: true }).waitFor();
      for (const selector of ['.op-scope-controls select', '.op-switcher button', '.op-filters button', '.op-request-link']) {
        const sizes = await page.locator(selector).evaluateAll(nodes => nodes.map(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })));
        expect(sizes.length).toBeGreaterThan(0);
        for (const size of sizes) { expect(size.width).toBeGreaterThanOrEqual(44); expect(size.height).toBeGreaterThanOrEqual(44); }
      }
      await page.locator('.op-request-link').first().click();
      const close = page.getByRole('button', { name: 'Close request details', exact: true });
      const bounds = await close.boundingBox();
      expect(bounds!.width).toBe(44); expect(bounds!.height).toBe(44);
      await close.press('Escape');
      await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(false);
      expect((await page.getByRole('button', { name: 'Overview', exact: true }).boundingBox())!.height).toBe(32);
    } finally { await touch.detach(); }
  });
});
