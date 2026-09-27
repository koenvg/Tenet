// Mechanics fixtures adapted from curated observations to the current schema.
// NOT_APPLICABLE=0 is scripted test input, not a historical model score.
import type { Assessment } from '../src/decision/contracts.js';
import { fixturePolicy, REPORTED_FIXTURES } from '../eval/generic-rule-fixtures.js';
import { answer } from './helpers.js';

export function reportedAssessment(index: 0 | 1): Assessment {
  const assessment = answer(fixturePolicy(REPORTED_FIXTURES[index]));
  assessment.rules[1]!.outcome = index === 0
    ? { choice: 'PASS', probabilities: { PASS: 0.88, UNKNOWN: 0.02, APPROVAL_REQUIRED: 0.02, FAIL: 0.08, NOT_APPLICABLE: 0 } }
    : { choice: 'FAIL', probabilities: { PASS: 0.35, UNKNOWN: 0.04, APPROVAL_REQUIRED: 0.03, FAIL: 0.58, NOT_APPLICABLE: 0 } };
  assessment.rules[1]!.evidence = { choice: 'SUFFICIENT', probabilities: index === 0
    ? { SUFFICIENT: 0.93, INSUFFICIENT: 0.07 } : { SUFFICIENT: 0.90, INSUFFICIENT: 0.10 } };
  if (index === 1) {
    assessment.rules[3]!.outcome = { choice: 'PASS', probabilities: { PASS: 0.88, UNKNOWN: 0.03, APPROVAL_REQUIRED: 0.01, FAIL: 0.08 } };
    assessment.rules[3]!.evidence = { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 0.87, INSUFFICIENT: 0.13 } };
  }
  return assessment;
}
