import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { FixtureArchiveWriter as ArchiveWriter } from '../test/archive-fixture.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { readPrivateFile, writeStageFile } from '../src/recording/files.js';
import { recordSessionKey, recordInvocationKey } from '../src/recording/archive.js';
import hostEntry from './host.js';
import plugin from './server.js';
import { setImmediate as yieldIo } from 'node:timers/promises';
import type { Status, Findings } from './contract.js';

const threadId = 'thr_abcdefgh1234', otherId = 'thr_wxyzabcd1234', hostId = 'host_abcdefgh1234';

async function bounded<T>(work: Promise<T>, label: string, timeoutMs = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} did not finish before the fixture deadline`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

async function append(writer: ArchiveWriter, id: string, link: string | undefined, choice: 'FAIL' | 'PASS', valid = true) {
  const sink = writer.bind({ sessionId: 'session', invocationId: id, callId: id, toolName: 'edit', cwd: '/tmp',
    mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: link });
  const policy = { rules: [{ id: 'r1', text: '<img src=x onerror=alert(1)>', line: 8, enforcement: 'WARN' }] };
  sink('begin', { policy: { rules: [{ ...policy.rules[0], text: 'old policy' }] }, action: 'secret-bearing-action' });
  sink('request', { payload: { model: 'fixture', state: { action: {}, policy: {}, context: {}, trajectory: {}, integrity: {} },
    questions: {}, secret: 'secret-bearing-action' }, policy, questionVersion: 'v1', mapping: [] });
  sink('validation', { valid });
  sink('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'r1', outcome: { choice, probabilities: { FAIL: 0.72 } } }] } });
  sink('decision', { decision: 'ALLOW' });
  sink('permission', { outcome: 'released' });
  sink('execution', { outcome: 'executed' });
  // Keep capture loss visible and do not overflow the unchanged production queue.
  await bounded(writer.settle(), `Capture ${id}`);
}

async function readyStatus(read: () => Promise<Status>): Promise<Status> {
  return bounded((async () => {
    for (let pass = 0; pass < 16; pass++) {
      const status = await read();
      assert.notEqual(status.coverage, 'unavailable', 'Fixture archive must remain available');
      if (!status.issues.includes('indexing-in-progress')) return status;
    }
    throw new Error('Fixture cold index did not finish within 16 refreshes');
  })(), 'Cold index');
}

for (const ioTurns of [0, 1, 4]) test(`owner details paginate only validated linked selected FAILs and project no raw actions, I/O turns ${ioTurns}`, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-bb-details-')));
  const writer = new ArchiveWriter({ enabled: true, directory: root }, undefined, async (...args) => {
    for (let turn = 0; turn < ioTurns; turn++) await yieldIo();
    await writeStageFile(...args);
  });
  const host = experimental_createHostEntryHarness(hostEntry);
  const fake = createFakePluginHost({ pluginId: 'tenet-status', settings: { recordingDirectories: JSON.stringify({ [hostId]: root }) },
    sdk: { threads: { get: async ({ threadId: id }: any) => ({ id, providerId: id === otherId ? 'codex' : 'pi', environmentId: 'env_fixture' }) as any },
      environments: { get: async () => ({ id: 'env_fixture', hostId }) as any } },
    experimental_callHostRpc: async ({ method, input, hostId: selected }: any) => {
      assert.equal(selected, hostId); return host.experimental_call(method, input);
    } });
  try {
    for (let n = 0; n < 7; n++) await append(writer, `flagged-${n}`, threadId, 'FAIL');
    await append(writer, 'passing', threadId, 'PASS'); await append(writer, 'invalid', threadId, 'FAIL', false);
    await append(writer, 'historical', undefined, 'FAIL'); await append(writer, 'other-thread', otherId, 'FAIL');
    await bounded(writer.complete(), 'Capture completion');
    assert.equal(writer.health().written, 77, 'all eleven seven-stage calls must persist');
    await plugin(fake.bb);
    const ready = await readyStatus(() => fake.harness.behavior.callRpc('status', { threadId }) as Promise<Status>);
    assert.equal(ready.linkedCalls, 9); assert.equal(ready.failures, 7);
    const first: any = await fake.harness.behavior.callRpc('findings', { threadId });
    assert.equal(first.coverage, 'partial'); assert.equal(first.linkedCalls, 9);
    assert.equal(first.items.length, 5); assert.ok(first.next);
    const second: any = await fake.harness.behavior.callRpc('findings', { threadId, cursor: first.next });
    assert.equal(second.items.length, 2); assert.equal(second.next, null);
    assert.deepEqual([...first.items, ...second.items].map(item => item.callId).sort(), Array.from({ length: 7 }, (_, n) => `flagged-${n}`));
    const item = first.items[0];
    assert.deepEqual(item.rules, [{ ruleId: 'r1', severity: 'WARN', policyText: '<img src=x onerror=alert(1)>', confidence: 0.72, uncertain: true, kind: 'policy' }]);
    assert.match(item.snapshot, /^[a-f0-9]{64}$/);
    assert.equal(item.wouldDecision, 'ALLOW'); assert.equal(item.actualPermission, 'released'); assert.equal(item.observedExecution, 'executed');
    assert.ok(item.missingStages.includes('response'));
    assert.ok(!JSON.stringify(first).includes('secret-bearing-action'));
    assert.ok(!JSON.stringify(first).includes('old policy'));
    const unknown: any = await fake.harness.behavior.callRpc('findings', { threadId: 'thr_000000001234' });
    assert.equal(unknown.coverage, 'unknown'); assert.deepEqual(unknown.items, []);
    const nonPi: any = await fake.harness.behavior.callRpc('findings', { threadId: otherId });
    const address = { schemaVersion: 3, host: 'pi', contextId: 'main', sessionId: 'session', invocationId: 'flagged-0' };
    let loseRequest = false;
    const flaky = new ArchiveIndex(root, async (archive, path) => {
      const text = await readPrivateFile(archive, path);
      const record = JSON.parse(text);
      if (loseRequest && record.invocationId === 'flagged-0' && record.stage === 'request') throw new Error('vanished-request');
      return text;
    });
    await flaky.refresh();
    const originalIssues = flaky.issues.bind(flaky);
    (flaky as any).issues = (session?: string) => [...originalIssues(session), ...(session
      ? [{ session, file: 'unrelated.json', reason: 'record-unavailable' }] : [])];
    const safeFirst = await flaky.threadFindings(threadId);
    const safeSecond = await flaky.threadFindings(threadId, safeFirst.next!);
    assert.equal([...safeFirst.items, ...safeSecond.items].length, 7, 'an unrelated session issue must not hide a call');
    assert.ok(!safeFirst.issues.includes('detail-unavailable'), 'session-wide issues are not this call failing');
    loseRequest = true;
    const missing = await flaky.detail(recordSessionKey(address), recordInvocationKey(address), threadId);
    assert.ok(missing.readIssues.some(issue => issue.reason === 'record-unavailable'));
    const brokenFirst = await flaky.threadFindings(threadId);
    const brokenSecond = await flaky.threadFindings(threadId, brokenFirst.next!);
    const brokenItems = [...brokenFirst.items, ...brokenSecond.items];
    assert.equal(brokenItems.length, 6);
    assert.ok(!brokenItems.some(item => item.callId === 'flagged-0'));
    assert.ok(!JSON.stringify(brokenItems).includes('old policy'));
    assert.ok([...brokenFirst.issues, ...brokenSecond.issues].includes('detail-unavailable'));
    const index = new ArchiveIndex(root); await index.refresh();
    const original = (index as any).allEntries.bind(index);
    let fullScans = 0;
    (index as any).allEntries = function* () { fullScans++; yield* original(); };
    await index.threadFindings(threadId);
    assert.equal(fullScans, 1, 'one metadata pass per findings page, not per candidate');
    (index as any).allEntries = () => { throw new Error('detail must not scan the full index'); };
    assert.ok((await index.detail(recordSessionKey(address), recordInvocationKey(address), threadId)).records.length);
    assert.equal(nonPi.coverage, 'unavailable');
    await assert.rejects(fake.harness.behavior.callRpc('findings', { threadId, cursor: 'not-a-cursor' }));
    await assert.rejects(fake.harness.behavior.callRpc('findings', { threadId, hostId } as any));
  } finally { await writer.close(); await fake.harness.lifecycle.dispose(); await host.experimental_dispose(); await rm(root, { recursive: true, force: true }); }
});

for (const loss of ['dropped', 'failed'] as const) test(`detail fixture rejects ${loss} capture`, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-bb-detail-loss-')));
  const writer = new ArchiveWriter({ enabled: true, directory: root },
    loss === 'dropped' ? { events: 1, bytes: 16 * 1024 * 1024 } : undefined,
    loss === 'failed' ? async () => { throw new Error('fixture-disk-failure'); } : writeStageFile);
  try {
    await assert.rejects(append(writer, 'lost', threadId, 'FAIL'), /Static archive fixture did not finish cleanly/);
    assert.ok(writer.health()[loss] > 0);
    await assert.rejects(bounded(writer.complete(), 'Capture completion'), /Static archive fixture did not finish cleanly/);
  } finally { await writer.close(); await rm(root, { recursive: true, force: true }); }
});

test('detail fixture capture waits for persistence and rejects a stalled completion', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-bb-detail-stall-')));
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const writing = new Promise<void>(resolve => { entered = resolve; });
  const writer = new ArchiveWriter({ enabled: true, directory: root }, undefined, async (...args) => {
    entered(); await gate; await writeStageFile(...args);
  });
  let settled = false;
  try {
    const capture = append(writer, 'held', threadId, 'FAIL').then(() => { settled = true; });
    await bounded(writing, 'Persistence start');
    assert.equal(settled, false); assert.equal(writer.health().written, 0);
    await assert.rejects(bounded(writer.complete(), 'Capture completion', 0), /Capture completion did not finish before the fixture deadline/);
    release(); await capture;
    await bounded(writer.complete(), 'Capture completion');
    assert.equal(settled, true); assert.equal(writer.health().written, 7);
  } finally { release(); await writer.close(); await rm(root, { recursive: true, force: true }); }
});

test('cold findings report bounded partial progress before complete pagination', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-bb-detail-cold-')));
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const host = experimental_createHostEntryHarness(hostEntry);
  const readStatus = () => host.experimental_call('readStatus', { threadId, recordingDirectory: root });
  const readFindings = (cursor?: string) => host.experimental_call('readFindings', { threadId, recordingDirectory: root, cursor });
  try {
    // Forty seven-stage calls exceed the unchanged 256-stage cold-read budget.
    for (let n = 0; n < 40; n++) await append(writer, `cold-${n}`, threadId, 'FAIL');
    await bounded(writer.complete(), 'Capture completion');
    assert.equal(writer.health().written, 280);
    const cold = await readFindings();
    assert.ok(cold.issues.includes('indexing-in-progress'));
    assert.equal(cold.coverage, 'partial');
    assert.ok(cold.linkedCalls > 0 && cold.linkedCalls <= 40);
    assert.ok(cold.items.length <= 5);
    assert.ok(!JSON.stringify(cold).includes('secret-bearing-action'));
    const ready = await readyStatus(readStatus);
    assert.equal(ready.linkedCalls, 40); assert.equal(ready.failures, 40);
    // Start pagination again without the cold cursor. The index is now complete.
    const items: Findings['items'] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 8; page++) {
      const findings = await readFindings(cursor);
      assert.ok(!findings.issues.includes('indexing-in-progress'));
      assert.equal(findings.linkedCalls, 40); assert.equal(findings.items.length, 5);
      assert.ok(!JSON.stringify(findings).includes('secret-bearing-action'));
      items.push(...findings.items);
      if (page < 7) assert.ok(findings.next);
      else assert.equal(findings.next, null);
      cursor = findings.next ?? undefined;
    }
    assert.deepEqual(items.map(item => item.callId).sort(), Array.from({ length: 40 }, (_, n) => `cold-${n}`).sort());
  } finally { await writer.close(); await host.experimental_dispose(); await rm(root, { recursive: true, force: true }); }
});

test('cold-index readiness rejects unavailable or non-completing reads', async () => {
  await assert.rejects(readyStatus(async () => ({ coverage: 'unavailable', linkedCalls: 0, failures: 0, issues: [] })), /Fixture archive must remain available/);
  let reads = 0;
  await assert.rejects(readyStatus(async () => {
    reads++;
    return { coverage: 'partial', linkedCalls: 7, failures: 7, issues: ['indexing-in-progress'] };
  }), /Fixture cold index did not finish within 16 refreshes/);
  assert.equal(reads, 16);
});
