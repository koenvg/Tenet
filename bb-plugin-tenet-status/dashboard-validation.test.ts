import { currentDashboardEvidence } from '../test/dashboard-host-fixture.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashboardHandlers } from './dashboard.js';
import type { HostDashboardChunk } from './dashboard-contract.js';

const projectId = 'proj_validation01', hostId = 'host_validation01';
const threadIds = Array.from({ length: 9 }, (_, n) => `thr_validation${String(n).padStart(2, '0')}`);
const rule = 'a'.repeat(64);

function validationFixture(environmentCount: number) {
  const calls = { project: 0, settings: 0, threads: [] as string[], environments: [] as string[], host: 0 };
  const threads = threadIds.map((id, n) => ({ id, projectId, providerId: 'pi', deletedAt: null as number | null,
    environmentId: `env_validation0${n % environmentCount}`, title: `Synthetic ${n}` }));
  const environments = Array.from({ length: environmentCount }, (_, n) => ({ id: `env_validation0${n}`, hostId }));
  const threadsById = new Map(threads.map(thread => [thread.id, thread]));
  const environmentsById = new Map(environments.map(environment => [environment.id, environment]));
  const state = { projectId, projectAvailable: true, settings: JSON.stringify({ [hostId]: '/synthetic/owner-archive' }),
    settingsAvailable: true, environmentAvailable: true };
  const stops: { token: string; host: string }[] = [];
  let duringHost = async () => {};
  const owner = dashboardHandlers({
    projects: { get: async () => { calls.project++; if (!state.projectAvailable) throw Error('revoked'); return { id: state.projectId }; } },
    threads: {
      list: async ({ archived }: { archived: boolean }) => archived ? [] : threads,
      get: async ({ threadId }: { threadId: string }) => {
        calls.threads.push(threadId); return threadsById.get(threadId);
      },
    },
    environments: { get: async ({ environmentId }: { environmentId: string }) => {
      calls.environments.push(environmentId);
      if (!state.environmentAvailable) throw Error('environment-unavailable');
      return environmentsById.get(environmentId);
    } },
  } as any, async () => {
    calls.settings++; if (!state.settingsAvailable) throw Error('settings-unavailable'); return state.settings;
  }, {
    stop: async (token, host) => { stops.push({ token, host }); return { stopped: true }; },
    read: async (input, host) => {
      if (input.kind === 'check') return currentDashboardEvidence();
      assert.equal(host, hostId);
      if (calls.host === 0) {
        assert.equal(input.kind, 'start');
        if (input.kind === 'start') {
          assert.deepEqual(input.threads, threadIds);
          assert.equal(input.recordingDirectory, '/synthetic/owner-archive');
        }
      } else assert.deepEqual(input, { kind: 'advance', token: `host-chunk-${calls.host}` });
      calls.host++;
      await duringHost();
      return { state: calls.host < 11 ? 'reading' : 'finished', next: calls.host < 11 ? `host-chunk-${calls.host}` : null,
        contributions: [{ key: rule, preview: 'Synthetic rule', builtin: false, state: 'failed', threadId: threadIds[0]!,
          sessionId: 'b'.repeat(64), callId: calls.host.toString(16).padStart(64, '0'), timestamp: calls.host, toolName: 'edit' }],
        linkedThreads: [threadIds[0]!], invocations: 1, invocationSizes: [1], association: 'complete',
        omittedThreads: [], omittedInvocations: 0, reasons: [] } satisfies HostDashboardChunk;
    },
  });
  const snapshot = () => ({ project: calls.project, settings: calls.settings,
    threads: calls.threads.length, environments: calls.environments.length, host: calls.host });
  const ready = async () => {
    let page = await owner.dashboard({ kind: 'start', scope: { kind: 'project', projectId } });
    for (let n = 0; n < 4; n++) page = await owner.dashboard({ kind: 'advance', token: page.next! });
    assert.deepEqual([page.state, page.coverage.resolved, calls.host], ['reading', 9, 0]);
    return page;
  };
  return { owner, calls, threads, environments, state, stops, snapshot, ready,
    duringHost: (callback: () => Promise<void>) => { duringHost = callback; } };
}

for (const environmentCount of [1, 2]) test(`validation shares reads across nine threads and ${environmentCount} environments without caching across passes`, async () => {
  const f = validationFixture(environmentCount);
  let page = await f.ready();
  try {
    for (let chunk = 1; chunk <= 11; chunk++) {
      const before = f.snapshot(), threadOffset = f.calls.threads.length, environmentOffset = f.calls.environments.length;
      const token = page.next!;
      page = await f.owner.dashboard({ kind: 'advance', token });
      assert.deepEqual(f.snapshot(), { project: before.project + 2, settings: before.settings + 2,
        threads: before.threads + 18, environments: before.environments + 2 * environmentCount, host: chunk });
      assert.deepEqual(f.calls.threads.slice(threadOffset), [...threadIds, ...threadIds]);
      assert.deepEqual(f.calls.environments.slice(environmentOffset), [...f.environments, ...f.environments].map(env => env.id));
      assert.deepEqual([page.rows[0]!.failed, page.coverage.invocations], [chunk, chunk]);
      const replayBefore = f.snapshot();
      assert.deepEqual(await f.owner.dashboard({ kind: 'advance', token }), page);
      assert.deepEqual(f.snapshot(), { project: replayBefore.project + 2, settings: replayBefore.settings + 2,
        threads: replayBefore.threads + 18, environments: replayBefore.environments + 2 * environmentCount, host: chunk });
    }
    page = await f.owner.dashboard({ kind: 'advance', token: page.next! });
    assert.deepEqual([page.state, page.next, page.coverage.processed, page.coverage.unknown], ['finished', null, 9, 8]);
    for (const read of [
      () => f.owner.dashboard({ kind: 'results', token: page.run }),
      () => f.owner.dashboardContributors({ token: page.run, expectedRevision: page.revision, rule }),
    ]) {
      const before = f.snapshot();
      const result = await read();
      assert.equal(result.state, 'items' in result ? 'ready' : 'finished');
      if ('items' in result) assert.deepEqual(result.items.map(item => item.callId),
        Array.from({ length: 11 }, (_, n) => (11 - n).toString(16).padStart(64, '0')));
      else assert.deepEqual(result.rows, page.rows);
      assert.deepEqual(f.snapshot(), { project: before.project + 2, settings: before.settings + 2,
        threads: before.threads + 18, environments: before.environments + 2 * environmentCount, host: 11 });
    }
  } finally { await f.owner.dashboardStop({ token: page.run }); }
});

type Fixture = ReturnType<typeof validationFixture>;
const changes: Record<string, (fixture: Fixture) => void> = {
  'project access revoked': f => { f.state.projectAvailable = false; },
  'wrong project returned': f => { f.state.projectId = 'proj_other00001'; },
  'wrong thread returned': f => { f.threads[8]!.id = 'thr_other000001'; },
  'thread moved to another project': f => { f.threads[8]!.projectId = 'proj_other00001'; },
  'thread deleted': f => { f.threads[8]!.deletedAt = 1; },
  'thread provider changed': f => { f.threads[8]!.providerId = 'codex'; },
  'thread environment changed': f => { f.threads[8]!.environmentId = 'env_validation01'; },
  'wrong environment returned': f => { f.environments[0]!.id = 'env_other000001'; },
  'environment access revoked': f => { f.state.environmentAvailable = false; },
  'host placement changed': f => { f.environments[0]!.hostId = 'host_other00001'; },
  'owner archive changed': f => { f.state.settings = JSON.stringify({ [hostId]: '/synthetic/other-archive' }); },
  'owner archive removed': f => { f.state.settings = '{}'; },
  'owner settings malformed': f => { f.state.settings = '[]'; },
  'owner settings unavailable': f => { f.state.settingsAvailable = false; },
};

for (const [name, change] of Object.entries(changes)) test(`post-host validation discards aggregates when ${name}`, async () => {
  const f = validationFixture(2);
  const initial = await f.ready();
  let page = await f.owner.dashboard({ kind: 'advance', token: initial.next! });
  assert.equal(page.rows[0]!.failed, 1);
  const token = page.next!;
  f.duringHost(async () => { change(f); });
  try {
    page = await f.owner.dashboard({ kind: 'advance', token });
    assert.deepEqual([page.state, page.rows, page.next], ['restart-required', [], null]);
    assert.equal(f.calls.host, 2);
    const replay = await f.owner.dashboard({ kind: 'advance', token });
    assert.deepEqual([replay.state, replay.rows], ['restart-required', []]);
    const results = await f.owner.dashboard({ kind: 'results', token: page.run });
    assert.deepEqual([results.state, results.rows], ['restart-required', []]);
    assert.deepEqual(await f.owner.dashboardContributors({ token: page.run, expectedRevision: page.revision, rule }),
      { state: 'restart-required', items: [], next: null });
  } finally { await f.owner.dashboardStop({ token: initial.run }); }
  assert.deepEqual(f.stops, [{ token: 'host-chunk-2', host: hostId }]);
});
