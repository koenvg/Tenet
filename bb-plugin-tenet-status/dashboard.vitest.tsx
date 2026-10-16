import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { DashboardPanel, type DashboardClient } from './dashboard-view';
import { syntheticDashboard, syntheticDashboardPage } from './dashboard.preview-fixture';
import { overviewPath } from './main-route';
import { MainPage } from './main-page';
import { loadPluginApp } from '@get-bb/plugin-sdk/testing/app';
import { renderSummarySlot, summaryCalls } from './summary-rpc.fixture';
import { projectA, syntheticPicker } from './main.preview-fixture';
import { readFileSync } from 'node:fs';
afterEach(() => { cleanup(); vi.useRealTimers(); });

test('registered root is a metadata-only project picker, not a global dashboard', async () => {
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSummarySlot(app.navPanels[0]!, { subPath: '' }, { rpc: { pickerProjects: () => syntheticPicker.projects() } });
  try {
    fireEvent.click(await slot.findByRole('button', { name: 'Synthetic local project' }));
    expect(slot.inspection.navigateCalls.at(-1)).toEqual({ method: 'toPluginPanel', path: 'findings', options: { subPath: `project/${projectA}` } });
    expect(summaryCalls(slot).map(c => c.method)).toEqual(['pickerProjects']);
    expect(slot.queryByText(/Start.*scan/)).toBeNull();
  } finally { slot.lifecycle.unmount(); }
});
test('project automatically loads Rule/Passing/Failing then one flat failure table and an exact call link', async () => {
  const source = syntheticDashboard(); const read = vi.fn(source.read); const contributors = vi.fn(source.contributors); const navigate = vi.fn();
  const slot = render(<DashboardPanel projectId={projectA} client={{ read, contributors }} navigate={navigate} />);
  const table = await slot.findByRole('table', { name: 'Project rules' });
  expect(within(table).getAllByRole('columnheader').map(el => el.textContent)).toEqual(['Rule', 'Passing', 'Failing']);
  const mixed = within(table).getByRole('button', { name: 'Ask before publishing.' }).closest('tr')!;
  expect(within(mixed).getAllByRole('cell').map(el => el.textContent)).toEqual(['90%', '10%']);
  expect(within(table).getByRole('button', { name: 'Keep credentials private.' }).closest('tr')?.textContent).toContain('100%0%');
  expect(within(table).getByRole('button', { name: 'Run offline tests.' }).closest('tr')?.textContent).toContain('Not checked');
  expect(read.mock.calls.map(c => c[0])).toEqual([{ kind: 'start', scope: { kind: 'project', projectId: projectA } }, { kind: 'advance', token: 'synthetic-step' }]);
  expect(contributors).not.toHaveBeenCalled();
  fireEvent.click(within(mixed).getByRole('button'));
  const failures = await slot.findByRole('table', { name: 'Failures' });
  expect(within(failures).getAllByRole('columnheader').map(el => el.textContent)).toEqual(['Thread', 'Tool', 'When', 'Open']);
  expect(within(failures).getAllByRole('row')).toHaveLength(2);
  expect(slot.queryByRole('table', { name: 'Project rules' })).toBeNull();
  const item = (await source.contributors({ token: 'synthetic-run', expectedRevision: syntheticDashboardPage.revision, rule: '1'.repeat(64) })).items[0]!;
  expect(failures.querySelector('time')?.dateTime).toBe(new Date(item.timestamp).toISOString());
  fireEvent.click(within(failures).getByRole('link', { name: 'Open call' }));
  expect(navigate).toHaveBeenLastCalledWith(overviewPath(item.threadId, { sessionId: item.sessionId, callId: item.callId }, item.projectId));
  fireEvent.click(slot.getByRole('button', { name: 'Back to rules' }));
  expect(slot.getByRole('table', { name: 'Project rules' })).toBeTruthy();
  expect(slot.queryByText('History details')).toBeNull();
  expect(slot.queryByText(/Recorded rules, not a live inventory|Unknown, not applicable|Capture is best-effort|Observed .* to/)).toBeNull();
  expect(slot.container.querySelectorAll('details')).toHaveLength(0);
  vi.useFakeTimers(); await act(() => vi.advanceTimersByTimeAsync(60000)); expect(read).toHaveBeenCalledTimes(2);
});
for (const timestamp of [1e100, -1e100]) test(`unrepresentable recorded time ${timestamp} keeps failures and recovery controls usable`, async () => {
  const source = syntheticDashboard(); const read = vi.fn(source.read); const navigate = vi.fn();
  const client: DashboardClient = { read, contributors: async (input, signal) => {
    const page = await source.contributors(input, signal);
    return { ...page, items: page.items.map(item => ({ ...item, timestamp })) };
  } };
  const slot = render(<DashboardPanel projectId={projectA} client={client} navigate={navigate} />);
  fireEvent.click(await slot.findByRole('button', { name: 'Ask before publishing.' }));
  const failures = await slot.findByRole('table', { name: 'Failures' });
  expect(within(failures).getAllByRole('row')).toHaveLength(2);
  expect(within(failures).getByText('Time unavailable')).toBeTruthy();
  expect(failures.querySelector('time')).toBeNull();
  fireEvent.click(within(failures).getByRole('link', { name: 'Open call' }));
  expect(navigate).toHaveBeenCalledTimes(1);
  fireEvent.click(slot.getByRole('button', { name: 'Back to rules' }));
  expect(slot.getByRole('table', { name: 'Project rules' })).toBeTruthy();
  fireEvent.click(slot.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(read.mock.calls.filter(([input]) => input.kind === 'start')).toHaveLength(2));
  expect(await slot.findByRole('table', { name: 'Project rules' })).toBeTruthy();
});
for (const [scenario, expected] of [['limited', 'Some history is missing'], ['empty', 'No recorded rules'], ['unprocessed', 'Rule history is incomplete'],
  ['unavailable', 'Some history is missing'], ['restart-required', 'Results cleared'], ['error', 'History unavailable']] as const)
  test(`project ${scenario} preserves explicit history states`, async () => {
    const slot = render(<DashboardPanel projectId={projectA} client={syntheticDashboard(scenario)} navigate={() => {}} />);
    expect(await slot.findByText(new RegExp(expected))).toBeTruthy();
    expect(slot.queryByText(/^Compliant$/)).toBeNull();
    if (scenario === 'unprocessed') {
      expect(slot.queryByText('No recorded rules in this history.')).toBeNull();
      expect(slot.getByLabelText('Partial history').textContent).toBe('Some history is missing. Rates cover recorded checks only.');
    }
  });
test('cancel, scope changes and unmount abort and refuse late results', async () => {
  const pending: { resolve: (page: typeof syntheticDashboardPage) => void; signal?: AbortSignal }[] = [];
  const client: DashboardClient = { read: vi.fn((_, signal) => new Promise<typeof syntheticDashboardPage>(resolve => pending.push({ resolve, signal }))), contributors: vi.fn() };
  const slot = render(<DashboardPanel client={client} projectId={projectA} navigate={() => {}} />);
  fireEvent.click(slot.getByRole('button', { name: 'Cancel' })); expect(pending[0]!.signal?.aborted).toBe(true);
  await act(async () => pending[0]!.resolve(syntheticDashboardPage));
  expect(slot.queryByRole('table')).toBeNull();
  fireEvent.click(slot.getByRole('button', { name: 'Refresh' }));
  slot.rerender(<DashboardPanel client={client} projectId="proj_fixture0002" navigate={() => {}} />);
  expect(pending[1]!.signal?.aborted).toBe(true);
  await act(async () => pending[1]!.resolve(syntheticDashboardPage));
  expect(slot.queryByRole('table')).toBeNull();
  slot.unmount(); expect(pending[2]!.signal?.aborted).toBe(true);
});
for (const outcome of ['restart-required', 'failure'] as const) test(`failure detail ${outcome} clears aggregates and ignores late responses after refresh`, async () => {
  let finish!: () => void;
  const source = syntheticDashboard();
  const slot = render(<DashboardPanel projectId={projectA} client={{ ...source, contributors: () => new Promise((resolve, reject) => {
    finish = () => outcome === 'failure' ? reject(Error('revoked')) : resolve({ state: 'restart-required', items: [], next: null });
  }) }} navigate={() => {}} />);
  fireEvent.click(await slot.findByRole('button', { name: 'Ask before publishing.' }));
  await act(async () => finish());
  expect(slot.getByRole('alert').textContent).toContain('Results cleared');
  expect(slot.queryByRole('table')).toBeNull();
  expect(slot.queryByRole('button', { name: 'Back to rules' })).toBeNull();
});
test('a late failure response cannot restore the previous project or rule', async () => {
  let finish!: (value: Awaited<ReturnType<DashboardClient['contributors']>>) => void;
  let signal: AbortSignal | undefined;
  const source = syntheticDashboard();
  const client: DashboardClient = { ...source, contributors: (_, next) => { signal = next; return new Promise(resolve => { finish = resolve; }); } };
  const slot = render(<DashboardPanel projectId={projectA} client={client} navigate={() => {}} />);
  fireEvent.click(await slot.findByRole('button', { name: 'Ask before publishing.' }));
  fireEvent.click(slot.getByRole('button', { name: 'Back to rules' }));
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(await source.contributors({ token: 'synthetic-run', expectedRevision: syntheticDashboardPage.revision, rule: '1'.repeat(64) })));
  expect(slot.queryByRole('table', { name: 'Failures' })).toBeNull();
  expect(slot.getByRole('table', { name: 'Project rules' })).toBeTruthy();
});
test('PASS-only rule opens an automatic plain empty failures state', async () => {
  const slot = render(<DashboardPanel projectId={projectA} client={syntheticDashboard()} navigate={() => {}} />);
  fireEvent.click(await slot.findByRole('button', { name: 'Keep credentials private.' }));
  expect(await slot.findByText('No recorded failures for this rule.')).toBeTruthy();
  await waitFor(() => expect(slot.queryByRole('status')).toBeNull());
});

test('Cancel retains a one-FAIL summary revision and invalidates detail after the owner continuation adds a FAIL', async () => {
  const partial = { ...structuredClone(syntheticDashboardPage), state: 'reading' as const, revision: 7, next: 'deferred-owner-step' };
  partial.rows = [partial.rows[0]!];
  let ownerRevision = partial.revision;
  let settle!: () => void;
  let continuationSignal: AbortSignal | undefined;
  const source = syntheticDashboard();
  const contributors = vi.fn(async (input: Parameters<DashboardClient['contributors']>[0]) => {
    if (input.expectedRevision !== ownerRevision) return { state: 'restart-required' as const, items: [], next: null };
    const result = await source.contributors(input);
    return { ...result, items: [...result.items, { ...result.items[0]!, callId: 'f'.repeat(64), label: 'Late owner failure' }] };
  });
  const read: DashboardClient['read'] = async (input, signal) => {
    if (input.kind === 'start') return partial;
    continuationSignal = signal;
    return new Promise(resolve => { settle = () => {
      ownerRevision++;
      resolve({ ...partial, revision: ownerRevision, state: 'finished', next: null,
        rows: [{ ...partial.rows[0]!, failed: 2, passing: 900 / 11, failing: 200 / 11 }] });
    }; });
  };
  const slot = render(<DashboardPanel projectId={projectA} client={{ read, contributors }} navigate={() => {}} />);
  await waitFor(() => expect(continuationSignal?.aborted).toBe(false));
  expect(slot.getByRole('cell', { name: '10% recorded failing; 1 FAIL of 10 scored checks' }).textContent).toBe('10%');
  fireEvent.click(slot.getByRole('button', { name: 'Cancel' }));
  expect(continuationSignal?.aborted).toBe(true);
  await act(async () => settle());
  expect(slot.getByRole('cell', { name: '10% recorded failing; 1 FAIL of 10 scored checks' }).textContent).toBe('10%');
  fireEvent.click(slot.getByRole('button', { name: 'Ask before publishing.' }));
  expect((await slot.findByRole('alert')).textContent).toBe('History access or snapshot changed. Results cleared. Refresh to try again.');
  expect(contributors.mock.calls.map(([input]) => input)).toEqual([{ token: partial.run, rule: partial.rows[0]!.key, expectedRevision: 7 }]);
  expect(slot.queryByRole('table')).toBeNull();
  expect(slot.queryByText('Late owner failure')).toBeNull();
  expect(slot.queryByRole('button', { name: 'Back to rules' })).toBeNull();
  expect(slot.getByRole('button', { name: 'Refresh' }).hasAttribute('disabled')).toBe(false);
});

test('every failure page sends the displayed revision and a stale next page clears previously displayed failures', async () => {
  const source = syntheticDashboard();
  const contributors = vi.fn(async (input: Parameters<DashboardClient['contributors']>[0]) => {
    if (input.cursor) return { state: 'restart-required' as const, items: [], next: null };
    return { ...await source.contributors(input), next: 'old-failure-cursor' };
  });
  const slot = render(<DashboardPanel projectId={projectA} client={{ ...source, contributors }} navigate={() => {}} />);
  fireEvent.click(await slot.findByRole('button', { name: 'Ask before publishing.' }));
  const failures = await slot.findByRole('table', { name: 'Failures' });
  expect(within(failures).getAllByRole('row')).toHaveLength(2);
  expect(slot.getByText(/10% failing · 1 failure/).textContent).toBe(' · 10% failing · 1 failure');
  fireEvent.click(slot.getByRole('button', { name: 'Next failures' }));
  expect((await slot.findByRole('alert')).textContent).toBe('History access or snapshot changed. Results cleared. Refresh to try again.');
  expect(contributors.mock.calls.map(([input]) => input)).toEqual([
    { token: 'synthetic-run', rule: '1'.repeat(64), expectedRevision: 2 },
    { token: 'synthetic-run', rule: '1'.repeat(64), expectedRevision: 2, cursor: 'old-failure-cursor' },
  ]);
  expect(slot.queryByRole('table')).toBeNull();
  expect(slot.queryByRole('link', { name: 'Open call' })).toBeNull();
});


test('51 failures support next, previous and first with range and final-page focus', async () => {
  const slot = render(<DashboardPanel projectId={projectA} client={syntheticDashboard('paging')} navigate={() => {}} />);
  fireEvent.click(await slot.findByRole('button', { name: 'Ask before publishing.' }));
  await slot.findByText('Showing 1–50 of 51 failures');
  const next = slot.getByRole('button', { name: 'Next failures' }); next.focus(); fireEvent.click(next);
  await slot.findByText('Showing 51–51 of 51 failures');
  expect(document.activeElement).toBe(slot.getByRole('heading', { name: 'Failures' }));
  expect(slot.getAllByRole('link', { name: 'Open call' })).toHaveLength(1);
  fireEvent.click(slot.getByRole('button', { name: 'Previous failures' }));
  await slot.findByText('Showing 1–50 of 51 failures');
  fireEvent.click(slot.getByRole('button', { name: 'Next failures' }));
  await slot.findByText('Showing 51–51 of 51 failures');
  fireEvent.click(slot.getByRole('button', { name: 'First failures' }));
  await slot.findByText('Showing 1–50 of 51 failures');
});


test('manifest and both registered panels resolve one transparent monochrome T asset', async () => {
  const manifest = JSON.parse(readFileSync('./package.json', 'utf8'));
  expect(manifest.bb.branding).toEqual({ icon: './icons/tenet.svg', experimental_icons: { tenet: './icons/tenet.svg' } });
  const xml = new DOMParser().parseFromString(readFileSync(manifest.bb.branding.icon, 'utf8'), 'image/svg+xml');
  expect(xml.querySelector('parsererror')).toBeNull();
  expect(xml.documentElement.getAttribute('viewBox')).toBe('0 0 24 24');
  expect(Array.from(xml.documentElement.children).map(el => el.tagName)).toEqual(['path']);
  expect(xml.querySelector('path')?.getAttribute('fill')).toBe('currentColor');
  const app = await loadPluginApp(() => import('./app'));
  expect(app.navPanels[0]?.icon).toBe('tenet-status/tenet');
  expect(app.threadPanelActions[0]?.icon).toBe('tenet-status/tenet');
});
