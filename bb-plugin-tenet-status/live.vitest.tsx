import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, within } from '@testing-library/react';
import { loadPluginApp } from '@get-bb/plugin-sdk/testing/app';
import { renderSummarySlot, summaryCalls } from './summary-rpc.fixture';
import { OverviewAdapter } from './overview-adapter';
import { MainPage } from './main-page';
import { overviewPath } from './main-route';
import { createLiveFixture, liveId, liveProject, liveThread, otherLiveThread } from './live.preview-fixture';
import { syntheticOverview } from './overview.preview-fixture';

type TestClock = { finished: boolean; pending?: Promise<void> };
let clock: TestClock;
beforeEach(() => { clock = { finished: false }; });
afterEach(async () => {
  clock.finished = true;
  try { await clock.pending; }
  finally { cleanup(); vi.useRealTimers(); }
});
const advance = async (milliseconds: number) => {
  const owner = clock;
  if (owner.finished) throw new Error('Test clock is closed');
  owner.pending = (async () => { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); })();
  await owner.pending;
  if (owner.finished) throw new Error('Test clock is closed');
};
const settle = () => advance(1);
const metadata = (threadId: string) => ({ id: threadId, providerId: 'pi', projectId: liveProject, deletedAt: null });

for (const entry of ['panel', 'main'] as const) for (const behavior of ['history and route navigation', 'append polling and manual refresh'] as const) test(`${entry}: ${behavior} preserves the old call and selected rule`, async () => {
  vi.useFakeTimers();
  const app = await loadPluginApp(() => import('./app')), fixture = createLiveFixture();
  const rpc = {
    overview: ({ threadId, ...selection }: any) => fixture.read(threadId, selection),
    pickerSelection: () => ({ state: 'ready', project: { id: liveProject, label: 'Authored project' }, thread: { id: liveThread, label: 'Authored Pi', status: 'idle', archived: false } }),
  };
  const path = overviewPath(liveThread, {}, liveProject);
  const slot = entry === 'panel'
    ? renderSummarySlot(app.threadPanelActions[0]!, { threadId: liveThread, params: null }, { rpc, sdk: { threads: { get: async ({ threadId }) => metadata(threadId) as any } } })
    : renderSummarySlot(app.navPanels[0]!, { subPath: path }, { rpc, sdk: { threads: { get: async ({ threadId }) => metadata(threadId) as any } } });
  const view = within(slot.container);
  try {
    await settle(); await settle();
    fireEvent.click(view.getByRole('button', { name: 'Browse calls' })); await settle();
    const archive = () => within(slot.container.querySelector<HTMLElement>('.archive-messages:has(.archive-toolbar)')!);
    const explorer = () => within(view.getByRole('complementary', { name: 'Call explorer' }));
    const detail = () => within(view.getByRole('region', { name: 'Invocation detail' }));
    const rules = () => within(detail().getByRole('navigation', { name: 'Rules' }));
    fireEvent.click(archive().getByRole('button', { name: 'More sessions' })); await settle();
    expect(archive().getByLabelText('Linked session').querySelectorAll('option')).toHaveLength(55);
    fireEvent.change(archive().getByLabelText('Linked session'), { target: { value: liveId(1054) } }); await settle();
    fireEvent.click(explorer().getByText('More invocations', { selector: 'button' })); await settle();
    expect(slot.container.querySelectorAll('.call-row')).toHaveLength(70);
    fireEvent.click(slot.container.querySelector<HTMLButtonElement>(`[data-call-id="${liveId(2001)}"]`)!); await settle();
    fireEvent.click(detail().getByText('Why this assessment')); fireEvent.click(detail().getByText(/^Browse all rules/));
    fireEvent.click(detail().getByRole('button', { name: 'More rules' })); await settle();
    fireEvent.click(rules().getByRole('button', { name: /Built-in integrity/ })); await settle();
    const selected = { sessionId: liveId(1054), callId: liveId(2001) };
    const readCount = summaryCalls(slot).length;
    expect(summaryCalls(slot).at(-1)?.input).toMatchObject(selected);
    expect(rules().getByRole('button', { name: /Built-in integrity/ }).getAttribute('aria-pressed')).toBe('true');
    if (behavior === 'history and route navigation') {
      if (entry === 'main') {
        slot.lifecycle.rerender(<MainPage subPath={overviewPath(liveThread, selected, liveProject)} />); await settle();
        expect(summaryCalls(slot)).toHaveLength(readCount);
        slot.lifecycle.rerender(<MainPage subPath={overviewPath(liveThread, { ...selected, callId: liveId(2002) }, liveProject)} />); await settle();
        slot.lifecycle.rerender(<MainPage subPath={overviewPath(liveThread, selected, liveProject)} />); await settle();
        expect(slot.container.querySelectorAll('.call-row')).toHaveLength(70);
        expect(detail().getByText('Recorded rules 1–16 of 19. At most 16 rules per page.')).toBeTruthy();
        fireEvent.click(detail().getByRole('button', { name: 'More rules' })); await settle();
        fireEvent.click(rules().getByRole('button', { name: /Built-in integrity/ })); await settle();
        expect(rules().getByRole('button', { name: /Built-in integrity/ }).getAttribute('aria-pressed')).toBe('true');
      }
    } else {
      fixture.append(); await advance(10_000);
      expect(slot.container.querySelectorAll('.call-row')).toHaveLength(50);
      expect(detail().getByText('Recorded rules 1–16 of 19. At most 16 rules per page.')).toBeTruthy();
      fireEvent.click(archive().getByRole('button', { name: 'More sessions' })); await settle();
      fireEvent.click(explorer().getByText('More invocations', { selector: 'button' })); await settle();
      fireEvent.click(detail().getByRole('button', { name: 'More rules' })); await settle();
      fireEvent.click(rules().getByRole('button', { name: /Built-in integrity/ })); await settle();
      expect(slot.container.querySelectorAll('.call-row')).toHaveLength(71);
      expect(detail().getByText('live-1')).toBeTruthy();
      expect(archive().getByLabelText('Linked session').querySelectorAll('option')).toHaveLength(55);
      expect(explorer().queryByText('More invocations', { selector: 'button' })).toBeNull();
      expect(rules().getByRole('button', { name: /Built-in integrity/ }).getAttribute('aria-pressed')).toBe('true');
      expect(detail().getByText('Recorded rules 17–19 of 19. At most 16 rules per page.')).toBeTruthy();
      fireEvent.click(archive().getByRole('button', { name: 'Refresh archive' })); await settle();
      expect(slot.container.querySelectorAll('.call-row')).toHaveLength(50);
      expect(detail().getByText('live-1')).toBeTruthy();
      expect((archive().getByLabelText('Linked session') as HTMLSelectElement).value).toBe(selected.sessionId);
      expect(summaryCalls(slot).at(-1)?.input).toMatchObject(selected);
      expect((summaryCalls(slot).at(-1)?.input as any)?.ruleCursor).toBeUndefined();
    }
  } finally { slot.lifecycle.unmount(); await settle(); }
  expect(vi.getTimerCount()).toBe(0); expect(document.querySelector('.tenet-summary-workspace')).toBeNull();
});

for (const failure of ['disconnect', 'timeout', 'cursor'] as const) test(`adapter clears ${failure}, bounds polling and allows successful manual retry`, async () => {
  vi.useFakeTimers();
  const fixture = createLiveFixture();
  const adapter = new OverviewAdapter((selection, signal) => fixture.read(liveThread, selection, signal), () => {}, { query: { kind: 'calls' } });
  try {
    await settle();
    adapter.loadMoreRules(); await settle();
    fixture.fail(failure); await advance(10_000);
    if (failure === 'cursor') { adapter.loadMoreCalls(); await settle(); }
    if (failure === 'timeout') {
      const pending = fixture.reads.at(-1)!.signal!;
      await advance(7_000);
      expect(pending.aborted).toBe(false); expect(fixture.reads).toHaveLength(3);
      await advance(1_000);
      expect(pending.aborted).toBe(true);
    }
    expect(adapter.state.data.state).toBe('unavailable');
    expect(adapter.workspace().model.calls).toHaveLength(0); expect(adapter.workspace().model.selected).toBeNull();
    const count = fixture.reads.length; await advance(30_000); expect(fixture.reads).toHaveLength(count);
    fixture.fail('none'); adapter.restart(); await settle();
    expect(adapter.state.data.state).toBe('available'); expect(adapter.state.error).toBe('');
    expect(fixture.reads.at(-1)!.selection.ruleCursor).toBeUndefined();
  } finally { adapter.dispose(); }
  expect(vi.getTimerCount()).toBe(0);
});

test('adapter rejects cross-host merging, including explicit refresh, and manual page-one read accepts the new scope', async () => {
  vi.useFakeTimers(); const fixture = createLiveFixture(); let thread = liveThread;
  const adapter = new OverviewAdapter((selection, signal) => fixture.read(thread, selection, signal), () => {}, { query: { kind: 'calls' } });
  try {
    await settle(); adapter.loadMoreCalls(); await settle(); thread = otherLiveThread;
    adapter.restart(); await settle();
    expect(adapter.state.data.calls).toHaveLength(0); expect(adapter.state.error).toContain('Archive scope changed');
    adapter.restart(); await settle();
    adapter.browseCalls(); await settle();
    expect(adapter.state.data.readScope).toBe(liveId(901)); expect(adapter.state.data.calls).toHaveLength(50);
  } finally { adapter.dispose(); }
});

test('metadata and summary transports receive scope-owned signals; unmount, timeout and switching ignore late reads', async () => {
  vi.useFakeTimers(); const app = await loadPluginApp(() => import('./app'));
  let finish!: (value: typeof syntheticOverview) => void;
  const slot = renderSummarySlot(app.threadPanelActions[0]!, { threadId: liveThread, params: null }, {
    rpc: { overview: () => new Promise(resolve => { finish = resolve; }) }, sdk: { threads: { get: async () => metadata(liveThread) as any } },
  });
  try {
    await settle();
    const args = slot.inspection.sdkCalls.find(c => c.method === 'plugins.callRpc')!.args[0] as { signal: AbortSignal; input: unknown };
    const threadArgs = slot.inspection.sdkCalls.find(c => c.method === 'threads.get')!.args[0] as { signal: AbortSignal };
    expect(args.signal.aborted).toBe(false);
    await advance(8_000); expect(args.signal.aborted).toBe(true);
    expect(within(slot.container).queryByText('synthetic-provider-error-1')).toBeNull();
    slot.lifecycle.unmount(); finish(structuredClone(syntheticOverview)); await settle();
    expect(threadArgs.signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector('.tenet-summary-workspace')).toBeNull();
  } finally { slot.lifecycle.unmount(); }
});

test('rapid selection changes abort the previous owner read and ignore its late completion', async () => {
  vi.useFakeTimers();
  const pending: { selection: any; signal: AbortSignal; finish: (value: typeof syntheticOverview) => void }[] = [];
  const adapter = new OverviewAdapter((selection, signal) => new Promise(resolve => pending.push({ selection, signal, finish: resolve })), () => {}, { query: { kind: 'calls' } });
  adapter.selectSession(liveId(1054));
  expect(pending[0]!.signal.aborted).toBe(true);
  pending[0]!.finish(structuredClone(syntheticOverview)); await settle(); expect(adapter.state.data.calls).toHaveLength(0);
  adapter.dispose(); expect(pending[1]!.signal.aborted).toBe(true);
  pending[1]!.finish(structuredClone(syntheticOverview)); await settle(); expect(adapter.state.data.calls).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});


test('polling updates the selected older timeline row from its separate safe detail read', async () => {
  vi.useFakeTimers(); const fixture = createLiveFixture(); let changed = false;
  const adapter = new OverviewAdapter(async (selection, signal) => {
    const data = await fixture.read(liveThread, selection, signal);
    if (changed && data.selected) {
      data.selected.execution = 'executed'; data.selected.assessmentStatus = 'unavailable';
      data.selected.failure = 'provider-error'; data.selected.evaluatorState = { status: 'unavailable', reason: 'provider-error' };
      data.selected.categories = ['unavailable'];
    }
    return data;
  }, () => {}, { query: { kind: 'calls' } });
  try {
    await settle(); adapter.loadMoreCalls(); await settle(); adapter.selectCall(liveId(2001)); await settle();
    changed = true; await advance(10_000);
    expect(adapter.state.data.calls.find(row => row.id === liveId(2001))).toMatchObject({ execution: 'executed', failure: 'provider-error', categories: ['unavailable'] });
    expect(adapter.state.data.calls).toHaveLength(70);
  } finally { adapter.dispose(); }
});


test('session/rule reads preserve an exhausted older call page and ordinary polling keeps the category', async () => {
  vi.useFakeTimers(); const fixture = createLiveFixture();
  const adapter = new OverviewAdapter((selection, signal) => fixture.read(liveThread, selection, signal), () => {}, { query: { kind: 'calls' } });
  try {
    await settle(); adapter.loadMoreCalls(); await settle();
    expect(adapter.state.data.nextCall).toBeNull();
    adapter.loadMoreSessions(); await settle(); adapter.loadMoreRules(); await settle();
    expect(adapter.state.data.nextCall).toBeNull(); expect(adapter.state.data.calls).toHaveLength(70);
    adapter.filterCategory('unavailable'); await settle();
    fixture.append(); await advance(10_000);
    expect(adapter.workspace().model.category).toBe('unavailable');
    expect(fixture.reads.at(-1)!.selection.category).toBe('unavailable');
    expect(adapter.state.data.calls).toHaveLength(0);
  } finally { adapter.dispose(); }
});
