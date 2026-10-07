import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { FixtureArchiveWriter } from '../test/archive-fixture.js';
import { answer } from '../test/helpers.js';
import { loadPolicy } from '../src/decision/policy.js';
import { policyEvidence, policyIntegrity } from '../src/decision/policy-contract.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { validRecord } from '../src/recording/contract.js';
import { invocationView } from '../src/inspector/view.js';
import { standaloneSummary } from '../inspector/src/shared/standalone-adapter.js';
import { decisionReason, explainDecision } from '../inspector/src/presentation.js';
import { overviewSchema } from './overview-contract.js';
import hostEntry from './host.js';

test('current schema-5 archive keeps common recorded facts, policy source identity and host-only raw data', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-react-parity-')));
  const threadId = 'thr_reactportfixture', sentinel = 'PRIVATE-CURRENT-ARGUMENT-SENTINEL';
  const host = experimental_createHostEntryHarness(hostEntry);
  try {
    const file = join(root, 'TENET.md'); await writeFile(file, 'Rule; Never commit.');
    const policy = await loadPolicy(file); assert.ok(policy.available);
    const writer = new FixtureArchiveWriter({ enabled: true, directory: join(root, 'archive') });
    const sink = writer.bind({ sessionId: 'current', invocationId: 'current', callId: 'current', toolName: 'bash',
      cwd: root, host: 'pi', contextId: 'main', bbThreadId: threadId, mode: 'observe' });
    sink('begin', { policy, config: { effectThreshold: .9, evidenceThreshold: .9 } });
    sink('request', { policy, questionVersion: 'policy-rules-v8-source-set', mapping: [],
      payload: { model: 'offline', state: { action: { arguments: sentinel }, policy: policyEvidence(policy),
        integrity: policyIntegrity(policy), context: {}, trajectory: {} }, questions: { q: sentinel } } });
    sink('response', { bytes: sentinel.length, truncated: false, value: sentinel });
    sink('validation', { valid: true }); sink('assessment', { assessment: answer(policy) });
    sink('decision', { decision: 'ALLOW', reason: 'all-rules-pass', contributions: [] });
    sink('permission', { outcome: 'released' });
    await writer.complete();
    const index = new ArchiveIndex(join(root, 'archive')); await index.refresh();
    const session = index.sessions().items[0]!, call = index.invocations(session.id).items[0]!;
    const detail = await index.detail(session.id, call.id, threadId);
    assert.ok(detail.records.length >= 7);
    assert.ok(detail.records.every(record => record.schemaVersion === 5 && validRecord(record)));
    const standalone = standaloneSummary(invocationView(detail.records));
    const response = overviewSchema.parse(await host.experimental_call('readOverview', { threadId, recordingDirectory: join(root, 'archive') }));
    assert.equal(response.state, 'available'); assert.ok(response.selected);
    const bb = response.selected;
    for (const field of ['decision', 'reason', 'permission', 'execution', 'approval', 'noRulesClassifiedViolated'] as const) assert.equal(bb[field], standalone[field], field);
    assert.deepEqual(bb.metadata, standalone.metadata); assert.equal(bb.metadata.policyDigest?.length, 64);
    assert.deepEqual(bb.rules.map(rule => rule.origin), standalone.rules.map(rule => rule.origin));
    assert.equal(bb.rules[0]!.origin?.role, 'project');
    assert.equal(explainDecision(bb), explainDecision(standalone));
    assert.equal(decisionReason(bb), decisionReason(standalone));
    assert.ok(!JSON.stringify(response).includes(sentinel)); assert.ok(JSON.stringify(detail.records).includes(sentinel));
    assert.throws(() => overviewSchema.parse({ ...response, selected: { ...bb,
      rules: [{ ...bb.rules[0], origin: { ...bb.rules[0]!.origin, raw: sentinel } }] } }));
  } finally { await rm(root, { recursive: true, force: true }); }
});
