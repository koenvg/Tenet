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
});
