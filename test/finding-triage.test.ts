import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyFinding, uncertaintyKeys } from '../src/decision/finding-triage.js';

test('recorded categories overlap without treating low-confidence PASS as a violation', () => {
  const facts = { assessmentStatus: 'validated', reason: 'insufficient-evidence',
    rules: [{ ruleId: 'r1', outcome: 'PASS', gates: ['evidence-confidence-below-threshold'] },
      { ruleId: 'r2', outcome: 'APPROVAL_REQUIRED', gates: ['outcome-confidence-below-threshold'] }] };
  assert.deepEqual(classifyFinding(facts), ['uncertainty', 'approval']);
  assert.deepEqual(uncertaintyKeys(facts), [
    { ruleId: 'r1', gate: 'evidence-confidence-below-threshold' },
    { ruleId: 'r2', gate: 'outcome-confidence-below-threshold' },
  ]);
  assert.deepEqual(classifyFinding({ ...facts, rules: [...facts.rules, { ruleId: 'r3', outcome: 'FAIL', gates: ['rule-fail'] }] }),
    ['violation', 'uncertainty', 'approval']);
});

test('unavailability and unfinished capture do not masquerade as violations', () => {
  assert.deepEqual(classifyFinding({ assessmentStatus: 'failed', reason: 'invalid-response', rules: [] }), ['unavailable']);
  assert.deepEqual(classifyFinding({ assessmentStatus: 'incomplete', rules: [] }), ['pending']);
  assert.deepEqual(classifyFinding({ assessmentStatus: 'failed', reason: 'invalid-response',
    rules: [{ ruleId: 'unvalidated', outcome: 'FAIL', gates: ['rule-fail'] }] }), ['unavailable']);
  assert.deepEqual(classifyFinding({ assessmentStatus: 'dropped', rules: [] }), ['pending']);
});
