import { afterEach, expect, test, vi } from 'vitest';
import { act, fireEvent, waitFor, render } from '@testing-library/react';
import { loadPluginApp } from '@get-bb/plugin-sdk/testing/app';
import { renderSummarySlot as renderSlot, summaryCalls } from './summary-rpc.fixture';
import { MainPage, MainPageView, type PickerClient } from './main-page';
import { overviewPath } from './main-route';
import { syntheticPicker, syntheticThread, mainSyntheticRead, projectA, projectB, stopped, noHistory, nonPi, deleted } from './main.preview-fixture';
import { syntheticOverview } from './overview.preview-fixture';
import { syntheticDashboard } from './dashboard.preview-fixture';
import { dashboardMethods } from './dashboard-contract';

afterEach(() => vi.useRealTimers());
const rpc = {
  pickerProjects: ({ cursor }: any) => syntheticPicker.projects(cursor),
  pickerThreads: ({ projectId, cursor }: any) => syntheticPicker.threads(projectId, cursor),
  pickerSelection: ({ threadId, projectId }: any) => syntheticPicker.selection(threadId, projectId),
  overview: ({ threadId, ...selection }: any) => mainSyntheticRead(threadId, selection),
};
const sdk = { threads: { get: ({ threadId }: any) => syntheticThread(threadId) as any } };

test('registered main root selects a project then automatically shows recorded rule percentages', async () => {
  const source = syntheticDashboard();
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSlot(app.navPanels[0]!, { subPath: '' }, { sdk, rpc: { ...rpc,
    dashboard: input => source.read(dashboardMethods.dashboard.input.parse(input)),
    dashboardContributors: input => source.contributors(dashboardMethods.dashboardContributors.input.parse(input)),
  } });
  try {
    const card = await slot.findByRole('button', { name: 'Synthetic local project' });
    expect(card.tagName).toBe('BUTTON');
    expect(card.textContent).toContain('BB project updated');
    expect(card.querySelector('time')?.getAttribute('datetime')).toBe('2025-01-02T00:00:00.000Z');
    expect(card.textContent).toContain('View rule history');
    expect(card.textContent).toContain('Recorded rule checks and their results.');
    expect(slot.getByText('Recorded history loads when you open a project. This picker does not scan histories.')).toBeTruthy();
    expect(summaryCalls(slot)).toEqual([{ method: 'pickerProjects', input: {} }]);
    fireEvent.click(await slot.findByRole('button', { name: 'Next projects' }));
    fireEvent.click(await slot.findByRole('button', { name: 'Synthetic remote project' }));
    expect(slot.getByRole('button', { name: 'Synthetic remote project' }).textContent).toContain('BB project update unavailable');
    expect(slot.inspection.navigateCalls.at(-1)).toEqual({ method: 'toPluginPanel', path: 'findings', options: { subPath: `project/${projectB}` } });
    expect(summaryCalls(slot).map(c => c.method)).toEqual(['pickerProjects', 'pickerProjects']);
    slot.lifecycle.rerender(<MainPage subPath={`project/${projectB}`} />);
    const rule = await slot.findByRole('button', { name: 'Ask before publishing.' });
    expect(rule.closest('tr')?.textContent).toBe('Ask before publishing.90%10%');
    fireEvent.click(rule);
    expect(await slot.findByRole('table', { name: 'Failures' })).toBeTruthy();
    expect(summaryCalls(slot).filter(call => call.method === 'dashboardContributors')).toEqual([
      { method: 'dashboardContributors', input: { token: 'synthetic-run', rule: '1'.repeat(64), expectedRevision: 2 } },
    ]);
    expect(slot.inspection.sdkCalls.every(call => call.method === 'plugins.callRpc')).toBe(true);
  } finally { slot.lifecycle.unmount(); }
});
test('project picker retries unavailable metadata and keeps an empty page explicit', async () => {
  const projects = vi.fn<PickerClient['projects']>().mockRejectedValueOnce(Error('offline')).mockResolvedValue({ items: [], next: null });
  const client = { ...syntheticPicker, projects };
  const slot = render(<MainPageView subPath="" client={client} navigate={vi.fn()} overview={() => null} findings={() => null} />);
  try {
    expect((await slot.findByRole('alert')).textContent).toBe('Selection list unavailable. Retry from the first page.');
    fireEvent.click(slot.getByRole('button', { name: 'First page / Retry' }));
    await waitFor(() => expect(slot.getByRole('status').textContent).toBe('No projects on this page.'));
    expect(slot.queryAllByRole('button')).toHaveLength(0);
    expect(projects.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, undefined]);
  } finally { slot.unmount(); }
});
test('leaving the project picker cancels metadata and ignores a late card page', async () => {
  let finish!: (page: Awaited<ReturnType<PickerClient['projects']>>) => void;
  let signal: AbortSignal | undefined;
  const client: PickerClient = { ...syntheticPicker, projects: (_cursor, pending) => {
    signal = pending; return new Promise(resolve => { finish = resolve; });
  } };
  const view = (subPath: string) => <MainPageView subPath={subPath} client={client} navigate={vi.fn()} overview={() => null} findings={() => null} />;
  const slot = render(view(''));
  try {
    expect(slot.getByRole('status').textContent).toBe('Reading BB metadata…');
    slot.rerender(view('invalid'));
    await act(async () => { finish(await syntheticPicker.projects()); });
    expect(signal?.aborted).toBe(true);
    expect(slot.getByRole('alert').textContent).toBe('Invalid Tenet selection. Choose a project to start again. No archive requested.');
    expect(slot.queryByRole('button', { name: 'Synthetic local project' })).toBeNull();
  } finally { slot.unmount(); }
});
test('stopped-thread main view reuses safe summaries; BB route restoration restores call/session/category and old findings', async () => {
  const app = await loadPluginApp(() => import('./app'));
  const path = overviewPath(stopped, {}, projectA);
  const slot = renderSlot(app.navPanels[0]!, { subPath: path }, { sdk, rpc: { ...rpc, findings: () => ({ coverage: 'unknown', linkedCalls: 0, issues: [], items: [], next: null }) } });
  try {
    expect(await slot.findByText(/2 evaluator failures/)).toBeTruthy();
    fireEvent.change(slot.getByLabelText('Finding category'), { target: { value: 'unavailable' } });
    const filtered = overviewPath(stopped, { sessionId: syntheticOverview.sessionId!, category: 'unavailable' }, projectA);
    expect(slot.inspection.navigateCalls.at(-1)).toEqual({ method: 'toPluginPanel', path: 'findings', options: { subPath: filtered } });
    slot.lifecycle.rerender(<MainPage subPath={filtered} />);
    await waitFor(() => expect(slot.container.querySelectorAll('.call-row')).toHaveLength(2));
    const callId = syntheticOverview.calls[2]!.id;
    fireEvent.click(slot.container.querySelector<HTMLButtonElement>(`[data-call-id="${callId}"]`)!);
    const selected = overviewPath(stopped, { sessionId: syntheticOverview.sessionId!, callId, category: 'unavailable' }, projectA);
    expect(slot.inspection.navigateCalls.at(-1)).toEqual({ method: 'toPluginPanel', path: 'findings', options: { subPath: selected } });
    slot.lifecycle.rerender(<MainPage subPath={selected} />);
    expect(await slot.findByText('synthetic-provider-error-2')).toBeTruthy();
    slot.lifecycle.rerender(<MainPage subPath={path} />); // BB Back supplies the old subPath.
    expect(await slot.findByText('synthetic-provider-error-1')).toBeTruthy();
    slot.lifecycle.rerender(<MainPage subPath={selected} />); // BB Forward.
    expect(await slot.findByText('synthetic-provider-error-2')).toBeTruthy();
    fireEvent.change(slot.getByLabelText('Linked session'), { target: { value: 'a'.repeat(64) } });
    expect(slot.inspection.navigateCalls.at(-1)).toEqual({ method: 'toPluginPanel', path: 'findings', options: {
      subPath: overviewPath(stopped, { sessionId: 'a'.repeat(64), category: 'unavailable' }, projectA) } });
    expect(slot.container.querySelector('.action-preview, .evidence-dock, .question-json')).toBeNull();
    expect(summaryCalls(slot).every(c => ['pickerSelection', 'overview'].includes(c.method))).toBe(true);
    slot.lifecycle.rerender(<MainPage subPath={stopped} />);
    expect(await slot.findByRole('heading', { name: 'Flagged rules' })).toBeTruthy();
    await waitFor(() => expect(slot.inspection.rpcCalls.at(-1)?.method).toBe('findings'));
    expect(slot.container.querySelector('.tenet-summary-workspace')).toBeNull();
  } finally { slot.lifecycle.unmount(); }
});
test('non-Pi, deleted, changed-scope and invalid selections clear old summary without archive reads', async () => {
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSlot(app.navPanels[0]!, { subPath: overviewPath(stopped, {}, projectA) }, { sdk, rpc });
  try {
    await slot.findByText(/2 evaluator failures/);
    const initialReads = summaryCalls(slot).filter(c => c.method === 'overview').length;
    for (const [path, message] of [[overviewPath(nonPi, {}, projectA), /supports Pi threads only/],
      [overviewPath(deleted, {}, projectA), /unavailable or deleted/], [overviewPath(stopped, {}, projectB), /project changed/],
      ['overview/not-a-thread', /Invalid Tenet selection/]] as const) {
      slot.lifecycle.rerender(<MainPage subPath={path} />);
      expect(await slot.findByText(message)).toBeTruthy();
      expect(slot.container.querySelector('.call-row, .common-summary')).toBeNull();
      expect(summaryCalls(slot).filter(c => c.method === 'overview')).toHaveLength(initialReads);
    }
    slot.lifecycle.rerender(<MainPage subPath={overviewPath(noHistory, {}, projectA)} />);
    expect(await slot.findByText('No recordings linked to this thread. Assessment unknown, not pass.')).toBeTruthy();
  } finally { slot.lifecycle.unmount(); }
});
for (const cause of ['moved', 'deleted', 'non-Pi', 'unreadable'] as const) test(`main refresh clears ${cause} scope without another archive read and unmount stops one polling owner`, async () => {
  vi.useFakeTimers();
  const app = await loadPluginApp(() => import('./app'));
  let moved = false;
  const read = vi.fn(rpc.overview);
  const slot = renderSlot(app.navPanels[0]!, { subPath: overviewPath(stopped, {}, projectA) }, {
    rpc: { ...rpc, overview: read }, sdk: { threads: { get: async ({ threadId }: any) => {
      if (moved && cause === 'unreadable') throw new Error('Metadata unavailable');
      return { ...(await syntheticThread(threadId)), projectId: moved && cause === 'moved' ? projectB : projectA,
        providerId: moved && cause === 'non-Pi' ? 'codex' : 'pi', deletedAt: moved && cause === 'deleted' ? 1 : null } as any;
    } } },
  });
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(1); }); await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(read).toHaveBeenCalledOnce();
    moved = true; await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(read).toHaveBeenCalledOnce(); expect(slot.container.textContent).toContain(cause === 'non-Pi' ? 'This overview supports Pi threads only.' : 'Host or archive unavailable. No current result.');
    expect(slot.container.querySelector('.call-row')).toBeNull();
  } finally { slot.lifecycle.unmount(); }
  await vi.advanceTimersByTimeAsync(30_000); expect(read).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
test.each([['pi', true], ['pi-subagents', true], ['codex', false], ['pi-prefix', false], ['pi-subagents-extra', false],
  ['Pi', false], ['PI-SUBAGENTS', false], [' pi', false], ['pi ', false], ['pi-subagents ', false]] as const)(
  'registered main overview rechecks exact provider %j before refreshing archives', async (nextProvider, accepted) => {
    vi.useFakeTimers();
    const app = await loadPluginApp(() => import('./app'));
    let providerId = 'pi';
    const read = vi.fn(rpc.overview);
    const slot = renderSlot(app.navPanels[0]!, { subPath: overviewPath(stopped, {}, projectA) }, {
      rpc: { ...rpc, overview: read }, sdk: { threads: { get: async ({ threadId }: any) => ({
        ...(await syntheticThread(threadId)), providerId,
      }) as any } },
    });
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(read).toHaveBeenCalledOnce();
      expect(slot.container.textContent).toContain('synthetic-provider-error-1');
      providerId = nextProvider;
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(read).toHaveBeenCalledTimes(accepted ? 2 : 1);
      if (accepted) {
        expect(slot.container.textContent).toContain('synthetic-provider-error-1');
        expect(read.mock.calls.at(-1)![0]).toMatchObject({ threadId: stopped });
      } else {
        expect(slot.container.textContent).toContain('This overview supports Pi threads only.');
        expect(slot.container.querySelector('.call-row')).toBeNull();
      }
    } finally { slot.lifecycle.unmount(); }
  });
test('main scope switch disposes mount and ignores a late summary completion', async () => {
  const app = await loadPluginApp(() => import('./app'));
  let resolve!: (value: typeof syntheticOverview) => void;
  const read = vi.fn(() => new Promise<typeof syntheticOverview>(r => { resolve = r; }));
  const slot = renderSlot(app.navPanels[0]!, { subPath: overviewPath(stopped, {}, projectA) }, { sdk, rpc: { ...rpc, overview: read } });
  try {
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    slot.lifecycle.rerender(<MainPage subPath="projects" />);
    await slot.findByRole('button', { name: 'Synthetic local project' });
    resolve(structuredClone(syntheticOverview));
    await Promise.resolve();
    expect(slot.container.querySelector('.tenet-summary-workspace')).toBeNull();
    expect(slot.queryByText(/2 evaluator failures/)).toBeNull();
  } finally { slot.lifecycle.unmount(); }
});

for (const end of ['close', 'timeout'] as const) test(`late selected-thread metadata after ${end} starts no archive read`, async () => {
  vi.useFakeTimers();
  const app = await loadPluginApp(() => import('./app'));
  let finish!: (value: Awaited<ReturnType<typeof syntheticThread>>) => void;
  let checks = 0;
  const read = vi.fn(rpc.overview);
  const slot = renderSlot(app.navPanels[0]!, { subPath: overviewPath(stopped, {}, projectA) }, { rpc: { ...rpc, overview: read },
    sdk: { threads: { get: ({ threadId }: any) => ++checks === 1 ? syntheticThread(threadId) as any
      : new Promise(resolve => { finish = value => resolve({ ...value } as any); }) } } });
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(checks).toBe(2); expect(read).not.toHaveBeenCalled();
    if (end === 'close') slot.lifecycle.rerender(<MainPage subPath="" />);
    else await act(async () => { await vi.advanceTimersByTimeAsync(8_001); });
    await act(async () => { finish(await syntheticThread(stopped)); await vi.advanceTimersByTimeAsync(1); });
    expect(read).not.toHaveBeenCalled();
  } finally { slot.lifecycle.unmount(); }
  expect(vi.getTimerCount()).toBe(0);
});


for (const stale of ['unchanged', 'revision', 'expired', 'access', 'detail-revision'] as const) test(`dashboard return revalidates retained failure position, stale=${stale}`, async () => {
  const source = syntheticDashboard('paging'); let returning = false;
  const read = vi.fn(async (input: Parameters<typeof source.read>[0]) => {
    const page = await source.read(input);
    if (returning && stale === 'access') throw Error('access revoked');
    if (returning && stale === 'expired') return { ...page, state: 'restart-required' as const, rows: [] };
    return returning && stale === 'revision' ? { ...page, revision: page.revision + 1 } : page;
  });
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSlot(app.navPanels[0]!, { subPath: `project/${projectA}` }, { sdk, rpc: { ...rpc,
    dashboard: input => read(dashboardMethods.dashboard.input.parse(input)),
    dashboardContributors: input => returning && stale === 'detail-revision' ? Promise.resolve({ state: 'restart-required', items: [], next: null }) : source.contributors(dashboardMethods.dashboardContributors.input.parse(input)),
  } });
  try {
    fireEvent.click(await slot.findByRole('button', { name: 'Ask before publishing.' }));
    fireEvent.click(await slot.findByRole('button', { name: 'Next failures' }));
    await slot.findByText('Showing 51–51 of 51 failures');
    fireEvent.click(slot.getByRole('link', { name: 'Open call' }));
    const path = (slot.inspection.navigateCalls.at(-1) as any).options.subPath;
    slot.lifecycle.rerender(<MainPage subPath={path} />);
    await slot.findByRole('button', { name: 'Back to project rules' });
    returning = true;
    slot.lifecycle.rerender(<MainPage subPath={`project/${projectA}`} />);
    if (stale !== 'unchanged') {
      expect((await slot.findByRole('alert')).textContent).toContain('Results cleared');
      expect(slot.queryByRole('table')).toBeNull();
    } else {
      await slot.findByText('Showing 51–51 of 51 failures');
      await waitFor(() => expect(document.activeElement).toBe(slot.getByRole('link', { name: 'Open call' })));
    }
    expect(read.mock.calls.filter(([input]) => input.kind === 'start')).toHaveLength(1);
    expect(read.mock.calls.at(-1)?.[0].kind).toBe('results');
  } finally { slot.lifecycle.unmount(); }
});


test('late restoration cannot reveal old rows after leaving project scope', async () => {
  const source = syntheticDashboard(); let settle!: (page: Awaited<ReturnType<typeof source.read>>) => void;
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSlot(app.navPanels[0]!, { subPath: `project/${projectA}` }, { sdk, rpc: { ...rpc,
    dashboard: input => { const parsed = dashboardMethods.dashboard.input.parse(input); return parsed.kind === 'results' ? new Promise(resolve => { settle = resolve; }) : source.read(parsed); },
    dashboardContributors: input => source.contributors(dashboardMethods.dashboardContributors.input.parse(input)),
  } });
  try {
    fireEvent.click(await slot.findByRole('button', { name: 'Ask before publishing.' }));
    fireEvent.click(await slot.findByRole('link', { name: 'Open call' }));
    const path = (slot.inspection.navigateCalls.at(-1) as any).options.subPath;
    slot.lifecycle.rerender(<MainPage subPath={path} />);
    await slot.findByRole('button', { name: 'Back to project rules' });
    slot.lifecycle.rerender(<MainPage subPath={`project/${projectA}`} />);
    await waitFor(() => expect(settle).toBeTypeOf('function'));
    expect(slot.queryByRole('table')).toBeNull();
    slot.lifecycle.rerender(<MainPage subPath="" />);
    await slot.findByRole('button', { name: 'Synthetic local project' });
    await act(async () => settle(await source.read({ kind: 'results', token: 'synthetic-run' })));
    expect(slot.queryByRole('table')).toBeNull();
    expect(slot.queryByRole('link', { name: 'Open call' })).toBeNull();
  } finally { slot.lifecycle.unmount(); }
});
