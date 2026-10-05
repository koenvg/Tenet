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

const threadId = 'thr_abcdefgh1234';
const linked: Status = { coverage: 'partial', linkedCalls: 2, failures: 1, issues: [] };

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
      fake.bb.rpc.register(rpcContract, { status: () => linked, findings: () => page });
      expect(await fake.harness.behavior.callRpc('findings', { threadId })).toEqual(page);
    } finally { await fake.harness.lifecycle.dispose(); }
  });

  it.each(rejectedMocks)('rejects $name at the RPC output boundary', async ({ handler, path }) => {
    const fake = createFakePluginHost();
    try {
      fake.bb.rpc.register(rpcContract, { status: () => linked, findings: handler });
      await expect(fake.harness.behavior.callRpc('findings', { threadId })).rejects.toMatchObject({
        code: 'invalid_output', issues: expect.arrayContaining([expect.objectContaining({ path })]),
      });
    } finally { await fake.harness.lifecycle.dispose(); }
  });
});

describe('Pi thread rule action', () => {
  it('does not show an action on non-Pi threads', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: false },
      { sdk: { threads: { get: async () => ({ providerId: 'codex' }) as any } } });
    try { expect(slot.queryByRole('button', { name: 'TENET rule status' })).toBeNull(); }
    finally { slot.lifecycle.unmount(); }
  });

  it('shows a short summary without exposing rule or call details', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: true },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } }, rpc: { status: () => linked } });
    try {
      const button = await slot.findByRole('button', { name: 'TENET rule status' });
      expect(button.textContent).toMatch(/^T/);
      fireEvent.click(button);
      const region = await slot.findByRole('region', { name: 'TENET rule status' });
      expect(await slot.findByText('1 flagged call')).toBeTruthy();
      expect(slot.getByText('Some calls may be missing.')).toBeTruthy();
      expect(region.className).toContain('fixed inset-x-2');
      expect(region.textContent).toContain('It does not mean the call was blocked.');
      for (const detail of ['policy:4', 'edit-1', 'native-session', 'BLOCK', 'released', '<img']) {
        expect(region.textContent).not.toContain(detail);
      }
      expect(document.querySelector('img')).toBeNull();
      expect(slot.queryByRole('button', { name: 'Load more findings' })).toBeNull();
      fireEvent.click(slot.getByRole('button', { name: 'Close TENET status' }));
      expect(slot.queryByRole('region', { name: 'TENET rule status' })).toBeNull();
    } finally { slot.lifecycle.unmount(); }
  });
  it('treats a thread without linked recordings as unknown, not passing', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: false },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } },
        rpc: { status: () => ({ coverage: 'unknown', linkedCalls: 0, failures: 0, issues: ['temporary-record', 'indexing-in-progress'] }) } });
    try {
      fireEvent.click(await slot.findByRole('button', { name: 'TENET rule status' }));
      expect(await slot.findByText('No recordings linked to this thread yet.')).toBeTruthy();
      expect(slot.getByText('Rule status is unknown.')).toBeTruthy();
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
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: true },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } },
        rpc: { status: () => ({ ...linked, linkedCalls: 1, failures: 0, issues: ['indexing-in-progress'] }) } });
    try {
      fireEvent.click(await slot.findByRole('button', { name: 'TENET rule status' }));
      expect(await slot.findByText('No flagged calls in 1 recorded call.')).toBeTruthy();
      expect(slot.getByText('Some calls may be missing.')).toBeTruthy();
      expect(slot.getByText('Archive warnings')).toBeTruthy();
    } finally { slot.lifecycle.unmount(); }
  });
  it('shows a plain-language unavailable state', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: false },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } },
        rpc: { status: () => ({ coverage: 'unavailable', linkedCalls: 0, failures: 0, issues: ['archive-unreadable'] }) } });
    try {
      fireEvent.click(await slot.findByRole('button', { name: 'TENET rule status' }));
      expect(await slot.findByText('Status unavailable right now.')).toBeTruthy();
      expect(slot.queryByText(/archive|archive-unreadable/i)).toBeNull();
    } finally { slot.lifecycle.unmount(); }
  });
  it('refreshes the summary while open', async () => {
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
      expect(slot.getByText('1 flagged call')).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(slot.getByText('No flagged calls in 2 recorded calls.')).toBeTruthy();
      expect(reads).toBe(2);
    } finally { vi.useRealTimers(); slot.lifecycle.unmount(); }
  });
  it('opens the thread details page from the compact header with a keyboard-operable button', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: true },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } }, rpc: { status: () => linked } });
    try {
      fireEvent.click(await slot.findByRole('button', { name: 'TENET rule status' }));
      const details = await slot.findByRole('button', { name: 'View flagged rules' });
      details.focus(); expect(document.activeElement).toBe(details);
      fireEvent.keyDown(details, { key: 'Enter' }); fireEvent.click(details);
      expect(slot.inspection.navigateCalls.length).toBe(1);
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
    try { expect(slot.getByText('Invalid thread link.')).toBeTruthy(); expect(slot.inspection.rpcCalls.length).toBe(0); }
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
  it('explains how to reach details from the sidebar root without an RPC', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.navPanels[0]!, { subPath: '' }, { rpc: { findings: () => { throw new Error('must not call'); } } });
    try { expect(slot.getByText(/Open a Pi thread/)).toBeTruthy(); expect(slot.inspection.rpcCalls.length).toBe(0); }
    finally { slot.lifecycle.unmount(); }
  });
  it('polls while closed and removes the finding indicator after a failed read', async () => {
    const app = await loadPluginApp(() => import('./app'));
    let reads = 0;
    vi.useFakeTimers();
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: true },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } },
        rpc: { status: () => { if (++reads > 1) throw new Error('disconnected'); return linked; } } });
    try {
      await act(async () => { await Promise.resolve(); });
      expect(slot.getByLabelText('1 recorded FAIL call')).toBeTruthy();
      expect(slot.queryByRole('region')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(slot.queryByLabelText('1 recorded FAIL call')).toBeNull();
      fireEvent.click(slot.getByRole('button', { name: 'TENET rule status' }));
      expect(slot.getByText('Status unavailable right now.')).toBeTruthy();
      expect(slot.inspection.navigateCalls).toHaveLength(0);
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
  it('shows terminal provider failure in the header disclosure and findings without a selected-FAIL badge', async () => {
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
      expect(button.textContent).toBe('T');
      expect(within(header.container).queryByText(/evaluator assessments failed/)).toBeNull();
      fireEvent.click(button);
      for (const slot of [within(header.container), within(findings.container)]) {
        const message = await slot.findByText('2 evaluator assessments failed. No valid policy result is available for these calls.');
        expect(message.closest('details')).toBeNull();
        expect(slot.getByText('Provider error: 2 assessments. Code: provider-error.').closest('details')?.open).toBe(false);
        expect(slot.getByText('These warnings may include records from other threads.')).toBeTruthy();
        expect(slot.queryByText(/checks are missing or unfinished/)).toBeNull();
        expect(slot.queryByLabelText(/recorded FAIL calls/)).toBeNull();
      }
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
