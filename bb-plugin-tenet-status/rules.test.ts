import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { HistoricalArchiveWriter as ArchiveWriter } from '../test/legacy-recording-fixture.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { readPrivateFile } from '../src/recording/files.js';
import { invocationView } from '../src/inspector/view.js';
import { standaloneSummary } from '../inspector/src/shared/standalone-adapter.js';
import { overviewSchema } from './overview-contract.js';
import hostEntry from './host.js';
import plugin from './server.js';
const threadId = 'thr_abcdefgh1234', other = 'thr_wxyzabcd1234', hostId = 'host_abcdefgh1234';
const sentinel = 'RAW-RULE-SENTINEL-NEVER-SERIALIZE';
async function ready(index: ArchiveIndex) { for (let n = 0; n < 200; n++) { await index.refresh(); if (!index.indexing) return; } throw new Error('indexing did not finish'); }
async function fixture(schema: 3 | 4) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-rules-')));
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  function append(callId: string, link = threadId, failed = false) {
    const identity = { sessionId: 'shared', invocationId: callId, callId, toolName: 'bash', host: 'pi', contextId: 'main', cwd: '/synthetic', mode: 'observe' as const, bbThreadId: link };
    const sink = writer.bindHistorical(identity, schema);
    const rules = Array.from({ length: 19 }, (_, n) => ({ id: `r${n}`, text: n === 0 ? '<script>window.ruleProbe=true</script>' : n === 1 ? 'x'.repeat(3000) : `Recorded rule ${n}`, line: n + 1, enforcement: n === 2 ? 'WARN' : 'BLOCK' }));
    delete (rules[3] as any).text;
    const integrity = { id: 'integrity', text: 'Recorded built-in integrity.' };
    const policy = { digest: 'a'.repeat(64), rules };
    sink('begin', { action: { arguments: sentinel }, policy, integrity, config: { effectThreshold: .65, evidenceThreshold: .75 }, questionVersion: `recorded-schema-${schema}` });
    sink('request', { policy, payload: { state: { integrity, evidence: sentinel, action: { arguments: sentinel } }, questions: { q: sentinel } } });
    sink('response', { value: { response: sentinel }, bytes: 100, truncated: false });
    sink('validation', { valid: !failed });
    const ids = [...rules.map(r => r.id), 'integrity', 'missing-snapshot'];
    sink('assessment', failed ? { reason: 'provider-error', error: sentinel } : { assessment: { model: 'offline', rules: ids.map((ruleId, n) => ({ ruleId,
      outcome: { choice: n === 2 || n === 19 ? 'FAIL' : n === 4 ? 'APPROVAL_REQUIRED' : 'PASS', probabilities: n === 2 || n === 19 ? { PASS: .04, FAIL: .96 } : n === 4 ? { PASS: .04, APPROVAL_REQUIRED: .96 } : { PASS: .96, FAIL: .04 } },
      evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .94 } }, response: sentinel })) } });
    sink('decision', { decision: 'BLOCK', reason: 'rule-fail', contributions: ids.map((ruleId, n) => ({ ruleId,
      gates: n === 2 || n === 19 ? ['rule-fail'] : n === 5 ? ['outcome-confidence-below-threshold'] : [],
      contribution: n === 2 ? 'advisory-gates' : n === 19 || n === 5 ? 'blocking-gates' : n === 4 ? 'approval-required' : 'pass',
      effectThreshold: n === 5 ? .99 : .81, evidenceThreshold: schema === 4 ? null : .82, evidenceGate: schema === 4 ? 'not-applicable' : 'applicable', profile: schema === 4 ? 'selected-profile' : 'legacy' })) });
    sink('permission', { outcome: 'released', reason: sentinel });
    return sink;
  }
  append('first'); append('second'); append('foreign', other); append('provider-failure', threadId, true);
  await writer.drain(5000);
  return { root, writer };
}
for (const schema of [3, 4] as const) test(`schema-${schema} rule pages preserve recorded meanings, exact links, fixed caps and snapshot cursor scope`, async () => {
  const f = await fixture(schema);
  try {
    let reads = 0;
    const index = new ArchiveIndex(f.root, async (root, path) => { reads++; return readPrivateFile(root, path); });
    await ready(index);
    const all = await index.threadOverview(threadId);
    const firstId = all.calls.find(c => c.callId === 'first')!.id, secondId = all.calls.find(c => c.callId === 'second')!.id;
    const selection = { sessionId: all.sessionId!, callId: firstId };
    reads = 0;
    const first = await index.threadOverview(threadId, selection); overviewSchema.parse(first);
    const view = first.selected!, cursor = view.rulePage!.next!;
    assert.ok(reads <= 64); assert.equal(view.rules.length, 16); assert.equal(view.rulePage!.total, 20); assert.ok(cursor.length <= 512);
    assert.equal(view.metadata!.schemas[0], schema); assert.equal(view.rules[0]!.text, '<script>window.ruleProbe=true</script>');
    assert.equal(view.rules[1]!.text.length, 2048); assert.equal(view.rules[1]!.textStatus, 'truncated'); assert.equal(view.rules[1]!.omittedTextChars, 962);
    assert.equal(view.rules[3]!.textStatus, 'missing'); assert.equal(view.missingRuleSnapshots, 1);
    assert.equal(view.rules[2]!.enforcement, 'WARN'); assert.equal(view.rules[2]!.result!.outcome!.choice, 'FAIL'); assert.equal(view.rules[2]!.contribution, 'advisory-gates');
    assert.equal(view.rules[4]!.contribution, 'approval-required'); assert.deepEqual(view.rules[5]!.gateIds, ['outcome-confidence-below-threshold']);
    assert.equal(view.rules[5]!.thresholds.effectThreshold, .99); assert.equal(view.rules[0]!.thresholds.evidenceThreshold, schema === 4 ? null : .82);
    assert.equal(view.permission, 'released'); assert.equal(view.execution, 'unknown'); assert.equal(view.noRulesClassifiedViolated, false);
    const second = await index.threadOverview(threadId, { ...selection, ruleCursor: cursor }); overviewSchema.parse(second);
    assert.equal(second.selected!.rules.length, 4); assert.equal(second.selected!.rulePage!.offset, 16); assert.equal(second.selected!.rulePage!.next, null);
    assert.equal(second.selected!.rules.at(-1)!.builtin, true); assert.equal(second.selected!.rules.at(-1)!.result!.outcome!.choice, 'FAIL');
    assert.equal(new Set([...view.rules, ...second.selected!.rules].map(r => r.id)).size, 20);
    for (const request of [{ ...selection, callId: secondId }, { ...selection, sessionId: 'b'.repeat(64) }, {}, { callId: firstId }])
      await assert.rejects(index.threadOverview(threadId, { ...request, ruleCursor: cursor }));
    await assert.rejects(index.threadOverview(other, { ...selection, ruleCursor: cursor }));
    for (const bad of ['x'.repeat(513), first.nextCall ?? 'wrong-operation', Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cursor, 'base64url').toString()), offset: 17 })).toString('base64url')])
      await assert.rejects(index.threadOverview(threadId, { ...selection, ruleCursor: bad }));
    assert.ok(!JSON.stringify([first, second]).includes(sentinel));
    const native = index.sessions().items[0]!;
    const raw = index.invocations(native.id).items.find(c => c.callId === 'first')!;
    const standalone = standaloneSummary(invocationView((await index.detail(native.id, raw.id, threadId)).records));
    for (const rule of [...view.rules, ...second.selected!.rules]) {
      const equivalent = standalone.rules.find(r => r.id === rule.id)!;
      assert.deepEqual(rule.thresholds, equivalent.thresholds); assert.deepEqual(rule.result, equivalent.result); assert.deepEqual(rule.gateIds, equivalent.gateIds);
    }
    const fail = await index.threadOverview(threadId, { sessionId: all.sessionId!, callId: all.calls.find(c => c.callId === 'provider-failure')!.id });
    assert.equal(fail.selected!.failure, 'provider-error'); assert.ok(fail.selected!.rules.every(r => !r.result && r.gateIds === null));
    // A new recorded stage changes this selected snapshot; the old cursor must not select it.
    const identity = { sessionId: 'shared', invocationId: 'first', callId: 'first', toolName: 'bash', host: 'pi', contextId: 'main', cwd: '/synthetic', mode: 'observe' as const, bbThreadId: threadId };
    const update = f.writer.bindHistorical(identity, schema);
    update('execution', { outcome: 'executed' }); await f.writer.drain(5000); await ready(index);
    await assert.rejects(index.threadOverview(threadId, { ...selection, ruleCursor: cursor }), /invalid-page/);
  } finally { await f.writer.close(5000); await rm(f.root, { recursive: true, force: true }); }
});
test('owner and host strict RPCs carry only selected-host rule pages and reject forged selections', async () => {
  const f = await fixture(4), host = experimental_createHostEntryHarness(hostEntry);
  const fake = createFakePluginHost({ pluginId: 'tenet-rules', settings: { recordingDirectories: JSON.stringify({ [hostId]: f.root }) },
    sdk: { threads: { get: async () => ({ providerId: 'pi', environmentId: 'env_rules' }) as any }, environments: { get: async () => ({ id: 'env_rules', hostId }) as any } },
    experimental_callHostRpc: async ({ method, input, hostId: selected }: any) => { assert.equal(selected, hostId); return host.experimental_call(method, input); } });
  try {
    plugin(fake.bb);
    const first: any = await fake.harness.behavior.callRpc('overview', { threadId });
    const selection = { threadId, sessionId: first.sessionId, callId: first.selectedId, ruleCursor: first.selected.rulePage.next };
    const next: any = await fake.harness.behavior.callRpc('overview', selection);
    assert.equal(next.selected.rules.length, 4); assert.ok(!JSON.stringify([first, next]).includes(sentinel));
    for (const extra of [{ ruleId: 'r1' }, { snapshot: 'a'.repeat(64) }, { evidence: true }, { hostId }, { recordingDirectory: f.root }, { limit: 17 }])
      await assert.rejects(fake.harness.behavior.callRpc('overview', { ...selection, ...extra } as any));
    await assert.rejects(host.experimental_call('readOverview', { ...selection, callId: 'b'.repeat(64), recordingDirectory: f.root }));
    await assert.rejects(host.experimental_call('readOverview', { ...selection, threadId: other, recordingDirectory: f.root }));
    const rejected: any = await fake.harness.behavior.callRpc('overview', { ...selection, callId: 'b'.repeat(64) });
    assert.equal(rejected.state, 'unavailable'); assert.equal(rejected.selected, null);
    await assert.rejects(fake.harness.behavior.callRpc('evidence' as any, { threadId }));
    await assert.rejects(fake.harness.behavior.callRpc('response' as any, { threadId }));
    assert.throws(() => overviewSchema.parse({ ...next, selected: { ...next.selected, rules: Array(17).fill(next.selected.rules[0]) } }));
  } finally { await fake.harness.lifecycle.dispose(); await host.experimental_dispose(); await f.writer.close(); await rm(f.root, { recursive: true, force: true }); }
});
