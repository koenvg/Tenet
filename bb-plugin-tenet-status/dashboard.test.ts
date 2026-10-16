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
  }, experimental_callHostRpc: async () => { reads++; return { state: 'finished', next: null, contributions: [], linkedThreads: [threadId], invocations: 1, association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [] }; } });
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
function coordinator(options: { contributions?: RuleObservation[]; invocations?: number; unavailable?: boolean; list?: (args: any) => any[] } = {}) {
  let time = 100, directory = '{}'; let placement = 'env_fixture0001'; let providerId = 'pi'; let deletedAt: number | null = null;
  const sdk: any = {
    projects: { list: async () => [{ id: projectId }], get: async () => ({ id: projectId }) },
    threads: { list: async (args: any) => options.list ? options.list(args) : args.archived ? [] : [{ id: threadId, projectId, providerId }],
      get: async ({ threadId: id }: any) => ({ id, projectId, providerId, deletedAt, environmentId: placement, title: 'Synthetic thread' }) },
    environments: { get: async ({ environmentId }: any) => ({ id: environmentId, hostId }) },
  };
  const handlers = dashboardHandlers(sdk, async () => directory, async () => ({ state: options.unavailable ? 'unavailable' : 'finished', next: null,
    contributions: options.contributions ?? [], linkedThreads: options.unavailable ? [] : [threadId], invocations: options.invocations ?? 1, association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [] }), () => time);
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
  const c = coordinator({ contributions: [...contributions, contributions[0]!] });
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
  const callsCoordinator = coordinator({ contributions: Array.from({ length: 60 }, (_, n) => ({ ...contribution(1), callId: n.toString(16).padStart(64, '0') })) });
  const callsRun = await finish(callsCoordinator.handlers);
  assert.equal(callsRun.rows[0]!.failed, 60); assert.equal(callsRun.rows[0]!.threads, 1);
  const firstCalls = await callsCoordinator.handlers.dashboardContributors({ token: callsRun.run, expectedRevision: callsRun.revision, rule: contribution(1).key });
  assert.equal(firstCalls.items.length, 50); assert.ok(firstCalls.next);
  const laterCalls = await callsCoordinator.handlers.dashboardContributors({ token: callsRun.run, expectedRevision: callsRun.revision, rule: contribution(1).key, cursor: firstCalls.next! });
  assert.equal(laterCalls.items.length, 10); assert.equal(laterCalls.next, null);
});
for (const cause of ['directory', 'placement', 'provider', 'deletion']) test(`dashboard invalidates aggregates on ${cause} changes`, async () => {
  const c = coordinator({ contributions: [contribution(1)] }); const page = await finish(c.handlers);
  assert.equal(page.rows[0]!.failed, 1); c.change(cause);
  const invalid = await c.handlers.dashboard({ kind: 'results', token: page.run });
  assert.equal(invalid.state, 'restart-required'); assert.deepEqual(invalid.rows, []);
});
test('dashboard invocation overflow and unavailable destinations are coverage, not violations', async () => {
  const overflow = await finish(coordinator({ contributions: [contribution(1)], invocations: 10001 }).handlers);
  assert.equal(overflow.state, 'limited'); assert.deepEqual(overflow.rows, []); assert.deepEqual(overflow.coverage.reasons, ['invocation-limit']);
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
  const handlers = dashboardHandlers(sdk, async () => '{}', async () => {
    dispatched(); await new Promise<void>(resolve => { release = resolve; });
    return { state: 'finished', next: null, contributions: [contribution(1)], linkedThreads: [threadId], invocations: 1, association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [] };
  });
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
  }, experimental_callHostRpc: async () => {
    if (hostReads++ === 0) return { state: 'reading', next: 'host-continuation', contributions: observations, linkedThreads: [threadId], invocations: initialFailures, association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [] };
    dispatched(); await new Promise<void>(resolve => { release = resolve; });
    return { state: 'finished', next: null, contributions: [{ ...contribution(1), callId: 'f'.repeat(64) }], linkedThreads: [threadId], invocations: 1, association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [] };
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
