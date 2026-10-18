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
    const response = overviewSchema.parse(await host.experimental_call('readOverview', { threadId, query: { kind: 'calls' }, recordingDirectory: join(root, 'archive') }));
    assert.equal(response.state, 'available'); assert.ok(response.selected);
    const bb = response.selected;
    for (const field of ['decision', 'reason', 'permission', 'execution', 'approval', 'noRulesClassifiedViolated'] as const) assert.equal(bb[field], standalone[field], field);
    assert.deepEqual(bb.metadata, standalone.metadata); assert.equal(bb.metadata.policyDigest?.length, 64);
    assert.deepEqual(bb.judge, standalone.judge);
    assert.deepEqual(bb.rules.map(rule => rule.origin), standalone.rules.map(rule => rule.origin));
    assert.equal(bb.rules[0]!.origin?.role, 'project');
    assert.equal(explainDecision(bb), explainDecision(standalone));
    assert.equal(decisionReason(bb), decisionReason(standalone));
    assert.ok(!JSON.stringify(response).includes(sentinel)); assert.ok(JSON.stringify(detail.records).includes(sentinel));
    assert.throws(() => overviewSchema.parse({ ...response, selected: { ...bb,
      rules: [{ ...bb.rules[0], origin: { ...bb.rules[0]!.origin, raw: sentinel } }] } }));
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const variant of ['v1', 'absent', 'hosted', 'loopback-80', 'apus', 'injected', 'failure', 'conflicting-terminal', 'origin-2048'] as const) {
  test(`recorded judge ${variant} has strict host and standalone parity without raw evidence`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-judge-summary-')));
    const threadId = 'thr_judgesummaryfixture';
    const host = experimental_createHostEntryHarness(hostEntry);
    try {
      const file = join(root, 'TENET.md'); await writeFile(file, 'Rule; Keep work local.');
      const policy = await loadPolicy(file); assert.ok(policy.available);
      const longOrigin = 'https://' + Array.from({ length: 31 }, () => 'a'.repeat(63)).join('.') + '.' + 'b'.repeat(56);
      assert.equal(longOrigin.length, 2048);
      const requestedDestination = variant === 'loopback-80' ? 'http://127.0.0.1' : variant === 'apus' ? 'http://127.0.0.1:8088'
        : variant === 'origin-2048' ? longOrigin : 'https://recorded.example.test';
      const descriptor = variant === 'absent' ? {} : variant === 'v1'
        ? { judgeReportVersion: 'judge-report-v1', requestedProvider: 'typesafe', requestedModel: 'historical-requested' }
        : { judgeReportVersion: 'judge-report-v2', requestedProvider: variant === 'apus' ? 'apus-llamacpp' : variant === 'injected' ? 'injected' : 'system-one',
          requestedModel: variant === 'injected' ? null : 'recorded-requested', requestedDestination: variant === 'injected' ? null : requestedDestination,
          transportContract: variant === 'apus' ? 'llamacpp-b11118-choice-v1' : variant === 'injected' ? null : 'system-one-v1',
          authentication: variant === 'injected' ? null : variant === 'apus' || variant === 'loopback-80' ? 'none' : 'bearer-env' };
      const configuration = { source: '~/.tenet/config.json + <project>/.tenet/config.json', settings: 'valid', availability: 'ready', deadlineMs: 1234,
        observation: { running: 1, waiting: 8, bytes: 8388608, ageMs: 30000 }, sources: { judge: 'project', deadlineMs: 'owner',
          observation: { running: 'project', waiting: 'owner', bytes: 'default', ageMs: 'default' } } };
      const writer = new FixtureArchiveWriter({ enabled: true, directory: join(root, 'archive') });
      const sink = writer.bind({ sessionId: 'recorded', invocationId: variant, callId: variant, toolName: 'bash', cwd: root,
        host: 'pi', contextId: 'main', bbThreadId: threadId, mode: 'observe' });
      sink('begin', { policy, ...descriptor, configuration, config: { effectThreshold: .9, evidenceThreshold: .9 } });
      sink('request', { policy, questionVersion: 'policy-rules-v8-source-set', mapping: [],
        payload: { model: 'recorded-requested', state: { action: { arguments: 'PRIVATE-JUDGE-SUMMARY-EVIDENCE' }, policy: policyEvidence(policy),
          integrity: policyIntegrity(policy), context: {}, trajectory: {} }, questions: { q: 'PRIVATE-JUDGE-SUMMARY-QUESTION' } } });
      sink('validation', { valid: variant !== 'failure' });
      sink('assessment', { ...descriptor, configuration, assessment: variant === 'failure' ? null : { ...answer(policy), model: 'recorded-returned' },
        ...(variant === 'failure' ? { reason: 'provider-error' } : {}) });
      sink('decision', { ...descriptor, decision: variant === 'failure' ? 'BLOCK' : 'ALLOW', reason: variant === 'failure' ? 'provider-error' : 'all-rules-pass' });
      sink('permission', { ...descriptor, outcome: 'released' });
      if (variant === 'conflicting-terminal') sink('assessment-status', { ...descriptor, status: 'unavailable', reason: 'provider-error' });
      await writer.complete();
      const index = new ArchiveIndex(join(root, 'archive')); await index.refresh();
      const session = index.sessions().items[0]!, call = index.invocations(session.id).items[0]!;
      const detail = await index.detail(session.id, call.id, threadId);
      assert.ok(detail.records.every(validRecord));
      const standalone = standaloneSummary(invocationView(detail.records));
      const response = overviewSchema.parse(await host.experimental_call('readOverview', { threadId, query: { kind: 'calls' }, recordingDirectory: join(root, 'archive') }));
      const bb = response.selected!; assert.ok(bb);
      assert.deepEqual(bb.judge, standalone.judge);
      assert.equal(bb.judge.provider, variant === 'v1' ? 'typesafe' : variant === 'absent' ? null : variant === 'apus' ? 'apus-llamacpp' : variant === 'injected' ? 'injected' : 'system-one');
      assert.equal(bb.judge.requestedDestination, ['v1', 'absent', 'injected'].includes(variant) ? null : requestedDestination);
      assert.equal(bb.judge.returnedModel, ['failure', 'conflicting-terminal'].includes(variant) ? null : 'recorded-returned');
      assert.deepEqual(bb.judge.configuration?.sources, configuration.sources);
      assert.doesNotMatch(JSON.stringify(response), /PRIVATE-JUDGE-SUMMARY/);
      for (const invalid of [{ raw: 'private' }, { requestedDestination: 'https://bad.invalid/path' }, { requestedDestination: 'x'.repeat(2049) },
        { transportContract: 'invented' }, { authentication: 'CUSTOM_ENV_REFERENCE' }, { configuration: { ...bb.judge.configuration, raw: 'private' } }]) {
        assert.throws(() => overviewSchema.parse({ ...response, selected: { ...bb, judge: { ...bb.judge, ...invalid } } }));
      }
      if (variant === 'conflicting-terminal') assert.throws(() => overviewSchema.parse({ ...response, selected: { ...bb, judge: { ...bb.judge, returnedModel: 'fabricated' } } }));
    } finally { await host.experimental_dispose(); await rm(root, { recursive: true, force: true }); }
  });
}
