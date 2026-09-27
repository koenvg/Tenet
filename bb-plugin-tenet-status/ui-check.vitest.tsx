// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { loadPluginApp, renderSlot } from '@get-bb/plugin-sdk/testing/app';
import type { Status } from './contract';

const threadId = 'thr_abcdefgh1234';
const linked: Status = { coverage: 'partial', linkedCalls: 2, failures: 1, issues: [] };

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
      expect(button.textContent).toBe('T');
      fireEvent.click(button);
      const region = await slot.findByRole('region', { name: 'TENET rule status' });
      expect(await slot.findByText('1 flagged call')).toBeTruthy();
      expect(slot.getByText('Among 2 recorded calls in this thread.')).toBeTruthy();
      expect(region.className).toContain('fixed inset-x-2');
      expect(region.textContent).toContain('This is not an all-clear.');
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
      expect(await slot.findByText('No recordings for this thread yet.')).toBeTruthy();
      expect(slot.getByText('Coverage is unknown, not a pass.')).toBeTruthy();
      expect(slot.getByText('Still checking. Some records may be missing.')).toBeTruthy();
      expect(slot.queryByText(/archive|indexing|BB_THREAD_ID|start a new BB Pi process/i)).toBeNull();
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
      expect(slot.getByText('Only recorded calls are shown. This is not an all-clear.')).toBeTruthy();
      expect(slot.getByText('Still checking recordings.')).toBeTruthy();
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
    const slot = renderSlot(app.threadHeaderActions[0]!, { threadId, projectId: 'project', isCompactViewport: false },
      { sdk: { threads: { get: async () => ({ providerId: 'pi' }) as any } },
        rpc: { status: () => reads++ === 0 ? linked : { ...linked, failures: 0 } } });
    try {
      const button = await slot.findByRole('button', { name: 'TENET rule status' });
      vi.useFakeTimers();
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
      const details = await slot.findByRole('button', { name: 'Open TENET details' });
      details.focus(); expect(document.activeElement).toBe(details);
      fireEvent.keyDown(details, { key: 'Enter' }); fireEvent.click(details);
      expect(slot.inspection.navigateCalls.length).toBe(1);
    } finally { slot.lifecycle.unmount(); }
  });
  it('paginates linked details and recovers from a rejected cursor with page-one Refresh', async () => {
    const app = await loadPluginApp(() => import('./app'));
    let reads = 0;
    const row = { id: 'a', callId: 'edit-1', toolName: 'edit', timestamp: 100, mode: 'observe',
      rules: [{ ruleId: 'r1', severity: 'BLOCK', policyText: '<img src=x onerror=alert(1)>', confidence: 0.72 }],
      wouldDecision: 'BLOCK', actualPermission: 'released', observedExecution: 'unknown', missingStages: ['execution'] };
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId }, {
      rpc: { findings: ({ cursor }: { cursor?: string }) => { reads++; if (cursor) throw new Error('invalid-page');
        return { coverage: 'partial', linkedCalls: 1, issues: ['indexing-in-progress', 'writer-loss'], items: [row], next: 'cursor-2' }; } } });
    try {
      expect(await slot.findByText('edit-1')).toBeTruthy();
      expect(slot.getByRole('heading', { name: 'edit' })).toBeTruthy();
      expect(slot.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
      expect(document.querySelector('img')).toBeNull();
      expect(slot.getByText(/Linked recordings only/)).toBeTruthy();
      expect(slot.getByText(/Recording gaps \(2\)/)).toBeTruthy();
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
    const finding = (id: string, callId: string, ruleId: string, policyText: string | null) => ({
      id, callId, toolName: 'edit', timestamp: 100, mode: 'observe', rules: [{ ruleId, severity: 'BLOCK', policyText, confidence: 0.8 }],
      wouldDecision: 'BLOCK', actualPermission: 'released', observedExecution: 'unknown', missingStages: [] });
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId }, { rpc: { findings: () => ({ coverage: 'partial', linkedCalls: 2, issues: [],
      items: [finding('a', 'edit-1', 'r1', 'Do not edit secrets'), finding('b', 'edit-2', 'r2', null)], next: null }) } });
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
    const slot = renderSlot(app.navPanels[0]!, { subPath: threadId }, { rpc: { findings: ({ cursor }: { cursor?: string }) => cursor
      ? { coverage: 'partial', linkedCalls: 2, issues: [], items: [{ id: 'b', callId: 'edit-2', toolName: 'edit', timestamp: 200,
        mode: 'observe', rules: [], wouldDecision: 'unknown', actualPermission: 'unknown', observedExecution: 'unknown', missingStages: [] }], next: null }
      : { coverage: 'partial', linkedCalls: 2, issues: first++ === 0 ? ['detail-unavailable'] : [], items: [], next: 'next' } } });
    try {
      expect(await slot.findByText(/flagged call changed or could not be read/)).toBeTruthy();
      fireEvent.click(slot.getByRole('button', { name: 'Load more findings' }));
      expect(await slot.findByText('edit-2')).toBeTruthy();
      expect(await slot.findByText(/flagged call changed or could not be read/)).toBeTruthy();
      fireEvent.click(slot.getByRole('button', { name: 'Refresh findings' }));
      expect(await slot.findByRole('button', { name: 'Load more findings' })).toBeTruthy();
      expect(slot.queryByText(/flagged call changed or could not be read/)).toBeNull();
    } finally { slot.lifecycle.unmount(); }
  });
  it('explains how to reach details from the sidebar root without an RPC', async () => {
    const app = await loadPluginApp(() => import('./app'));
    const slot = renderSlot(app.navPanels[0]!, { subPath: '' }, { rpc: { findings: () => { throw new Error('must not call'); } } });
    try { expect(slot.getByText(/Open a Pi thread/)).toBeTruthy(); expect(slot.inspection.rpcCalls.length).toBe(0); }
    finally { slot.lifecycle.unmount(); }
  });
});
