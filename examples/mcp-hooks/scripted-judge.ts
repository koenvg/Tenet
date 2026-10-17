import type { Assessment, Judge } from 'tenet';

export type Outcome = 'PASS' | 'FAIL' | 'APPROVAL_REQUIRED';

// Full synthetic assessments. No semantic classifier and no production transport.
export function scriptedJudge(outcome: Outcome): Judge {
  return async request => ({ profile: 'applicability-v1', model: 'scripted', rules: [
    ...request.policy.rules.map(rule => ({ ruleId: rule.id,
      outcome: { choice: outcome, probabilities: { PASS: Number(outcome === 'PASS'), FAIL: Number(outcome === 'FAIL'),
        APPROVAL_REQUIRED: Number(outcome === 'APPROVAL_REQUIRED'), UNKNOWN: 0, NOT_APPLICABLE: 0 } },
      evidence: { choice: 'SUFFICIENT' as const, probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } })),
    { ruleId: 'builtin:policy-integrity', outcome: { choice: 'PASS', probabilities: { PASS: 1, FAIL: 0, APPROVAL_REQUIRED: 0, UNKNOWN: 0 } },
      evidence: { choice: 'SUFFICIENT' as const, probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } },
  ] } satisfies Assessment);
}
