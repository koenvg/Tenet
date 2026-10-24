import { currentDashboardEvidence } from '../test/dashboard-host-fixture.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { dashboardHandlers } from './dashboard.js';
import type { DashboardPage, HostDashboardRequest } from './dashboard-contract.js';

const projectId = 'proj_resolution01', hostId = 'host_resolution01', rule = 'a'.repeat(64), sessionId = 'b'.repeat(64);
const ids = Array.from({ length: 16 }, (_, n) => `thr_resolution${String(n).padStart(2, '0')}`);
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function gate() { return { entered: deferred(), release: deferred() }; }

function fixture(count = 9, environmentCount = 1, gatedIds = ids.slice(0, 8), gatedRead = 1) {
  const threads = ids.slice(0, count).map((id, n) => ({ id, projectId, providerId: 'pi',
    environmentId: `env_resolution${String(n % environmentCount).padStart(2, '0')}`, title: `Synthetic ${n}` }));
  const environments = Array.from({ length: environmentCount }, (_, n) => ({ id: `env_resolution${String(n).padStart(2, '0')}`, hostId }));
  const gates = new Map(gatedIds.map(id => [id, gate()]));
  const reads = new Map<string, number>();
  const calls = { project: 0, settings: 0, threads: [] as { id: string; read: number }[],
    returned: [] as string[], environments: [] as string[], hosts: [] as HostDashboardRequest[] };
  const state = { time: 0, missing: '', rejected: '', environmentAvailable: true,
    heldEnvironment: '', environmentGate: gate() };
  const owner = dashboardHandlers({
    projects: { get: async () => { calls.project++; return { id: projectId, name: 'Synthetic project' }; } },
    threads: {
      list: async ({ archived }: { archived: boolean }) => archived ? [] : threads,
      get: async ({ threadId }: { threadId: string }) => {
        const read = (reads.get(threadId) ?? 0) + 1; reads.set(threadId, read);
        calls.threads.push({ id: threadId, read });
        const held = gates.get(threadId);
        if (held && read === gatedRead) { held.entered.resolve(); await held.release.promise; }
        if (read === 1) calls.returned.push(threadId);
        if (threadId === state.rejected) throw Error('thread-unavailable');
        return threadId === state.missing ? null : threads.find(thread => thread.id === threadId);
      },
    },
    environments: { get: async ({ environmentId }: { environmentId: string }) => {
      calls.environments.push(environmentId);
      if (environmentId === state.heldEnvironment) {
        state.environmentGate.entered.resolve(); await state.environmentGate.release.promise;
      }
      if (!state.environmentAvailable) throw Error('environment-unavailable');
      return environments.find(environment => environment.id === environmentId);
    } },
  } as any, async () => { calls.settings++; return '{}'; }, {
    stop: async () => ({ stopped: true }),
    read: async (input, host) => {
      if (input.kind === 'check') return currentDashboardEvidence();
      assert.equal(host, hostId); assert.equal(input.kind, 'start'); calls.hosts.push(input);
      if (input.kind !== 'start') throw Error('unexpected-host-continuation');
      return { state: 'finished', next: null, contributions: input.threads.map(threadId => ({
        key: rule, preview: 'Synthetic rule', builtin: false, state: 'failed', threadId, sessionId,
        callId: ids.indexOf(threadId).toString(16).padStart(64, '0'), timestamp: 1, toolName: 'edit',
      })), linkedThreads: input.threads, invocations: input.threads.length,
      invocationSizes: input.threads.map(() => 1), association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [] };
    },
  }, () => state.time);
  const start = () => owner.dashboard({ kind: 'start', scope: { kind: 'project', projectId } });
  const discover = async () => {
    let page = await start();
    for (let n = 0; n < 2; n++) page = await owner.dashboard({ kind: 'advance', token: page.next! });
    assert.deepEqual([page.state, page.coverage.discovered, page.coverage.resolved], ['reading', count, 0]);
    return page;
  };
  const release = () => { for (const held of gates.values()) held.release.resolve(); state.environmentGate.release.resolve(); };
  const snapshot = () => ({ project: calls.project, settings: calls.settings, threads: calls.threads.length, environments: calls.environments.length });
  return { owner, start, discover, gates, calls, state, environments, release, snapshot };
}

const unresolved = { discovered: 9, resolved: 0, processed: 0, unknown: 0, unavailable: 0, unprocessed: 9,
  partial: 0, omittedInvocations: 0, invocations: 0, capture: 'best-effort', reasons: [] };
const finished = { discovered: 9, resolved: 9, processed: 9, unknown: 0, unavailable: 0, unprocessed: 0,
  partial: 0, omittedInvocations: 0, invocations: 9, capture: 'best-effort', reasons: [] };
const expectedRows = [{ key: rule, preview: 'Synthetic rule', builtin: false, passed: 0, failed: 9,
  unscored: 0, passing: 0, failing: 100, threads: 9 }];

for (const environmentCount of [1, 9]) test(`resolution admits eight, commits reverse replies in discovery order, and refreshes ${environmentCount} environments`, async () => {
  const f = fixture(9, environmentCount);
  const initial = await f.discover();
  const token = initial.next!;
  const pending = f.owner.dashboard({ kind: 'advance', token });
  try {
    await f.gates.get(ids[0]!)!.entered.promise;
    assert.deepEqual(f.calls.threads, ids.slice(0, 8).map(id => ({ id, read: 1 })));
    assert.deepEqual(f.calls.returned, []);
    for (const id of ids.slice(0, 8).reverse()) { f.gates.get(id)!.release.resolve(); await setImmediate(); }
    let page = await pending;
    assert.deepEqual(f.calls.returned, ids.slice(0, 8).reverse());
    assert.deepEqual(page.coverage, { ...unresolved, resolved: 8 });
    assert.deepEqual(page.rows, []);
    assert.deepEqual(f.calls.threads, [...ids.slice(0, 8).map(id => ({ id, read: 1 })), ...ids.slice(0, 8).map(id => ({ id, read: 2 }))]);
    assert.deepEqual(f.calls.environments.slice(0, Math.min(8, environmentCount)),
      f.environments.slice(0, 8).map(environment => environment.id).reverse());
    assert.deepEqual(f.calls.environments.slice(Math.min(8, environmentCount)), f.environments.slice(0, 8).map(environment => environment.id));
    assert.equal(f.calls.hosts.length, 0);
    page = await f.owner.dashboard({ kind: 'advance', token: page.next! });
    assert.deepEqual(page.coverage, { ...unresolved, resolved: 9 });
    page = await f.owner.dashboard({ kind: 'advance', token: page.next! });
    assert.equal(f.calls.hosts.length, 1);
    const hostRequest = f.calls.hosts[0]!;
    assert.equal(hostRequest.kind, 'start');
    if (hostRequest.kind === 'start') assert.deepEqual(hostRequest.threads, ids.slice(0, 9));
    assert.deepEqual(page.rows, expectedRows);
    assert.deepEqual(page.coverage, finished);
    const finalToken = page.next!;
    page = await f.owner.dashboard({ kind: 'advance', token: finalToken });
    assert.deepEqual([page.state, page.next, page.coverage, page.rows], ['finished', null, finished, expectedRows]);
    for (const read of ['replay', 'results', 'contributors'] as const) {
      const before = f.snapshot();
      const result = read === 'contributors'
        ? await f.owner.dashboardContributors({ token: page.run, expectedRevision: page.revision, rule })
        : await f.owner.dashboard(read === 'replay' ? { kind: 'advance', token: finalToken } : { kind: 'results', token: page.run });
      if ('items' in result) assert.deepEqual(result, { state: 'ready', next: null, items: [
        { threadId: ids[0], projectId, label: 'Synthetic 0', sessionId, callId: '0'.repeat(64), timestamp: 1, toolName: 'edit' },
        { threadId: ids[1], projectId, label: 'Synthetic 1', sessionId, callId: '0'.repeat(63) + '1', timestamp: 1, toolName: 'edit' },
        { threadId: ids[2], projectId, label: 'Synthetic 2', sessionId, callId: '0'.repeat(63) + '2', timestamp: 1, toolName: 'edit' },
        { threadId: ids[3], projectId, label: 'Synthetic 3', sessionId, callId: '0'.repeat(63) + '3', timestamp: 1, toolName: 'edit' },
        { threadId: ids[4], projectId, label: 'Synthetic 4', sessionId, callId: '0'.repeat(63) + '4', timestamp: 1, toolName: 'edit' },
        { threadId: ids[5], projectId, label: 'Synthetic 5', sessionId, callId: '0'.repeat(63) + '5', timestamp: 1, toolName: 'edit' },
        { threadId: ids[6], projectId, label: 'Synthetic 6', sessionId, callId: '0'.repeat(63) + '6', timestamp: 1, toolName: 'edit' },
        { threadId: ids[7], projectId, label: 'Synthetic 7', sessionId, callId: '0'.repeat(63) + '7', timestamp: 1, toolName: 'edit' },
        { threadId: ids[8], projectId, label: 'Synthetic 8', sessionId, callId: '0'.repeat(63) + '8', timestamp: 1, toolName: 'edit' },
      ] });
      else assert.deepEqual([result.state, result.rows, result.coverage], ['finished', expectedRows, finished]);
      assert.deepEqual(f.snapshot(), { project: before.project + 2, settings: before.settings + 2,
        threads: before.threads + 18, environments: before.environments + 2 * environmentCount });
    }
  } finally { f.release(); await pending; await f.owner.dashboardStop({ token: initial.run }); }
});

test('null and rejected resolutions remain unavailable while successful siblings are acquired', async () => {
  const f = fixture(9, 1, []); f.state.missing = ids[0]!; f.state.rejected = ids[1]!;
  let page = await f.discover();
  try {
    for (let n = 0; n < 4; n++) page = await f.owner.dashboard({ kind: 'advance', token: page.next! });
    assert.deepEqual([page.state, page.next, page.coverage, page.rows], ['finished', null,
      { ...finished, resolved: 7, processed: 7, unavailable: 2, invocations: 7 }, [{ ...expectedRows[0], failed: 7, threads: 7 }]]);
    assert.equal(f.calls.hosts.length, 1);
    const request = f.calls.hosts[0]!;
    assert.equal(request.kind, 'start');
    if (request.kind === 'start') assert.deepEqual(request.threads, ids.slice(2, 9));
  } finally { await f.owner.dashboardStop({ token: page.run }); }
});

test('Stop drains every admitted resolution chain and discards the entire unfinished batch', async () => {
  const f = fixture(16, 16, ids.slice(8));
  let page = await f.discover();
  page = await f.owner.dashboard({ kind: 'advance', token: page.next! });
  assert.deepEqual(page.coverage, { ...unresolved, discovered: 16, resolved: 8, unprocessed: 16 });
  f.state.heldEnvironment = 'env_resolution15';
  const token = page.next!, pending = f.owner.dashboard({ kind: 'advance', token });
  let settled = false;
  let stopping: Promise<unknown> | undefined;
  try {
    await f.gates.get(ids[8]!)!.entered.promise;
    assert.deepEqual(f.calls.threads.filter(call => call.read === 1).map(call => call.id), ids);
    stopping = f.owner.dashboardStop({ token: page.run }).then(result => { settled = true; return result; });
    for (const id of ids.slice(8, 15)) f.gates.get(id)!.release.resolve();
    await setImmediate(); assert.equal(settled, false);
    f.gates.get(ids[15]!)!.release.resolve();
    await f.state.environmentGate.entered.promise;
    await setImmediate(); assert.equal(settled, false);
    f.state.environmentGate.release.resolve();
    const late = await pending;
    assert.deepEqual(await stopping, { stopped: true });
    const coverage = { ...unresolved, discovered: 16, resolved: 8, unprocessed: 16, reasons: ['acquisition-stopped'] };
    assert.deepEqual([late.state, late.next, late.rows, late.coverage], ['limited', null, [], coverage]);
    assert.deepEqual(await f.owner.dashboard({ kind: 'advance', token }), late);
    const results = await f.owner.dashboard({ kind: 'results', token: page.run });
    assert.deepEqual([results.state, results.next, results.rows, results.coverage], ['limited', null, [], coverage]);
    assert.deepEqual(await f.owner.dashboardStop({ token: page.run }), { stopped: true });
    assert.deepEqual(f.calls.threads.filter(call => ids.slice(8).includes(call.id)), ids.slice(8).map(id => ({ id, read: 1 })));
    assert.deepEqual(f.calls.hosts, []);
  } finally { f.release(); await pending; await stopping; await f.owner.dashboardStop({ token: page.run }); }
});

for (const cause of ['expiry', 'eviction'] as const) test(`${cause} discards a gated resolution batch without host acquisition or restored results`, async () => {
  const f = fixture();
  const page = await f.discover(), extras: DashboardPage[] = [];
  if (cause === 'eviction') for (let n = 0; n < 3; n++) extras.push(await f.start());
  const token = page.next!, pending = f.owner.dashboard({ kind: 'advance', token });
  let replacement: Promise<DashboardPage> | undefined;
  try {
    await f.gates.get(ids[0]!)!.entered.promise;
    assert.deepEqual(f.calls.threads, ids.slice(0, 8).map(id => ({ id, read: 1 })));
    if (cause === 'expiry') f.state.time = 600001;
    replacement = f.start();
    await setImmediate();
    f.release();
    const late = await pending;
    extras.push(await replacement);
    assert.deepEqual([late.state, late.rows, late.next, late.coverage], ['restart-required', [], null,
      { ...unresolved, discovered: 0, unprocessed: 0, reasons: ['scope-access-or-run-changed'] }]);
    const replay = await f.owner.dashboard({ kind: 'advance', token });
    const results = await f.owner.dashboard({ kind: 'results', token: page.run });
    for (const result of [replay, results]) assert.deepEqual([result.state, result.rows, result.next], ['restart-required', [], null]);
    assert.deepEqual(await f.owner.dashboardContributors({ token: page.run, expectedRevision: late.revision, rule }),
      { state: 'restart-required', items: [], next: null });
    assert.deepEqual(f.calls.threads, ids.slice(0, 8).map(id => ({ id, read: 1 })));
    assert.deepEqual(f.calls.hosts, []);
  } finally {
    f.release(); await pending; await replacement;
    await f.owner.dashboardStop({ token: page.run });
    for (const extra of extras) await f.owner.dashboardStop({ token: extra.run });
  }
});

for (const cause of ['environment access revoked', 'host placement changed'] as const) test(`fresh post-resolution validation rejects ${cause}`, async () => {
  const f = fixture(9, 1, ids.slice(0, 8), 2);
  const page = await f.discover(), token = page.next!;
  const pending = f.owner.dashboard({ kind: 'advance', token });
  try {
    await f.gates.get(ids[7]!)!.entered.promise;
    if (cause === 'environment access revoked') f.state.environmentAvailable = false;
    else f.environments[0]!.hostId = 'host_other00001';
    f.release();
    const late = await pending;
    assert.deepEqual([late.state, late.rows, late.next], ['restart-required', [], null]);
    for (const result of [await f.owner.dashboard({ kind: 'advance', token }), await f.owner.dashboard({ kind: 'results', token: page.run })])
      assert.deepEqual([result.state, result.rows, result.next], ['restart-required', [], null]);
    assert.deepEqual(await f.owner.dashboardContributors({ token: page.run, expectedRevision: late.revision, rule }),
      { state: 'restart-required', items: [], next: null });
    assert.deepEqual(f.calls.hosts, []);
  } finally { f.release(); await pending; await f.owner.dashboardStop({ token: page.run }); }
});
