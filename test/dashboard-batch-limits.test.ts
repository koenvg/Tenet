import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashboardHandlers } from '../bb-plugin-tenet-status/dashboard.js';
import { dashboardHostMethods, type HostDashboardChunk } from '../bb-plugin-tenet-status/dashboard-contract.js';
import type { RuleObservation } from '../src/inspector/bb-dashboard.js';

const projectId = 'proj_fixture0001';
const threads = ['thr_fixture00001', 'thr_fixture00002', 'thr_fixture00003'];
const hosts = ['host_fixture0001', 'host_fixture0002', 'host_fixture0003'];
const environments = ['env_fixture0001', 'env_fixture0002', 'env_fixture0003'];
type Partition = 'single' | 'batched';
type Invocation = RuleObservation[];
const key = (n: number) => n.toString(16).padStart(64, '0');
const observation = (rule: number, call: number, extra: Partial<RuleObservation> = {}): RuleObservation => ({
  key: key(rule), preview: 'Synthetic passing rule.', builtin: false, state: 'passed',
  threadId: threads[0]!, sessionId: 'a'.repeat(64), callId: key(call), timestamp: 0, toolName: 'edit', ...extra,
});
const reply = (groups: Invocation[], next: string | null = null, thread = threads[0]!): HostDashboardChunk => ({
  state: next ? 'reading' : 'finished', next, contributions: groups.flat(), invocationSizes: groups.map(g => g.length),
  linkedThreads: [thread], invocations: groups.length, association: 'complete', omittedThreads: [], omittedInvocations: 0, reasons: [],
});
function pack(groups: Invocation[], partition: Partition, thread = threads[0]!) {
  const chunks: HostDashboardChunk[] = [];
  let batch: Invocation[] = [], size = 0;
  for (const group of groups) {
    assert.ok(group.length <= 65);
    if (batch.length && (partition === 'single' || batch.length === 128 || size + group.length > 65)) {
      chunks.push(reply(batch, 'pending', thread)); batch = []; size = 0;
    }
    batch.push(group); size += group.length;
  }
  if (batch.length) chunks.push(reply(batch, null, thread));
  return chunks;
}
async function published(streams: HostDashboardChunk[][]) {
  const sdk: any = {
    projects: { get: async () => ({ id: projectId }) },
    threads: {
      list: async ({ archived }: any) => archived ? [] : threads.slice(0, streams.length).map(id => ({ id, projectId, providerId: 'pi' })),
      get: async ({ threadId }: any) => ({ id: threadId, projectId, providerId: 'pi', environmentId: environments[threads.indexOf(threadId)] }),
    },
    environments: { get: async ({ environmentId }: any) => ({ id: environmentId, hostId: hosts[environments.indexOf(environmentId)] }) },
  };
  const owner = dashboardHandlers(sdk, async () => '{}', { stop: async () => ({ stopped: true }), read: async (input, hostId) => {
    const stream = streams[hosts.indexOf(hostId)]!;
    const index = input.kind === 'advance' ? Number(input.token) : 0;
    const chunk = structuredClone(stream[index]!);
    chunk.next = index + 1 < stream.length ? String(index + 1) : null;
    if (chunk.next) chunk.state = 'reading';
    return dashboardHostMethods.readDashboard.output.parse(chunk);
  } }, () => 100);
  let page = await owner.dashboard({ kind: 'start', scope: { kind: 'project', projectId } });
  let lastToken = '';
  for (let n = 0; page.next && n < 11000; n++) {
    lastToken = page.next; page = await owner.dashboard({ kind: 'advance', token: lastToken });
  }
  assert.equal(page.next, null);
  assert.deepEqual(await owner.dashboard({ kind: 'advance', token: lastToken }), page);
  const rows = [...page.rows];
  let after = page.rowsNext;
  while (after) {
    const later = await owner.dashboard({ kind: 'results', token: page.run, cursor: after });
    rows.push(...later.rows); after = later.rowsNext;
  }
  return { owner, page, rows };
}

test('host output requires bounded ordered invocation sizes with matching counts, sums and identities', () => {
  const valid = reply([[], [observation(1, 1), observation(2, 1)], []]);
  assert.deepEqual(dashboardHostMethods.readDashboard.output.parse(valid).invocationSizes, [0, 2, 0]);
  const { invocationSizes: _, ...missing } = valid;
  const invalid: unknown[] = [missing,
    ...[[-1, 2, 1], [0.5, 1.5, 0], [66], Array(129).fill(0), [2], [0, 1, 0]].map(invocationSizes => ({ ...valid, invocationSizes })),
    { ...reply(Array.from({ length: 128 }, () => [])), invocations: 129 },
    { ...reply([[observation(1, 1)], [observation(2, 1)]]), invocationSizes: [-1, 3] },
    ...['threadId', 'sessionId', 'callId'].map(field => ({ ...valid, contributions: [valid.contributions[0],
      { ...valid.contributions[1], [field]: field === 'threadId' ? threads[1] : 'b'.repeat(64) }] })),
  ];
  for (const chunk of invalid) assert.equal(dashboardHostMethods.readDashboard.output.safeParse(chunk).success, false);
  assert.equal(dashboardHostMethods.readDashboard.output.safeParse(reply(Array.from({ length: 128 }, () => []))).success, true);
  assert.equal(dashboardHostMethods.readDashboard.output.safeParse(reply([Array.from({ length: 65 }, (_, n) => observation(n, 1))])).success, true);
  assert.equal(dashboardHostMethods.readDashboard.output.safeParse(reply([Array.from({ length: 65 }, (_, n) => observation(n, 1)), [observation(66, 2)]])).success, false);
});

for (const observed of [true, false]) test(`project invocation cap admits the same whole invocations across destinations, observed=${observed}`, async () => {
  for (const partition of ['single', 'batched'] as const) {
    const streams = [5000, 4950, 100].map((count, destination) => pack(Array.from({ length: count }, (_, n) => observed && destination === 2
      ? [1, 2].map(rule => observation(rule, n, { threadId: threads[destination]!, builtin: rule === 2 })) : []), partition, threads[destination]!));
    const { page, rows } = await published(streams);
    assert.deepEqual([page.state, page.coverage.invocations, page.coverage.reasons], ['limited', 10000, ['invocation-limit']]);
    assert.deepEqual(rows.map(row => [row.key, row.passed, row.failed, row.unscored]), observed
      ? [[key(1), 50, 0, 0], [key(2), 50, 0, 0]] : []);
  }
});

test('zero sizes preserve admission order and empty EOF or omission replies do not invent invocation overflow', async () => {
  const prefix = pack(Array.from({ length: 9997 }, () => []), 'batched');
  for (const partition of ['single', 'batched'] as const) {
    const ordered = await published([[...prefix, ...pack([[], [observation(1, 1)], [], [], [observation(2, 2)]], partition)]]);
    assert.deepEqual([ordered.page.state, ordered.page.coverage.invocations, ordered.page.coverage.reasons], ['limited', 10000, ['invocation-limit']]);
    assert.deepEqual(ordered.rows.map(r => [r.key, r.passed]), [[key(1), 1]]);
    for (const ending of ['direct', 'empty', 'omitted'] as const) {
      const groups = [...pack(Array.from({ length: 10000 }, () => []), partition)];
      if (ending !== 'direct') groups.push({ ...reply([]), ...(ending === 'omitted' ? {
        state: 'limited' as const, omittedThreads: [threads[0]!], omittedInvocations: 1, reasons: ['oversized-invocation'],
      } : {}) });
      const { page, rows } = await published([groups]);
      assert.deepEqual([page.state, page.coverage.invocations, page.coverage.reasons, page.coverage.omittedInvocations],
        [ending === 'omitted' ? 'limited' : 'finished', 10000, ending === 'omitted' ? ['oversized-invocation'] : [], ending === 'omitted' ? 1 : 0]);
      assert.deepEqual(rows, []);
    }
  }
});

test('row cap retains a partial invocation and counts no trailing sizes regardless of tail partition', async () => {
  const prefix = pack(Array.from({ length: 4095 }, (_, n) => [observation(n, n)]), 'batched');
  const tails = [[observation(0, 0)], [observation(4095, 5002), observation(0, 5002), observation(4096, 5002)], [], [observation(1, 5003)], []];
  for (const partition of ['single', 'batched'] as const) {
    const { page, rows } = await published([[...prefix, ...pack(tails, partition)]]);
    assert.deepEqual([page.state, page.coverage.invocations, page.coverage.reasons], ['limited', 4097, ['retained-result-limit']]);
    assert.deepEqual(rows.map(r => [r.key, r.passed, r.failed, r.unscored]),
      Array.from({ length: 4096 }, (_, n) => [key(n), n === 0 ? 2 : 1, 0, 0]));
  }
});

test('UTF-8 byte cap charges duplicates only once, fits exact equality and stops within the failing invocation', async () => {
  const limit = 16 * 1024 * 1024;
  const charge = (value: RuleObservation) => Buffer.byteLength(JSON.stringify(value)) + 256;
  const accepted = observation(2, 9999, { state: 'failed', preview: '界"\\\n'.repeat(400) });
  const standard = observation(1, 0, { state: 'failed', preview: '界"\\\n'.repeat(400) });
  const base = charge({ ...standard, preview: '' });
  const count = Math.floor((limit - charge(accepted) - base) / charge(standard));
  assert.equal(count, 4000);
  const prefix = Array.from({ length: count }, (_, n) => [observation(1, n, { state: 'failed', preview: standard.preview })]);
  const padding = limit - charge(accepted) - count * charge(standard) - base;
  const duplicate = observation(1, 9999, { state: 'failed', preview: '界'.repeat(Math.floor(padding / 3)) + 'x'.repeat(padding % 3) });
  prefix.push([duplicate]);
  assert.equal(prefix.flat().reduce((sum, value) => sum + charge(value), 0) + charge(accepted), limit);
  const tails = [[duplicate, accepted, observation(3, 9999)], [], [observation(4, 10000)], []];
  for (const partition of ['single', 'batched'] as const) {
    const { owner, page, rows } = await published([[...pack(prefix, 'batched'), ...pack(tails, partition)]]);
    assert.deepEqual([page.state, page.coverage.invocations, page.coverage.reasons], ['limited', count + 2, ['retained-result-limit']]);
    assert.deepEqual(rows.map(r => [r.key, r.passed, r.failed, r.unscored]), [[key(1), 0, count + 1, 0], [key(2), 0, 1, 0]]);
    for (const [rule, expected] of [[1, [...prefix.flat().map(c => c.callId)].sort()], [2, [key(9999)]]] as const) {
      const calls: string[] = []; let cursor: string | undefined;
      do {
        const contributors = await owner.dashboardContributors({ token: page.run, rule: key(rule), expectedRevision: page.revision, cursor });
        assert.equal(contributors.state, 'ready'); calls.push(...contributors.items.map(c => c.callId)); cursor = contributors.next ?? undefined;
      } while (cursor);
      assert.deepEqual(calls.sort(), expected);
    }
  }
});
