import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { ArchiveWriter } from '../src/recording/archive.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { readPrivateFile } from '../src/recording/files.js';
import hostEntry from './host.js';
import plugin from './server.js';
import { overviewSchema } from './overview-contract.js';
import { invocationView } from '../src/inspector/view.js';
import { standaloneSummary, standaloneCall } from '../inspector/src/shared/standalone-adapter.js';
import { ArchiveWriter as HistoricalWriter } from '../test/legacy-recording-fixture.js';
const threadId = 'thr_abcdefgh1234', other = 'thr_wxyzabcd1234', machineA = 'host_abcdefgh1234', machineB = 'host_wxyzabcd1234';
const sentinel = 'RAW-SENTINEL-DO-NOT-SERIALIZE';
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-overview-')));
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const append = (callId: string, link: string | undefined = threadId, sessionId = 'shared-native', failure = false, choice = 'PASS', text = '<script>window.archiveExecuted=true</script>') => {
    const sink = writer.bind({ sessionId, invocationId: callId, callId, toolName: 'bash', mode: 'observe', host: 'pi', contextId: 'main', cwd: '/same-directory', bbThreadId: link });
    const policy = { digest: 'a'.repeat(64), rules: [{ id: 'r1', text, line: 4, enforcement: 'BLOCK' }] };
    sink('begin', { action: { arguments: sentinel }, policy, config: { effectThreshold: .87, evidenceThreshold: .83 }, questionVersion: 'historical-v1' });
    sink('request', { policy, questionVersion: 'historical-v1', mapping: [], payload: { model: 'fixture', state: { action: { arguments: sentinel }, policy: {}, context: { evidence: sentinel }, trajectory: {}, integrity: {} }, questions: { q: sentinel } } });
    sink('response', { value: { body: sentinel, error: sentinel }, bytes: 100, truncated: false });
    sink('validation', { valid: !failure, reason: failure ? 'provider-error' : undefined });
    sink('assessment', failure ? { reason: 'provider-error', error: sentinel } : { assessment: { model: 'fixture', rules: [{ ruleId: 'r1',
      outcome: { choice, probabilities: { [choice]: .72 } }, evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .95 } }, response: sentinel }] } });
    sink('decision', { decision: failure ? 'BLOCK' : choice === 'APPROVAL_REQUIRED' ? 'ASK' : 'ALLOW', reason: failure ? 'provider-error' : sentinel,
      contributions: [{ ruleId: 'r1', gates: failure ? [] : choice === 'FAIL' ? ['rule-fail', 'outcome-confidence-below-threshold'] : ['outcome-confidence-below-threshold'],
        contribution: 'blocking-gates', effectThreshold: .87, evidenceThreshold: .83, evidenceGate: 'applicable' }] });
    sink('permission', { outcome: 'released', error: sentinel }); sink('execution', { outcome: 'executed' });
    return sink;
  };
  return { root, writer, append };
}
async function ready(index: ArchiveIndex) { for (let n = 0; n < 200; n++) { await index.refresh(); if (!index.indexing) return; } throw new Error('fixture indexing did not finish'); }

test('host summaries allowlist all categories, exact mixed-thread links and terminal evaluator failures', async () => {
  const f = await fixture();
  try {
    f.append('fail-1', threadId, 'shared-native', true); f.append('fail-2', threadId, 'shared-native', true);
    f.append('pass'); f.append('violation', threadId, 'shared-native', false, 'FAIL'); f.append('approval', threadId, 'shared-native', false, 'APPROVAL_REQUIRED');
    f.append('foreign', other); // Unlinked history is recorded below.
    const historical = f.writer.bind({ sessionId: 'old', invocationId: 'old', callId: 'old', toolName: 'read', mode: 'observe', host: 'pi', contextId: 'main', cwd: '/same-directory' });
    historical('begin', {});
    const pending = f.writer.bind({ sessionId: 'shared-native', invocationId: 'pending', callId: 'pending', toolName: 'read', mode: 'observe', host: 'pi', contextId: 'main', cwd: '/same-directory', bbThreadId: threadId });
    pending('begin', {});
    // A resume uses the same native session, but remains bound to its recorded BB link.
    f.append('resume', threadId); f.append('resume', other);
    await f.writer.close(5000);
    let reads = 0, lose = false;
    const index = new ArchiveIndex(f.root, async (root, path) => { reads++; const text = await readPrivateFile(root, path); if (lose && JSON.parse(text).callId === 'fail-1') throw new Error(sentinel); return text; });
    await ready(index); reads = 0;
    const data = await index.threadOverview(threadId);
    overviewSchema.parse(data);
    assert.equal(data.sessions.length, 1); assert.equal(data.linkedCalls, 7); assert.equal(data.failures, 1);
    assert.equal(data.sessions[0]!.categoryCounts.unavailable, 2); assert.equal(data.sessions[0]!.categoryCounts.violation, 1);
    assert.equal(data.sessions[0]!.categoryCounts.pending, 1);
    assert.ok(reads <= 8, 'one selected detail, not every timeline row');
    assert.equal(data.calls.some(c => c.callId === 'foreign' || c.callId === 'old'), false);
    assert.ok(!JSON.stringify(data).includes(sentinel));
    for (const call of data.calls.filter(c => c.callId.startsWith('fail-'))) {
      assert.deepEqual(call.evaluatorState, { status: 'unavailable', reason: 'provider-error' });
      assert.deepEqual(call.categories, ['unavailable']); assert.equal(call.execution, 'executed');
      const detail = await index.threadOverview(threadId, { sessionId: data.sessionId!, callId: call.id });
      assert.equal(detail.selected?.noRulesClassifiedViolated, false); assert.equal(detail.selected?.failure, 'provider-error');
      assert.ok(!JSON.stringify(detail).includes(sentinel));
      const native = index.sessions().items.find(s => s.sessionId === 'shared-native')!;
      const rawRow = index.invocations(native.id).items.find(r => r.callId === call.callId)!;
      const raw = await index.detail(native.id, rawRow.id, threadId);
      assert.deepEqual(standaloneSummary(invocationView(raw.records)).evaluatorState, detail.selected?.evaluatorState);
      assert.deepEqual(standaloneCall(rawRow).evaluatorState, call.evaluatorState);
    }
    const violated = data.calls.find(c => c.callId === 'violation')!;
    const selected = await index.threadOverview(threadId, { sessionId: data.sessionId!, callId: violated.id });
    assert.equal(selected.selected?.rules[0]?.thresholds.effectThreshold, .87);
    assert.equal(selected.selected?.metadata?.questionVersion, 'historical-v1');
    assert.equal(selected.selected?.rules[0]?.text, '<script>window.archiveExecuted=true</script>');
    const foreign = await index.threadOverview(other);
    await assert.rejects(index.threadOverview(threadId, { sessionId: foreign.sessionId! }), /invalid-selection/);
    await assert.rejects(index.threadOverview(threadId, { sessionId: data.sessionId!, callId: foreign.calls[0]!.id }), /invalid-selection/);
    await assert.rejects(index.threadOverview(threadId, { sessionId: 'f'.repeat(64) }), /invalid-selection/);
    const unknown = await index.threadOverview('thr_000000001234');
    assert.equal(unknown.coverage, 'unknown'); assert.equal(unknown.selected, null);
    lose = true;
    const missing = await index.threadOverview(threadId, { sessionId: data.sessionId!, callId: data.calls.find(c => c.callId === 'fail-1')!.id });
    assert.equal(missing.selected, null); assert.ok(missing.issues.includes('detail-unavailable')); assert.ok(!JSON.stringify(missing).includes(sentinel));
    assert.throws(() => overviewSchema.parse({ ...data, evidence: sentinel }));
    assert.throws(() => overviewSchema.parse({ ...selected, selected: { ...selected.selected, response: sentinel } }));
  } finally { await f.writer.close(); await rm(f.root, { recursive: true, force: true }); }
});

test('summary pages and cursors are bounded and scoped; refresh/detail budgets remain shared', async () => {
  const f = await fixture();
  try {
    for (let n = 0; n < 55; n++) { f.append(`call-${n}`, threadId, 'one-session', false, n % 2 ? 'FAIL' : 'PASS', 'x'.repeat(3000)); await f.writer.drain(5000); }
    for (let n = 0; n < 51; n++) { f.append(`session-call-${n}`, threadId, `session-${n}`); await f.writer.drain(5000); }
    await f.writer.close(5000);
    let reads = 0;
    const index = new ArchiveIndex(f.root, async (root, path) => { reads++; return readPrivateFile(root, path); });
    await index.refresh(); assert.ok(reads <= 256); assert.ok(index.indexing); await ready(index);
    const all = await index.threadOverview(threadId); assert.equal(all.sessions.length, 50); assert.ok(all.nextSession && all.nextSession.length <= 512);
    const second = await index.threadOverview(threadId, { sessionCursor: all.nextSession! }); assert.equal(second.sessions.length, 2);
    const native = index.sessions({ limit: 100 }).items.find(s => s.sessionId === 'one-session')!;
    const linkedId = (await import('../src/recording/archive.js')).sessionKey(JSON.stringify([threadId, native.id]));
    reads = 0;
    const first = await index.threadOverview(threadId, { sessionId: linkedId }); assert.equal(first.calls.length, 50); assert.ok(first.nextCall); assert.ok(reads <= 64);
    assert.equal(first.selected?.rules[0]?.text.length, 2048); assert.match(first.selected!.rules[0]!.text, /\[omitted\]$/);
    const next = await index.threadOverview(threadId, { sessionId: linkedId, callCursor: first.nextCall! }); assert.equal(next.calls.length, 5);
    assert.equal(new Set([...first.calls, ...next.calls].map(c => c.id)).size, 55);
    await assert.rejects(index.threadOverview(other, { callCursor: first.nextCall! }));
    await assert.rejects(index.threadOverview(threadId, { sessionId: linkedId, category: 'violation', callCursor: first.nextCall! }), /invalid-page/);
    await assert.rejects(index.threadOverview(threadId, { sessionCursor: first.nextCall! }), /invalid-page/);
    await assert.rejects(index.threadOverview(threadId, { sessionId: linkedId, callCursor: 'x'.repeat(513) }), /invalid-page/);
  } finally { await f.writer.close(); await rm(f.root, { recursive: true, force: true }); }
});

test('backend resolves only the selected Pi machine, rejects client escapes, and clears unavailable hosts/archives', async () => {
  const a = await fixture(), b = await fixture();
  const hostA = experimental_createHostEntryHarness(hostEntry), hostB = experimental_createHostEntryHarness(hostEntry);
  const calls: any[] = []; let disconnected = false, currentEnvironment = 'env_machinea';
  try {
    a.append('machine-a'); b.append('machine-b', other); await a.writer.close(5000); await b.writer.close(5000);
    const fake = createFakePluginHost({ pluginId: 'tenet-overview', settings: { recordingDirectories: JSON.stringify({ [machineA]: a.root, [machineB]: b.root }) },
      sdk: { threads: { get: async ({ threadId: id }: any) => ({ id, providerId: id === 'thr_nonpi1234' ? 'codex' : 'pi', environmentId: id === other ? 'env_machineb' : currentEnvironment }) as any },
        environments: { get: async ({ environmentId }: any) => ({ id: environmentId, hostId: environmentId === 'env_machineb' ? machineB : machineA }) as any } },
      experimental_callHostRpc: async ({ method, input, hostId }: any) => { calls.push({ method, input, hostId }); if (disconnected) throw new Error(sentinel); return (hostId === machineA ? hostA : hostB).experimental_call(method, input); } });
    try {
      plugin(fake.bb);
      const local: any = await fake.harness.behavior.callRpc('overview', { threadId });
      assert.deepEqual(local.calls.map((c: any) => c.callId), ['machine-a']); assert.equal(calls[0].hostId, machineA);
      const remote: any = await fake.harness.behavior.callRpc('overview', { threadId: other });
      assert.deepEqual(remote.calls.map((c: any) => c.callId), ['machine-b']); assert.equal(calls[1].hostId, machineB);
      assert.match(local.readScope, /^[a-f0-9]{64}$/); assert.notEqual(local.readScope, remote.readScope);
      assert.ok(!JSON.stringify(local).includes(a.root));
      const unchanged: any = await fake.harness.behavior.callRpc('overview', { threadId }); assert.equal(unchanged.readScope, local.readScope);
      currentEnvironment = 'env_machinea_moved';
      const moved: any = await fake.harness.behavior.callRpc('overview', { threadId }); assert.notEqual(moved.readScope, local.readScope);
      currentEnvironment = 'env_machinea';
      await fake.harness.behavior.setSettings({ recordingDirectories: JSON.stringify({ [machineA]: b.root, [machineB]: b.root }) });
      const changedArchive: any = await fake.harness.behavior.callRpc('overview', { threadId }); assert.notEqual(changedArchive.readScope, local.readScope);
      await fake.harness.behavior.setSettings({ recordingDirectories: JSON.stringify({ [machineA]: a.root, [machineB]: b.root }) });
      const before = calls.length;
      const unsupported: any = await fake.harness.behavior.callRpc('overview', { threadId: 'thr_nonpi1234' });
      assert.equal(unsupported.state, 'unsupported'); assert.equal(calls.length, before);
      for (const extra of [{ readScope: local.readScope }, { hostId: machineB }, { recordingDirectory: b.root }, { nativeSession: 'shared-native' }, { limit: 51 }, { cursor: 'x' }])
        await assert.rejects(fake.harness.behavior.callRpc('overview', { threadId, ...extra } as any));
      await assert.rejects(fake.harness.behavior.callRpc('overview', { threadId, callCursor: 'x'.repeat(513) }));
      const forged: any = await fake.harness.behavior.callRpc('overview', { threadId, sessionId: remote.sessionId });
      assert.equal(forged.state, 'unavailable'); assert.deepEqual(forged.calls, []);
      disconnected = true;
      const lost: any = await fake.harness.behavior.callRpc('overview', { threadId: other });
      assert.equal(lost.state, 'unavailable'); assert.deepEqual(lost.calls, []); assert.equal(calls.at(-1).hostId, machineB);
      assert.ok(!JSON.stringify(lost).includes(sentinel)); disconnected = false;
      await rm(b.root, { recursive: true, force: true });
      const missing: any = await fake.harness.behavior.callRpc('overview', { threadId: other }); assert.equal(missing.state, 'unavailable');
      const relative: any = await hostA.experimental_call('readOverview', { threadId, recordingDirectory: '../archive' }); assert.equal(relative.state, 'unavailable');
    } finally { await fake.harness.lifecycle.dispose(); }
  } finally { await hostA.experimental_dispose(); await hostB.experimental_dispose(); await a.writer.close(); await b.writer.close(); await rm(a.root, { recursive: true, force: true }); await rm(b.root, { recursive: true, force: true }); }
});

test('historical contract, label/rule limits and selected-detail cap do not become a false pass', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-overview-limits-')));
  const writer = new HistoricalWriter({ enabled: true, directory: root });
  try {
    const identity = { sessionId: 'historical', invocationId: 'historical-call', callId: 'c'.repeat(900), toolName: 't'.repeat(900),
      mode: 'observe' as const, host: 'pi', contextId: 'main', cwd: '/same-directory', bbThreadId: threadId };
    const historical = writer.bindHistorical(identity, 3);
    const rules = Array.from({ length: 20 }, (_, n) => ({ id: `rule-${n}`, text: `Recorded rule ${n}`, line: n + 1, enforcement: 'BLOCK' }));
    historical('begin', { policy: { rules }, config: { effectThreshold: .65, evidenceThreshold: .75 }, questionVersion: 'old-contract-v3' });
    historical('assessment-status', { status: 'unavailable', reason: 'provider-error' });
    historical('execution', { outcome: 'executed' });
    await writer.drain(5000);
    const index = new ArchiveIndex(root); await ready(index);
    const data = await index.threadOverview(threadId); overviewSchema.parse(data);
    assert.ok(data.calls[0]!.callId.length <= 256); assert.ok(data.calls[0]!.toolName.length <= 256);
    assert.equal(data.selected!.rules.length, 16); assert.equal(data.selected!.omittedRules, 4);
    assert.deepEqual(data.selected!.metadata!.schemas, [3]); assert.equal(data.selected!.metadata!.questionVersion, 'old-contract-v3');
    assert.equal(data.selected!.rules[0]!.thresholds.effectThreshold, .65);
    assert.deepEqual(data.selected!.evaluatorState, { status: 'unavailable', reason: 'provider-error' }); assert.equal(data.failures, 0);
    for (let n = 0; n < 65; n++) historical('begin', { action: { arguments: sentinel } });
    await writer.drain(5000); await ready(index);
    const capped = await index.threadOverview(threadId, { sessionId: data.sessionId!, callId: data.calls[0]!.id });
    assert.equal(capped.selected, null); assert.ok(capped.issues.includes('detail-unavailable')); assert.ok(!JSON.stringify(capped).includes(sentinel));
  } finally { await writer.close(5000); await rm(root, { recursive: true, force: true }); }
});


test('live archive stages update an older selected call without losing bounded cursor history or leaking raw fields', async () => {
  const f = await fixture();
  try {
    const older = f.append('older');
    for (let n = 0; n < 55; n++) { f.append(`newer-${n}`); await f.writer.drain(5000); }
    const index = new ArchiveIndex(f.root); await ready(index);
    const first = await index.threadOverview(threadId);
    const second = await index.threadOverview(threadId, { sessionId: first.sessionId!, callCursor: first.nextCall! });
    const selectedId = second.calls.find(c => c.callId === 'older')!.id;
    const selection = { sessionId: first.sessionId!, callId: selectedId };
    const selected = await index.threadOverview(threadId, selection);
    assert.equal(selected.selected!.identity!.callId, 'older'); assert.equal(selected.calls.some(c => c.id === selectedId), false);
    older('assessment-status', { status: 'unavailable', reason: 'provider-error', error: sentinel });
    f.append('live-appended'); await f.writer.drain(5000); await ready(index);
    const live = await index.threadOverview(threadId, selection); overviewSchema.parse(live);
    assert.equal(live.calls.length, 50); assert.equal(live.linkedCalls, 57);
    assert.equal(live.selected!.evaluatorState!.status, 'unavailable'); assert.equal(live.selectedId, selectedId);
    assert.equal(live.selected!.permission, 'released'); assert.equal(live.selected!.execution, 'executed');
    const olderPage = await index.threadOverview(threadId, { ...selection, callCursor: first.nextCall! });
    assert.ok(olderPage.calls.some(c => c.id === selectedId)); assert.ok(!JSON.stringify([live, olderPage]).includes(sentinel));
  } finally { await f.writer.close(5000); await rm(f.root, { recursive: true, force: true }); }
});
