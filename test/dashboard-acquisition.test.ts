import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, mkdir, rm, rename, symlink, chmod, opendir, writeFile, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dashboardHost } from '../bb-plugin-tenet-status/dashboard-host.js';
import { dashboardHandlers } from '../bb-plugin-tenet-status/dashboard.js';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { ruleRecording } from './session-rules-fixture.js';
import { randomUUID } from 'node:crypto';
import { recordSessionKey } from '../src/recording/archive.js';
import { writeStageFile, readPrivateFile } from '../src/recording/files.js';
import { validRecord, type ArchiveRecord } from '../src/recording/contract.js';
import { sessionRuleStage } from '../src/inspector/session-rules.js';
import { DashboardArchiveReader } from '../src/inspector/dashboard-reader.js';
import { loadPolicy } from '../src/decision/policy.js';
import { policyEvidence, policyIntegrity } from '../src/decision/policy-contract.js';
import { answer } from './helpers.js';

const projectId = 'proj_fixture0001', threadId = 'thr_fixture00001', hostId = 'host_fixture0001';
async function fixture(run: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-acquisition-')));
  try {
    const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
    try {
      const sink = writer.bindHistorical({ sessionId: 'selected', invocationId: 'one', callId: 'one', toolName: 'edit', cwd: '/synthetic', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: threadId }, 4);
      for (const [stage, data] of Object.entries(ruleRecording({ outcome: 'FAIL' }))) sink(stage as any, data);
      await writer.complete();
    } finally { await writer.close(); }
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
const start = (root: string) => ({ kind: 'start' as const, threads: [threadId], qualification: 'a'.repeat(64), recordingDirectory: root });
async function finishHost(host: ReturnType<typeof dashboardHost>, root: string) {
  let chunk = await host.readDashboard(start(root));
  const observations = [...chunk.contributions];
  for (let n = 0; chunk.next && n < 20000; n++) { chunk = await host.readDashboard({ kind: 'advance', token: chunk.next }); observations.push(...chunk.contributions); }
  assert.equal(chunk.next, null); return { chunk, observations };
}
function sdk(calls: { project: number; thread: number; environment: number }, count = 1): any {
  const ids = Array.from({ length: count }, (_, n) => n ? `thr_${String(n).padStart(12, '0')}` : threadId);
  return {
    projects: { get: async () => { calls.project++; return { id: projectId }; } },
    threads: { list: async (args: any) => args.archived ? [] : ids.map(id => ({ id, projectId, providerId: 'pi' })),
      get: async ({ threadId: id }: any) => { calls.thread++; return { id, projectId, providerId: 'pi', environmentId: 'env_fixture0001' }; } },
    environments: { get: async () => { calls.environment++; return { id: 'env_fixture0001', hostId }; } },
  };
}
async function finishOwner(owner: ReturnType<typeof dashboardHandlers>) {
  let page = await owner.dashboard({ kind: 'start', scope: { kind: 'project', projectId } });
  for (let n = 0; page.next && n < 20000; n++) page = await owner.dashboard({ kind: 'advance', token: page.next });
  assert.equal(page.next, null); return page;
}
test('selected project survives 257 empty unrelated directories', () => fixture(async root => {
  for (let n = 0; n < 257; n++) await mkdir(join(root, n.toString(16).padStart(64, '0')), { mode: 0o700 });
  const host = dashboardHost();
  try { const result = await finishHost(host, root); assert.equal(result.chunk.state, 'finished'); assert.equal(result.observations.length, 2); }
  finally { await host.dispose(); }
}));
test('six sequential completed refreshes do not consume active admission', () => fixture(async root => {
  const host = dashboardHost();
  try { const states = []; for (let n = 0; n < 6; n++) states.push((await finishHost(host, root)).chunk.state);
    assert.deepEqual(states, ['finished', 'finished', 'finished', 'finished', 'finished', 'finished']); }
  finally { await host.dispose(); }
}));
test('limited unsearched destinations are not processed or unknown', async () => {
  const calls = { project: 0, thread: 0, environment: 0 };
  const owner = dashboardHandlers(sdk(calls), async () => '{}', async () => ({ state: 'limited', next: null, contributions: [], linkedThreads: [], invocations: 0, reasons: ['host-run-limit'], association: 'partial', omittedThreads: [], omittedInvocations: 0 } as any));
  const page = await finishOwner(owner);
  assert.deepEqual([page.coverage.processed, page.coverage.unknown, page.coverage.unprocessed], [0, 0, 1]);
});
test('each fresh pre/post pass shares project settings and environment reads', async () => {
  const calls = { project: 0, thread: 0, environment: 0, settings: 0 };
  const owner = dashboardHandlers(sdk(calls, 8), async () => { calls.settings++; return '{}'; }, async () => ({ state: 'finished', next: null, contributions: [], linkedThreads: [], invocations: 0, reasons: [], association: 'complete', omittedThreads: [], omittedInvocations: 0 } as any));
  let page = await owner.dashboard({ kind: 'start', scope: { kind: 'project', projectId } });
  for (let n = 0; n < 3; n++) page = await owner.dashboard({ kind: 'advance', token: page.next! });
  Object.keys(calls).forEach(key => { calls[key as keyof typeof calls] = 0; });
  await owner.dashboard({ kind: 'advance', token: page.next! });
  assert.deepEqual(calls, { project: 2, thread: 16, environment: 2, settings: 2 });
});

function record(n: number, selected = false, data = ruleRecording({ rules: 64 }).begin): ArchiveRecord & { schemaVersion: 4; data: any } {
  return { schemaVersion: 4, sessionId: 'unrelated', invocationId: `inv-${n}`, callId: `call-${n}`, toolName: 'edit',
    cwd: '/synthetic', mode: 'observe', host: selected ? 'pi' : 'sdk', contextId: 'main', bbThreadId: selected ? threadId : 'thr_unrelated001',
    writerId: 'a'.repeat(36), eventId: randomUUID(), sequence: n + 1, timestamp: n, stage: 'begin', data };
}
async function persist(root: string, value: ArchiveRecord, name = value.eventId) {
  assert.equal(validRecord(value), true);
  const folder = join(root, recordSessionKey(value));
  await writeStageFile(root, folder, name, JSON.stringify(value)); return { folder, path: join(folder, `${name}.json`) };
}
test('unrelated metadata above the old 8 MiB retention preserves selected observations and global writer loss', () => fixture(async root => {
  let metadataBytes = 0;
  for (let n = 0; n < 20; n++) {
    const value = record(n); value.data.policy.source = '/' + 'x'.repeat(8000);
    metadataBytes += Buffer.byteLength(JSON.stringify(sessionRuleStage(value)));
    await persist(root, value);
  }
  assert.ok(metadataBytes > 8 * 1024 * 1024);
  const health = { ...record(21), stage: 'health' as const, data: { scope: 'writer', failed: 1, dropped: 0, drainTimeouts: 0, pending: 0 } };
  await persist(root, health);
  const host = dashboardHost();
  try {
    const result = await finishHost(host, root);
    assert.deepEqual([result.chunk.state, result.chunk.association, result.observations.length], ['finished', 'complete', 2]);
    assert.deepEqual(result.chunk.reasons, ['writer-loss']);
  } finally { await host.dispose(); }
}));
test('oversized selected invocations preserve other results and explicit partial coverage', () => fixture(async root => {
  for (let n = 0; n < 3; n++) { const value = record(n, true); value.data.policy.source = '/' + 'x'.repeat(8000); await persist(root, value); }
  const host = dashboardHost();
  try {
    const calls = { project: 0, thread: 0, environment: 0 };
    const owner = dashboardHandlers(sdk(calls), async () => JSON.stringify({ [hostId]: root }), request => host.readDashboard(request));
    const page = await finishOwner(owner);
    assert.deepEqual([page.state, page.rows.length, page.coverage.processed, page.coverage.unknown, page.coverage.partial, page.coverage.unprocessed, page.coverage.omittedInvocations], ['limited', 2, 0, 0, 1, 0, 3]);
    assert.deepEqual(page.rows.map(r => [r.builtin, r.passed, r.failed]).sort(), [[false, 0, 1], [true, 1, 0]]);
  } finally { await host.dispose(); }
}));
test('four active scans are admitted, a fifth is capped, and retained terminal steps replay immutably until eviction', () => fixture(async root => {
  const host = dashboardHost();
  try {
    const chunks = await Promise.all(Array.from({ length: 5 }, () => host.readDashboard(start(root))));
    assert.deepEqual(chunks.map(c => c.state), ['reading', 'reading', 'reading', 'reading', 'limited']);
    assert.deepEqual(chunks[4]!.reasons, ['host-run-limit']);
    const token = chunks[0]!.next!;
    const original = await host.readDashboard({ kind: 'advance', token });
    const expected = structuredClone(original);
    original.reasons.push('caller-mutation'); original.contributions.length = 0;
    assert.deepEqual(await host.readDashboard({ kind: 'advance', token }), expected);
    let chunk = expected;
    while (chunk.next) chunk = await host.readDashboard({ kind: 'advance', token: chunk.next });
    for (let n = 1; n < 4; n++) { let current = chunks[n]!; while (current.next) current = await host.readDashboard({ kind: 'advance', token: current.next }); }
    assert.deepEqual(await host.readDashboard({ kind: 'advance', token }), expected);
    await finishHost(host, root);
    assert.deepEqual((await host.readDashboard({ kind: 'advance', token })).reasons, ['host-run-not-retained']);
    assert.equal((await finishHost(host, root)).chunk.state, 'finished');
  } finally { await host.dispose(); }
}));
test('expiry and disposal invalidate active and completed tokens', () => fixture(async root => {
  let time = 100;
  const host = dashboardHost(() => time);
  const chunk = await host.readDashboard(start(root));
  time += 600001;
  assert.equal((await host.readDashboard({ kind: 'advance', token: chunk.next! })).state, 'restart-required');
  assert.equal((await finishHost(host, root)).chunk.state, 'finished');
  const active = await host.readDashboard(start(root));
  await host.dispose();
  assert.deepEqual((await host.readDashboard({ kind: 'advance', token: active.next! })).reasons, ['host-disposed']);
}));
for (const change of ['identity', 'symlink', 'permissions']) test(`root ${change} change invalidates a retained scan`, () => fixture(async root => {
  const host = dashboardHost();
  const moved = `${root}-original`;
  try {
    const chunk = await host.readDashboard(start(root));
    if (change === 'permissions') await chmod(root, 0o755);
    else {
      await rename(root, moved);
      if (change === 'identity') await mkdir(root, { mode: 0o700 }); else await symlink(moved, root);
    }
    assert.equal((await host.readDashboard({ kind: 'advance', token: chunk.next! })).state, 'restart-required');
  } finally { await host.dispose(); if (change === 'permissions') await chmod(root, 0o700); else { await rm(root, { recursive: true, force: true }); await rename(moved, root); } }
}));
for (const unsafe of ['symlink', 'hardlink', 'public']) test(`unsafe ${unsafe} records are not associated or exposed`, () => fixture(async root => {
  const value = record(1, true), saved = await persist(root, value);
  if (unsafe === 'public') await chmod(saved.path, 0o644);
  else { const original = join(root, 'private-original'); await rename(saved.path, original); if (unsafe === 'symlink') await symlink(original, saved.path); else { await link(original, saved.path); } }
  const host = dashboardHost();
  try {
    const result = await finishHost(host, root);
    assert.deepEqual([result.chunk.association, result.observations.length], ['partial', 2]);
    assert.deepEqual(result.chunk.reasons, ['unsafe-or-unreadable-record']);
  } finally { await host.dispose(); }
}));
test('per-step stage and input-byte budgets resume without dropping selected facts', () => fixture(async root => {
  for (let n = 0; n < 270; n++) await persist(root, record(n, false, { padding: 'x'.repeat(n < 8 ? 3 * 1024 * 1024 : 0) }));
  let reads = 0, bytes = 0;
  const reader = new DashboardArchiveReader(root, new Set([threadId]), 'a'.repeat(64), async (...args) => {
    const text = await readPrivateFile(...args); reads++; bytes += Buffer.byteLength(text); return text;
  });
  const observations = []; let turns = 0, totalReads = 0;
  try {
    for (; turns < 100; turns++) {
      reads = 0; bytes = 0;
      const chunk = await reader.advance(); observations.push(...chunk.contributions); totalReads += reads;
      assert.ok(reads <= 256); assert.ok(bytes <= 16 * 1024 * 1024);
      if (chunk.finished) break;
    }
    assert.ok(turns >= 3 && turns < 100); assert.equal(observations.length, 2); assert.ok(totalReads >= 270);
  } finally { await reader.close(); }
}));
test('completed exact association search alone permits unknown coverage', async () => {
  for (const association of ['complete', 'partial', 'pending'] as const) {
    const calls = { project: 0, thread: 0, environment: 0 };
    const owner = dashboardHandlers(sdk(calls), async () => '{}', async () => ({ state: 'limited', next: null, contributions: [], linkedThreads: [], invocations: 0, reasons: ['archive-work-limit'], association, omittedThreads: [], omittedInvocations: 0 }));
    const page = await finishOwner(owner);
    assert.deepEqual([page.coverage.processed, page.coverage.unknown, page.coverage.unprocessed, page.coverage.partial], association === 'complete' ? [1, 1, 0, 0] : [0, 0, 1, 0]);
  }
});

async function names(root: string) {
  const cursor = await opendir(root), entries: string[] = [];
  try { for (;;) { const entry = await cursor.read(); if (!entry) break; entries.push(entry.name); } }
  finally { await cursor.close(); }
  return entries;
}
async function selected(root: string, sessionId: string) {
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  try {
    const sink = writer.bindHistorical({ sessionId, invocationId: 'late', callId: 'late', toolName: 'edit', cwd: '/synthetic', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: threadId }, 4);
    for (const [stage, data] of Object.entries(ruleRecording({ outcome: 'FAIL' }))) sink(stage as any, data);
    await writer.complete();
  } finally { await writer.close(); }
}
test('selected session visited after 258 empty directories and over 8 MiB of unrelated metadata still projects', () => fixture(async root => {
  const late = join(root, 'late'); await mkdir(late, { mode: 0o700 });
  const sessions = new Map<string, string>();
  for (let n = 0; n < 260; n++) {
    const value = { ...record(n), host: 'pi', sessionId: `candidate-${n}` }, key = recordSessionKey(value);
    sessions.set(key, value.sessionId); await mkdir(join(late, key), { mode: 0o700 });
  }
  const order = await names(late), last = order.at(-1)!, first = order[0]!;
  let metadataBytes = 0;
  for (let n = 0; n < 20; n++) {
    const value = { ...record(n), host: 'pi', sessionId: sessions.get(first)! };
    value.data.policy.source = '/' + 'x'.repeat(8000);
    metadataBytes += Buffer.byteLength(JSON.stringify(sessionRuleStage(value))); await persist(late, value);
  }
  await selected(late, sessions.get(last)!);
  assert.ok(metadataBytes > 8 * 1024 * 1024); assert.equal((await names(late)).indexOf(last), 259);
  const host = dashboardHost();
  try {
    let chunk = await host.readDashboard(start(late));
    assert.deepEqual(chunk.linkedThreads, []); assert.equal(chunk.state, 'reading');
    chunk = await host.readDashboard({ kind: 'advance', token: chunk.next! });
    assert.deepEqual(chunk.linkedThreads, []); assert.equal(chunk.state, 'reading');
    const observations = [...chunk.contributions];
    for (let n = 0; chunk.next && n < 100; n++) { chunk = await host.readDashboard({ kind: 'advance', token: chunk.next }); observations.push(...chunk.contributions); }
    assert.deepEqual([chunk.state, chunk.association, observations.length], ['finished', 'complete', 2]);
    assert.deepEqual(chunk.reasons, []);
  } finally { await host.dispose(); }
}));
test('terminal archive work cap folds completed selected sessions and never invents unknown for unreached associations', () => fixture(async root => {
  for (let start = 0; start < 16385; start += 128)
    await Promise.all(Array.from({ length: Math.min(128, 16385 - start) }, (_, n) => writeFile(join(root, `.noise-${start + n}`), '', { mode: 0o600 })));
  const order = await names(root);
  assert.ok(order.findIndex(name => /^[a-f0-9]{64}$/.test(name)) < 16000, 'selected session must be visited within the finite lifetime');
  const host = dashboardHost();
  try {
    const result = await finishHost(host, root);
    assert.deepEqual([result.chunk.state, result.chunk.association, result.observations.length], ['limited', 'partial', 2]);
    assert.deepEqual(result.chunk.reasons, ['archive-work-limit']);
    const calls = { project: 0, thread: 0, environment: 0 };
    const owner = dashboardHandlers(sdk(calls), async () => JSON.stringify({ [hostId]: root }), request => host.readDashboard(request.kind === 'start' ? { ...request, threads: ['thr_absent000001'] } : request));
    const page = await finishOwner(owner);
    assert.deepEqual([page.state, page.rows.length, page.coverage.processed, page.coverage.unknown, page.coverage.unprocessed], ['limited', 0, 0, 0, 1]);
  } finally { await host.dispose(); }
}));
test('session replacement and symlink changes between budgeted steps invalidate rather than fold truncated histories', () => fixture(async root => {
  const saved = await persist(root, record(0, true));
  for (let n = 1; n < 300; n++) await persist(root, record(n, true, {}));
  const host = dashboardHost();
  const moved = `${saved.folder}-old`;
  try {
    const chunk = await host.readDashboard(start(root));
    assert.equal(chunk.state, 'reading');
    await rename(saved.folder, moved); await symlink(moved, saved.folder);
    const invalid = await host.readDashboard({ kind: 'advance', token: chunk.next! });
    assert.equal(invalid.state, 'restart-required'); assert.deepEqual(invalid.contributions, []);
  } finally { await host.dispose(); await rm(saved.folder, { force: true }); await rename(moved, saved.folder); }
}));

test('selected retained-byte exhaustion omits whole invocations without erasing useful completed facts', () => fixture(async root => {
  let metadataBytes = 0;
  for (let n = 0; n < 140; n++) {
    const data = ruleRecording({ rules: 8 }).begin; data.policy.source = '/' + 'x'.repeat(8000);
    const value = record(n, true, data); metadataBytes += Buffer.byteLength(JSON.stringify(sessionRuleStage(value)));
    await persist(root, value);
  }
  assert.ok(metadataBytes > 8 * 1024 * 1024);
  const host = dashboardHost();
  try {
    const result = await finishHost(host, root);
    assert.equal(result.chunk.state, 'limited'); assert.equal(result.chunk.association, 'complete');
    assert.ok(result.observations.length > 2 && result.observations.length < 140 * 9 + 2);
    assert.equal(result.observations.filter(o => o.state === 'failed').length, 1);
    assert.equal(result.observations.filter(o => o.state === 'passed').length, 1);
    assert.deepEqual(result.chunk.omittedThreads, [threadId]); assert.ok(result.chunk.reasons.includes('oversized-invocation'));
  } finally { await host.dispose(); }
}));
test('a session unfinished at the terminal work cap cannot publish its otherwise trusted checks', () => fixture(async root => {
  const folder = join(root, (await names(root))[0]!);
  for (let start = 0; start < 65537; start += 256)
    await Promise.all(Array.from({ length: Math.min(256, 65537 - start) }, (_, n) => writeFile(join(folder, `.noise-${start + n}`), '', { mode: 0o600 })));
  assert.ok((await names(folder)).findIndex(name => name.endsWith('.json')) < 64000);
  const host = dashboardHost();
  try {
    const result = await finishHost(host, root);
    assert.deepEqual([result.chunk.state, result.chunk.association, result.observations.length], ['limited', 'partial', 0]);
    assert.deepEqual(result.chunk.linkedThreads, [threadId]); assert.deepEqual(result.chunk.omittedThreads, [threadId]);
    assert.deepEqual(result.chunk.reasons, ['archive-work-limit']);
  } finally { await host.dispose(); }
}));
test('resolution shares its fresh authorization context and retained owner replies are immutable', async () => {
  const calls = { project: 0, thread: 0, environment: 0, settings: 0 };
  const owner = dashboardHandlers(sdk(calls, 8), async () => { calls.settings++; return '{}'; }, async () => ({ state: 'finished', next: null, contributions: [], linkedThreads: [], invocations: 0, reasons: [], association: 'complete', omittedThreads: [], omittedInvocations: 0 }));
  let page = await owner.dashboard({ kind: 'start', scope: { kind: 'project', projectId } });
  for (let n = 0; n < 2; n++) page = await owner.dashboard({ kind: 'advance', token: page.next! });
  Object.keys(calls).forEach(key => { calls[key as keyof typeof calls] = 0; });
  const token = page.next!;
  const resolved = await owner.dashboard({ kind: 'advance', token }), expected = structuredClone(resolved);
  assert.deepEqual(calls, { project: 2, thread: 16, environment: 2, settings: 2 });
  resolved.coverage.reasons.push('caller-mutation'); resolved.coverage.resolved = 0;
  assert.deepEqual(await owner.dashboard({ kind: 'advance', token }), expected);
});

for (const change of ['settings', 'environment', 'membership', 'provider', 'deletion']) test(`fresh post-host authorization rejects ${change} changes`, async () => {
  let changed = false;
  const calls = { project: 0, thread: 0, environment: 0 };
  const api = sdk(calls);
  api.threads.get = async () => ({ id: threadId, projectId: changed && change === 'membership' ? 'proj_foreign0001' : projectId,
    providerId: changed && change === 'provider' ? 'codex' : 'pi', deletedAt: changed && change === 'deletion' ? 1 : null, environmentId: 'env_fixture0001' });
  api.environments.get = async () => ({ id: 'env_fixture0001', hostId: changed && change === 'environment' ? 'host_foreign0001' : hostId });
  const owner = dashboardHandlers(api, async () => changed && change === 'settings' ? JSON.stringify({ [hostId]: '/synthetic/changed' }) : '{}', async () => {
    changed = true;
    return { state: 'finished', next: null, contributions: [], linkedThreads: [threadId], invocations: 1, reasons: [], association: 'complete', omittedThreads: [], omittedInvocations: 0 };
  });
  const page = await finishOwner(owner);
  assert.equal(page.state, 'restart-required'); assert.deepEqual(page.rows, []);
});
test('one environment read per distinct environment in each pass, never shared across requests', async () => {
  const calls = { project: 0, thread: 0, environment: 0, settings: 0 };
  const api = sdk(calls, 8);
  api.threads.get = async ({ threadId: id }: any) => { calls.thread++; return { id, projectId, providerId: 'pi', environmentId: id === threadId ? 'env_fixture0001' : 'env_fixture0002' }; };
  api.environments.get = async ({ environmentId: id }: any) => { calls.environment++; return { id, hostId }; };
  const owner = dashboardHandlers(api, async () => { calls.settings++; return '{}'; }, async () => ({ state: 'finished', next: null, contributions: [], linkedThreads: [], invocations: 0, reasons: [], association: 'complete', omittedThreads: [], omittedInvocations: 0 }));
  const page = await finishOwner(owner);
  for (let n = 0; n < 2; n++) {
    Object.keys(calls).forEach(key => { calls[key as keyof typeof calls] = 0; });
    await owner.dashboard({ kind: 'results', token: page.run });
    assert.deepEqual(calls, { project: 1, thread: 8, environment: 2, settings: 1 });
  }
});
test('only exact schema 3/4/5 Pi membership reaches the scoped host while current and historical trust remain interpretable', () => fixture(async root => {
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  try {
    for (const schema of [1, 2, 3] as const) {
      const base = { sessionId: `schema-${schema}`, invocationId: 'history', callId: 'history', toolName: `v${schema}`, cwd: '/synthetic', mode: 'observe' as const };
      const sink = schema === 1 ? writer.bindHistorical(base, 1) : schema === 2 ? writer.bindHistorical({ ...base, host: 'pi', contextId: 'main' }, 2)
        : writer.bindHistorical({ ...base, host: 'pi', contextId: 'main', bbThreadId: threadId }, 3);
      for (const [stage, data] of Object.entries(ruleRecording({ outcome: 'PASS' }))) sink(stage as any, data);
      await writer.settle();
    }
    const file = join(root, 'TENET.md'); await writeFile(file, 'Rule; Never commit.');
    const policy = await loadPolicy(file); assert.ok(policy.available);
    const current = writer.bind({ sessionId: 'schema-5', invocationId: 'current', callId: 'current', toolName: 'v5', cwd: root, mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: threadId });
    current('begin', { policy });
    current('request', { policy, questionVersion: 'policy-rules-v8-source-set', mapping: [], payload: { model: 'offline', state: { action: { arguments: 'PRIVATE-RAW-SENTINEL' }, policy: policyEvidence(policy), integrity: policyIntegrity(policy), context: {}, trajectory: {} }, questions: {} } });
    current('validation', { valid: true }); current('assessment', { assessment: answer(policy) });
    await writer.complete();
  } finally { await writer.close(); }
  const host = dashboardHost();
  try {
    const result = await finishHost(host, root);
    assert.deepEqual(result.observations.map(o => o.toolName).sort(), ['edit', 'edit', 'v3', 'v3', 'v5', 'v5']);
    assert.deepEqual(result.observations.filter(o => o.toolName === 'v5').map(o => [o.builtin, o.state]).sort(), [[false, 'passed'], [true, 'passed']]);
    assert.deepEqual(result.observations.filter(o => o.toolName === 'v3').map(o => [o.builtin, o.state]).sort(), [[false, 'passed'], [true, 'passed']]);
    assert.equal(JSON.stringify(result).includes('PRIVATE-RAW-SENTINEL'), false);
  } finally { await host.dispose(); }
}));
