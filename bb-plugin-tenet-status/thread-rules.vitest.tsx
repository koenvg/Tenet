import { expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { loadPluginApp } from '@get-bb/plugin-sdk/testing/app';
import { renderSummarySlot } from './summary-rpc.fixture';
import { syntheticRead } from './overview.preview-fixture';

test.each(['panel', 'main'])('default %s lists every recorded status before rule/check/call drilldown', async surface => {
  const app = await loadPluginApp(() => import('./app'));
  const read = vi.fn((selection: any) => syntheticRead(selection));
  const options = { sdk: { threads: { get: async () => ({ id: 'thr_abcdefgh1234', providerId: 'pi', projectId: 'proj_synthetic0001' }) as any } }, rpc: { overview: read, pickerSelection: () => ({ state: 'ready', project: { id: 'proj_synthetic0001', label: 'Synthetic' }, thread: { id: 'thr_abcdefgh1234', label: 'Synthetic thread', status: 'idle', archived: false } }) } };
  const slot = surface === 'panel'
    ? renderSummarySlot(app.threadPanelActions[0]!, { threadId: 'thr_abcdefgh1234', params: null }, options)
    : renderSummarySlot(app.navPanels[0]!, { subPath: 'overview/thr_abcdefgh1234' }, options);
  try {
    expect(await slot.findByRole('heading', { name: 'Recorded rules for this thread' })).toBeTruthy();
    for (const status of ['Violation found', 'No violations found', 'Unclear', 'Not checked']) expect(slot.getAllByText(status).length).toBeGreaterThan(0);
    expect(slot.queryByLabelText('Linked session')).toBeNull();
    expect(slot.queryByRole('button', { name: 'Summary' })).toBeNull();
    expect(slot.container.querySelector('.thread-rule-coverage')).toBeNull();
    expect(slot.container.querySelector('.thread-rule-footer > [role="status"]')).toBeNull();
    expect(slot.queryByText('Archive warnings')).toBeNull();
    expect(slot.queryByText(/^No violations found does not prove complete capture/)).toBeNull();
    expect(read.mock.calls[0]![0].callId).toBeUndefined();
    fireEvent.click(slot.getByRole('button', { name: /Ask before publishing changes/ }));
    expect(await slot.findByRole('heading', { name: 'Recorded checks' })).toBeTruthy();
    fireEvent.click(slot.getByRole('button', { name: 'View recorded call' }));
    expect(await slot.findByText('Why this assessment')).toBeTruthy();
    fireEvent.click(slot.getByRole('button', { name: 'Back to recorded checks' }));
    expect(await slot.findByRole('heading', { name: 'Recorded checks' })).toBeTruthy();
    fireEvent.click(slot.getByRole('button', { name: 'Back to recorded rules' }));
    expect(await slot.findByRole('heading', { name: 'Recorded rules for this thread' })).toBeTruthy();
    fireEvent.click(slot.getByRole('button', { name: 'Browse calls' }));
    expect(await slot.findByText('Archive warnings', { exact: true })).toBeTruthy();
    fireEvent.click(slot.getByText('Archive warnings', { exact: true }));
    expect(slot.getByText('corrupt-record', { exact: true })).toBeTruthy();
  } finally { slot.lifecycle.unmount(); }
});

test('rule inventory reports real omissions without the repeated footer diagnostics', async () => {
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSummarySlot(app.threadPanelActions[0]!, { threadId: 'thr_abcdefgh1234', params: null }, {
    sdk: { threads: { get: async () => ({ id: 'thr_abcdefgh1234', providerId: 'pi' }) as any } },
    rpc: { overview: (selection: any) => {
      const data = syntheticRead(selection);
      if (data.threadRules) data.threadRules.summary = { ...data.threadRules.summary, inventory: 'unknown', incomplete: true,
        omittedRules: 2, omittedChecks: 3, missingIntegrity: 1 };
      return data;
    } },
  });
  try {
    expect((await slot.findByText('2 rule observations omitted · 3 checks omitted · 1 missing recorded integrity declarations')).getAttribute('role')).toBe('status');
    expect(slot.queryByText('Archive warnings')).toBeNull();
    expect(slot.container.querySelector('.thread-rule-coverage')).toBeNull();
    expect(slot.container.querySelector('.thread-rule-footer > p')).toBeNull();
  } finally { slot.lifecycle.unmount(); }
});
test.each([
  [1e20, null],
  [-1e20, null],
  [0, '1970-01-01T00:00:00.000Z'],
] as const)('recorded checks remain usable with timestamp %s', async (timestamp, expectedIso) => {
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSummarySlot(app.threadPanelActions[0]!, { threadId: 'thr_abcdefgh1234', params: null }, {
    sdk: { threads: { get: async () => ({ id: 'thr_abcdefgh1234', providerId: 'pi' }) as any } },
    rpc: { overview: (selection: any) => {
      const data = syntheticRead(selection);
      if (data.threadRules && data.threadRules.kind !== 'inventory') {
        data.threadRules.items = data.threadRules.items.map(check => ({ ...check, timestamp }));
      }
      return data;
    } },
  });
  try {
    await slot.findByRole('heading', { name: 'Recorded rules for this thread' });
    fireEvent.click(slot.getByRole('button', { name: /Ask before publishing changes/ }));
    await slot.findByRole('heading', { name: 'Recorded checks' });
    if (expectedIso === null) {
      expect(await slot.findByText('Recorded time unavailable')).toBeTruthy();
      expect(slot.container.querySelector('.thread-check-list time')).toBeNull();
    } else {
      expect(slot.container.querySelector('.thread-check-list time')?.getAttribute('datetime')).toBe(expectedIso);
    }
    fireEvent.click(slot.getByRole('button', { name: 'View recorded call' }));
    expect(await slot.findByRole('heading', { name: 'Recorded call summary' })).toBeTruthy();
  } finally { slot.lifecycle.unmount(); }
});


test('rule and check pagination polls fresh first pages, preserves unchanged nodes and clears stale or unavailable pages', async () => {
  vi.useFakeTimers();
  const { act } = await import('@testing-library/react');
  const app = await loadPluginApp(() => import('./app'));
  let revision = 'a'.repeat(64), unavailable = false, stale = false;
  const first = syntheticRead({}).threadRules!;
  if (first.kind !== 'inventory') throw new Error('inventory expected');
  const inventory = Array.from({ length: 55 }, (_, n) => ({ ...first.items[0]!, id: (1000 + n).toString(16).padStart(64, '0'),
    label: `declaration-${n}`, excerpt: `Recorded inventory rule ${n + 1}.`, timestamp: 1000 - n }));
  const read = vi.fn((selection: any) => {
    if (unavailable) return { ...syntheticRead({}), state: 'unavailable' as const, threadRules: null, selected: null, selectedId: null, calls: [] };
    if (stale && selection.query?.inventoryCursor) throw new Error('stale-cursor');
    const query = selection.query;
    const data = syntheticRead(query?.kind === 'checks' || query?.kind === 'call' ? { query: { ...query, ruleId: '64'.padStart(64, '0') } } : {});
    data.revision = revision;
    if (query?.kind === 'checks' || query?.kind === 'call') {
      const checks = data.threadRules!;
      if (checks.kind === 'inventory') throw new Error('checks expected');
      checks.rule = inventory[54]!;
      checks.items = Array.from({ length: 55 }, (_, n) => ({ ...checks.items[0]!, id: (2000 + n).toString(16).padStart(64, '0'), timestamp: 2000 - n }));
      checks.items = query.checkCursor ? checks.items.slice(50) : checks.items.slice(0, 50);
      checks.next = query.checkCursor ? null : 'check-page-two'; checks.revision = revision;
    } else {
      data.threadRules = { kind: 'inventory', revision, summary: { ...data.threadRules!.summary, retainedRules: 55 },
        items: query?.inventoryCursor ? inventory.slice(50) : inventory.slice(0, 50), next: query?.inventoryCursor ? null : 'inventory-page-two' };
    }
    return data;
  });
  const slot = renderSummarySlot(app.threadPanelActions[0]!, { threadId: 'thr_abcdefgh1234', params: null }, {
    sdk: { threads: { get: async () => ({ id: 'thr_abcdefgh1234', providerId: 'pi' }) as any } }, rpc: { overview: read },
  });
  const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
  try {
    await settle();
    fireEvent.click(slot.getByRole('button', { name: 'More recorded rules' })); await settle();
    expect(slot.getByRole('list', { name: 'Recorded rules' }).querySelectorAll('button')).toHaveLength(55);
    const last = slot.getByRole('button', { name: /Recorded inventory rule 55/ }); last.focus();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(read.mock.calls.at(-1)![0].query?.inventoryCursor).toBeUndefined();
    expect(document.activeElement).toBe(last);
    fireEvent.click(last); await settle();
    fireEvent.click(slot.getByRole('button', { name: 'More recorded checks' })); await settle();
    expect(slot.getAllByRole('button', { name: 'View recorded call' })).toHaveLength(55);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(read.mock.calls.at(-1)![0].query.checkCursor).toBeUndefined();
    expect(slot.getAllByRole('button', { name: 'View recorded call' })).toHaveLength(55);
    fireEvent.click(slot.getByRole('button', { name: 'Back to recorded rules' })); await settle();
    fireEvent.click(slot.getByRole('button', { name: 'More recorded rules' })); await settle();
    revision = 'b'.repeat(64);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(slot.getByRole('list', { name: 'Recorded rules' }).querySelectorAll('button')).toHaveLength(50);
    stale = true; fireEvent.click(slot.getByRole('button', { name: 'More recorded rules' })); await settle();
    expect(slot.queryByText('Recorded inventory rule 1.')).toBeNull();
    const count = read.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); }); expect(read).toHaveBeenCalledTimes(count);
    stale = false; fireEvent.click(slot.getByRole('button', { name: 'Refresh from page one' })); await settle();
    expect(slot.getByRole('list', { name: 'Recorded rules' }).querySelectorAll('button')).toHaveLength(50);
    unavailable = true; await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(slot.queryByText('Recorded inventory rule 1.')).toBeNull();
    expect(slot.getByRole('status').textContent).toBe('Host or archive unavailable. No current result.');
  } finally { slot.lifecycle.unmount(); vi.useRealTimers(); }
});
