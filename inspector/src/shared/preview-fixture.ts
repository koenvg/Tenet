import type { SummaryWorkspaceInput, SummaryDecision } from './model.js';

// Authored safe summaries only. No archive, policy file or provider is read.
const selected: SummaryDecision = {
  identity: { toolName: 'bash', callId: 'synthetic-pass', mode: 'observe' },
  decision: 'ALLOW', reason: 'all-rules-pass', permission: 'released', execution: 'executed',
  approval: 'not required', categories: [], missing: [], assessmentStatus: 'validated', failure: null,
  noRulesClassifiedViolated: true,
  rules: [{ id: 'synthetic-rule', text: 'Ask before sending a message.', line: 2, enforcement: 'BLOCK', builtin: false,
    result: { outcome: { choice: 'PASS', probabilities: { PASS: .95, FAIL: .01, UNKNOWN: .02, APPROVAL_REQUIRED: .02 } },
      evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .97, INSUFFICIENT: .03 } } },
    gateIds: [], contribution: 'pass', thresholds: { effectThreshold: .9, evidenceThreshold: .9 }, evidenceGate: 'applicable', profile: 'legacy' }],
};

export const previewSummaries: Record<string, SummaryDecision> = {
  'synthetic-pass': selected,
  'synthetic-uncertain': {
    ...selected, identity: { toolName: 'read', callId: 'synthetic-uncertain', mode: 'observe' },
    decision: 'BLOCK', reason: 'insufficient-evidence', execution: 'unknown', categories: ['uncertainty'], missing: ['execution'],
    rules: [{ ...selected.rules[0]!, gateIds: ['evidence-confidence-below-threshold'], contribution: 'blocking-gates',
      result: { outcome: { choice: 'PASS', probabilities: { PASS: .95, FAIL: .01, UNKNOWN: .02, APPROVAL_REQUIRED: .02 } },
        evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .85, INSUFFICIENT: .15 } } } }],
  },
};
export const previewInput: SummaryWorkspaceInput = {
  model: { calls: [
    { id: 'synthetic-pass', callId: 'synthetic-pass', toolName: 'bash', timestamp: 1000, mode: 'observe',
      decision: 'ALLOW', permission: 'released', execution: 'executed', categories: [], missing: [], assessmentStatus: 'validated', failure: null },
    { id: 'synthetic-uncertain', callId: 'synthetic-uncertain', toolName: 'read', timestamp: 2000, mode: 'observe',
      decision: 'BLOCK', permission: 'released', execution: 'unknown', categories: ['uncertainty'], missing: ['execution'], assessmentStatus: 'validated', failure: null },
  ], selected, selectedId: 'synthetic-pass', category: '', coverage: 'Synthetic preview. Best-effort capture, not complete coverage.', loading: false, error: '' },
  actions: { selectCall() {}, filterCategory() {}, refresh() {} },
};
