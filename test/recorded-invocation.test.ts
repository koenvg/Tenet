import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invocationView } from '../src/inspector/view.js';
import { projectSummaryDecision } from '../src/inspector/bb-summary.js';
import { projectThreadFinding } from '../src/inspector/bb-findings.js';
import type { ArchiveRecord, Stage } from '../src/recording/contract.js';

const thread = 'thr_recorded142';
const policy = { rules: [{ id: 'r', text: 'Recorded rule', enforcement: 'WARN', line: 7 }] };
const integrity = { id: 'integrity', text: 'Recorded integrity' };
const assessment = { model: 'historical', rules: [
  { ruleId: 'r', outcome: { choice: 'FAIL', probabilities: { FAIL: .8 } } },
  { ruleId: 'integrity', outcome: { choice: 'PASS' } },
] };
function rows(stages: [Stage, Record<string, unknown>][]): ArchiveRecord[] {
  return stages.map(([stage, data], index) => ({ schemaVersion: 4, host: 'pi', contextId: 'main',
    writerId: '11111111-1111-4111-8111-111111111111', eventId: `event-${index}`, sequence: index + 1,
    timestamp: index + 1, sessionId: 'recorded', invocationId: 'one', callId: 'one', toolName: 'read',
    cwd: '/synthetic-private-cwd', mode: 'observe', bbThreadId: thread, stage, data }));
}
function fixture(): ArchiveRecord[] {
  return rows([
    ['begin', { policy, integrity, config: { effectThreshold: .7, evidenceThreshold: .9 } }],
    ['request', { policy, payload: { state: { integrity, action: 'private-action', trajectory: 'private-history' } } }],
    ['response', { value: 'private-response' }],
    ['validation', { valid: true, assessment }],
    ['assessment', { assessment, config: { effectThreshold: .75, evidenceThreshold: .95 } }],
    ['decision', { decision: 'BLOCK', contributions: [{ ruleId: 'r', contribution: 'advisory-gates', gates: ['rule-fail'], evidenceThreshold: null }],
      diagnostics: [{ ruleId: 'r', gates: ['outcome-confidence-below-threshold'], effectThreshold: .1 },
        { ruleId: 'integrity', gates: [], contribution: 'pass', effectThreshold: .6 }] }],
    ['permission', { outcome: 'released' }], ['execution', { outcome: 'executed' }],
  ]);
}

test('readers share recorded snapshots and per-rule precedence without merging disclosure rules', () => {
  const records = fixture(), before = JSON.stringify(records);
  const view = invocationView(records), summary = projectSummaryDecision(records);
  const finding = projectThreadFinding(records, 'selected', thread).item!;
  assert.equal(view.decision, 'BLOCK'); assert.equal(summary.decision, 'BLOCK'); assert.equal(finding.wouldDecision, 'BLOCK');
  assert.equal(view.permission, 'released'); assert.equal(summary.permission, 'released'); assert.equal(finding.actualPermission, 'released');
  assert.equal(view.execution, 'executed'); assert.equal(summary.execution, 'executed'); assert.equal(finding.observedExecution, 'executed');
  assert.deepEqual(view.rules.map(rule => rule.thresholds), summary.rules.map(rule => rule.thresholds));
  assert.deepEqual(summary.rules[0]!.thresholds, { effectThreshold: .75, evidenceThreshold: null });
  assert.deepEqual(view.rules[0]!.gateIds, ['rule-fail']);
  assert.deepEqual(view.rules[0]!.gates!.gates, ['outcome-confidence-below-threshold']);
  assert.equal(view.rules[1]!.contribution, 'unavailable', 'private contribution is not inferred from diagnostics');
  assert.equal(summary.rules[1]!.contribution, 'pass', 'BB summary retains its diagnostic fallback');
  assert.equal(finding.rules[0]!.uncertain, false);
  assert.equal(view.evidence.action, 'private-action');
  const serialized = JSON.stringify([summary, finding]);
  for (const secret of ['private-action', 'private-history', 'private-response', '/synthetic-private-cwd']) assert.ok(!serialized.includes(secret));
  assert.equal(JSON.stringify(records), before, 'no reader rewrites recorded facts');
});

test('latest stages and diagnostic-array presence keep their recorded meanings', () => {
  const records = fixture();
  records.push(...rows([
    ['assessment', { assessment, config: { effectThreshold: .85 } }],
    ['decision', { decision: 'ASK', contributions: [], diagnostics: [{ ruleId: 'r', gates: [], contribution: 'pass' }] }],
  ]));
  const view = invocationView(records), summary = projectSummaryDecision(records);
  const finding = projectThreadFinding(records, 'selected', thread).item!;
  assert.equal(view.decision, 'ASK'); assert.equal(summary.decision, 'ASK'); assert.equal(finding.wouldDecision, 'ASK');
  assert.equal(view.rules[0]!.thresholds.effectThreshold, .85);
  assert.equal(summary.rules[0]!.thresholds.effectThreshold, .85);
  assert.equal(view.rules[0]!.thresholds.evidenceThreshold, null, 'an assessment config replaces, not merges with, begin config');
  assert.deepEqual(summary.rules[0]!.gateIds, []);
  assert.equal(finding.rules[0]!.uncertain, true, 'empty contributions do not fall through to a diagnostic array for finding certainty');
});

test('fallback snapshots do not substitute for submitted snapshots or fresh retained assessments', () => {
  const records = fixture();
  records.find(record => record.stage === 'request')!.data = { questionVersion: 'historical' };
  assert.equal(invocationView(records).rules.length, 2);
  assert.equal(projectSummaryDecision(records).rules.length, 2);
  assert.equal(projectThreadFinding(records, 'selected', thread).item, null, 'a present request with missing policy does not reuse begin for findings');
  const withoutRequest = records.filter(record => record.stage !== 'request');
  assert.ok(projectThreadFinding(withoutRequest, 'selected', thread).item, 'begin is available when request is absent');
  const withoutAssessment = withoutRequest.filter(record => record.stage !== 'assessment');
  assert.equal(invocationView(withoutAssessment).rules[0]!.result!.outcome.choice, 'FAIL');
  assert.equal(projectSummaryDecision(withoutAssessment).rules[0]!.result!.outcome!.choice, 'FAIL');
  assert.equal(projectThreadFinding(withoutAssessment, 'selected', thread).item, null, 'findings require a retained assessment stage');
});

test('BB projections never visit private evidence presentation data', () => {
  const records = fixture();
  Object.defineProperty(records[0]!.data, 'evidenceContext', { get() { throw new Error('private evidence view constructed'); } });
  assert.doesNotThrow(() => projectSummaryDecision(records));
  assert.doesNotThrow(() => projectThreadFinding(records, 'selected', thread));
  assert.throws(() => invocationView(records), /private evidence view constructed/);
});
