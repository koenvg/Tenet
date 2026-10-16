import { createElement } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import App from '../../src/App.js';
import { ruleUIFixture, other } from './rule-ui-fixture.js';
import '../../src/style.css';
import '../../src/components.css';
import '../../src/summary.css';
afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, '', location.pathname); });

test('native session radios close picker and restore trigger focus', async () => {
  ruleUIFixture(); const screen = await render(createElement(App));
  await expect.element(screen.getByRole('button', { name: /Do not publish secrets/ })).toBeVisible();
  const trigger = screen.getByRole('button', { name: /^Session / });
  await trigger.click();
  await screen.getByRole('radio').nth(1).click();
  await expect.poll(() => location.search).toBe(`?session=${other}`);
  expect(document.querySelector('#rule-session-menu')?.matches(':popover-open')).toBe(false);
  expect(document.activeElement).toBe(trigger.element());
  expect(screen.container.querySelectorAll('.call-list, .workspace, .pane-resizer, select')).toHaveLength(0);
});

for (const width of [390, 320]) test(`mobile rule panel fills ${width}px and restores row focus`, async () => {
  await page.viewport(width, 844); ruleUIFixture();
  const screen = await render(createElement(App));
  const row = screen.getByRole('button', { name: /Do not publish secrets/ });
  await expect.element(row).toBeVisible(); await row.click();
  await expect.element(screen.getByRole('dialog', { name: 'Rule details' })).toBeVisible();
  expect(screen.container.querySelector('dialog')?.getBoundingClientRect().width).toBe(width);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth);
  expect(getComputedStyle(document.documentElement).overflow).toBe('hidden');
  await screen.getByRole('button', { name: 'Close', exact: true }).click();
  expect(document.activeElement).toBe(row.element());
  expect(getComputedStyle(document.documentElement).overflow).not.toBe('hidden');
});

test('partial archive exposes exact scoped reader, file and writer diagnostics on demand', async () => {
  await page.viewport(390, 844); ruleUIFixture({ warning: true });
  const screen = await render(createElement(App));
  await expect.element(screen.getByText('Partial archive · capture issues', { exact: true })).toBeVisible();
  expect(screen.container.querySelector('.recording-issues')?.hasAttribute('open')).toBe(false);
  await screen.getByText('Recording issues and archive controls', { exact: true }).click();
  await expect.element(screen.getByText(/7 failed writes or snapshots, 8 dropped stages, 9 drain timeouts/)).toBeVisible();
  const text = screen.container.querySelector('.issues-body')?.textContent;
  expect(text).toContain('Reader coverage, archive-wide: 1 unsupported schema records (1 newer), 2 corrupt records, 1 other issues');
  expect(text).toContain('unsafe-record: fictional.json');
  expect(text).toContain('Cumulative counters per writer, not per call. They may include other sessions. Zero counters do not prove complete capture.');
  expect(text).toContain('Their contents are not read.');
  expect(text).toContain('A rebuild alone does not update a running reader.');
  expect(text).toContain('1 recording file issues. 1 writers reporting recording issues.');
  await expect.element(screen.getByRole('button', { name: 'Refresh archive' })).toBeVisible();
});

test('empty, loading and transport error states retain recovery without automatic calls', async () => {
  const f = ruleUIFixture({ empty: true });
  let release!: (value: Response) => void;
  f.intercept(() => new Promise(resolve => { release = resolve; }));
  const screen = await render(createElement(App));
  await expect.element(screen.container.querySelector<HTMLElement>('.rule-empty')!).toHaveTextContent('Reading archive…');
  release(new Response('{}', { status: 503 }));
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Archive request failed: 503. Try refreshing.');
  f.intercept(() => undefined);
  await screen.getByText('Recording issues and archive controls', { exact: true }).click();
  await screen.getByRole('button', { name: 'Refresh archive' }).click();
  await expect.element(screen.getByText('Choose a recorded session to inspect its rules.', { exact: true })).toBeVisible();
  expect(screen.container.querySelector('.invocation')).toBeNull();
});
