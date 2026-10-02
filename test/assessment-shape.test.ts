import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessmentShapeIssue } from '../src/decision/assessment-shape.js';
import { validateAssessment } from '../src/decision/decide.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';
import { answer, policy } from './helpers.js';
import type { Assessment } from '../src/decision/contracts.js';

const notApplicable = (): Assessment => {
  const value: Assessment = answer(policy);
  value.rules[0]!.outcome = { choice: 'NOT_APPLICABLE', probabilities: { PASS: 0, APPROVAL_REQUIRED: 0, FAIL: 0, UNKNOWN: 0, NOT_APPLICABLE: 1 } };
  value.rules[0]!.evidence = null;
  value.rules[0]!.factReferences = { digest: 'recorded', operationIds: ['recorded'] };
  return value;
};

for (const defect of ['forbidden references', 'empty operation', 'nonstring operation', 'oversized operation', 'oversized digest', 'too many operations', 'incompatible profile'] as const) {
  test(`runtime and recorded structural validation reject ${defect} identically`, () => {
    const value = notApplicable();
    const rule = value.rules[0]!;
    if (defect === 'forbidden references') {
      rule.outcome = { choice: 'UNKNOWN', probabilities: { PASS: 0, APPROVAL_REQUIRED: 0, FAIL: 0, UNKNOWN: 1, NOT_APPLICABLE: 0 } };
      rule.evidence = { choice: 'INSUFFICIENT', probabilities: { SUFFICIENT: 0, INSUFFICIENT: 1 } };
    } else if (defect === 'incompatible profile') (value as any).profile = 'unrecognized-contract';
    else {
      rule.factReferences = { digest: 'recorded', operationIds: ['recorded'] };
      if (defect === 'empty operation') rule.factReferences.operationIds = [''];
      if (defect === 'nonstring operation') (rule.factReferences as any).operationIds = [42];
      if (defect === 'oversized operation') rule.factReferences.operationIds = ['x'.repeat(4097)];
      if (defect === 'oversized digest') rule.factReferences.digest = 'x'.repeat(129);
      if (defect === 'too many operations') rule.factReferences.operationIds = Array(65).fill('recorded');
    }
    const bytes = JSON.stringify(value);
    assert.equal(assessmentShapeIssue(value, policy.rules.map(r => r.id), INTEGRITY_ID), 'response-shape');
    assert.throws(() => validateAssessment(value, policy));
    assert.equal(JSON.stringify(value), bytes, 'structural inspection never rewrites recorded assessment');
  });
}
test('structural validity does not authenticate exemptions or recompute gates', () => {
  const value = notApplicable();
  value.rules[0]!.factReferences = { digest: 'recorded-digest', operationIds: ['recorded-operation'] };
  const bytes = JSON.stringify(value);
  assert.equal(assessmentShapeIssue(value, policy.rules.map(r => r.id), INTEGRITY_ID), undefined);
  assert.equal(JSON.stringify(value), bytes);
  assert.equal(validateAssessment(value, policy).rules[0]!.applicabilitySupported, false);
});
