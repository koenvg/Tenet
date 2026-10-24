import { currentDashboardEvidence } from '../test/dashboard-host-fixture.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import plugin from './server.js';
import { dashboardMethods, type ContributorPage, type DashboardPage } from './dashboard-contract.js';
import { dashboardHandlers } from './dashboard.js';
import type { RuleObservation } from '../src/inspector/bb-dashboard.js';

const projectId = 'proj_fixture0001', threadId = 'thr_fixture00001', hostId = 'host_fixture0001';
test('dashboard public RPC starts for the selected project, discovers archived subagents, replays advances and invalidates changed access', async () => {
  const queries: any[] = []; let lists = 0, reads = 0, accessible = true;
  const fake = createFakePluginHost({ sdk: {
    projects: { list: async (args: any) => { lists++; assert.deepEqual(args, { includePersonal: true }); return [{ id: projectId, name: 'Fixture' }] as any; },
      get: async () => { if (!accessible) throw Error('revoked'); return { id: projectId, name: 'Fixture' } as any; } },
    threads: { list: async (args: any) => { queries.push(args); return args.archived ? [{ id: threadId, projectId, providerId: 'pi-subagents', deletedAt: null }] as any : []; },
      get: async () => ({ id: threadId, projectId, providerId: 'pi-subagents', environmentId: 'env_fixture0001', deletedAt: null }) as any },
    environments: { get: async () => ({ id: 'env_fixture0001', hostId }) as any },
  }, experimental_callHostRpc: async call => { if ((call.input as any).kind === 'check') return currentDashboardEvidence(); reads++; return { state: 'finished', next: null, contributions: [], linkedThreads: [threadId], invocations: 1, invocationSizes: [0], association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [] }; } });
  plugin(fake.bb);
  try {
    assert.equal(reads, 0);
    let page = await fake.harness.behavior.callRpc('dashboard', { kind: 'start', scope: { kind: 'project', projectId } }) as DashboardPage;
    for (let i = 0; page.next && i < 30; i++) {
      const input = { kind: 'advance', token: page.next };
      const [a, b] = await Promise.all([fake.harness.behavior.callRpc('dashboard', input), fake.harness.behavior.callRpc('dashboard', input)]);
      assert.deepEqual(a, b); page = a as DashboardPage;
    }
    assert.equal(page.state, 'finished'); assert.equal(lists, 0); assert.equal(reads, 1);
    assert.deepEqual(queries.map(q => [q.includeHidden, q.archived, q.limit]), [[true, false, 50], [true, true, 50]]);
    assert.equal(page.coverage.processed, 1); assert.equal(page.coverage.unknown, 0);
    accessible = false;
    const invalid = await fake.harness.behavior.callRpc('dashboard', { kind: 'results', token: page.run }) as DashboardPage;
    assert.equal(invalid.state, 'restart-required'); assert.deepEqual(invalid.rows, []);
    for (const input of [{ kind: 'start', scope: { kind: 'all-projects' } }, { kind: 'start', scope: { kind: 'all-projects' }, hostId }, { kind: 'advance', token: 'x', recordingDirectory: '/tmp' }])
      await assert.rejects(fake.harness.behavior.callRpc('dashboard', input));
    assert.equal(dashboardMethods.dashboard.input.safeParse({ kind: 'start', scope: { kind: 'all-projects', threadId } }).success, false);
  } finally { await fake.harness.lifecycle.dispose(); }
});

const contribution = (n: number): RuleObservation => ({ key: n.toString(16).padStart(64, '0'),
  preview: 'Synthetic WARN', builtin: false, state: 'failed',
  threadId, sessionId: 'a'.repeat(64), callId: 'b'.repeat(64), timestamp: 1, toolName: 'edit' });
function coordinator(options: { groups?: RuleObservation[][]; unavailable?: boolean; list?: (args: any) => any[] } = {}) {
  let time = 100, directory = '{}'; let placement = 'env_fixture0001'; let providerId = 'pi'; let deletedAt: number | null = null;
  const sdk: any = {
    projects: { list: async () => [{ id: projectId }], get: async () => ({ id: projectId }) },
    threads: { list: async (args: any) => options.list ? options.list(args) : args.archived ? [] : [{ id: threadId, projectId, providerId }],
      get: async ({ threadId: id }: any) => ({ id, projectId, providerId, deletedAt, environmentId: placement, title: 'Synthetic thread' }) },
    environments: { get: async ({ environmentId }: any) => ({ id: environmentId, hostId }) },
  };
  const handlers = dashboardHandlers(sdk, async () => directory, { stop: async () => ({ stopped: true }), read: async input => {
      if (input.kind === 'check') return currentDashboardEvidence();
    const start = input.kind === 'advance' ? Number(input.token) : 0;
    const groups = options.unavailable ? [] : options.groups ?? [[]];
    let end = start, size = 0;
    while (end < groups.length && end - start < 128 && size + groups[end]!.length <= 65) {
      size += groups[end]!.length; end++;
    }
    const batch = groups.slice(start, end), more = end < groups.length;
    return { state: options.unavailable ? 'unavailable' : more ? 'reading' : 'finished', next: more ? String(end) : null,
      contributions: batch.flat(), linkedThreads: options.unavailable ? [] : [threadId], invocationSizes: batch.map(group => group.length),
      invocations: batch.length, association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [] };
  } }, () => time);
  return { handlers, expire: () => { time += 600001; }, change: (cause: string) => {
    if (cause === 'directory') directory = JSON.stringify({ [hostId]: '/synthetic/new-archive' });
    if (cause === 'placement') placement = 'env_fixture0002';
    if (cause === 'provider') providerId = 'codex';
    if (cause === 'deletion') deletedAt = 1;
  } };
}
async function finish(handlers: ReturnType<typeof dashboardHandlers>) {
  let page = await handlers.dashboard({ kind: 'start', scope: { kind: 'project', projectId } });
  const first = page.next!; let replay: DashboardPage | undefined;
  for (let n = 0; page.next && n < 1000; n++) {
    page = await handlers.dashboard({ kind: 'advance', token: page.next }); replay ??= page;
  }
  assert.equal(page.next, null);
  assert.deepEqual(await handlers.dashboard({ kind: 'advance', token: first }), replay);
  return page;
}
test('dashboard result and contributor pages are 50-bounded and expire without leaking old aggregates', async () => {
  const contributions = Array.from({ length: 60 }, (_, n) => contribution(n));
  const c = coordinator({ groups: [[...contributions, contributions[0]!]] });
  const page = await finish(c.handlers);
  assert.equal(page.rows.length, 50); assert.ok(page.rowsNext);
  assert.equal(page.rows.every(r => r.failed === 1), true);
  const next = await c.handlers.dashboard({ kind: 'results', token: page.run, cursor: page.rowsNext! });
  assert.equal(next.rows.length, 10); assert.equal(next.rowsNext, null);
  const calls = await c.handlers.dashboardContributors({ token: page.run, expectedRevision: page.revision, rule: contributions[0]!.key });
  assert.deepEqual(calls.items.map(c => [c.threadId, c.projectId, c.sessionId, c.callId]), [[threadId, projectId, 'a'.repeat(64), 'b'.repeat(64)]]);
  await assert.rejects(c.handlers.dashboardContributors({ token: page.run, expectedRevision: page.revision, rule: contributions[0]!.key, cursor: page.rowsNext! }));
  c.expire();
  assert.equal((await c.handlers.dashboardContributors({ token: page.run, expectedRevision: page.revision, rule: contributions[0]!.key })).state, 'restart-required');
  assert.deepEqual((await c.handlers.dashboard({ kind: 'results', token: page.run })).rows, []);
  const callsCoordinator = coordinator({ groups: Array.from({ length: 60 }, (_, n) => [{ ...contribution(1), callId: n.toString(16).padStart(64, '0') }]) });
  const callsRun = await finish(callsCoordinator.handlers);
  assert.equal(callsRun.rows[0]!.failed, 60); assert.equal(callsRun.rows[0]!.threads, 1);
  const firstCalls = await callsCoordinator.handlers.dashboardContributors({ token: callsRun.run, expectedRevision: callsRun.revision, rule: contribution(1).key });
  assert.equal(firstCalls.items.length, 50); assert.ok(firstCalls.next);
  const laterCalls = await callsCoordinator.handlers.dashboardContributors({ token: callsRun.run, expectedRevision: callsRun.revision, rule: contribution(1).key, cursor: firstCalls.next! });
  assert.equal(laterCalls.items.length, 10); assert.equal(laterCalls.next, null);
});
test('repeated backward failure reads preserve three pages and the selected nonfirst rules page', async () => {
  const failures = (key: number, count: number) => Array.from({ length: count }, (_, n) => ({
    ...contribution(key), callId: n.toString(16).padStart(64, '0'),
  }));
  const c = coordinator({ groups: Array.from({ length: 102 }, (_, call) => Array.from({ length: call === 101 ? 50 : 51 }, (_, rule) => ({
    ...contribution(rule), callId: call.toString(16).padStart(64, '0'),
  }))) });
  const page = await finish(c.handlers);
  assert.ok(page.rowsNext);
  const selected = await c.handlers.dashboard({ kind: 'results', token: page.run, cursor: page.rowsNext });
  assert.deepEqual(selected.rows.map(row => [row.key, row.failed]), [[contribution(50).key, 101]]);
  const request = { token: page.run, expectedRevision: page.revision, rule: contribution(50).key };
  const first = await c.handlers.dashboardContributors(request);
  assert.equal(first.items.length, 50); assert.ok(first.next);
  const nextTokens = new Set<string>();
  for (let round = 0; round < 140; round++) {
    const second = await c.handlers.dashboardContributors({ ...request, cursor: first.next });
    assert.equal(second.state, 'ready'); assert.ok(second.next);
    assert.deepEqual(second.items.map(item => item.callId), failures(50, 100).slice(50).map(item => item.callId));
    nextTokens.add(second.next);
    const last = await c.handlers.dashboardContributors({ ...request, cursor: second.next });
    assert.deepEqual(last.items.map(item => item.callId), [(100).toString(16).padStart(64, '0')]);
    assert.equal(last.next, null);
  }
  assert.equal(nextTokens.size, 1);
  assert.deepEqual(await c.handlers.dashboardContributors(request), first);
  assert.deepEqual(await c.handlers.dashboard({ kind: 'results', token: page.run, cursor: page.rowsNext }), selected);
  c.change('directory');
  assert.deepEqual(await c.handlers.dashboardContributors({ ...request, cursor: first.next }), { state: 'restart-required', items: [], next: null });
});
test('128 retained failure cursors do not evict rule results and still enforce a bounded failure history', async () => {
  const observations = Array.from({ length: 6451 }, (_, n) => ({ ...contribution(0), callId: n.toString(16).padStart(64, '0') }));
  const c = coordinator({ groups: [...observations.map(value => [value]), Array.from({ length: 60 }, (_, n) => contribution(n + 1))] });
  const page = await finish(c.handlers);
  assert.ok(page.rowsNext);
  const selected = await c.handlers.dashboard({ kind: 'results', token: page.run, cursor: page.rowsNext });
  assert.equal(selected.rows.length, 11);
  const request = { token: page.run, expectedRevision: page.revision, rule: contribution(0).key };
  const first = await c.handlers.dashboardContributors(request);
  assert.ok(first.next);
  let current: ContributorPage = first;
  for (let index = 1; index < 128; index++) {
    assert.ok(current.next);
    current = await c.handlers.dashboardContributors({ ...request, cursor: current.next });
    assert.equal(current.items.length, 50);
  }
  assert.ok(current.next);
  assert.deepEqual(await c.handlers.dashboard({ kind: 'results', token: page.run, cursor: page.rowsNext }), selected);
  const second = await c.handlers.dashboardContributors({ ...request, cursor: first.next });
  assert.deepEqual(second.items.map(item => item.callId), observations.slice(50, 100).map(item => item.callId));
  const penultimate = await c.handlers.dashboardContributors({ ...request, cursor: current.next });
  assert.equal(penultimate.items.length, 50); assert.ok(penultimate.next);
  const last = await c.handlers.dashboardContributors({ ...request, cursor: penultimate.next });
  assert.deepEqual(last.items.map(item => item.callId), [observations[6450]!.callId]);
  assert.equal(last.next, null);
  await assert.rejects(c.handlers.dashboardContributors({ ...request, cursor: first.next }), /stale-dashboard-page/);
  assert.deepEqual(await c.handlers.dashboard({ kind: 'results', token: page.run, cursor: page.rowsNext }), selected);
});
for (const cause of ['directory', 'placement', 'provider', 'deletion']) test(`dashboard invalidates aggregates on ${cause} changes`, async () => {
  const c = coordinator({ groups: [[contribution(1)]] }); const page = await finish(c.handlers);
  assert.equal(page.rows[0]!.failed, 1); c.change(cause);
  const invalid = await c.handlers.dashboard({ kind: 'results', token: page.run });
  assert.equal(invalid.state, 'restart-required'); assert.deepEqual(invalid.rows, []);
});
test('dashboard invocation overflow and unavailable destinations are coverage, not violations', async () => {
  const overflow = await finish(coordinator({ groups: [...Array.from({ length: 10000 }, () => []), [contribution(1)]] }).handlers);
  assert.equal(overflow.state, 'limited'); assert.equal(overflow.coverage.invocations, 10000);
  assert.deepEqual(overflow.rows, []); assert.deepEqual(overflow.coverage.reasons, ['invocation-limit']);
  const unavailable = await finish(coordinator({ unavailable: true }).handlers);
  assert.equal(unavailable.coverage.unavailable, 1); assert.equal(unavailable.coverage.unknown, 0); assert.deepEqual(unavailable.rows, []);
});
test('dashboard retained thread cap is visible and empty filtered metadata windows continue', async () => {
  const c = coordinator({ list: args => args.archived ? [] : Array.from({ length: 50 }, (_, n) => ({
    id: `thr_${String(args.offset + n).padStart(12, '0')}`, projectId, providerId: args.offset === 0 ? 'codex' : 'pi-subagents' })) });
  const page = await finish(c.handlers);
  assert.equal(page.state, 'limited'); assert.equal(page.coverage.discovered, 128); assert.ok(page.coverage.reasons.includes('thread-limit'));
});

test('an in-flight host response cannot restore project aggregates after access is revoked', async () => {
  let accessible = true;
  let release!: () => void;
  let dispatched!: () => void;
  const waiting = new Promise<void>(resolve => { dispatched = resolve; });
  const sdk: any = {
    projects: { get: async () => { if (!accessible) throw Error('revoked'); return { id: projectId }; } },
    threads: { list: async (args: any) => args.archived ? [] : [{ id: threadId, projectId, providerId: 'pi' }],
      get: async () => ({ id: threadId, projectId, providerId: 'pi', environmentId: 'env_fixture0001' }) },
    environments: { get: async () => ({ id: 'env_fixture0001', hostId }) },
  };
  const handlers = dashboardHandlers(sdk, async () => '{}', { stop: async () => ({ stopped: true }), read: async input => {
    if (input.kind === 'check') return currentDashboardEvidence();
    dispatched(); await new Promise<void>(resolve => { release = resolve; });
    return { state: 'finished', next: null, contributions: [contribution(1)], linkedThreads: [threadId], invocations: 1, invocationSizes: [1], association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [] };
  } });
  let page = await handlers.dashboard({ kind: 'start', scope: { kind: 'project', projectId } });
  for (let n = 0; n < 3; n++) page = await handlers.dashboard({ kind: 'advance', token: page.next! });
  const response = handlers.dashboard({ kind: 'advance', token: page.next! });
  await waiting; accessible = false; release();
  const invalid = await response;
  assert.equal(invalid.state, 'restart-required'); assert.deepEqual(invalid.rows, []);
  assert.equal((await handlers.dashboardContributors({ token: page.run, expectedRevision: page.revision, rule: contribution(1).key })).state, 'restart-required');
});

for (const initialFailures of [1, 51]) test(`public failure reads bind ${initialFailures} displayed failures and stale paging to the summary revision after Cancel`, async () => {
  let release!: () => void;
  let dispatched!: () => void;
  const waiting = new Promise<void>(resolve => { dispatched = resolve; });
  let hostReads = 0;
  const observations = Array.from({ length: initialFailures }, (_, n) => ({ ...contribution(1), callId: n.toString(16).padStart(64, '0') }));
  const fake = createFakePluginHost({ sdk: {
    projects: { get: async () => ({ id: projectId, name: 'Fixture' }) as any },
    threads: { list: async (args: any) => args.archived ? [] : [{ id: threadId, projectId, providerId: 'pi' }] as any,
      get: async () => ({ id: threadId, projectId, providerId: 'pi', environmentId: 'env_fixture0001' }) as any },
    environments: { get: async () => ({ id: 'env_fixture0001', hostId }) as any },
  }, experimental_callHostRpc: async call => {
    if ((call.input as any).kind === 'check') return currentDashboardEvidence();
    if (hostReads++ === 0) return { state: 'reading', next: 'host-continuation', contributions: observations, linkedThreads: [threadId], invocations: initialFailures, invocationSizes: observations.map(() => 1), association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [] };
    dispatched(); await new Promise<void>(resolve => { release = resolve; });
    return { state: 'finished', next: null, contributions: [{ ...contribution(1), callId: 'f'.repeat(64) }], linkedThreads: [threadId], invocations: 1, invocationSizes: [1], association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [] };
  } });
  plugin(fake.bb);
  const rpc = async (input: unknown) => await fake.harness.behavior.callRpc('dashboardContributors', input) as ContributorPage;
  try {
    let displayed = await fake.harness.behavior.callRpc('dashboard', { kind: 'start', scope: { kind: 'project', projectId } }) as DashboardPage;
    for (let n = 0; n < 4; n++) displayed = await fake.harness.behavior.callRpc('dashboard', { kind: 'advance', token: displayed.next! }) as DashboardPage;
    assert.deepEqual(displayed.rows.map(r => [r.failed, r.passing, r.failing]), [[initialFailures, 0, 100]]);
    const selection = { token: displayed.run, rule: contribution(1).key, expectedRevision: displayed.revision };
    const first = await rpc(selection);
    assert.equal(first.state, 'ready'); assert.equal(first.items.length, Math.min(initialFailures, 50));
    if (initialFailures === 51) {
      const last = await rpc({ ...selection, cursor: first.next });
      assert.equal(last.items.length, 1); assert.equal(last.next, null);
    }
    const browser = new AbortController();
    const continuation = fake.harness.behavior.callRpc('dashboard', { kind: 'advance', token: displayed.next! });
    await waiting; browser.abort();
    // Browser cancellation cannot recall work already dispatched to the owner.
    const stale = rpc({ ...selection, ...(first.next ? { cursor: first.next } : {}) });
    release();
    const settled = await continuation as DashboardPage;
    assert.equal(browser.signal.aborted, true);
    assert.deepEqual(await stale, { state: 'restart-required', items: [], next: null });
    assert.equal(displayed.rows[0]!.failed, initialFailures);
    assert.equal(settled.rows[0]!.failed, initialFailures + 1);
    assert.equal(settled.revision, displayed.revision + 1);
    if (first.next) await assert.rejects(rpc({ ...selection, expectedRevision: settled.revision, cursor: first.next }));
    assert.deepEqual(await rpc({ ...selection, expectedRevision: settled.revision + 1 }), { state: 'restart-required', items: [], next: null });
    const current = await rpc({ ...selection, expectedRevision: settled.revision });
    const items = [...current.items];
    if (current.next) items.push(...(await rpc({ ...selection, expectedRevision: settled.revision, cursor: current.next })).items);
    assert.equal(current.state, 'ready'); assert.equal(items.length, settled.rows[0]!.failed);
    assert.deepEqual(items.map(item => item.callId).sort(), [...observations.map(o => o.callId), 'f'.repeat(64)].sort());
    for (const expectedRevision of [undefined, -1, 1.5, '4']) await assert.rejects(rpc({ ...selection, expectedRevision }));
    await assert.rejects(rpc({ ...selection, hostId }));
  } finally { release?.(); await fake.harness.lifecycle.dispose(); }
});

test('failure request requires a strict nonnegative integer expected revision', () => {
  const input = { token: 'run', rule: contribution(1).key };
  for (const expectedRevision of [undefined, -1, 0.5, '0', null])
    assert.equal(dashboardMethods.dashboardContributors.input.safeParse({ ...input, expectedRevision }).success, false);
  assert.deepEqual(dashboardMethods.dashboardContributors.input.parse({ ...input, expectedRevision: 0 }), { ...input, expectedRevision: 0 });
  assert.equal(dashboardMethods.dashboardContributors.input.safeParse({ ...input, expectedRevision: 0, revision: 0 }).success, false);
});

test('public Stop is token-only and idempotent after revocation, and routes only to the original retained host', async () => {
  let revoked = false;
  const calls: { method: string; input: unknown; hostId: string }[] = [];
  const fake = createFakePluginHost({ sdk: {
    projects: { get: async () => { if (revoked) throw Error('revoked'); return { id: projectId } as any; } },
    threads: { list: async (args: any) => args.archived ? [] : [{ id: threadId, projectId, providerId: 'pi' }] as any,
      get: async () => ({ id: threadId, projectId, providerId: 'pi', environmentId: 'env_fixture0001' }) as any },
    environments: { get: async () => ({ id: 'env_fixture0001', hostId: revoked ? 'host_changed0001' : hostId }) as any },
  }, experimental_callHostRpc: async call => {
    if ((call.input as any).kind === 'check') return currentDashboardEvidence();
    calls.push({ method: call.method, input: call.input, hostId: call.hostId });
    return call.method === 'stopDashboard' ? { stopped: true } : { state: 'reading', next: 'retained-host-continuation', contributions: [contribution(1)], linkedThreads: [threadId], invocations: 1, invocationSizes: [1], association: 'pending', omittedThreads: [], omittedInvocations: 0, reasons: [] };
  } });
  plugin(fake.bb);
  try {
    let page = await fake.harness.behavior.callRpc('dashboard', { kind: 'start', scope: { kind: 'project', projectId } }) as DashboardPage;
    for (let n = 0; n < 4; n++) page = await fake.harness.behavior.callRpc('dashboard', { kind: 'advance', token: page.next! }) as DashboardPage;
    assert.deepEqual(page.rows.map(row => [row.failed, row.failing]), [[1, 100]]);
    revoked = true;
    for (const token of ['unknown', 'retained-host-continuation', page.run, page.run])
      assert.deepEqual(await fake.harness.behavior.callRpc('dashboardStop', { token }), { stopped: true });
    assert.deepEqual(calls.filter(call => call.method === 'stopDashboard'), [{ method: 'stopDashboard', input: { token: 'retained-host-continuation' }, hostId }]);
    const invalid = await fake.harness.behavior.callRpc('dashboard', { kind: 'results', token: page.run }) as DashboardPage;
    assert.deepEqual([invalid.state, invalid.rows], ['restart-required', []]);
    for (const input of [{ token: page.run, hostId }, { token: page.run, threads: [threadId] }, { token: page.run, recordingDirectory: '/tmp' }, { token: '' }, {}])
      await assert.rejects(fake.harness.behavior.callRpc('dashboardStop', input));
  } finally { await fake.harness.lifecycle.dispose(); }
});
