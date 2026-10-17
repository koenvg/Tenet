import React from 'react';
import { afterEach, expect, test } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DashboardPanel, type DashboardClient } from './dashboard-view';
import type { HostDashboardChunk } from './dashboard-contract';
import { dashboardHandlers } from './dashboard';
import { dashboardHost } from './dashboard-host';

const projectId = 'proj_fixture0001', threadId = 'thr_fixture0001', hostId = 'host_fixture0001', environmentId = 'env_fixture0001';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
afterEach(cleanup);

test('mounted Cancel and Refresh recover real owner and host capacity after late host-start replies', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mounted-lifecycle-')));
  const host = dashboardHost();
  const admissions: { chunk: HostDashboardChunk; release: () => void }[] = [];
  const sdk: any = { projects: { get: async () => ({ id: projectId, name: 'Synthetic project' }) }, threads: {
    list: async ({ archived }: any) => archived ? [] : [{ id: threadId, projectId, providerId: 'pi' }],
    get: async () => ({ id: threadId, projectId, providerId: 'pi', environmentId }),
  }, environments: { get: async () => ({ id: environmentId, hostId }) } };
  const owner = dashboardHandlers(sdk, async () => JSON.stringify({ [hostId]: root }), async input => {
    const chunk = await host.readDashboard(input);
    const gate = deferred<void>();
    admissions.push({ chunk, release: () => gate.resolve() });
    await gate.promise;
    return chunk;
  });
  const client: DashboardClient = { read: input => owner.dashboard(input),
    contributors: input => owner.dashboardContributors(input), stop: token => (owner as any).dashboardStop({ token }) };
  try {
    for (let n = 0; n < 300; n++) await mkdir(join(root, n.toString(16).padStart(64, '0')), { mode: 0o700 });
    const slot = render(<DashboardPanel projectId={projectId} client={client} navigate={() => {}} />);
    for (let n = 0; n < 5; n++) {
      await waitFor(() => expect(admissions).toHaveLength(n + 1));
      expect([admissions[n]!.chunk.state, admissions[n]!.chunk.contributions, admissions[n]!.chunk.reasons]).toEqual(['reading', [], []]);
      fireEvent.click(slot.getByRole('button', { name: 'Cancel' }));
      expect(slot.getByRole('status').textContent).toBe('Loading cancelled. History is partial. Refresh to try again.');
      await act(async () => { admissions[n]!.release(); });
      expect(slot.queryByRole('table')).toBeNull();
      if (n < 4) fireEvent.click(slot.getByRole('button', { name: 'Refresh' }));
    }
    slot.unmount();
    const replacement = await host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'b'.repeat(64), recordingDirectory: root });
    expect([replacement.state, replacement.contributions, replacement.reasons]).toEqual(['reading', [], []]);
  } finally {
    admissions.forEach(admission => admission.release());
    cleanup(); await host.dispose(); await rm(root, { recursive: true, force: true });
  }
});
