import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invocationView } from '../src/inspector/view.js';
import { explainDecision, orderedRules, gateExplanation } from '../inspector/src/presentation.js';

const fixture = (decision = 'BLOCK') => invocationView([
  { stage: 'begin', data: { policy: { rules: [
    { id: 'pass', text: 'Pass', line: 1, enforcement: 'BLOCK' },
    { id: 'low', text: 'Low confidence', line: 2, enforcement: 'BLOCK' },
  ] } } },
  { stage: 'assessment', data: { assessment: { rules: [
    { ruleId: 'low', outcome: { choice: 'PASS', probabilities: { PASS: .88 } } },
  ] } } },
  { stage: 'decision', data: { decision, reason: 'insufficient-evidence', contributions: [
    { ruleId: 'pass', contribution: 'pass', gates: [] },
    { ruleId: 'low', contribution: 'blocking-gates', gates: ['outcome-confidence-below-threshold'], effectThreshold: .9 },
  ] } },
] as any);

test('decision explanation cites recorded gate and exact values without calling PASS a violation', () => {
  const view = fixture();
  assert.match(explainDecision(view), /PASS selected at 0.88; required confidence 0.9/);
  assert.ok(!explainDecision(view).includes('violation'));
  assert.deepEqual(orderedRules(view.rules).map(r => r.id), ['low', 'pass']);
  assert.deepEqual(view.rules.map(r => r.id), ['pass', 'low'], 'presentation never mutates the snapshot');
});

test('missing or unrecognized records remain explicit, never inferred from a probability', () => {
  const view = fixture();
  const rule = view.rules[1]!;
  assert.equal(gateExplanation('future-gate', rule), 'Unrecognized recorded gate: future-gate');
  rule.gateIds = null; rule.contribution = 'unavailable';
  assert.match(explainDecision(view), /insufficient-evidence/);
  assert.match(explainDecision(view), /not recorded/);
  assert.ok(!explainDecision(view).includes('0.88'));
});

test('schema-3 assessment lifecycle never infers a decision from released permission or execution', () => {
  const base = { schemaVersion: 3, host: 'pi', contextId: 'main', sessionId: 's', invocationId: 'i', callId: 'c',
    toolName: 'edit', cwd: '/work', mode: 'observe', timestamp: 1, writerId: '00000000-0000-0000-0000-000000000000',
    eventId: '00000000-0000-0000-0000-000000000000', sequence: 1 };
  const row = (stage: string, data: object, timestamp: number) => ({ ...base, stage, data, timestamp });
  const pending = invocationView([row('begin', { policy: { rules: [] } }, 1),
    row('permission', { outcome: 'released' }, 2), row('execution', { outcome: 'executed' }, 3),
    row('assessment-status', { status: 'pending', profile: 'legacy' }, 4)] as any);
  assert.equal(pending.permission, 'released');
  assert.equal(pending.execution, 'executed');
  assert.equal(pending.decision, 'unavailable');
  assert.equal(pending.assessmentStatus, 'pending');
  const dropped = invocationView([row('assessment-status', { status: 'dropped', reason: 'queue-capacity' }, 5),
    row('permission', { outcome: 'released' }, 2), row('begin', { policy: { rules: [] } }, 1)] as any);
  assert.equal(dropped.assessmentStatus, 'dropped');
  assert.equal(dropped.decision, 'unavailable');
  assert.equal(dropped.execution, 'unknown');
  const completed = invocationView([row('decision', { decision: 'BLOCK', reason: 'rule-failed' }, 6),
    row('assessment-status', { status: 'completed', queueWaitMs: 42, providerDurationMs: 120 }, 7),
    row('execution', { outcome: 'executed' }, 3), row('permission', { outcome: 'released' }, 2)] as any);
  assert.equal(completed.assessmentStatus, 'completed');
  assert.equal(completed.decision, 'BLOCK');
  assert.equal(completed.permission, 'released');
  assert.equal(completed.execution, 'executed');
  assert.equal(completed.queueWaitMs, 42);
  assert.equal(completed.providerDurationMs, 120);
});
