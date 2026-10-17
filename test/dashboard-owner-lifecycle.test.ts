import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dashboardHost } from '../bb-plugin-tenet-status/dashboard-host.js';
import { dashboardHandlers } from '../bb-plugin-tenet-status/dashboard.js';
import { DashboardArchiveReader } from '../src/inspector/dashboard-reader.js';
import type { DashboardPage, HostDashboardChunk } from '../bb-plugin-tenet-status/dashboard-contract.js';

const projectId = 'proj_fixture0001', threadId = 'thr_fixture0001', hostId = 'host_fixture0001', environmentId = 'env_fixture0001';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function fixture(run: (value: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const value = await setup();
  try { await run(value); } finally { value.release.resolve(); await value.host.dispose(); await rm(value.root, { recursive: true, force: true }); }
}
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-owner-lifecycle-')));
  for (let n = 0; n < 300; n++) await mkdir(join(root, n.toString(16).padStart(64, '0')), { mode: 0o700 });
  const host = dashboardHost(), release = deferred<void>(), entered = deferred<HostDashboardChunk>();
  const state = { gate: false, accessible: true, time: 0, failStop: false, directory: root };
  const stops: [string, string][] = [];
  const sdk: any = { projects: { get: async () => { if (!state.accessible) throw Error('revoked'); return { id: projectId, name: 'Synthetic project' }; } }, threads: {
    list: async ({ archived }: any) => archived ? [] : [{ id: threadId, projectId, providerId: 'pi' }],
    get: async () => ({ id: threadId, projectId, providerId: 'pi', environmentId }),
  }, environments: { get: async () => ({ id: environmentId, hostId }) } };
  const owner = dashboardHandlers(sdk, async () => JSON.stringify({ [hostId]: state.directory }), {
    read: async input => { const chunk = await host.readDashboard(input); if (state.gate) { entered.resolve(chunk); await release.promise; } return chunk; },
    stop: async (token, destination) => { stops.push([token, destination]); if (state.failStop) throw Error('cleanup-failed'); return host.stopDashboard({ token }); },
  }, () => state.time);
  return { root, host, owner, state, stops, release, entered };
}
const start = (owner: ReturnType<typeof dashboardHandlers>) => owner.dashboard({ kind: 'start', scope: { kind: 'project', projectId } });
async function resolved(owner: ReturnType<typeof dashboardHandlers>) {
  let page = await start(owner);
  for (let n = 0; n < 3; n++) page = await owner.dashboard({ kind: 'advance', token: page.next! });
  return page;
}
const coverage = { discovered: 1, resolved: 1, processed: 0, unknown: 0, unavailable: 0, unprocessed: 1, partial: 0, omittedInvocations: 0, invocations: 0, capture: 'best-effort', reasons: ['acquisition-stopped'] };

test('owner Stop drains a late real host start, keeps immutable replay, and never folds behind its fence', () => fixture(async f => {
  const page = await resolved(f.owner), saved = structuredClone(page);
  f.state.gate = true;
  const pending = f.owner.dashboard({ kind: 'advance', token: page.next! });
  const chunk = await f.entered.promise;
  assert.equal(chunk.state, 'reading');
  const stopping = f.owner.dashboardStop({ token: page.run });
  f.release.resolve();
  const late = await pending;
  assert.deepEqual(await stopping, { stopped: true });
  assert.deepEqual([late.state, late.rows, late.next, late.coverage], ['limited', [], null, coverage]);
  const results = await f.owner.dashboard({ kind: 'results', token: page.run });
  assert.deepEqual([results.state, results.rows, results.next, results.coverage], ['limited', [], null, coverage]);
  assert.deepEqual(await f.owner.dashboard({ kind: 'advance', token: saved.next! }), late);
  assert.deepEqual(await f.owner.dashboardStop({ token: page.run }), { stopped: true });
  assert.deepEqual(await f.owner.dashboardStop({ token: 'unknown' }), { stopped: true });
  const scans = await Promise.all(Array.from({ length: 4 }, () => f.host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'b'.repeat(64), recordingDirectory: f.root })));
  assert.deepEqual(scans.map(scan => [scan.state, scan.reasons]), Array.from({ length: 4 }, () => ['reading', []]));
}));

for (const cause of ['eviction', 'expiry', 'revocation'] as const) test(`${cause} drains a late real host start without restoring discarded results`, () => fixture(async f => {
  const page = await resolved(f.owner);
  f.state.gate = true;
  const pending = f.owner.dashboard({ kind: 'advance', token: page.next! });
  const chunk = await f.entered.promise;
  assert.equal(chunk.state, 'reading');
  let replacement: Promise<DashboardPage> | undefined;
  if (cause === 'eviction') { for (let n = 0; n < 3; n++) await start(f.owner); replacement = start(f.owner); await new Promise(resolve => setTimeout(resolve, 0)); }
  if (cause === 'expiry') { f.state.time = 600001; replacement = start(f.owner); await new Promise(resolve => setTimeout(resolve, 0)); }
  if (cause === 'revocation') { f.state.accessible = false; f.state.directory = '/synthetic/new-destination'; }
  f.release.resolve();
  const late = await pending;
  assert.deepEqual([late.state, late.rows, late.next], ['restart-required', [], null]);
  await replacement;
  assert.deepEqual(await f.owner.dashboardStop({ token: page.run }), { stopped: true });
  assert.deepEqual((await f.owner.dashboard({ kind: 'results', token: page.run })).rows, []);
  assert.deepEqual(f.stops, [[chunk.next!, hostId]]);
  const scans = await Promise.all(Array.from({ length: 4 }, () => f.host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'c'.repeat(64), recordingDirectory: f.root })));
  assert.deepEqual(scans.map(scan => scan.state), ['reading', 'reading', 'reading', 'reading']);
}));

test('concurrent owner admission retains a closing victim until retry succeeds', () => fixture(async f => {
  const pages: DashboardPage[] = [];
  for (let n = 0; n < 4; n++) { const page = await resolved(f.owner); pages.push(await f.owner.dashboard({ kind: 'advance', token: page.next! })); }
  f.state.failStop = true;
  const replacements = await Promise.allSettled([start(f.owner), start(f.owner), start(f.owner)]);
  assert.deepEqual(replacements.map(result => result.status), ['rejected', 'rejected', 'rejected']);
  assert.deepEqual((await f.host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'd'.repeat(64), recordingDirectory: f.root })).reasons, ['host-run-limit']);
  assert.deepEqual((await f.owner.dashboard({ kind: 'results', token: pages[0]!.run })).rows, []);
  const preserved = await f.owner.dashboard({ kind: 'results', token: pages[1]!.run });
  assert.deepEqual([preserved.state, preserved.coverage.unprocessed, preserved.next !== null], ['reading', 1, true]);
  f.state.failStop = false;
  const replacement = await start(f.owner);
  assert.deepEqual([replacement.state, replacement.coverage.discovered], ['discovering', 0]);
  assert.deepEqual(await f.owner.dashboardStop({ token: pages[0]!.run }), { stopped: true });
  const scan = await f.host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'e'.repeat(64), recordingDirectory: f.root });
  assert.equal(scan.state, 'reading');
  assert.deepEqual((await f.host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'f'.repeat(64), recordingDirectory: f.root })).reasons, ['host-run-limit']);
}));

test('concurrent fifth starts wait for the same counted victim before reserving replacements', () => fixture(async f => {
  const pages: DashboardPage[] = [];
  for (let n = 0; n < 4; n++) { const page = await resolved(f.owner); pages.push(await f.owner.dashboard({ kind: 'advance', token: page.next! })); }
  const close = DashboardArchiveReader.prototype.close, gate = deferred<void>(), entered = deferred<void>();
  let once = false;
  DashboardArchiveReader.prototype.close = async function () { if (!once) { once = true; entered.resolve(); await gate.promise; } return close.call(this); };
  try {
    const completed: DashboardPage[] = [];
    const starts = Array.from({ length: 3 }, () => start(f.owner).then(page => { completed.push(page); return page; }));
    await entered.promise;
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(completed, []);
    const preserved = await f.owner.dashboard({ kind: 'results', token: pages[1]!.run });
    assert.deepEqual([preserved.state, preserved.coverage.unprocessed], ['reading', 1]);
    assert.deepEqual((await f.host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'f'.repeat(64), recordingDirectory: f.root })).reasons, ['host-run-limit']);
    gate.resolve();
    const replacements = await Promise.all(starts);
    assert.deepEqual(replacements.map(page => [page.state, page.coverage.discovered]), [['discovering', 0], ['discovering', 0], ['discovering', 0]]);
    const retained = await f.owner.dashboard({ kind: 'results', token: pages[3]!.run });
    assert.deepEqual([retained.state, retained.coverage.unprocessed], ['reading', 1]);
    assert.deepEqual((await f.owner.dashboard({ kind: 'results', token: pages[2]!.run })).rows, []);
    const scans = await Promise.all(Array.from({ length: 4 }, () => f.host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'e'.repeat(64), recordingDirectory: f.root })));
    assert.deepEqual(scans.map(scan => scan.state), ['reading', 'reading', 'reading', 'limited']);
  } finally { gate.resolve(); DashboardArchiveReader.prototype.close = close; }
}));

test('an owner invocation limit remembers and releases the overflowing nonterminal destination token', () => fixture(async f => {
  let admitted = 0;
  const owner = dashboardHandlers({ projects: { get: async () => ({ id: projectId }) }, threads: {
    list: async ({ archived }: any) => archived ? [] : [{ id: threadId, projectId, providerId: 'pi' }],
    get: async () => ({ id: threadId, projectId, providerId: 'pi', environmentId }),
  }, environments: { get: async () => ({ id: environmentId, hostId }) } } as any, async () => JSON.stringify({ [hostId]: f.root }), {
    read: async () => {
      if (admitted < 10000) {
        const invocations = Math.min(128, 10000 - admitted); admitted += invocations;
        return { state: 'reading', next: `synthetic-${admitted}`, contributions: [], linkedThreads: [], invocations,
          invocationSizes: Array(invocations).fill(0), association: 'pending', omittedThreads: [], omittedInvocations: 0, reasons: [] };
      }
      return { ...await f.host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'a'.repeat(64), recordingDirectory: f.root }),
        invocations: 1, invocationSizes: [0] };
    },
    stop: token => f.host.stopDashboard({ token }),
  });
  let limited = await resolved(owner);
  for (let n = 0; limited.next && n < 80; n++) limited = await owner.dashboard({ kind: 'advance', token: limited.next });
  assert.deepEqual([limited.state, limited.rows, limited.coverage.reasons], ['limited', [], ['invocation-limit']]);
  assert.equal(limited.coverage.invocations, 10000);
  assert.deepEqual(await owner.dashboardStop({ token: limited.run }), { stopped: true });
  const scans = await Promise.all(Array.from({ length: 4 }, () => f.host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'f'.repeat(64), recordingDirectory: f.root })));
  assert.deepEqual(scans.map(scan => scan.state), ['reading', 'reading', 'reading', 'reading']);
}));

test('stopped partial owner results retain immutable replay and revision-bound contributors under fresh authorization', async () => {
  let changed = false;
  const stops: [string, string][] = [];
  const observation = { key: 'a'.repeat(64), preview: 'Synthetic rule', builtin: false, state: 'failed' as const,
    threadId, sessionId: 'b'.repeat(64), callId: 'c'.repeat(64), timestamp: 1, toolName: 'edit' };
  const owner = dashboardHandlers({ projects: { get: async () => ({ id: projectId }) }, threads: {
    list: async ({ archived }: any) => archived ? [] : [{ id: threadId, projectId, providerId: 'pi' }],
    get: async () => ({ id: threadId, projectId, providerId: 'pi', environmentId }),
  }, environments: { get: async () => ({ id: environmentId, hostId }) } } as any, async () => changed ? JSON.stringify({ [hostId]: '/synthetic/changed' }) : '{}', {
    read: async () => ({ state: 'reading', next: 'retained-host-token', contributions: [observation], linkedThreads: [threadId], invocations: 1, invocationSizes: [1], association: 'pending', omittedThreads: [], omittedInvocations: 0, reasons: [] }),
    stop: async (token, host) => { stops.push([token, host]); return { stopped: true }; },
  });
  const resolvedPage = await resolved(owner), token = resolvedPage.next!;
  const page = await owner.dashboard({ kind: 'advance', token }), expected = structuredClone(page);
  assert.deepEqual(page.rows.map(row => [row.preview, row.failed, row.failing]), [['Synthetic rule', 1, 100]]);
  page.rows.length = 0; page.coverage.reasons.push('caller-mutation');
  assert.deepEqual(await owner.dashboardStop({ token: page.run }), { stopped: true });
  assert.deepEqual(await owner.dashboard({ kind: 'advance', token }), expected);
  const stopped = await owner.dashboard({ kind: 'advance', token: expected.next! });
  assert.deepEqual([stopped.state, stopped.revision, stopped.rows, stopped.next, stopped.coverage.reasons], ['limited', expected.revision, expected.rows, null, ['acquisition-stopped']]);
  const request = { token: page.run, rule: observation.key, expectedRevision: expected.revision };
  assert.deepEqual(await owner.dashboardContributors(request), { state: 'ready', items: [{ threadId, projectId, label: threadId, sessionId: observation.sessionId, callId: observation.callId, timestamp: 1, toolName: 'edit' }], next: null });
  changed = true;
  assert.deepEqual([...(await owner.dashboard({ kind: 'advance', token })).rows, ...(await owner.dashboardContributors(request)).items], []);
  assert.deepEqual(await owner.dashboardStop({ token: page.run }), { stopped: true });
  assert.deepEqual(stops, [['retained-host-token', hostId]]);
});

test('Stop after synchronous folding still completes fresh post-authorization and revision bookkeeping', async () => {
  const post = deferred<void>(), releasePost = deferred<void>();
  let hostReturned = false;
  const observation = { key: 'a'.repeat(64), preview: 'Synthetic rule', builtin: false, state: 'failed' as const,
    threadId, sessionId: 'b'.repeat(64), callId: 'c'.repeat(64), timestamp: 1, toolName: 'edit' };
  const owner = dashboardHandlers({ projects: { get: async () => {
    if (hostReturned) { post.resolve(); await releasePost.promise; }
    return { id: projectId };
  } }, threads: { list: async ({ archived }: any) => archived ? [] : [{ id: threadId, projectId, providerId: 'pi' }],
    get: async () => ({ id: threadId, projectId, providerId: 'pi', environmentId }) },
    environments: { get: async () => ({ id: environmentId, hostId }) } } as any, async () => '{}', {
    read: async () => { hostReturned = true; return { state: 'reading', next: 'host-token', contributions: [observation], linkedThreads: [threadId], invocations: 1, invocationSizes: [1], association: 'pending', omittedThreads: [], omittedInvocations: 0, reasons: [] }; },
    stop: async () => ({ stopped: true }),
  });
  const page = await resolved(owner);
  const response = owner.dashboard({ kind: 'advance', token: page.next! });
  await post.promise;
  const stopping = owner.dashboardStop({ token: page.run });
  releasePost.resolve();
  const committed = await response;
  assert.deepEqual(await stopping, { stopped: true });
  assert.deepEqual([committed.state, committed.revision, committed.rows.map(row => [row.failed, row.failing])], ['limited', page.revision + 1, [[1, 100]]]);
  assert.deepEqual(await owner.dashboardContributors({ token: page.run, rule: observation.key, expectedRevision: page.revision }), { state: 'restart-required', items: [], next: null });
  const current = await owner.dashboardContributors({ token: page.run, rule: observation.key, expectedRevision: committed.revision });
  assert.deepEqual(current.items.map(item => [item.callId, item.projectId]), [[observation.callId, projectId]]);
});
