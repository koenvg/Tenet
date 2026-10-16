// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import { loadPluginApp, renderSlot as renderSdkSlot, type PluginRpcTestHandlers, type RenderSlotOptions } from '@get-bb/plugin-sdk/testing/app';
import { rpcContract, type Findings, type Status } from './contract';

// The SDK's default mock contract accepts unknown outputs. Pin these mocks to Tenet.
type TenetSlotOptions = Omit<RenderSlotOptions, 'rpc'> & {
  rpc?: Partial<PluginRpcTestHandlers<typeof rpcContract>>;
};
function renderSlot<Props extends object>(registration: { component: ComponentType<Props> }, props: Props, options: TenetSlotOptions = {}) {
  const { status, findings } = options.rpc ?? {};
  return renderSdkSlot(registration, props, { ...options, rpc: {
    ...(status ? { status: async (input: unknown) => rpcContract.status.output.parse(await status(rpcContract.status.input.parse(input))) } : {}),
    ...(findings ? { findings: async (input: unknown) => rpcContract.findings.output.parse(await findings(rpcContract.findings.input.parse(input))) } : {}),
  } });
}
import { renderSummarySlot, summaryCalls } from './summary-rpc.fixture';

const threadId = 'thr_abcdefgh1234';
const linked: Status = { coverage: 'partial', linkedCalls: 2, failures: 1, issues: [] };

const headerBaseline: Status = {
  coverage: 'partial', linkedCalls: 2, failures: 0, issues: [],
  assessments: { completed: 2, unavailable: 0, pending: 0, dropped: 0, cancelled: 0, incomplete: 0, reasons: [] },
  notices: { approvals: 0, uncertain: 0, incomplete: 0 },
};
const { assessments: _assessments, ...headerWithoutAssessments } = headerBaseline;
const { notices: _notices, ...headerWithoutNotices } = headerBaseline;
const headerWithoutMetadata: Status = { coverage: 'partial', linkedCalls: 2, failures: 0, issues: [] };

const headerIconPaths = {
  Checking: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  Unavailable: 'M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5Zm0 13 8-8',
  Unknown: 'M12 2 2 12l10 10 10-10L12 2Zm-3 7a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01',
  Review: 'M12 3 2 21h20L12 3Zm0 6v5m0 3h.01',
  'No flags': 'M12 3a9 9 0 1 0 9 9M17 4l1 .5M20 7l.5 1M8 12h8',
};
const closedHeaderCases: { name: string; status: Status; kind: keyof typeof headerIconPaths; description: string; badge?: string }[] = [
  { name: 'fully accounted linked calls without flags', status: headerBaseline, kind: 'No flags',
    description: 'No recorded FAIL calls. Some calls may be missing.' },
  { name: 'one recorded FAIL call', status: { ...headerBaseline, failures: 1 }, kind: 'Review', badge: '1 recorded FAIL call',
    description: '1 recorded FAIL call. Some calls may be missing.' },
  { name: 'two recorded FAIL calls', status: { ...headerBaseline, failures: 2 }, kind: 'Review', badge: '2 recorded FAIL calls',
    description: '2 recorded FAIL calls. Some calls may be missing.' },
  { name: 'unavailable assessments without double-counting reasons', status: { ...headerBaseline,
    assessments: { ...headerBaseline.assessments!, completed: 0, unavailable: 2, reasons: [{ code: 'provider-error', count: 2 }] } }, kind: 'Review',
    description: 'No recorded FAIL calls. 2 evaluator assessments unavailable. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'pending assessment', status: { ...headerBaseline, assessments: { ...headerBaseline.assessments!, completed: 1, pending: 1 } }, kind: 'Review',
    description: 'No recorded FAIL calls. 1 assessment pending. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'dropped assessment', status: { ...headerBaseline, assessments: { ...headerBaseline.assessments!, completed: 1, dropped: 1 } }, kind: 'Review',
    description: 'No recorded FAIL calls. 1 assessment dropped. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'cancelled assessment', status: { ...headerBaseline, assessments: { ...headerBaseline.assessments!, completed: 1, cancelled: 1 } }, kind: 'Review',
    description: 'No recorded FAIL calls. 1 assessment cancelled. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'incomplete assessment with overlapping legacy notice', status: { ...headerBaseline,
    assessments: { ...headerBaseline.assessments!, completed: 1, incomplete: 1 }, notices: { ...headerBaseline.notices!, incomplete: 1 } }, kind: 'Review',
    description: 'No recorded FAIL calls. 1 assessment incomplete. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'uncertain recorded result', status: { ...headerBaseline, notices: { ...headerBaseline.notices!, uncertain: 1 } }, kind: 'Review',
    description: 'No recorded FAIL calls. 1 call had an uncertain result. Some calls may be missing.' },
  { name: 'recorded approval condition rather than a policy FAIL', status: { ...headerBaseline, notices: { ...headerBaseline.notices!, approvals: 1 } }, kind: 'Review',
    description: 'No recorded FAIL calls. 1 call had an approval condition. Some calls may be missing.' },
  { name: 'missing assessment metadata', status: headerWithoutAssessments, kind: 'Unknown',
    description: 'No recorded FAIL calls. Assessment status unknown. Some calls may be missing.' },
  { name: 'missing notice metadata', status: headerWithoutNotices, kind: 'Unknown',
    description: 'No recorded FAIL calls. Notice status unknown. Some calls may be missing.' },
  { name: 'completed count below linked calls', status: { ...headerBaseline, assessments: { ...headerBaseline.assessments!, completed: 0 } }, kind: 'Unknown',
    description: 'No recorded FAIL calls. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'completed count above linked calls', status: { ...headerBaseline, assessments: { ...headerBaseline.assessments!, completed: 3 } }, kind: 'Unknown',
    description: 'No recorded FAIL calls. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'legacy unfinished checks without assessment metadata', status: { ...headerWithoutAssessments,
    notices: { ...headerBaseline.notices!, incomplete: 1 } }, kind: 'Review',
    description: 'No recorded FAIL calls. 1 call had missing or unfinished checks. Assessment status unknown. Some calls may be missing.' },
  { name: 'FAIL with both optional metadata fields missing', status: { ...headerWithoutMetadata, failures: 1 }, kind: 'Review', badge: '1 recorded FAIL call',
    description: '1 recorded FAIL call. Assessment status unknown. Notice status unknown. Some calls may be missing.' },
  { name: 'archive warning without policy flags', status: { ...headerBaseline, issues: ['corrupt-record'] }, kind: 'Review',
    description: 'No recorded FAIL calls. Archive warnings may include other threads. Some calls may be missing.' },
  { name: 'unknown coverage without linked calls', status: { ...headerBaseline, coverage: 'unknown', linkedCalls: 0,
    assessments: { ...headerBaseline.assessments!, completed: 0 } }, kind: 'Unknown',
    description: 'No linked recordings. Rule status unknown.' },
  { name: 'archive warning with unknown coverage and no linked calls', status: { ...headerBaseline, coverage: 'unknown', linkedCalls: 0,
    assessments: { ...headerBaseline.assessments!, completed: 0 }, issues: ['corrupt-record'] }, kind: 'Review',
    description: 'No linked recordings. Rule status unknown. Archive warnings may include other threads.' },
  { name: 'unknown coverage with positive linked calls', status: { ...headerBaseline, coverage: 'unknown' }, kind: 'Unknown',
    description: 'Recording coverage unknown. Rule status unknown.' },
  { name: 'archive warning with unknown coverage and positive linked calls', status: { ...headerBaseline, coverage: 'unknown', issues: ['corrupt-record'] }, kind: 'Review',
    description: 'Recording coverage unknown. Rule status unknown. Archive warnings may include other threads.' },
  { name: 'partial coverage with no linked calls', status: { ...headerBaseline, linkedCalls: 0,
    assessments: { ...headerBaseline.assessments!, completed: 0 } }, kind: 'Unknown',
    description: 'No linked recordings. Rule status unknown. No recorded FAIL calls. Some calls may be missing.' },
  { name: 'mixed FAIL, evaluator failure, uncertainty and archive warning', status: { ...headerBaseline, failures: 1,
    assessments: { ...headerBaseline.assessments!, completed: 0, unavailable: 2, reasons: [{ code: 'provider-error', count: 2 }] },
    notices: { ...headerBaseline.notices!, uncertain: 1 }, issues: ['corrupt-record'] }, kind: 'Review', badge: '1 recorded FAIL call',
    description: '1 recorded FAIL call. 2 evaluator assessments unavailable. 1 call had an uncertain result. Archive warnings may include other threads. Completed assessment count does not match linked calls. Some calls may be missing.' },
  { name: 'unavailable archive response', status: { coverage: 'unavailable', linkedCalls: 0, failures: 0, issues: ['private-raw-code'] }, kind: 'Unavailable',
    description: 'Status unavailable right now.' },
];

type Finding = Findings['items'][number];
const savedFinding: Finding = {
  id: 'a'.repeat(64), snapshot: 'a'.repeat(64), callId: 'edit-1', toolName: 'edit', timestamp: 100, mode: 'observe',
  rules: [{ origin: null, ruleId: 'r1', severity: 'BLOCK', policyText: 'Recorded rule', confidence: 0.8, uncertain: false, kind: 'policy' }],
  wouldDecision: 'BLOCK', actualPermission: 'released', observedExecution: 'unknown', missingStages: [],
};

describe('finding RPC output contract', () => {
  const page: Findings = { coverage: 'partial', linkedCalls: 1, issues: [], items: [savedFinding], next: null };
  const { snapshot, ...withoutSnapshot } = savedFinding;
  const { timestamp, ...withoutTimestamp } = savedFinding;
  const { uncertain, ...withoutUncertain } = savedFinding.rules[0]!;
  const { kind, ...withoutKind } = savedFinding.rules[0]!;
  const { next, ...withoutNext } = page;

  // These invalid handlers must fail static checking and the real RPC output validator.
  const rejectedMocks: { name: string; handler: PluginRpcTestHandlers<typeof rpcContract>['findings']; path: (string | number)[] }[] = [
    { name: 'a missing snapshot', path: ['items', 0, 'snapshot'],
      // @ts-expect-error A findings mock must include the snapshot.
      handler: () => ({ ...page, items: [withoutSnapshot] }) },
    { name: 'a missing timestamp in an async result', path: ['items', 0, 'timestamp'],
      // @ts-expect-error Async findings mocks must also include all required fields.
      handler: async () => ({ ...page, items: [withoutTimestamp] }) },
    { name: 'a missing rule uncertainty', path: ['items', 0, 'rules', 0, 'uncertain'],
      // @ts-expect-error Finding rules must include uncertain.
      handler: () => ({ ...page, items: [{ ...savedFinding, rules: [withoutUncertain] }] }) },
    { name: 'a missing rule kind', path: ['items', 0, 'rules', 0, 'kind'],
      // @ts-expect-error Finding rules must include kind.
      handler: () => ({ ...page, items: [{ ...savedFinding, rules: [withoutKind] }] }) },
    { name: 'a missing page cursor', path: ['next'],
      // @ts-expect-error A findings result must include next, even on the last page.
      handler: () => withoutNext },
    { name: 'a short finding ID', path: ['items', 0, 'id'],
      handler: () => ({ ...page, items: [{ ...savedFinding, id: 'a' }] }) },
    { name: 'a non-hex snapshot', path: ['items', 0, 'snapshot'],
      handler: () => ({ ...page, items: [{ ...savedFinding, snapshot: 'z'.repeat(64) }] }) },
  ];

  it('accepts a complete finding through the RPC output validator', async () => {
    const fake = createFakePluginHost();
    try {
      fake.bb.rpc.register({ status: rpcContract.status, findings: rpcContract.findings }, { status: () => linked, findings: () => page });
      expect(await fake.harness.behavior.callRpc('findings', { threadId })).toEqual(page);
    } finally { await fake.harness.lifecycle.dispose(); }
  });

  it.each(rejectedMocks)('rejects $name at the RPC output boundary', async ({ handler, path }) => {
    const fake = createFakePluginHost();
    try {
      fake.bb.rpc.register({ status: rpcContract.status, findings: rpcContract.findings }, { status: () => linked, findings: handler });
      await expect(fake.harness.behavior.callRpc('findings', { threadId })).rejects.toMatchObject({
        code: 'invalid_output', issues: expect.arrayContaining([expect.objectContaining({ path })]),
      });
    } finally { await fake.harness.lifecycle.dispose(); }
  });
});

describe('Pi thread rule action', () => {
  describe.each([false, true])('icon-only header (compact %s)', isCompactViewport => {
    it.each(closedHeaderCases)('describes $name without visible captions', async ({ status, kind, description, badge }) => {
      const app = await loadPluginApp(() => import('./app'));
      const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport },
        { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } }, rpc: { status: () => status } });
      try {
        const button = await slot.findByTitle(description);
        expect(slot.getByRole('button', { name: 'TENET rule status' })).toBe(button);
        expect(button.textContent).toBe(`T${badge ? status.failures : ''}`);
        const logo = button.querySelector('.tenet-gate-logo');
        expect(logo?.getAttribute('aria-hidden')).toBe('true');
        expect(logo?.querySelector('.tenet-gate-logo__fallback')?.textContent).toBe('T');
        expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe(description);
        expect(button.hasAttribute('aria-expanded')).toBe(false);
        expect(button.hasAttribute('aria-controls')).toBe(false);
        expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
        expect(button.querySelector('svg path')?.getAttribute('d')).toBe(headerIconPaths[kind]);
        expect(slot.queryByRole('region')).toBeNull();
        expect(slot.queryByLabelText(/recorded FAIL calls?/)).toBe(badge ? slot.getByLabelText(badge) : null);
        expect(slot.container.textContent).not.toMatch(/passed|safe|all.clear|private-raw-code/i);
      } finally { slot.lifecycle.unmount(); }
    });
  });

  it('keeps the full mixed-category description on the compact button without a caption or aggregate count', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: true },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } }, rpc: { status: () => ({ ...headerBaseline, failures: 1,
        assessments: { ...headerBaseline.assessments!, completed: 0, unavailable: 2 }, notices: { approvals: 1, uncertain: 1, incomplete: 0 } }) } });
    try {
      await slot.findByLabelText('1 recorded FAIL call');
      const button = slot.getByRole('button', { name: 'TENET rule status' });
      expect(button.textContent).toBe('T1');
      const logo = button.querySelector('.tenet-gate-logo');
      expect(logo?.getAttribute('aria-hidden')).toBe('true');
      expect(logo?.querySelector('.tenet-gate-logo__fallback')?.textContent).toBe('T');
      expect(button.textContent).not.toContain('TENET rules');
      expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      const description = '1 recorded FAIL call. 2 evaluator assessments unavailable. 1 call had an approval condition. 1 call had an uncertain result. Completed assessment count does not match linked calls. Some calls may be missing.';
      expect(button.getAttribute('title')).toBe(description);
      expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe(description);
      button.focus();
      expect(document.activeElement).toBe(button);
      fireEvent.click(button);
      expect(slot.queryByRole('region')).toBeNull();
      expect(button.hasAttribute('aria-expanded')).toBe(false);
    } finally { slot.lifecycle.unmount(); }
  });

  it.each([false, true])('renders five pairwise-distinct status SVGs (compact %s)', async isCompactViewport => {
    const app = await loadPluginApp(() => import('./app'));
    const paths: (string | null | undefined)[] = [];
    vi.useFakeTimers();
    try {
      for (const status of [null, { coverage: 'unavailable', linkedCalls: 0, failures: 0, issues: [] } as Status,
        headerWithoutMetadata, { ...headerBaseline, failures: 1 }, headerBaseline]) {
        const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport },
          { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } },
            rpc: { status: () => status ?? new Promise<Status>(() => {}) } });
        try {
          await act(async () => { await Promise.resolve(); });
          const button = slot.getByRole('button', { name: 'TENET rule status' });
          expect(button.textContent).toBe(status?.failures ? 'T1' : 'T');
          expect(button.querySelectorAll('svg')).toHaveLength(1);
          paths.push(button.querySelector('svg path')?.getAttribute('d'));
        } finally { slot.lifecycle.unmount(); }
      }
      expect(paths).toEqual([headerIconPaths.Checking, headerIconPaths.Unavailable, headerIconPaths.Unknown,
        headerIconPaths.Review, headerIconPaths['No flags']]);
      expect(new Set(paths).size).toBe(5);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it.each([false, true])('shows checking until the first read times out without inventing a result (compact %s)', async isCompactViewport => {
    const app = await loadPluginApp(() => import('./app'));
    vi.useFakeTimers();
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } }, rpc: { status: () => new Promise<Status>(() => {}) } });
    try {
      await act(async () => { await Promise.resolve(); });
      const button = slot.getByRole('button', { name: 'TENET rule status' });
      expect(button.textContent).toBe('T');
      expect(button.getAttribute('title')).toBe('Checking recordings.');
      expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe('Checking recordings.');
      expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(button.querySelector('svg path')?.getAttribute('d')).toBe(headerIconPaths.Checking);
      await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
      expect(button.textContent).toBe('T');
      expect(button.getAttribute('title')).toBe('Status unavailable right now.');
      expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe('Status unavailable right now.');
      expect(button.querySelector('svg path')?.getAttribute('d')).toBe(headerIconPaths.Unavailable);
      expect(slot.queryByRole('region')).toBeNull();
      slot.lifecycle.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally { slot.lifecycle.unmount(); vi.useRealTimers(); }
  });

  it.each(['codex', 'pi-prefix', 'pi-subagents-extra', 'Pi', 'PI-SUBAGENTS', ' pi', 'pi ', 'pi-subagents '])('does not show an action or request status for %j', async providerId => {
    const app = await loadPluginApp(() => import('./app'));
    const metadata = vi.fn(async () => ({ providerId }) as any), status = vi.fn(() => linked);
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: false },
      { sdk: { threads: { get: metadata } }, rpc: { status } });
    try {
      await act(async () => { await Promise.resolve(); });
      expect(metadata).toHaveBeenCalledOnce();
      expect(slot.queryByRole('button', { name: 'TENET rule status' })).toBeNull();
      expect(status).not.toHaveBeenCalled();
    } finally { slot.lifecycle.unmount(); }
  });

  it.each(['pi', 'pi-subagents'])('shows only the recorded FAIL count without exposing rule or call details for %s', async providerId => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: true },
      { sdk: { threads: { get: async () => ({ providerId }) as any } }, rpc: { status: () => linked } });
    try {
      await slot.findByLabelText('1 recorded FAIL call');
      const button = slot.getByRole('button', { name: 'TENET rule status' });
      expect(button.textContent).toBe('T1');
      fireEvent.click(button);
      expect(slot.queryByRole('region')).toBeNull();
      for (const detail of ['policy:4', 'edit-1', 'native-session', 'BLOCK', 'released', '<img']) {
        expect(slot.container.textContent).not.toContain(detail);
      }
      expect(document.querySelector('img')).toBeNull();
      expect(slot.queryByRole('button', { name: 'Load more findings' })).toBeNull();
    } finally { slot.lifecycle.unmount(); }
  });
  it('treats a thread without linked recordings as unknown, not passing', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId },
      { rpc: { findings: () => ({ coverage: 'unknown', linkedCalls: 0, items: [], next: null, issues: ['temporary-record', 'indexing-in-progress'] }) } });
    try {
      expect((await slot.findByText('No recordings linked to this thread yet. Rule status is unknown.')).textContent).toBe('No recordings linked to this thread yet. Rule status is unknown.');
      expect(slot.getByText('Archive warnings').closest('details')?.open).toBe(false);
      expect(slot.getByText('These warnings may include records from other threads.')).toBeTruthy();
      expect(slot.queryByText(/A flag means/)).toBeNull();
      expect(slot.queryByText(/0 saved calls/)).toBeNull();
      expect(slot.getByText(/Still reading saved calls/).closest('details')?.open).toBe(false);
    } finally { slot.lifecycle.unmount(); }
  });
  it('keeps an empty details page separate from shared archive warnings', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId }, { rpc: { findings: () => ({
      coverage: 'unknown', linkedCalls: 0, items: [], next: null,
      issues: ['corrupt-record', 'temporary-record', 'additional-archive-issues'],
    }) } });
    try {
      expect(await slot.findByText('No recordings linked to this thread yet. Rule status is unknown.')).toBeTruthy();
      expect(slot.getByText('Archive warnings').closest('details')?.open).toBe(false);
      expect(slot.getByText('These warnings may include records from other threads.')).toBeTruthy();
      expect(slot.getByText('Some archive warnings could not be listed.')).toBeTruthy();
      expect(slot.queryByText(/A flag means|0 saved calls|additional archive issues|still being saved/)).toBeNull();
    } finally { slot.lifecycle.unmount(); }
  });
  it('does not suggest an all-clear when recorded calls have no flags', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId },
      { rpc: { findings: () => ({ coverage: 'partial', linkedCalls: 1, items: [], next: null, issues: ['indexing-in-progress'] }) } });
    try {
      expect((await slot.findByText('No flagged calls to show.')).textContent).toBe('No flagged calls to show.');
      expect(slot.getByText('Some calls may be missing.')).toBeTruthy();
      expect(slot.getByText('Archive warnings')).toBeTruthy();
      expect(slot.getByText('A flag means TENET found a possible rule break. It does not mean the call was blocked.').closest('details')?.open).toBe(false);
      expect(slot.container.textContent).not.toMatch(/passed|safe|all.clear/i);
    } finally { slot.lifecycle.unmount(); }
  });
  it('shows a plain-language unavailable state', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: false },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } },
        rpc: { status: () => ({ coverage: 'unavailable', linkedCalls: 0, failures: 0, issues: ['archive-unreadable'] }) } });
    try {
      const button = await slot.findByTitle('Status unavailable right now.');
      expect(button.textContent).toBe('T');
      expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe('Status unavailable right now.');
      expect(slot.queryByText(/archive|archive-unreadable/i)).toBeNull();
    } finally { slot.lifecycle.unmount(); }
  });
  it('refreshes the summary without opening a popup', async () => {
    const app = await loadPluginApp(() => import('./app'));
    let reads = 0;
    vi.useFakeTimers();
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: false },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } },
        rpc: { status: () => reads++ === 0 ? linked : { ...linked, failures: 0 } } });
    try {
      await act(async () => { await Promise.resolve(); });
      const button = slot.getByRole('button', { name: 'TENET rule status' });
      fireEvent.click(button);
      await act(async () => { await Promise.resolve(); });
      expect(button.textContent).toBe('T1');
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(button.textContent).toBe('T');
      expect(button.getAttribute('title')).toBe('No recorded FAIL calls. Assessment status unknown. Notice status unknown. Some calls may be missing.');
      expect(slot.queryByRole('region')).toBeNull();
      expect(reads).toBe(2);
    } finally { vi.useRealTimers(); slot.lifecycle.unmount(); }
  });
  it.each([false, true])('opens only the same thread panel on repeated and keyboard clicks even if the host rejects it (compact %s)', async isCompactViewport => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } }, openThreadPanel: () => false, rpc: { status: () => linked } });
    try {
      await slot.findByLabelText('1 recorded FAIL call');
      const button = slot.getByRole('button', { name: 'TENET rule status' });
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
      button.focus(); expect(document.activeElement).toBe(button);
      fireEvent.click(button);
      fireEvent.click(button);
      for (const key of ['Enter', ' ']) {
        fireEvent.keyDown(button, { key });
        fireEvent.keyUp(button, { key });
        fireEvent.click(button, { detail: 0 });
      }
      expect(slot.inspection.navigateCalls).toEqual(Array.from({ length: 4 }, () => ({
        method: 'openThreadPanel', options: { actionId: 'tenet-overview', title: 'TENET overview', params: null },
      })));
      expect(button.textContent).toBe('T1');
      expect(button.hasAttribute('aria-expanded')).toBe(false);
      expect(button.hasAttribute('aria-controls')).toBe(false);
      expect(slot.queryByRole('region')).toBeNull();
      expect(slot.queryByRole('dialog')).toBeNull();
      expect(slot.getAllByRole('button')).toEqual([button]);
      for (const name of ['Close TENET status', 'Open thread overview', 'View flagged rules']) {
        expect(slot.queryByRole('button', { name })).toBeNull();
      }
    } finally { slot.lifecycle.unmount(); }
  });
  it('paginates linked details and recovers from a rejected cursor with page-one Refresh', async () => {
    const app = await loadPluginApp(() => import('./app'));
    let reads = 0;
    const row: Finding = { ...savedFinding,
      rules: [{ origin: null, ruleId: 'r1', severity: 'BLOCK', policyText: '<img src=x onerror=alert(1)>', confidence: 0.72, uncertain: false, kind: 'policy' }],
      missingStages: ['execution'] };
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId }, {
      rpc: { findings: (input) => { const { cursor } = rpcContract.findings.input.parse(input); reads++; if (cursor) throw new Error('invalid-page');
        return { coverage: 'partial', linkedCalls: 1, issues: ['indexing-in-progress', 'writer-loss'], items: [row], next: 'cursor-2' }; } } });
    try {
      expect(await slot.findByText('edit-1')).toBeTruthy();
      expect(slot.getByText('edit')).toBeTruthy();
      expect(slot.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
      expect(document.querySelector('img')).toBeNull();
      expect(slot.getByText('Some calls may be missing.')).toBeTruthy();
      expect(slot.getByText('These warnings may include records from other threads.')).toBeTruthy();
      for (const extra of ['Would-decision', 'Actual permission', 'Observed execution', 'Confidence:', 'Severity:', 'Missing stages:', 'Back to thread', threadId]) {
        expect(slot.queryByText(extra, { exact: false })).toBeNull();
      }
      const more = slot.getByRole('button', { name: 'Load more findings' });
      fireEvent.click(more);
      expect(await slot.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Could not load the next page'));
      expect(slot.queryByRole('button', { name: 'Load more findings' })).toBeNull();
      const refresh = slot.getByRole('button', { name: 'Refresh findings' });
      refresh.focus(); fireEvent.click(refresh);
      expect(document.activeElement).toBe(refresh);
      expect(await slot.findByRole('button', { name: 'Load more findings' })).toBeTruthy();
      expect(reads).toBe(3);
      const main = slot.getByRole('main');
      expect(main.className).toContain('max-w');
      expect(main.className).toContain('min-w-0');
    } finally { slot.lifecycle.unmount(); }
  });
  it('groups selected rule text under the matching tool call and falls back to rule ID', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const finding = (id: string, callId: string, ruleId: string, policyText: string | null): Finding => ({
      ...savedFinding, id, callId, rules: [{ origin: null, ruleId, severity: 'BLOCK', policyText, confidence: 0.8, uncertain: false, kind: 'policy' }] });
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId }, { rpc: { findings: () => ({ coverage: 'partial', linkedCalls: 2, issues: [],
      items: [finding('a'.repeat(64), 'edit-1', 'r1', 'Do not edit secrets'), finding('b'.repeat(64), 'edit-2', 'r2', null)], next: null }) } });
    try {
      const first = (await slot.findByText('edit-1')).closest('ol > li');
      const second = slot.getByText('edit-2').closest('ol > li');
      expect(first?.textContent).toContain('Do not edit secrets');
      expect(first?.textContent).not.toContain('r2');
      expect(second?.textContent).toContain('Rule r2 (text unavailable)');
      expect(second?.textContent).not.toContain('Do not edit secrets');
    } finally { slot.lifecycle.unmount(); }
  });
  it('does not request details from malformed deep links', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.navPanels[0]!, { subPath: 'not-a-thread' }, { rpc: { findings: () => { throw new Error('must not call'); } } });
    try { expect(slot.getByText('Invalid Tenet selection. Choose a project to start again. No archive requested.')).toBeTruthy(); expect(slot.inspection.rpcCalls.length).toBe(0); }
    finally { slot.lifecycle.unmount(); }
  });
  it('keeps earlier detail gaps visible across successful pages and clears them on Refresh', async () => {
    const app = await loadPluginApp(() => import('./app'));
    let first = 0;
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId }, { rpc: { findings: (input) => {
      const { cursor } = rpcContract.findings.input.parse(input);
      return cursor
      ? { coverage: 'partial', linkedCalls: 2, issues: [], items: [{ ...savedFinding, id: 'b'.repeat(64), callId: 'edit-2', timestamp: 200,
        rules: [{ origin: null, ruleId: 'r1', policyText: 'Rule', severity: 'WARN', confidence: 0.9, uncertain: false, kind: 'policy' }], wouldDecision: 'unknown', actualPermission: 'unknown' }], next: null }
      : { coverage: 'partial', linkedCalls: 2, issues: first++ === 0 ? ['detail-unavailable'] : [], items: [], next: 'next' }; } } });
    try {
      expect(await slot.findByText(/Some flagged calls could not be read/)).toBeTruthy();
      fireEvent.click(slot.getByRole('button', { name: 'Load more findings' }));
      expect(await slot.findByText('edit-2')).toBeTruthy();
      expect(await slot.findByText(/Some flagged calls could not be read/)).toBeTruthy();
      fireEvent.click(slot.getByRole('button', { name: 'Refresh findings' }));
      expect(await slot.findByRole('button', { name: 'Load more findings' })).toBeTruthy();
      expect(slot.queryByText(/Some flagged calls could not be read/)).toBeNull();
    } finally { slot.lifecycle.unmount(); }
  });
  it('opens the sidebar root with metadata only and no findings or archive RPC', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSummarySlot(app.navPanels[0]!, { subPath: '' }, { rpc: { pickerProjects: () => ({ items: [], next: null }),
      findings: () => { throw new Error('must not call'); } } });
    try { expect(await slot.findByText('No projects on this page.')).toBeTruthy(); expect(summaryCalls(slot).map(call => call.method)).toEqual(['pickerProjects']); }
    finally { slot.lifecycle.unmount(); }
  });
  it.each([false, true])('polls while closed without remounting the Gate logo and removes a stale FAIL badge (compact %s)', async isCompactViewport => {
    const app = await loadPluginApp(() => import('./app'));
    let reads = 0;
    vi.useFakeTimers();
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } },
        rpc: { status: () => { if (++reads === 2) throw new Error('disconnected'); return linked; } } });
    try {
      await act(async () => { await Promise.resolve(); });
      expect(slot.getByLabelText('1 recorded FAIL call')).toBeTruthy();
      expect(app.threadHeaderActions[0]!.title).toBe('T');
      const originalButton = slot.getByRole('button', { name: 'TENET rule status' });
      const logo = originalButton.querySelector('.tenet-gate-logo');
      expect(logo?.getAttribute('aria-hidden')).toBe('true');
      expect(logo?.querySelector('.tenet-gate-logo__fallback')?.textContent).toBe('T');
      const fullMark = logo?.querySelector('.tenet-gate-logo__full');
      expect(fullMark?.tagName).toBe('SPAN');
      const pieces = Array.from(logo?.querySelectorAll('.tenet-gate-logo__piece') ?? []);
      expect(pieces.map(piece => piece.tagName)).toEqual(['SPAN', 'SPAN', 'SPAN']);
      expect(pieces.map(piece => piece.className)).toEqual([
        'tenet-gate-logo__piece tenet-gate-logo__left',
        'tenet-gate-logo__piece tenet-gate-logo__right',
        'tenet-gate-logo__piece tenet-gate-logo__stem',
      ]);
      expect(slot.queryByRole('region')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(slot.queryByLabelText('1 recorded FAIL call')).toBeNull();
      const button = slot.getByRole('button', { name: 'TENET rule status' });
      expect(button.textContent).toBe('T');
      expect(button).toBe(originalButton);
      expect(button.querySelector('.tenet-gate-logo')).toBe(logo);
      expect(logo?.querySelector('.tenet-gate-logo__full')).toBe(fullMark);
      pieces.forEach((piece, index) => expect(logo?.querySelectorAll('.tenet-gate-logo__piece')[index]).toBe(piece));
      expect(button.getAttribute('title')).toBe('Status unavailable right now.');
      expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe('Status unavailable right now.');
      expect(slot.queryByRole('region')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(slot.getByLabelText('1 recorded FAIL call').textContent).toBe('1');
      expect(button.textContent).toBe('T1');
      expect(button.textContent).not.toContain('TENET rules');
      expect(button.querySelector('.tenet-gate-logo')).toBe(logo);
      expect(logo?.querySelector('.tenet-gate-logo__full')).toBe(fullMark);
      pieces.forEach((piece, index) => expect(logo?.querySelectorAll('.tenet-gate-logo__piece')[index]).toBe(piece));
      expect(button.getAttribute('title')).toBe('1 recorded FAIL call. Assessment status unknown. Notice status unknown. Some calls may be missing.');
      expect(reads).toBe(3);
      fireEvent.click(button);
      expect(slot.queryByRole('region')).toBeNull();
      expect(slot.inspection.navigateCalls).toEqual([
        { method: 'openThreadPanel', options: { actionId: 'tenet-overview', title: 'TENET overview', params: null } },
      ]);
    } finally { vi.useRealTimers(); slot.lifecycle.unmount(); }
  });
  it('groups repeated calls by snapshot and keeps uncertain FAIL and integrity visible', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const row = (id: string, callId: string, snapshot: string, kind: Finding['rules'][number]['kind'] = 'policy'): Finding => ({
      ...savedFinding, id, snapshot, callId, rules: [{ origin: null, ruleId: 'r1', policyText: 'Recorded rule', severity: 'WARN', confidence: 0.6, uncertain: true, kind }],
    });
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId }, { rpc: { findings: () => ({
      coverage: 'partial', linkedCalls: 4, issues: [], next: null, notices: { approvals: 1, uncertain: 2, incomplete: 1 },
      items: [row('1'.repeat(64), 'one', 'a'.repeat(64)), row('2'.repeat(64), 'two', 'a'.repeat(64)), row('3'.repeat(64), 'three', 'b'.repeat(64)), row('4'.repeat(64), 'four', 'c'.repeat(64), 'integrity')],
    }) } });
    try {
      await slot.findByText('one');
      expect(slot.getAllByRole('heading', { name: 'Recorded rule' })).toHaveLength(3);
      expect(slot.getByText('2 calls shown')).toBeTruthy();
      expect(slot.getByText('Rule protection')).toBeTruthy();
      expect(slot.getAllByText('Uncertain', { exact: true })).toHaveLength(3);
      expect(slot.getByText(/1 call needed approval/)).toBeTruthy();
    } finally { slot.lifecycle.unmount(); }
  });
  it('clears stale details on a hung live read and disposes polling', async () => {
    const app = await loadPluginApp(() => import('./app'));
    vi.useFakeTimers();
    let reads = 0;
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId }, { rpc: { findings: () => ++reads === 1
      ? { coverage: 'partial', linkedCalls: 1, issues: [], next: null, items: [] } : new Promise<Findings>(() => {}) } });
    try {
      await act(async () => { await Promise.resolve(); });
      expect(slot.getByText('No flagged calls to show.')).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(18_000); });
      expect(slot.getByRole('alert').textContent).toContain('Recordings unavailable');
      expect(slot.queryByText('No flagged calls to show.')).toBeNull();
      expect(slot.inspection.navigateCalls).toHaveLength(0);
      slot.lifecycle.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
      expect(reads).toBe(2);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('keeps older loaded pages across polling ticks until explicit refresh, but clears them when unavailable', async () => {
    const app = await loadPluginApp(() => import('./app'));
    vi.useFakeTimers();
    let unavailable = false;
    const row = (callId: string): Finding => ({ ...savedFinding, id: (callId === 'older' ? 'b' : 'a').repeat(64), callId,
      rules: [{ origin: null, ruleId: 'r1', policyText: 'Rule', severity: 'WARN', confidence: 0.9, uncertain: false, kind: 'policy' }] });
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId }, { rpc: { findings: (input) => {
      const { cursor } = rpcContract.findings.input.parse(input);
      return unavailable ? { coverage: 'unavailable', linkedCalls: 0, issues: [], items: [], next: null }
        // Nine linked calls include seven without selected FAILs; only two findings are paginated.
        : { coverage: 'partial', linkedCalls: 9, issues: [], items: [row(cursor ? 'older' : 'newer')], next: cursor ? null : 'next' }; } } });
    try {
      await act(async () => { await Promise.resolve(); });
      expect(slot.getByText('9 saved calls in this thread. Rule counts include only the calls shown.')).toBeTruthy();
      expect(slot.getByText('1 call shown')).toBeTruthy();
      fireEvent.click(slot.getByRole('button', { name: 'Load more findings' }));
      await act(async () => { await Promise.resolve(); });
      expect(slot.getByText('older')).toBeTruthy();
      expect(slot.getByText('9 saved calls in this thread. Rule counts include only the calls shown.')).toBeTruthy();
      expect(slot.getByText('2 calls shown')).toBeTruthy();
      const opened = slot.getByText('older').closest('details')!;
      fireEvent.click(opened.querySelector('summary')!);
      expect(opened.open).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(slot.getByText('older')).toBeTruthy();
      expect(slot.getByText('older').closest('details')).toBe(opened);
      expect(opened.open).toBe(true);
      expect(slot.getByText(/Browsing older findings/)).toBeTruthy();
      fireEvent.click(slot.getByRole('button', { name: 'Refresh findings' }));
      await act(async () => { await Promise.resolve(); });
      expect(slot.queryByText('older')).toBeNull();
      fireEvent.click(slot.getByRole('button', { name: 'Load more findings' }));
      await act(async () => { await Promise.resolve(); });
      unavailable = true;
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(slot.queryByText('older')).toBeNull();
      expect(slot.getByText('Cannot read saved calls. Try Refresh.')).toBeTruthy();
    } finally { slot.lifecycle.unmount(); vi.useRealTimers(); }
  });
  it('keeps rule uncertainty visible but hides calls and recording mechanics until requested', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId }, { rpc: { findings: () => ({
      coverage: 'partial', linkedCalls: 1, issues: ['writer-loss'], next: null, notices: { approvals: 1, uncertain: 1, incomplete: 0 },
      items: [{ ...savedFinding, callId: 'private-call-id', rules: [
        { origin: null, ruleId: 'r1', policyText: 'Do not edit secrets', severity: 'WARN', confidence: 0.6, uncertain: true, kind: 'policy' },
      ] }],
    }) } });
    try {
      const title = await slot.findByRole('heading', { name: 'Do not edit secrets' });
      const disclosure = title.closest('details');
      expect(disclosure).not.toBeNull();
      expect(disclosure?.open).toBe(false);
      expect(disclosure?.querySelector('summary')?.textContent).toContain('Uncertain');
      expect(slot.getByText('private-call-id').closest('details')?.open).toBe(false);
      expect(slot.getByText('Some calls were not saved.').closest('details')?.open).toBe(false);
      fireEvent.click(disclosure!.querySelector('summary')!);
      expect(disclosure?.open).toBe(true);
    } finally { slot.lifecycle.unmount(); }
  });
  it('shows terminal provider failure in the header description and findings without a selected-FAIL badge', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const status: Status = { coverage: 'partial', linkedCalls: 2, failures: 0, issues: ['corrupt-record'],
      notices: { approvals: 0, uncertain: 0, incomplete: 0 },
      assessments: { completed: 0, unavailable: 2, pending: 0, dropped: 0, cancelled: 0, incomplete: 0,
        reasons: [{ code: 'provider-error', count: 2 }] } };
    const header = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: true },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } }, rpc: { status: () => status } });
    const { failures: _failures, ...page } = status;
    const findings = renderSlot(app.navPanels[0]!, { subPath: threadId }, { rpc: { findings: () => ({ ...page, items: [], next: null }) } });
    try {
      const button = await header.findByRole('button', { name: 'TENET rule status' });
      await header.findByTitle('No recorded FAIL calls. 2 evaluator assessments unavailable. Archive warnings may include other threads. Completed assessment count does not match linked calls. Some calls may be missing.');
      expect(button.textContent).toBe('T');
      expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(button.getAttribute('title')).toBe('No recorded FAIL calls. 2 evaluator assessments unavailable. Archive warnings may include other threads. Completed assessment count does not match linked calls. Some calls may be missing.');
      expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe('No recorded FAIL calls. 2 evaluator assessments unavailable. Archive warnings may include other threads. Completed assessment count does not match linked calls. Some calls may be missing.');
      expect(within(header.container).queryByLabelText(/recorded FAIL calls?/)).toBeNull();
      expect(within(header.container).queryByText(/evaluator assessments failed/)).toBeNull();
      expect(within(header.container).queryByRole('region')).toBeNull();
      const details = within(findings.container);
      const message = await details.findByText('2 evaluator assessments failed. No valid policy result is available for these calls.');
      expect(message.closest('details')).toBeNull();
      expect(details.getByText('Provider error: 2 assessments. Code: provider-error.').closest('details')?.open).toBe(false);
      expect(details.getByText('These warnings may include records from other threads.')).toBeTruthy();
      expect(details.queryByText(/checks are missing or unfinished/)).toBeNull();
      expect(details.queryByLabelText(/recorded FAIL calls/)).toBeNull();
      expect(within(findings.container).getByText('No flagged calls to show.')).toBeTruthy();
    } finally { header.lifecycle.unmount(); findings.lifecycle.unmount(); }
  });
  it('keeps pending, cancelled, dropped and incomplete assessments separate from terminal invalid responses', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId }, { rpc: { findings: () => ({
      coverage: 'partial', linkedCalls: 6, issues: ['missing-stages'], items: [], next: null,
      notices: { approvals: 0, uncertain: 0, incomplete: 1 },
      assessments: { completed: 1, unavailable: 1, pending: 1, dropped: 1, cancelled: 1, incomplete: 1,
        reasons: [{ code: 'invalid-response', count: 1 }] },
    }) } });
    try {
      expect(await slot.findByText('1 evaluator assessment failed. No valid policy result is available for this call.')).toBeTruthy();
      for (const label of ['1 assessment completed.', '1 assessment is pending.', '1 assessment was cancelled.',
        '1 assessment was dropped before completion.', '1 assessment has incomplete records.', 'Invalid evaluator response: 1 assessment. Code: invalid-response.']) {
        expect(slot.getByText(label)).toBeTruthy();
      }
      expect(slot.queryByText(/missing or unfinished/)).toBeNull();
    } finally { slot.lifecycle.unmount(); }
  });
});
