import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DashboardPanel, type DashboardClient } from './dashboard-view';
import type { HostDashboardChunk } from './dashboard-contract';
import { dashboardHandlers } from './dashboard';
import { dashboardHost } from './dashboard-host';
import { FixtureArchiveWriter } from '../test/archive-fixture';
import { ruleRecording } from '../test/session-rules-fixture';
import { syntheticDashboardPage } from './dashboard.preview-fixture';
import type { DashboardPage } from './dashboard-contract';
import type { DashboardReturn } from './dashboard-view';

const projectId = 'proj_fixture0001', threadId = 'thr_fixture0001', hostId = 'host_fixture0001', environmentId = 'env_fixture0001';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
afterEach(() => { cleanup(); vi.useRealTimers(); });

test('mounted Cancel and Refresh recover real owner and host capacity after late host-start replies', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mounted-lifecycle-')));
  const host = dashboardHost();
  const admissions: { chunk: HostDashboardChunk; release: () => void }[] = [];
  const sdk: any = { projects: { get: async () => ({ id: projectId, name: 'Synthetic project' }) }, threads: {
    list: async ({ archived }: any) => archived ? [] : [{ id: threadId, projectId, providerId: 'pi' }],
    get: async () => ({ id: threadId, projectId, providerId: 'pi', environmentId }),
  }, environments: { get: async () => ({ id: environmentId, hostId }) } };
  const owner = dashboardHandlers(sdk, async () => JSON.stringify({ [hostId]: root }), { stop: token => host.stopDashboard({ token }), read: async input => {
    const chunk = await host.readDashboard(input);
    const gate = deferred<void>();
    admissions.push({ chunk, release: () => gate.resolve() });
    await gate.promise;
    return chunk;
  } });
  const client: DashboardClient = { read: input => owner.dashboard(input),
    contributors: input => owner.dashboardContributors(input), stop: token => owner.dashboardStop({ token }) };
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

for (const exit of ['cancel', 'unmount'] as const) test(`a replacement cancelled during known predecessor cleanup cannot start after ${exit}`, async () => {
  const gate = deferred<{ stopped: true }>(), advance = deferred<DashboardPage>();
  const requests: string[] = [], stops: string[] = [];
  const client: DashboardClient = { read: async input => {
    requests.push(input.kind);
    return input.kind === 'start' ? { ...structuredClone(syntheticDashboardPage), state: 'reading', next: 'pending' } : advance.promise;
  }, contributors: async () => ({ state: 'ready', items: [], next: null }), stop: token => { stops.push(token); return gate.promise; } };
  const slot = render(<DashboardPanel projectId={projectId} client={client} navigate={() => {}} />);
  await waitFor(() => expect(requests).toEqual(['start', 'advance']));
  fireEvent.click(slot.getByRole('button', { name: 'Cancel' }));
  expect(slot.getByRole('table').textContent).toContain('Ask before publishing.');
  fireEvent.click(slot.getByRole('button', { name: 'Refresh' }));
  expect(slot.getByRole('status').textContent).toBe('Loading rules… Cancel');
  if (exit === 'cancel') fireEvent.click(slot.getByRole('button', { name: 'Cancel' })); else slot.unmount();
  await act(async () => { gate.resolve({ stopped: true }); advance.resolve(syntheticDashboardPage); });
  expect([requests, stops]).toEqual([['start', 'advance'], ['synthetic-run']]);
  if (exit === 'cancel') expect(slot.getByRole('status').textContent).toBe('Loading cancelled. History is partial. Refresh to try again.');
});

test('no-token Refresh proceeds while old metadata is unresolved, then stops only its late identity', async () => {
  const old = deferred<DashboardPage>(), stops: string[] = [], requests: string[] = [];
  let starts = 0;
  const client: DashboardClient = { read: async input => {
    requests.push(input.kind);
    return starts++ === 0 ? old.promise : { ...structuredClone(syntheticDashboardPage), run: 'replacement' };
  }, contributors: async () => ({ state: 'ready', items: [], next: null }), stop: async token => { stops.push(token); return { stopped: true }; } };
  const slot = render(<DashboardPanel projectId={projectId} client={client} navigate={() => {}} />);
  fireEvent.click(slot.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(slot.getByRole('button', { name: 'Refresh' }));
  expect((await slot.findByRole('table')).textContent).toContain('Ask before publishing.');
  await act(async () => { old.resolve({ ...structuredClone(syntheticDashboardPage), run: 'old-metadata', next: 'never-advance' }); });
  expect([requests, stops, slot.queryByRole('status')]).toEqual([['start', 'start'], ['old-metadata'], null]);
  slot.unmount();
  await act(async () => {});
  expect(stops).toEqual(['old-metadata', 'replacement']);
});

test('six real completed refreshes retain literal coverage and Open call return restores paged failures and focus after cleanup', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-return-lifecycle-')));
  const host = dashboardHost();
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  try {
    for (let n = 0; n < 51; n++) {
      const sink = writer.bindHistorical({ sessionId: 'selected', invocationId: `inv-${n}`, callId: `call-${n}`, toolName: 'edit', cwd: '/synthetic', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: threadId }, 4);
      for (const [stage, value] of Object.entries(ruleRecording({ outcome: 'FAIL' }))) sink(stage as any, value);
      await writer.settle();
    }
    await writer.complete(); await writer.close();
    const sdk: any = { projects: { get: async () => ({ id: projectId }) }, threads: {
      list: async ({ archived }: any) => archived ? [] : [{ id: threadId, projectId, providerId: 'pi' }],
      get: async () => ({ id: threadId, projectId, providerId: 'pi', environmentId, title: 'Synthetic thread' }),
    }, environments: { get: async () => ({ id: environmentId, hostId }) } };
    const owner = dashboardHandlers(sdk, async () => JSON.stringify({ [hostId]: root }), {
      read: input => host.readDashboard(input), stop: token => host.stopDashboard({ token }),
    });
    const pages: DashboardPage[] = [];
    let completed = deferred<void>();
    const client: DashboardClient = { read: async input => {
      const page = await owner.dashboard(input); pages.push(page);
      if (!page.next) completed.resolve();
      return page;
    },
      contributors: input => owner.dashboardContributors(input), stop: token => owner.dashboardStop({ token }) };
    let retained: DashboardReturn | null = null;
    const remember = (value: DashboardReturn | null) => { retained = value; };
    const paths: string[] = [];
    const slot = render(<DashboardPanel projectId={projectId} client={client} navigate={path => paths.push(path)} remember={remember} />);
    for (let n = 0; n < 6; n++) {
      await act(async () => { await completed.promise; });
      const rule = slot.getByRole('button', { name: 'Only synthetic actions. <script>inert()</script>' });
      expect(rule.hasAttribute('disabled')).toBe(false);
      expect(slot.queryByRole('status')).toBeNull();
      expect([pages.at(-1)?.state, pages.at(-1)?.next]).toEqual(['finished', null]);
      expect(pages.at(-1)?.coverage).toEqual({ discovered: 1, resolved: 1, processed: 1, unknown: 0, unavailable: 0, unprocessed: 0, partial: 0, omittedInvocations: 0, invocations: 51, capture: 'best-effort', reasons: [] });
      expect(pages.at(-1)?.rows.map(row => [row.builtin, row.passed, row.failed, row.passing, row.failing]).sort()).toEqual([[false, 0, 51, 0, 100], [true, 51, 0, 100, 0]]);
      if (n < 5) {
        completed = deferred<void>();
        fireEvent.click(slot.getByRole('button', { name: 'Refresh' }));
      }
    }
    fireEvent.click(slot.getByRole('button', { name: 'Only synthetic actions. <script>inert()</script>' }));
    fireEvent.click(await slot.findByRole('button', { name: 'Next failures' }));
    await slot.findByText('Showing 51–51 of 51 failures');
    const link = slot.getByRole('link', { name: 'Open call' });
    const href = link.getAttribute('href');
    fireEvent.click(link);
    expect(paths).toEqual([href!.slice(1)]);
    slot.unmount();
    const returned = render(<DashboardPanel projectId={projectId} client={client} navigate={path => paths.push(path)} remember={remember} retained={retained} />);
    await returned.findByText('Showing 51–51 of 51 failures');
    expect(returned.getByRole('link', { name: 'Open call' }).getAttribute('href')).toBe(href);
    await waitFor(() => expect(document.activeElement).toBe(returned.getByRole('link', { name: 'Open call' })));
    fireEvent.click(returned.getByRole('button', { name: 'Previous failures' }));
    await returned.findByText('Showing 1–50 of 51 failures');
    fireEvent.click(returned.getByRole('button', { name: 'Back to rules' }));
    expect(document.activeElement?.textContent).toBe('Only synthetic actions. <script>inert()</script>');
    returned.unmount();
  } finally { cleanup(); await writer.close(); await host.dispose(); await rm(root, { recursive: true, force: true }); }
}, 30000);

test('completed and stopped host replay expires on the original timer without a later sweep', async () => {
  vi.useFakeTimers();
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-fixed-expiry-')));
  const host = dashboardHost(() => 0);
  const start = () => host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'a'.repeat(64), recordingDirectory: root });
  try {
    const stopped = await start(), completed = await start();
    const recorded = await host.readDashboard({ kind: 'advance', token: completed.next! });
    expect([stopped.state, recorded.state]).toEqual(['reading', 'finished']);
    await vi.advanceTimersByTimeAsync(599999);
    expect(await host.stopDashboard({ token: stopped.next! })).toEqual({ stopped: true });
    expect(await host.readDashboard({ kind: 'advance', token: completed.next! })).toEqual(recorded);
    await vi.advanceTimersByTimeAsync(1);
    expect((await host.readDashboard({ kind: 'advance', token: stopped.next! })).reasons).toEqual(['host-run-not-retained']);
    expect((await host.readDashboard({ kind: 'advance', token: completed.next! })).reasons).toEqual(['host-run-not-retained']);
  } finally { await host.dispose(); await rm(root, { recursive: true, force: true }); }
});

test('failed known-run cleanup blocks replacement and a later Refresh retries the closed predecessor', async () => {
  let fail = true, starts = 0;
  const pending = deferred<DashboardPage>();
  const stops: string[] = [];
  const client: DashboardClient = { read: async input => {
    if (input.kind === 'start') { starts++; return starts === 1 ? { ...structuredClone(syntheticDashboardPage), next: 'pending' } : syntheticDashboardPage; }
    return pending.promise;
  }, contributors: async () => ({ state: 'ready', items: [], next: null }), stop: async token => { stops.push(token); if (fail) throw Error('cleanup-failed'); return { stopped: true }; } };
  const slot = render(<DashboardPanel projectId={projectId} client={client} navigate={() => {}} />);
  await waitFor(() => expect(slot.getByRole('table').textContent).toContain('Ask before publishing.'));
  fireEvent.click(slot.getByRole('button', { name: 'Cancel' }));
  await act(async () => {});
  fireEvent.click(slot.getByRole('button', { name: 'Refresh' }));
  expect((await slot.findByRole('alert')).textContent).toBe('History unavailable. Results cleared. Refresh to try again.');
  expect(starts).toBe(1);
  fail = false;
  fireEvent.click(slot.getByRole('button', { name: 'Refresh' }));
  expect((await slot.findByRole('table')).textContent).toContain('Ask before publishing.');
  expect([starts, stops]).toEqual([2, ['synthetic-run', 'synthetic-run', 'synthetic-run']]);
  pending.resolve(syntheticDashboardPage);
});

for (const exit of ['refresh', 'unmount', 'supersession'] as const) test(`real metadata-only starts remain cleanup-observable after no-token ${exit}`, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-metadata-lifecycle-')));
  const host = dashboardHost(), first = deferred<DashboardPage>(), release = deferred<void>();
  let currentProject = projectId, starts = 0;
  const requests: { kind: string; token?: string }[] = [], stopped: string[] = [];
  const sdk: any = { projects: { get: async ({ projectId: id }: any) => ({ id }) }, threads: {
    list: async ({ archived, projectId: id }: any) => archived ? [] : [{ id: threadId, projectId: id, providerId: 'pi' }],
    get: async () => ({ id: threadId, projectId: currentProject, providerId: 'pi', environmentId }),
  }, environments: { get: async () => ({ id: environmentId, hostId }) } };
  const owner = dashboardHandlers(sdk, async () => JSON.stringify({ [hostId]: root }), { read: input => host.readDashboard(input), stop: token => host.stopDashboard({ token }) });
  const client: DashboardClient = { read: async input => {
    requests.push(input);
    const page = await owner.dashboard(input);
    if (input.kind === 'start' && starts++ === 0) { first.resolve(page); await release.promise; }
    return page;
  }, contributors: input => owner.dashboardContributors(input), stop: async token => { stopped.push(token); return owner.dashboardStop({ token }); } };
  try {
    const slot = render(<DashboardPanel projectId={projectId} client={client} navigate={() => {}} />);
    const old = await first.promise;
    if (exit === 'unmount') slot.unmount();
    else if (exit === 'refresh') {
      fireEvent.click(slot.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(slot.getByRole('button', { name: 'Refresh' }));
      await slot.findByText('No recorded rules in this history.');
    } else {
      currentProject = 'proj_fixture0002';
      slot.rerender(<DashboardPanel projectId={currentProject} client={client} navigate={() => {}} />);
      await slot.findByText('No recorded rules in this history.');
    }
    await act(async () => { release.resolve(); });
    expect(stopped).toEqual([old.run]);
    expect(requests.some(input => input.kind === 'advance' && input.token === old.next)).toBe(false);
    const retained = await owner.dashboard({ kind: 'results', token: old.run });
    expect([retained.state, retained.rows, retained.next, retained.coverage.discovered, retained.coverage.reasons]).toEqual(['limited', [], null, 0, ['acquisition-stopped']]);
    const scans = await Promise.all(Array.from({ length: 4 }, () => host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'd'.repeat(64), recordingDirectory: root })));
    expect(scans.map(chunk => [chunk.state, chunk.reasons])).toEqual([['reading', []], ['reading', []], ['reading', []], ['reading', []]]);
  } finally { release.resolve(); cleanup(); await host.dispose(); await rm(root, { recursive: true, force: true }); }
});

for (const exit of ['unmount', 'supersession'] as const) test(`real pending host starts release capacity after mounted ${exit}`, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-route-lifecycle-')));
  const host = dashboardHost(), entered = deferred<void>(), release = deferred<void>();
  let hostStarts = 0;
  const pages: DashboardPage[] = [];
  const sdk: any = { projects: { get: async ({ projectId: id }: any) => ({ id }) }, threads: {
    list: async ({ archived, projectId: id }: any) => archived ? [] : [{ id: id === projectId ? threadId : 'thr_fixture0002', projectId: id, providerId: 'pi' }],
    get: async ({ threadId: id }: any) => ({ id, projectId: id === threadId ? projectId : 'proj_fixture0002', providerId: 'pi', environmentId }),
  }, environments: { get: async () => ({ id: environmentId, hostId }) } };
  const owner = dashboardHandlers(sdk, async () => JSON.stringify({ [hostId]: root }), {
    read: async input => { const chunk = await host.readDashboard(input); if (input.kind === 'start' && hostStarts++ === 0) { entered.resolve(); await release.promise; } return chunk; },
    stop: token => host.stopDashboard({ token }),
  });
  const client: DashboardClient = { read: async input => { const page = await owner.dashboard(input); pages.push(page); return page; },
    contributors: input => owner.dashboardContributors(input), stop: token => owner.dashboardStop({ token }) };
  try {
    for (let n = 0; n < 300; n++) await mkdir(join(root, n.toString(16).padStart(64, '0')), { mode: 0o700 });
    const slot = render(<DashboardPanel projectId={projectId} client={client} navigate={() => {}} />);
    await entered.promise;
    const old = pages[0]!;
    if (exit === 'unmount') slot.unmount();
    else slot.rerender(<DashboardPanel projectId="proj_fixture0002" client={client} navigate={() => {}} />);
    await act(async () => {});
    expect(hostStarts).toBe(1);
    await act(async () => { release.resolve(); });
    if (exit === 'supersession') {
      await slot.findByText('No recorded rules in this history.');
      expect([pages.at(-1)?.state, pages.at(-1)?.rows, pages.at(-1)?.scope.projectId, pages.at(-1)?.coverage.unknown]).toEqual(['finished', [], 'proj_fixture0002', 1]);
    }
    const retained = await owner.dashboard({ kind: 'results', token: old.run });
    expect([retained.state, retained.rows, retained.next, retained.coverage.reasons]).toEqual(['limited', [], null, ['acquisition-stopped']]);
    const scans = await Promise.all(Array.from({ length: 4 }, () => host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'f'.repeat(64), recordingDirectory: root })));
    expect(scans.map(chunk => chunk.state)).toEqual(['reading', 'reading', 'reading', 'reading']);
  } finally { release.resolve(); cleanup(); await host.dispose(); await rm(root, { recursive: true, force: true }); }
});
