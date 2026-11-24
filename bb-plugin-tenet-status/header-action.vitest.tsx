import { act, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { experimental_useAppPanel, useBbNavigate, useSdk, type PluginThreadAction, type PluginThreadActionTarget } from '@get-bb/plugin-sdk/app';
import { loadPluginApp, type PluginSdkTestFakes } from '@get-bb/plugin-sdk/testing/app';
import { rpcContract, type Status } from './contract';
import { overviewTab, renderSummarySlot, summaryCalls } from './summary-rpc.fixture';

const first = 'thr_abcdefgh1234';
const second = 'thr_abcdefgh1235';
const nonPi = 'thr_abcdefgh1236';

const headerBaseline: Status = {
  coverage: 'partial', linkedCalls: 2, failures: 0, issues: [],
  assessments: { completed: 2, unavailable: 0, pending: 0, dropped: 0, cancelled: 0, incomplete: 0, reasons: [] },
  notices: { approvals: 0, uncertain: 0, incomplete: 0 },
};
const { assessments: _assessments, ...headerWithoutAssessments } = headerBaseline;
const { notices: _notices, ...headerWithoutNotices } = headerBaseline;
const headerWithoutMetadata: Status = { coverage: 'partial', linkedCalls: 2, failures: 0, issues: [] };

const closedHeaderCases: { name: string; status: Status; label: string; description: string }[] = [
  { name: 'fully accounted linked calls without flags', status: headerBaseline, label: 'TENET: No flags · 0 recorded FAIL',
    description: 'No recorded FAIL calls. Some calls may be missing.' },
  { name: 'one recorded FAIL call', status: { ...headerBaseline, failures: 1 }, label: 'TENET: Review · 1 recorded FAIL',
    description: '1 recorded FAIL call. Some calls may be missing.' },
  { name: 'two recorded FAIL calls', status: { ...headerBaseline, failures: 2 }, label: 'TENET: Review · 2 recorded FAIL',
    description: '2 recorded FAIL calls. Some calls may be missing.' },
  { name: 'unavailable assessments without double-counting reasons', status: { ...headerBaseline,
    assessments: { ...headerBaseline.assessments!, completed: 0, unavailable: 2, reasons: [{ code: 'provider-error', count: 2 }] } }, label: 'TENET: Review · 0 recorded FAIL',
    description: 'No recorded FAIL calls. 2 evaluator assessments unavailable. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'pending assessment', status: { ...headerBaseline, assessments: { ...headerBaseline.assessments!, completed: 1, pending: 1 } }, label: 'TENET: Review · 0 recorded FAIL',
    description: 'No recorded FAIL calls. 1 assessment pending. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'dropped assessment', status: { ...headerBaseline, assessments: { ...headerBaseline.assessments!, completed: 1, dropped: 1 } }, label: 'TENET: Review · 0 recorded FAIL',
    description: 'No recorded FAIL calls. 1 assessment dropped. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'cancelled assessment', status: { ...headerBaseline, assessments: { ...headerBaseline.assessments!, completed: 1, cancelled: 1 } }, label: 'TENET: Review · 0 recorded FAIL',
    description: 'No recorded FAIL calls. 1 assessment cancelled. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'incomplete assessment with overlapping legacy notice', status: { ...headerBaseline,
    assessments: { ...headerBaseline.assessments!, completed: 1, incomplete: 1 }, notices: { ...headerBaseline.notices!, incomplete: 1 } }, label: 'TENET: Review · 0 recorded FAIL',
    description: 'No recorded FAIL calls. 1 assessment incomplete. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'uncertain recorded result', status: { ...headerBaseline, notices: { ...headerBaseline.notices!, uncertain: 1 } }, label: 'TENET: Review · 0 recorded FAIL',
    description: 'No recorded FAIL calls. 1 call had an uncertain result. Some calls may be missing.' },
  { name: 'recorded approval condition rather than a policy FAIL', status: { ...headerBaseline, notices: { ...headerBaseline.notices!, approvals: 1 } }, label: 'TENET: Review · 0 recorded FAIL',
    description: 'No recorded FAIL calls. 1 call had an approval condition. Some calls may be missing.' },
  { name: 'missing assessment metadata', status: headerWithoutAssessments, label: 'TENET: Unknown · 0 recorded FAIL',
    description: 'No recorded FAIL calls. Assessment status unknown. Some calls may be missing.' },
  { name: 'missing notice metadata', status: headerWithoutNotices, label: 'TENET: Unknown · 0 recorded FAIL',
    description: 'No recorded FAIL calls. Notice status unknown. Some calls may be missing.' },
  { name: 'completed count below linked calls', status: { ...headerBaseline, assessments: { ...headerBaseline.assessments!, completed: 0 } }, label: 'TENET: Unknown · 0 recorded FAIL',
    description: 'No recorded FAIL calls. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'completed count above linked calls', status: { ...headerBaseline, assessments: { ...headerBaseline.assessments!, completed: 3 } }, label: 'TENET: Unknown · 0 recorded FAIL',
    description: 'No recorded FAIL calls. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'legacy unfinished checks without assessment metadata', status: { ...headerWithoutAssessments,
    notices: { ...headerBaseline.notices!, incomplete: 1 } }, label: 'TENET: Review · 0 recorded FAIL',
    description: 'No recorded FAIL calls. 1 call had missing or unfinished checks. Assessment status unknown. Some calls may be missing.' },
  { name: 'FAIL with both optional metadata fields missing', status: { ...headerWithoutMetadata, failures: 1 }, label: 'TENET: Review · 1 recorded FAIL',
    description: '1 recorded FAIL call. Assessment status unknown. Notice status unknown. Some calls may be missing.' },
  { name: 'archive warning without policy flags', status: { ...headerBaseline, issues: ['corrupt-record'] }, label: 'TENET: Review · 0 recorded FAIL',
    description: 'No recorded FAIL calls. Archive warnings may include other threads. Some calls may be missing.' },
  { name: 'unknown coverage without linked calls', status: { ...headerBaseline, coverage: 'unknown', linkedCalls: 0,
    assessments: { ...headerBaseline.assessments!, completed: 0 } }, label: 'TENET: Unknown',
    description: 'No linked recordings. Rule status unknown.' },
  { name: 'archive warning with unknown coverage and no linked calls', status: { ...headerBaseline, coverage: 'unknown', linkedCalls: 0,
    assessments: { ...headerBaseline.assessments!, completed: 0 }, issues: ['corrupt-record'] }, label: 'TENET: Review',
    description: 'No linked recordings. Rule status unknown. Archive warnings may include other threads.' },
  { name: 'unknown coverage with positive linked calls', status: { ...headerBaseline, coverage: 'unknown' }, label: 'TENET: Unknown',
    description: 'Recording coverage unknown. Rule status unknown.' },
  { name: 'archive warning with unknown coverage and positive linked calls', status: { ...headerBaseline, coverage: 'unknown', issues: ['corrupt-record'] }, label: 'TENET: Review',
    description: 'Recording coverage unknown. Rule status unknown. Archive warnings may include other threads.' },
  { name: 'partial coverage with no linked calls', status: { ...headerBaseline, linkedCalls: 0,
    assessments: { ...headerBaseline.assessments!, completed: 0 } }, label: 'TENET: Unknown · 0 recorded FAIL',
    description: 'No linked recordings. Rule status unknown. No recorded FAIL calls. Some calls may be missing.' },
  { name: 'mixed FAIL, evaluator failure, uncertainty and archive warning', status: { ...headerBaseline, failures: 1,
    assessments: { ...headerBaseline.assessments!, completed: 0, unavailable: 2, reasons: [{ code: 'provider-error', count: 2 }] },
    notices: { ...headerBaseline.notices!, uncertain: 1 }, issues: ['corrupt-record'] }, label: 'TENET: Review · 1 recorded FAIL',
    description: '1 recorded FAIL call. 2 evaluator assessments unavailable. 1 call had an uncertain result. Archive warnings may include other threads. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'unavailable archive response', status: { coverage: 'unavailable', linkedCalls: 0, failures: 0, issues: ['private-raw-code'] }, label: 'TENET: Unavailable',
    description: 'Status unavailable right now.' },
];

type ThreadGet = NonNullable<NonNullable<PluginSdkTestFakes['threads']>['get']>;
function threadTarget(id: string): PluginThreadActionTarget {
  return {
    id, projectId: 'project', parentThreadId: null, parentNotifications: 'off',
    archivedAt: null, pinnedAt: null, sectionId: null, isUnread: false, status: 'idle', environment: null,
  };
}

const getThread: ThreadGet = async ({ threadId }) => ({
  ...threadTarget(threadId),
  providerId: threadId === second ? 'pi-subagents' : threadId === nonPi ? 'codex' : 'pi',
  title: 'Synthetic thread', titleFallback: null, originKind: null, originPluginId: null,
  sourceThreadId: null, lifecycleOwnerThreadId: null, environmentId: null, deletedAt: null,
  createdAt: 0, updatedAt: 0, latestAttentionAt: 0, lastReadAt: null,
  canEditMessages: false, canRestoreEnvironment: false, canSpawnChild: false,
  activeBackgroundAgentCount: 0, queuedMessageCount: 0, runtime: { displayStatus: 'idle' }, visibility: 'visible',
});

async function mountAction(
  status: (threadId: string) => Status | Promise<Status>,
  threadIds: readonly string[] = [first],
  openTab = () => true,
  readThread: ThreadGet = getThread,
) {
  const app = await loadPluginApp(() => import('./app'));
  const registration = app.threadActions.find(action => action.id === 'tenet-rules');
  if (!registration?.useData) throw new Error('Missing TENET thread action data hook');
  const { useData, item, placement } = registration;
  let actions = new Map<string, PluginThreadAction | null>();
  function Collector({ ids }: { ids: readonly string[] }) {
    const data = useData!({ threadIds: ids });
    const sdk = useSdk(), navigate = useBbNavigate(), experimental_panel = experimental_useAppPanel();
    useLayoutEffect(() => {
      actions = new Map([first, second, nonPi].map(id => [id, item({ thread: threadTarget(id), data, sdk, navigate, experimental_panel })]));
    });
    return null;
  }
  const slot = renderSummarySlot({ component: Collector }, { ids: threadIds }, {
    sdk: { threads: { get: readThread } },
    rpc: { status: input => status(rpcContract.status.input.parse(input).threadId) },
    experimental_panel: { openTab },
  });
  return {
    placement, tab: overviewTab(app), slot,
    action: (id = first) => actions.get(id),
    show: (ids: readonly string[]) => slot.lifecycle.rerender(<Collector ids={ids} />),
  };
}

const settle = () => act(async () => {});
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
afterEach(() => { vi.useRealTimers(); });

it.each(closedHeaderCases)('labels and describes $name', async ({ status, label, description }) => {
  const header = await mountAction(() => status);
  try {
    await waitFor(() => expect(header.action()).toMatchObject({ label, detail: description }));
  } finally { header.slot.lifecycle.unmount(); }
});

it('registers a header action that requests the same thread overview instance on every activation', async () => {
  const header = await mountAction(() => ({ ...headerBaseline, failures: 2 }), [first], () => false);
  try {
    expect(header.placement).toBe('header');
    expect(header.tab).toMatchObject({
      id: 'tenet-overview', context: { kind: 'thread' }, availability: 'action',
      title: 'TENET overview', layout: 'flush', params: null,
    });
    await waitFor(() => expect(header.action()?.label).toBe('TENET: Review · 2 recorded FAIL'));
    for (let i = 0; i < 2; i++) {
      await header.action()!.run({ requestRename: () => { throw new Error('Unexpected rename'); } });
    }
    const request = { method: 'openTab', options: {
      tab: { id: 'tenet-overview', context: { kind: 'thread' }, availability: 'action' },
      title: 'TENET overview', params: null,
    } };
    expect(header.slot.inspection.experimental_panelCalls).toEqual([request, request]);
    expect(header.slot.inspection.navigateCalls).toEqual([]);
    expect(summaryCalls(header.slot)).toEqual([{ method: 'status', input: { threadId: first } }]);
  } finally { header.slot.lifecycle.unmount(); }
});

it('keeps split-thread status separate and ignores late results for a removed and reopened thread', async () => {
  vi.useFakeTimers();
  let firstReads = 0;
  let finishOldRead!: (status: Status) => void;
  const oldRead = new Promise<Status>(resolve => { finishOldRead = resolve; });
  const header = await mountAction(id => {
    if (id === second) return { ...headerBaseline, failures: 2 };
    if (firstReads++ === 0) return oldRead;
    return { ...headerBaseline, assessments: { ...headerBaseline.assessments!, completed: 1, incomplete: 1 } };
  }, [first, second, nonPi]);
  try {
    await settle();
    expect(header.action()?.label).toBe('TENET: Checking');
    expect(header.action(second)?.label).toBe('TENET: Review · 2 recorded FAIL');
    expect(header.action(nonPi)).toBeNull();
    await act(async () => header.show([second, nonPi]));
    expect(header.action()).toBeNull();
    const reads = () => summaryCalls(header.slot);
    expect(reads()).toEqual([first, second].map(threadId => ({ method: 'status', input: { threadId } })));
    const firstCall = header.slot.inspection.sdkCalls.find(call => call.method === 'plugins.callRpc');
    expect(firstCall?.args[0]).toHaveProperty('signal.aborted', true);
    await act(async () => header.show([first, second, nonPi]));
    expect(header.action()).toMatchObject({
      label: 'TENET: Review · 0 recorded FAIL',
      detail: 'No recorded FAIL calls. 1 assessment incomplete. Completed assessment count does not match linked calls. Some calls may be missing.',
    });
    await act(async () => finishOldRead({ ...headerBaseline, failures: 9 }));
    expect(header.action()?.label).toBe('TENET: Review · 0 recorded FAIL');
    expect(header.action(second)?.label).toBe('TENET: Review · 2 recorded FAIL');
    expect(reads()).toEqual([first, second, first].map(threadId => ({ method: 'status', input: { threadId } })));
  } finally { header.slot.lifecycle.unmount(); }
  expect(vi.getTimerCount()).toBe(0);
});

it('shows status once a slow Pi provider lookup completes', async () => {
  vi.useFakeTimers();
  let finishLookup!: () => void;
  const lookup = new Promise<void>(resolve => { finishLookup = resolve; });
  const header = await mountAction(() => headerBaseline, [first], undefined, async input => {
    await lookup;
    return getThread(input);
  });
  try {
    await advance(9_000);
    expect(header.action()).toBeNull();
    expect(summaryCalls(header.slot)).toEqual([]);
    await act(async () => finishLookup());
    expect(header.action()?.label).toBe('TENET: No flags · 0 recorded FAIL');
  } finally { header.slot.lifecycle.unmount(); }
});

it('clears a stale count on a hung refresh, then recovers on the next poll', async () => {
  vi.useFakeTimers();
  let reads = 0;
  const header = await mountAction(() => {
    if (++reads === 2) return new Promise<Status>(() => {});
    return { ...headerBaseline, failures: reads === 1 ? 1 : 2 };
  });
  try {
    await settle();
    expect(header.action()?.label).toBe('TENET: Review · 1 recorded FAIL');
    await advance(18_000);
    expect(header.action()).toMatchObject({ label: 'TENET: Unavailable', detail: 'Status unavailable right now.' });
    await advance(2_000);
    expect(header.action()?.label).toBe('TENET: Review · 2 recorded FAIL');
  } finally { header.slot.lifecycle.unmount(); }
  await advance(30_000);
  expect(reads).toBe(3);
  expect(vi.getTimerCount()).toBe(0);
});
