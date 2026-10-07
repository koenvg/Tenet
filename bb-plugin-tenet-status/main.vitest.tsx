import { afterEach, expect, test, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { loadPluginApp } from '@get-bb/plugin-sdk/testing/app';
import { renderSummarySlot as renderSlot, summaryCalls } from './summary-rpc.fixture';
import { MainPage } from './main-page';
import { overviewPath } from './main-route';
import { syntheticPicker, syntheticThread, mainSyntheticRead, projectA, projectB, stopped, noHistory, nonPi, deleted } from './main.preview-fixture';
import { syntheticOverview } from './overview.preview-fixture';

afterEach(() => vi.useRealTimers());
const rpc = {
  pickerProjects: ({ cursor }: any) => syntheticPicker.projects(cursor),
  pickerThreads: ({ projectId, cursor }: any) => syntheticPicker.threads(projectId, cursor),
  pickerSelection: ({ threadId, projectId }: any) => syntheticPicker.selection(threadId, projectId),
  overview: ({ threadId, ...selection }: any) => mainSyntheticRead(threadId, selection),
};
const sdk = { threads: { get: ({ threadId }: any) => syntheticThread(threadId) as any } };

test('registered main root pages metadata only and sends project/thread choices through BB history', async () => {
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSlot(app.navPanels[0]!, { subPath: '' }, { sdk, rpc });
  try {
    fireEvent.click(await slot.findByRole('button', { name: 'Next projects' }));
    fireEvent.click(await slot.findByRole('button', { name: 'Synthetic remote project' }));
    expect(slot.inspection.navigateCalls.at(-1)).toEqual({ method: 'toPluginPanel', path: 'findings', options: { subPath: `project/${projectB}` } });
    slot.lifecycle.rerender(<MainPage subPath={`project/${projectA}`} />);
    fireEvent.click(await slot.findByRole('button', { name: /Stopped Pi/ }));
    expect(slot.inspection.navigateCalls.at(-1)).toEqual({ method: 'toPluginPanel', path: 'findings', options: { subPath: overviewPath(stopped, {}, projectA) } });
    expect(summaryCalls(slot).every(c => c.method.startsWith('picker'))).toBe(true);
    expect(slot.inspection.sdkCalls.every(call => call.method === 'plugins.callRpc')).toBe(true);
  } finally { slot.lifecycle.unmount(); }
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
    fireEvent.click(slot.getByText('synthetic-provider-error-2'));
    const selected = overviewPath(stopped, { sessionId: syntheticOverview.sessionId!, callId, category: 'unavailable' }, projectA);
    expect(slot.inspection.navigateCalls.at(-1)).toEqual({ method: 'toPluginPanel', path: 'findings', options: { subPath: selected } });
    slot.lifecycle.rerender(<MainPage subPath={selected} />);
    expect(await slot.findByText('Call synthetic-provider-error-2')).toBeTruthy();
    slot.lifecycle.rerender(<MainPage subPath={path} />); // BB Back supplies the old subPath.
    expect(await slot.findByText('Call synthetic-provider-error-1')).toBeTruthy();
    slot.lifecycle.rerender(<MainPage subPath={selected} />); // BB Forward.
    expect(await slot.findByText('Call synthetic-provider-error-2')).toBeTruthy();
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
test('main scope switch disposes mount and ignores a late summary completion', async () => {
  const app = await loadPluginApp(() => import('./app'));
  let resolve!: (value: typeof syntheticOverview) => void;
  const read = vi.fn(() => new Promise<typeof syntheticOverview>(r => { resolve = r; }));
  const slot = renderSlot(app.navPanels[0]!, { subPath: overviewPath(stopped, {}, projectA) }, { sdk, rpc: { ...rpc, overview: read } });
  try {
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    slot.lifecycle.rerender(<MainPage subPath="" />);
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
