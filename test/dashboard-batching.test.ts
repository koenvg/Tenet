import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, opendir, writeFile, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DashboardArchiveReader } from '../src/inspector/dashboard-reader.js';
import { recordSessionKey, recordInvocationKey, sessionKey } from '../src/recording/archive.js';
import { validRecord, type ArchiveRecord } from '../src/recording/contract.js';
import { writeStageFile } from '../src/recording/files.js';
import { dashboardHost } from '../bb-plugin-tenet-status/dashboard-host.js';
import { dashboardHandlers } from '../bb-plugin-tenet-status/dashboard.js';
import { dashboardHostMethods, type HostDashboardChunk } from '../bb-plugin-tenet-status/dashboard-contract.js';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { ruleRecording } from './session-rules-fixture.js';

const projectId = 'proj_fixture0001', hostId = 'host_fixture0001', environmentId = 'env_fixture0001';
const ids = Array.from({ length: 8 }, (_, n) => `thr_${String(n).padStart(12, '0')}`);
const policyKey = '3471f3945604e63196266133d0229343decd407ce89d0579765ae93278c4f491';
const integrityKey = 'd5d5eff45bf5767d75475627afe800d48853c4111e1103785728ae76a516b98f';
const sentinel = 'RAW-BATCHING-SENTINEL';
async function archive(run: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-batching-')));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const address = (n: number) => ({ schemaVersion: 4 as const, sessionId: 'synthetic-session', invocationId: `inv-${n}`,
  callId: `call-${n}`, toolName: 'edit', cwd: '/synthetic', mode: 'observe' as const, host: 'pi' as const, contextId: 'main', bbThreadId: ids[0]! });
async function recordings(root: string, count = 100) {
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  try {
    for (let n = 0; n < count; n++) {
      const sink = writer.bindHistorical(address(n), 4), data = ruleRecording({ outcome: n % 10 === 0 ? 'FAIL' : 'PASS' });
      data.begin.policy.rules[0].text = 'Only synthetic actions.';
      data.begin.raw = sentinel;
      for (const [stage, value] of Object.entries(data)) sink(stage as any, value);
      await writer.settle();
    }
    await writer.complete();
  } finally { await writer.close(); }
}
function record(n: number, data: Record<string, any>, stage: ArchiveRecord['stage'] = 'begin'): ArchiveRecord {
  return { ...address(n), writerId: 'a'.repeat(36), eventId: randomUUID(), sequence: n + 1, timestamp: n, stage, data };
}
async function persist(root: string, value: ArchiveRecord) {
  assert.equal(validRecord(value), true);
  const folder = join(root, recordSessionKey(value));
  await writeStageFile(root, folder, value.eventId, JSON.stringify(value));
  return join(folder, `${value.eventId}.json`);
}
async function names(folder: string) {
  const cursor = await opendir(folder), result: string[] = [];
  try { for (;;) { const entry = await cursor.read(); if (!entry) return result; result.push(entry.name); } }
  finally { await cursor.close(); }
}
async function orderedGroups(root: string, sizes: number[]) {
  const values = new Map<string, ArchiveRecord>();
  for (let n = 0; n < sizes.length; n++) { const value = record(n, {}); await persist(root, value); values.set(`${value.eventId}.json`, value); }
  const folder = join(root, recordSessionKey(address(0))), order = await names(folder);
  for (const [index, name] of order.entries()) {
    const value = values.get(name)!;
    if (sizes[index] === 0) { value.stage = 'validation'; value.data = { valid: true }; }
    else {
      const data = ruleRecording({ rules: sizes[index]! - 1 }).begin;
      data.policy.rules.forEach((rule: any, n: number) => { rule.text = `Synthetic group ${index} rule ${n}.`; });
      value.data = data;
    }
    await writeFile(join(folder, name), JSON.stringify(value));
  }
  assert.deepEqual(await names(folder), order);
  return order.map(name => values.get(name)!);
}
const start = (root: string) => ({ kind: 'start' as const, threads: ids, qualification: 'a'.repeat(64), recordingDirectory: root });
async function scannedHost(host: ReturnType<typeof dashboardHost>, root: string) {
  let chunk = await host.readDashboard(start(root));
  for (let n = 0; chunk.association === 'pending' && n < 20; n++) chunk = await host.readDashboard({ kind: 'advance', token: chunk.next! });
  assert.equal(chunk.association, 'complete'); assert.equal(chunk.invocations, 0);
  assert.deepEqual(chunk.invocationSizes, []);
  return chunk;
}
async function hostFolds(host: ReturnType<typeof dashboardHost>, root: string) {
  let chunk = await scannedHost(host, root); const chunks: HostDashboardChunk[] = [];
  for (let n = 0; chunk.next && n < 200; n++) {
    chunk = dashboardHostMethods.readDashboard.output.parse(await host.readDashboard({ kind: 'advance', token: chunk.next })); chunks.push(chunk);
  }
  assert.equal(chunk.next, null); return chunks;
}
async function readerFolds(root: string) {
  const reader = new DashboardArchiveReader(root, new Set(ids), 'a'.repeat(64)), scans = [], folds = [];
  try {
    let chunk;
    do { chunk = await reader.advance(); scans.push(chunk); assert.ok(scans.length < 20); } while (chunk.association === 'pending');
    do { chunk = await reader.advance(); folds.push(chunk); assert.ok(folds.length < 300); } while (!chunk.finished);
    return { scans, folds };
  } finally { await reader.close(); }
}
const fact = (c: HostDashboardChunk['contributions'][number]) => [c.threadId, c.sessionId, c.callId, c.key, c.state].join('|');
function expectedFacts() {
  return Array.from({ length: 100 }, (_, n) => {
    const value = address(n), session = sessionKey(JSON.stringify([ids[0], recordSessionKey(value)]));
    const call = sessionKey(JSON.stringify([ids[0], recordSessionKey(value), recordInvocationKey(value)]));
    return [[ids[0], session, call, policyKey, n % 10 === 0 ? 'failed' : 'passed'].join('|'),
      [ids[0], session, call, integrityKey, 'passed'].join('|')];
  }).flat().sort();
}

test('100 invocations pack whole, schema-valid batches and concurrent host replay is immutable', () => archive(async root => {
  await recordings(root); const host = dashboardHost();
  try {
    const scan = await scannedHost(host, root), token = scan.next!;
    const [first, replay] = await Promise.all([host.readDashboard({ kind: 'advance', token }), host.readDashboard({ kind: 'advance', token })]);
    assert.deepEqual(first, replay); const saved = structuredClone(first);
    first.contributions[0]!.preview = sentinel; first.contributions.length = 0; first.reasons.push(sentinel);
    first.invocationSizes[0] = 65; first.invocationSizes.push(0);
    assert.deepEqual(replay, saved); assert.deepEqual(await host.readDashboard({ kind: 'advance', token }), saved);
    const chunks = [saved]; let chunk = saved;
    for (let n = 0; chunk.next && n < 200; n++) { chunk = await host.readDashboard({ kind: 'advance', token: chunk.next }); chunks.push(chunk); }
    assert.deepEqual(chunks.map(c => c.invocations), [32, 32, 32, 4]);
    assert.deepEqual(chunks.map(c => c.invocationSizes), [Array(32).fill(2), Array(32).fill(2), Array(32).fill(2), Array(4).fill(2)]);
    assert.deepEqual(chunks.map(c => c.contributions.length), [64, 64, 64, 8]);
    assert.deepEqual(chunks.map(c => c.state), ['reading', 'reading', 'reading', 'finished']);
    chunks.forEach(c => dashboardHostMethods.readDashboard.output.parse(c));
    assert.deepEqual(chunks.flatMap(c => c.contributions.map(fact)).sort(), expectedFacts());
    assert.equal(JSON.stringify(chunks).includes(sentinel), false);
  } finally { await host.dispose(); }
}));

test('a canonical 65-observation projection is never split next to another invocation', () => archive(async root => {
  await orderedGroups(root, [65, 2]); const host = dashboardHost();
  try {
    const chunks = await hostFolds(host, root);
    assert.deepEqual(chunks.map(c => [c.invocations, c.contributions.length, c.state]), [[1, 65, 'reading'], [1, 2, 'finished']]);
    assert.deepEqual(chunks.map(c => c.invocationSizes), [[65], [2]]);
    assert.equal(new Set(chunks[0]!.contributions.map(c => c.callId)).size, 1);
    assert.notEqual(chunks[0]!.contributions[0]!.callId, chunks[1]!.contributions[0]!.callId);
    assert.equal(new Set(chunks.flatMap(c => c.contributions.map(fact))).size, 67);
  } finally { await host.dispose(); }
}));

test('uneven 32/34/31 projections preserve fixture-established traversal order and pack 32/65', () => archive(async root => {
  const order = await orderedGroups(root, [32, 34, 31]), host = dashboardHost();
  const calls = order.map(value => sessionKey(JSON.stringify([ids[0], recordSessionKey(value), recordInvocationKey(value)])));
  try {
    const chunks = await hostFolds(host, root);
    assert.deepEqual(chunks.map(c => [c.invocations, c.contributions.length, c.state]), [[1, 32, 'reading'], [2, 65, 'finished']]);
    assert.deepEqual(chunks.map(c => c.invocationSizes), [[32], [34, 31]]);
    assert.deepEqual(chunks.map(c => [...new Set(c.contributions.map(v => v.callId))]), [[calls[0]], [calls[1], calls[2]]]);
    assert.equal(new Set(chunks.flatMap(c => c.contributions.map(fact))).size, 97);
  } finally { await host.dispose(); }
}));

test('zero-output positions survive whole-projection deferral and exact fold-work EOF', () => archive(async root => {
  await orderedGroups(root, [0, 32, 0, 34, 0, 31, 0]);
  const { scans, folds } = await readerFolds(root);
  assert.deepEqual(scans.flatMap(c => c.invocationSizes), []);
  assert.deepEqual(folds.map(c => c.invocationSizes), [[0, 32, 0], [34, 0, 31, 0]]);
  assert.deepEqual(folds.map(c => c.invocations), [3, 4]);
}));

test('exactly 128 staged zero-output groups leave an empty EOF batch, not another invocation', () => archive(async root => {
  for (let n = 0; n < 128; n++) await persist(root, record(n, { valid: true }, 'validation'));
  const { folds } = await readerFolds(root);
  assert.deepEqual(folds.map(c => [c.invocationSizes, c.invocations, c.finished]), [[Array(128).fill(0), 128, false], [[], 0, true]]);
}));

test('257 staged zero-output groups consume finite fold work and still count as invocations', () => archive(async root => {
  for (let n = 0; n < 257; n++) await persist(root, record(n, { valid: true }, 'validation'));
  const { folds } = await readerFolds(root);
  assert.deepEqual(folds.map(c => [c.invocations, c.contributions.length, c.finished]), [[128, 0, false], [128, 0, false], [1, 0, true]]);
  assert.deepEqual(folds.map(c => c.invocationSizes), [Array(128).fill(0), Array(128).fill(0), [0]]);
  assert.deepEqual(folds.map(c => c.omittedInvocations), [0, 0, 0]);
}));

test('129 omitted groups consume work, report omissions once and preserve useful observations', () => archive(async root => {
  for (let n = 0; n < 129; n++) {
    await persist(root, record(n, ruleRecording({ rules: 65 }).begin));
    await persist(root, record(n, { valid: true }, 'validation'));
  }
  await persist(root, record(129, ruleRecording().begin));
  const { scans, folds } = await readerFolds(root), all = [...scans, ...folds];
  assert.equal(folds.length, 2);
  assert.deepEqual(folds.map(c => c.finished), [false, true]);
  assert.equal(folds.reduce((n, c) => n + c.invocations, 0), 1);
  assert.equal(folds.flatMap(c => c.contributions).length, 2);
  assert.deepEqual(folds.flatMap(c => c.invocationSizes), [2]);
  assert.equal(all.reduce((n, c) => n + c.omittedInvocations, 0), 129);
  assert.deepEqual(folds.map(c => c.omittedInvocations), [0, 0]);
  assert.deepEqual(folds.at(-1)!.omittedThreads, [ids[0]]);
  assert.deepEqual([folds.at(-1)!.association, folds.at(-1)!.reasons], ['complete', ['oversized-invocation']]);
}));

test('root replacement between overflow deferral and emission fails closed', () => archive(async root => {
  await orderedGroups(root, [32, 34, 31]); const host = dashboardHost(), moved = `${root}-original`;
  try {
    const scan = await scannedHost(host, root), first = await host.readDashboard({ kind: 'advance', token: scan.next! });
    assert.deepEqual([first.invocations, first.contributions.length, first.state], [1, 32, 'reading']);
    await rename(root, moved); await mkdir(root, { mode: 0o700 });
    try {
      const chunk = await host.readDashboard({ kind: 'advance', token: first.next! });
      assert.deepEqual([chunk.state, chunk.next, chunk.invocations, chunk.contributions], ['restart-required', null, 0, []]);
      assert.deepEqual(chunk.invocationSizes, []);
    } finally { await rm(root, { recursive: true, force: true }); await rename(moved, root); }
  } finally { await host.dispose(); }
}));

type Counts = { owner: number; host: number; project: number; thread: number; environment: number; settings: number; list: number };
const counts = (): Counts => ({ owner: 0, host: 0, project: 0, thread: 0, environment: 0, settings: 0, list: 0 });
const delta = (after: Counts, before: Counts) => Object.fromEntries(Object.keys(after).map(k => [k, after[k as keyof Counts] - before[k as keyof Counts]]));
function sdk(calls: Counts, accessible = () => true): any {
  return {
    projects: { get: async () => { calls.project++; if (!accessible()) throw Error('revoked'); return { id: projectId }; } },
    threads: { list: async (args: any) => { calls.list++; return args.archived ? [] : ids.map(id => ({ id, projectId, providerId: 'pi' })); },
      get: async ({ threadId }: any) => { calls.thread++; assert.ok(ids.includes(threadId)); return { id: threadId, projectId, providerId: 'pi', environmentId }; } },
    environments: { get: async () => { calls.environment++; return { id: environmentId, hostId }; } },
  };
}

test('exported handlers preserve exact rows and coverage with fewer calls and fresh pre/post authorization', () => archive(async root => {
  await recordings(root); const host = dashboardHost(), calls = counts(), chunks: HostDashboardChunk[] = [];
  try {
    const owner = dashboardHandlers(sdk(calls), async () => { calls.settings++; return JSON.stringify({ [hostId]: root }); }, { stop: token => host.stopDashboard({ token }), read: async (input, selectedHost) => {
      calls.host++; assert.equal(selectedHost, hostId); const chunk = await host.readDashboard(input); chunks.push(chunk); return chunk;
    } }, () => 100);
    const read = async (input: Parameters<typeof owner.dashboard>[0]) => { calls.owner++; return owner.dashboard(input); };
    let page = await read({ kind: 'start', scope: { kind: 'project', projectId } });
    let replay: { token: string; page: typeof page } | undefined;
    for (let n = 0; page.next && n < 200; n++) {
      const before = { ...calls }, length = chunks.length, token = page.next;
      page = await read({ kind: 'advance', token });
      if (chunks.length > length && chunks.at(-1)!.invocations) {
        assert.deepEqual(delta(calls, before), { owner: 1, host: 1, project: 2, thread: 16, environment: 2, settings: 2, list: 0 });
        replay ??= { token, page: structuredClone(page) };
      }
    }
    assert.deepEqual([page.state, page.next, page.rowsNext], ['finished', null, null]);
    assert.deepEqual([page.started, page.observed], [100, 100]);
    assert.deepEqual(page.rows, [
      { key: policyKey, preview: 'Only synthetic actions.', builtin: false, passed: 90, failed: 10, unscored: 0, passing: 90, failing: 10, threads: 1 },
      { key: integrityKey, preview: 'Protect the recorded policy.', builtin: true, passed: 100, failed: 0, unscored: 0, passing: 100, failing: 0, threads: 1 },
    ]);
    assert.deepEqual(page.coverage, { discovered: 8, resolved: 8, processed: 8, unknown: 7, unavailable: 0, unprocessed: 0, partial: 0,
      omittedInvocations: 0, invocations: 100, capture: 'best-effort', reasons: [] });
    assert.deepEqual(calls, { owner: 11, host: 6, project: 21, thread: 128, environment: 16, settings: 20, list: 2 });
    assert.deepEqual(chunks.map(c => [c.invocations, c.contributions.length, c.state]),
      [[0, 0, 'reading'], [0, 0, 'reading'], [32, 64, 'reading'], [32, 64, 'reading'], [32, 64, 'reading'], [4, 8, 'finished']]);
    let before = { ...calls };
    assert.deepEqual(await read({ kind: 'advance', token: replay!.token }), replay!.page);
    assert.deepEqual(delta(calls, before), { owner: 1, host: 0, project: 1, thread: 8, environment: 1, settings: 1, list: 0 });
    before = { ...calls }; assert.deepEqual(await read({ kind: 'results', token: page.run }), page);
    assert.deepEqual(delta(calls, before), { owner: 1, host: 0, project: 1, thread: 8, environment: 1, settings: 1, list: 0 });
    assert.equal(JSON.stringify([page, chunks]).includes(sentinel), false);
  } finally { await host.dispose(); }
}));

test('access revocation while a real batched host response is in flight prevents aggregate publication', () => archive(async root => {
  await recordings(root); const host = dashboardHost(), calls = counts(); let accessible = true;
  let release!: () => void, dispatched!: () => void, response: HostDashboardChunk | undefined;
  const waiting = new Promise<void>(resolve => { dispatched = resolve; });
  const owner = dashboardHandlers(sdk(calls, () => accessible), async () => JSON.stringify({ [hostId]: root }), { stop: token => host.stopDashboard({ token }), read: async input => {
    const chunk = await host.readDashboard(input);
    if (chunk.invocations) {
      response = chunk;
      const hold = new Promise<void>(resolve => { release = resolve; }); dispatched(); await hold;
    }
    return chunk;
  } });
  try {
    let page = await owner.dashboard({ kind: 'start', scope: { kind: 'project', projectId } });
    for (let n = 0; n < 20; n++) {
      const pending = owner.dashboard({ kind: 'advance', token: page.next! });
      const result = await Promise.race([pending.then(value => ({ value })), waiting.then(() => null)]);
      if (result) { page = result.value; continue; }
      assert.deepEqual([response!.invocations, response!.contributions.length], [32, 64]);
      accessible = false; release(); page = await pending; break;
    }
    assert.equal(accessible, false);
    assert.deepEqual([page.state, page.next, page.rows, page.coverage.reasons], ['restart-required', null, [], ['scope-access-or-run-changed']]);
    const replay = await owner.dashboard({ kind: 'results', token: page.run });
    assert.deepEqual([replay.state, replay.rows], ['restart-required', []]);
  } finally { release?.(); await host.dispose(); }
}));
