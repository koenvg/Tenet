import { expect, test, vi } from 'vitest';
import { createElement } from 'react';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import SummaryWorkspace from '../../src/shared/SummaryWorkspace.js';
import type { SummaryWorkspaceModel } from '../../src/shared/model.js';
import { standaloneSummary } from '../../src/shared/standalone-adapter.js';
import { makeView } from './fixtures.js';

const empty: SummaryWorkspaceModel = { calls: [], selected: null, category: '', coverage: 'Assessment unknown, not pass.', loading: false, error: '' };
const actions = () => ({ selectCall: vi.fn(), filterCategory: vi.fn(), refresh: vi.fn(), loadMoreCalls: vi.fn(), loadMoreSessions: vi.fn() });

for (const [name, patch, coverage] of [
  ['empty', {}, 'Assessment unknown, not pass.'],
  ['loading', { loading: true }, 'Reading linked recordings…'],
  ['unavailable', { unavailable: true }, 'Host or archive unavailable. No current result.'],
] as const) test(`${name} has one primary status and no empty explorer or detail`, async () => {
  const handlers = actions();
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model: { ...empty, ...patch, coverage }, actions: handlers }));
  await expect.element(screen.getByRole('status')).toHaveTextContent(coverage);
  expect(screen.container.querySelectorAll('[role="status"]')).toHaveLength(1);
  expect(screen.container.querySelector('.mobile-nav, .explorer, .inspection')).toBeNull();
  const refresh = screen.getByRole('button', { name: 'Refresh archive' });
  if ('loading' in patch && patch.loading) await expect.element(refresh).toBeDisabled();
  else { await refresh.click(); expect(handlers.refresh).toHaveBeenCalledOnce(); }
});

test('active zero-match category keeps its native select and reset', async () => {
  const handlers = actions();
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model: { ...empty, category: 'violation' }, actions: handlers }));
  await expect.element(screen.getByRole('combobox', { name: 'Finding category' })).toHaveValue('violation');
  await expect.element(screen.getByText('No calls match this finding category.')).toBeVisible();
  await screen.getByRole('button', { name: 'Clear filter' }).click();
  expect(handlers.filterCategory).toHaveBeenCalledExactlyOnceWith('');
});

for (const continuation of ['moreCalls', 'moreSessions'] as const) test(`${continuation} keeps continuation reachable when the current page is empty`, async () => {
  const handlers = actions();
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model: { ...empty, [continuation]: true }, actions: handlers }));
  const button = screen.getByRole('button', { name: continuation === 'moreCalls' ? 'More invocations' : 'More sessions' });
  await button.click();
  expect(handlers[continuation === 'moreCalls' ? 'loadMoreCalls' : 'loadMoreSessions']).toHaveBeenCalledOnce();
});

for (const loading of [false, true]) test(`selected-only summary remains reachable with loading=${loading}`, async () => {
  await page.viewport(390, 900);
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model: { ...empty, loading, selected: standaloneSummary(makeView({ execution: 'executed' })) }, actions: actions() }));
  await screen.getByRole('button', { name: 'Summary', exact: true }).click();
  await expect.element(screen.getByRole('region', { name: 'Recorded call' })).toBeVisible();
  await screen.getByText('Recording details', { exact: true }).click();
  await expect.element(screen.getByRole('region', { name: 'Actual execution' }).getByText('Ran', { exact: true })).toBeVisible();
});

test('refresh with stale calls and summary retains selection and warnings outside session metadata', async () => {
  await page.viewport(1280, 900);
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model: { ...empty, loading: true, selectedId: 'opaque', selected: standaloneSummary(makeView()),
    calls: [{ id: 'opaque', callId: 'synthetic', toolName: 'bash', timestamp: 1000, mode: 'observe', decision: 'ALLOW', permission: 'released', execution: 'unknown', categories: [], missing: [], assessmentStatus: 'completed', failure: null }],
    sessionId: 'session', archiveWarnings: ['corrupt-record'] }, actions: actions() }));
  await expect.element(screen.getByRole('button', { name: /Shell command/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.element(screen.getByRole('region', { name: 'Recorded call' })).toBeVisible();
  await screen.getByText('Archive warnings', { exact: true }).click();
  await expect.element(screen.getByText('corrupt-record', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('Session recording details', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('session', { exact: true })).not.toBeVisible();
});

test('standalone private slots retain their order even without shared calls or selection', async () => {
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model: empty, actions: actions(), standalone: true,
    navigation: createElement('nav', null, 'Private navigation'), coverage: createElement('header', null, 'Private coverage'),
    explorer: createElement('aside', null, 'Private explorer'), inspection: createElement('section', null, 'Private inspection') }));
  const workspace = screen.container.querySelector('.tenet-summary-workspace')!;
  expect([...workspace.children].map(node => node.textContent)).toEqual(['Private navigation', 'Private coverage', 'Private explorer', '', 'Private inspection']);
  expect(workspace.classList.contains('embedded')).toBe(false);
});
