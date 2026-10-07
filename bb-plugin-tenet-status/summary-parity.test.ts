import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { FixtureArchiveWriter } from '../test/archive-fixture.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { validRecord } from '../src/recording/contract.js';
import { invocationView } from '../src/inspector/view.js';
import { standaloneSummary } from '../inspector/src/shared/standalone-adapter.js';
import { decisionReason, explainDecision } from '../inspector/src/presentation.js';
import hostEntry from './host.js';

const threadId = 'thr_parityfixture1', sentinel = 'PRIVATE-PARITY-SOURCE';
const cases = [
  { reason: 'all-rules-pass', decision: 'ALLOW', choice: 'PASS', expectedApproval: 'not required' },
  { reason: 'insufficient-evidence', decision: 'BLOCK', choice: 'PASS', gate: 'outcome-confidence-below-threshold', expectedApproval: 'not required' },
  { reason: 'advisory-findings', decision: 'ALLOW', choice: 'FAIL', enforcement: 'WARN', gate: 'rule-fail', expectedApproval: 'not required' },
  { reason: 'rule-approval-required', decision: 'ASK', choice: 'APPROVAL_REQUIRED', expectedApproval: 'unknown' },
  { reason: 'rule-failed', decision: 'BLOCK', choice: 'FAIL', gate: 'rule-fail', expectedApproval: 'not required' },
  { reason: 'policy-integrity', decision: 'BLOCK', choice: 'PASS', integrityFail: true, expectedApproval: 'not required' },
  { reason: 'rule-approval-required', decision: 'ASK', choice: 'APPROVAL_REQUIRED', permissionReason: 'approval-unavailable', expectedApproval: 'unavailable (host cannot approve)' },
  { reason: 'rule-approval-required', decision: 'ASK', choice: 'APPROVAL_REQUIRED', mode: 'observe', expectedApproval: 'not requested (observe mode)' },
  { reason: 'rule-approval-required', decision: 'ASK', choice: 'APPROVAL_REQUIRED', approval: 'approved', expectedApproval: 'approved' },
  { reason: 'rule-approval-required', decision: 'ASK', choice: 'APPROVAL_REQUIRED', approval: 'denied', expectedApproval: 'denied' },
  { reason: 'rule-approval-required', decision: 'ASK', choice: 'APPROVAL_REQUIRED', approval: 'cancelled', expectedApproval: 'cancelled' },
] as const;

for (const schema of [3, 4] as const) for (const [n, scenario] of cases.entries()) test(`schema-${schema} archive-to-host summary parity: ${scenario.reason} / ${scenario.expectedApproval}`, async () => {
  const c: { reason: string; decision: string; choice: string; expectedApproval: string; enforcement?: string; gate?: string; integrityFail?: boolean; permissionReason?: string; mode?: 'observe'; approval?: string } = scenario;
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-summary-parity-')));
  const host = experimental_createHostEntryHarness(hostEntry);
  try {
    const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
    const identity = { sessionId: 'parity', invocationId: `case-${n}`, callId: `case-${n}`, toolName: 'bash', cwd: '/synthetic', host: 'pi', contextId: 'main', bbThreadId: threadId, mode: c.mode ?? 'enforce' as const };
    const sink = writer.bindHistorical(identity, schema);
    const policy = { digest: 'a'.repeat(64), rules: [{ id: 'rule', text: 'Recorded policy.', line: 1, enforcement: c.enforcement ?? 'BLOCK' }] };
    const integrity = { id: 'integrity', text: 'Recorded integrity.' };
    const outcome = (choice: string) => ({ choice, probabilities: { PASS: choice === 'PASS' ? .97 : .01, FAIL: choice === 'FAIL' ? .97 : .01, APPROVAL_REQUIRED: choice === 'APPROVAL_REQUIRED' ? .97 : .01, UNKNOWN: .01 } });
    const result = (ruleId: string, choice: string) => ({ ruleId, outcome: outcome(choice), evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .97, INSUFFICIENT: .03 } } });
    const assessment = { model: 'scripted', rules: [result('rule', c.choice), result('integrity', c.integrityFail ? 'FAIL' : 'PASS')] };
    sink('begin', { policy, integrity, config: { effectThreshold: .99, evidenceThreshold: .9, assessmentProfile: 'legacy' }, arguments: sentinel });
    sink('request', { policy, payload: { model: 'scripted', state: { action: { arguments: sentinel }, policy: {}, context: {}, trajectory: {}, integrity }, questions: { q: sentinel } }, questionVersion: 'recorded-v3', mapping: [] });
    sink('response', { bytes: sentinel.length, truncated: false, value: sentinel });
    sink('validation', { valid: true });
    sink('assessment', { assessment });
    sink('decision', { decision: c.decision, reason: c.reason, contributions: [{ ruleId: 'rule', gates: c.gate ? [c.gate] : [], contribution: c.gate ? c.enforcement === 'WARN' ? 'advisory-gates' : 'blocking-gates' : 'pass', effectThreshold: .99, evidenceThreshold: .9, evidenceGate: 'applicable', profile: 'legacy' }, { ruleId: 'integrity', gates: c.integrityFail ? ['rule-fail'] : [], contribution: c.integrityFail ? 'blocking-gates' : 'pass' }] });
    if (c.approval) sink('approval', { outcome: c.approval });
    sink('permission', { outcome: c.decision === 'BLOCK' || c.permissionReason || c.approval === 'denied' || c.approval === 'cancelled' ? 'blocked' : 'released', reason: c.permissionReason ?? sentinel });
    await writer.complete();
    const index = new ArchiveIndex(root); await index.refresh();
    const session = index.sessions().items[0]!, call = index.invocations(session.id).items[0]!;
    const { records } = await index.detail(session.id, call.id, threadId);
    assert.ok(records.length >= 7); assert.ok(records.every(validRecord), 'Parity fixtures must pass the recorded schema contract');
    const standalone = standaloneSummary(invocationView(records));
    const bb = (await host.experimental_call('readOverview', { threadId, recordingDirectory: root })).selected!;
    assert.ok(bb);
    for (const field of ['decision', 'reason', 'permission', 'execution', 'approval', 'noRulesClassifiedViolated'] as const) assert.equal(bb[field], standalone[field], field);
    assert.equal(bb.reason, c.reason); assert.equal(bb.approval, c.expectedApproval);
    assert.equal(explainDecision(bb), explainDecision(standalone)); assert.equal(decisionReason(bb), decisionReason(standalone));
    assert.ok(!JSON.stringify(bb).includes(sentinel));
  } finally { await host.experimental_dispose(); await rm(root, { recursive: true, force: true }); }
});
