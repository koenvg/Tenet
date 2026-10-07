import { afterEach, expect, test, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import { loadPluginApp, renderSlot } from '@get-bb/plugin-sdk/testing/app';
import { OverviewAdapter } from './overview-adapter';
import { syntheticOverview, syntheticRead } from './overview.preview-fixture';
import { emptyOverview } from '../src/inspector/bb-summary';
import { projectSummaryDecision } from '../src/inspector/bb-summary';
afterEach(() => { vi.useRealTimers(); });
const threadId = 'thr_abcdefgh1234';
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test('Pi header sends identical focus requests, preserves finding count and focused findings route', async () => {
  const app = await loadPluginApp(() => import('./app'));
  expect(app.threadPanelActions[0]?.layout).toBe('flush');
  const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: false }, {
    sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } },
    openThreadPanel: () => true,
    rpc: { status: () => ({ coverage: 'partial', linkedCalls: 3, failures: 0, issues: [], assessments: { completed: 1, unavailable: 2, pending: 0, dropped: 0, cancelled: 0, incomplete: 0, reasons: [{ code: 'provider-error', count: 2 }] } }) },
  });
  try {
    for (let n = 0; n < 2; n++) { fireEvent.click(await slot.findByRole('button', { name: 'TENET rule status' })); fireEvent.click(await slot.findByRole('button', { name: 'Open thread overview' })); }
    expect(slot.inspection.navigateCalls.filter(c => c.method === 'openThreadPanel')).toEqual([
      { method: 'openThreadPanel', options: { actionId: 'tenet-overview', title: 'TENET overview', params: null } },
      { method: 'openThreadPanel', options: { actionId: 'tenet-overview', title: 'TENET overview', params: null } },
    ]);
    expect(slot.queryByLabelText(/recorded FAIL/)).toBeNull();
    fireEvent.click(slot.getByRole('button', { name: 'TENET rule status' }));
    fireEvent.click(slot.getByRole('button', { name: 'View flagged rules' }));
    expect(slot.inspection.navigateCalls.at(-1)).toEqual({ method: 'toPluginPanel', path: 'findings', options: { subPath: threadId } });
  } finally { slot.lifecycle.unmount(); }
});

test('restored non-Pi panel reads no archive; forged params read no summaries', async () => {
  const app = await loadPluginApp(() => import('./app'));
  for (const [providerId, params, message] of [['codex', null, 'This overview supports Pi threads only. No archive requested.'],
    ['pi', { recordingDirectory: '/escape' }, 'Panel selection rejected. Close this tab and open the overview again.']] as const) {
    const slot = renderSlot(app.threadPanelActions[0]!, { threadId, params }, {
      sdk: { threads: { get: async () => ({ providerId }) as any } }, rpc: { overview: () => { throw new Error('must not read'); } },
    });
    try { expect(await slot.findByText(message)).toBeTruthy(); expect(slot.inspection.rpcCalls).toHaveLength(0); }
    finally { slot.lifecycle.unmount(); }
  }
});

test('real panel mounts shared safe summary, displays inert text, and clears stale data on disconnect', async () => {
  const app = await loadPluginApp(() => import('./app'));
  let disconnected = false;
  const slot = renderSlot(app.threadPanelActions[0]!, { threadId, params: null }, {
    sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } },
    rpc: { overview: (selection: any) => {
      if (disconnected) return emptyOverview();
      const data = syntheticRead(selection);
      const source = { schemaVersion: 3, host: 'pi', contextId: 'main', bbThreadId: threadId, callId: 'synthetic-provider-error-1', toolName: 'bash', mode: 'observe' };
      data.selected = projectSummaryDecision([
        { ...source, stage: 'begin', data: { policy: { rules: [{ id: 'r1', text: '<script>window.archiveExecuted=true</script>', enforcement: 'BLOCK' }] }, action: { arguments: 'RAW-SENTINEL' } } },
        { ...source, stage: 'request', data: { payload: { state: { evidence: 'RAW-SENTINEL' }, questions: { q: 'RAW-SENTINEL' } } } },
        { ...source, stage: 'response', data: { value: 'RAW-SENTINEL', error: 'RAW-SENTINEL' } },
        { ...source, stage: 'assessment-status', data: { status: 'unavailable', reason: 'provider-error' } },
      ] as any);
      expect(JSON.stringify(data)).not.toContain('RAW-SENTINEL');
      return data;
    } },
  });
  try {
    expect(await slot.findByText(/2 evaluator failures/)).toBeTruthy();
    fireEvent.click(slot.getByRole('button', { name: 'Summary', hidden: true }));
    expect(await slot.findByText('Recorded assessment: unavailable · provider-error.')).toBeTruthy();
    fireEvent.click(slot.getByText('Why this assessment')); fireEvent.click(slot.getByText('Selected check details'));
    expect(slot.getAllByText('<script>window.archiveExecuted=true</script>')).toBeTruthy();
    expect(slot.container.querySelector('script')).toBeNull(); expect((window as any).archiveExecuted).toBeUndefined();
    expect(slot.container.innerHTML).not.toContain('RAW-SENTINEL');
    expect(slot.inspection.rpcCalls.every(c => c.method === 'overview')).toBe(true);
    disconnected = true;
    fireEvent.click(slot.getByRole('button', { name: 'Refresh archive' }));
    expect(await slot.findByText('Host or archive unavailable. No current result.')).toBeTruthy();
    expect(slot.getByText('Calls unavailable. Missing records are not a pass.')).toBeTruthy();
    expect(slot.queryByText('Call synthetic-provider-error-1')).toBeNull();
  } finally { slot.lifecycle.unmount(); }
});

test('one adapter ignores late scopes, times out, polls once, and stops reads/timers on disposal', async () => {
  vi.useFakeTimers();
  const changed = vi.fn(), pending: ((v: typeof syntheticOverview) => void)[] = [];
  const read = vi.fn(() => new Promise<typeof syntheticOverview>(resolve => pending.push(resolve)));
  const adapter = new OverviewAdapter(read, changed);
  adapter.selectSession('b'.repeat(64));
  pending[0]!(structuredClone(syntheticOverview)); await tick();
  expect(adapter.state.data.calls).toHaveLength(0);
  pending[1]!(structuredClone(syntheticOverview)); await tick();
  expect(adapter.state.data.calls).toHaveLength(3);
  await vi.advanceTimersByTimeAsync(10_000); expect(read).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(8_000);
  expect(adapter.state.data.state).toBe('unavailable'); expect(adapter.state.data.calls).toHaveLength(0); expect(adapter.state.error).toContain('Read unavailable');
  const notifications = changed.mock.calls.length; adapter.dispose();
  pending[2]!(structuredClone(syntheticOverview)); await tick(); await vi.advanceTimersByTimeAsync(30_000);
  expect(changed).toHaveBeenCalledTimes(notifications); expect(read).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0);
});

test('panel unmount stops its single ten-second reader and disposes the Svelte mount', async () => {
  vi.useFakeTimers();
  const app = await loadPluginApp(() => import('./app'));
  const read = vi.fn(() => structuredClone(syntheticOverview));
  const slot = renderSlot(app.threadPanelActions[0]!, { threadId, params: null }, { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } }, rpc: { overview: read } });
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10_000); expect(read).toHaveBeenCalledTimes(2);
  slot.lifecycle.unmount(); await tick();
  await vi.advanceTimersByTimeAsync(30_000); expect(read).toHaveBeenCalledTimes(2);
  expect(document.querySelector('.tenet-summary-workspace')).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});
