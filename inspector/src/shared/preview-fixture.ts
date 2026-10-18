import type { SummaryWorkspaceInput, SummaryDecision } from './model.js';

import { reportedViolations, uncertainGates } from '../../../src/inspector/summary-display.js';
// Authored safe summaries only. No archive, policy file or provider is read.
const selected: SummaryDecision = {
  judge: { provider: 'typesafe', requestedModel: 'jev-latest', returnedModel: 'jev-authored-v1', judgeReportVersion: 'judge-report-v1',
    requestedDestination: null, transportContract: null, authentication: null, experimental: null, configuration: null },
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
  'v2-hosted': { ...selected, identity: { toolName: 'bash', callId: 'v2-hosted', mode: 'observe' },
    judge: { ...selected.judge, provider: 'system-one', judgeReportVersion: 'judge-report-v2', requestedModel: 'custom-requested', returnedModel: 'custom-returned',
      requestedDestination: 'https://authored.example.test', transportContract: 'system-one-v1', authentication: 'bearer-env',
      configuration: { source: '~/.tenet/config.json + <project>/.tenet/config.json', settings: 'valid', availability: 'ready', deadlineMs: 2500,
        observation: { running: 1, waiting: 8, bytes: 8388608, ageMs: 30000 },
        sources: { judge: 'project', deadlineMs: 'default', observation: { running: 'project', waiting: 'project', bytes: 'default', ageMs: 'default' } } } } },
  'v2-loopback': { ...selected, identity: { toolName: 'read', callId: 'v2-loopback', mode: 'observe' },
    judge: { ...selected.judge, provider: 'system-one', judgeReportVersion: 'judge-report-v2', requestedModel: 'kev-authored', returnedModel: 'kev-returned',
      requestedDestination: 'http://127.0.0.1', transportContract: 'system-one-v1', authentication: 'none' } },
  'v2-failure': { ...selected, identity: { toolName: 'bash', callId: 'v2-failure', mode: 'enforce' }, decision: 'BLOCK', permission: 'blocked', execution: 'unknown',
    assessmentStatus: 'unavailable', evaluatorState: { status: 'unavailable', reason: 'provider-error' }, failure: 'provider-error',
    categories: ['unavailable'], rules: [], noRulesClassifiedViolated: false,
    judge: { ...selected.judge, provider: 'system-one', judgeReportVersion: 'judge-report-v2', requestedModel: 'kev-authored', returnedModel: null,
      requestedDestination: 'http://127.0.0.1:18091', transportContract: 'system-one-v1', authentication: 'none' } },
  'v2-apus': { ...selected, identity: { toolName: 'read', callId: 'v2-apus', mode: 'observe' },
    judge: { ...selected.judge, provider: 'apus-llamacpp', judgeReportVersion: 'judge-report-v2', requestedModel: 'apus-authored', returnedModel: 'apus-returned', experimental: true,
      requestedDestination: 'http://127.0.0.1:8088', transportContract: 'llamacpp-b11118-choice-v1', authentication: 'none' } },
  'identity-absent': { ...selected, identity: { toolName: 'read', callId: 'identity-absent', mode: 'observe' },
    judge: { ...selected.judge, provider: null, requestedModel: null, returnedModel: null, judgeReportVersion: null } },
  'v2-injected': { ...selected, identity: { toolName: 'read', callId: 'v2-injected', mode: 'observe' },
    judge: { ...selected.judge, provider: 'injected', requestedModel: null, returnedModel: 'authored-injected', judgeReportVersion: 'judge-report-v2' } },
};
for (const view of Object.values(previewSummaries)) {
  view.recordedAction = view.identity?.toolName === 'bash'
    ? { field: 'command', text: 'printf "authored  preview"\n  echo 雪', truncated: false }
    : { field: 'path', text: 'authored/recorded file.txt', truncated: false };
  view.reportedViolations = reportedViolations(view.rules, view.assessmentStatus !== 'unavailable', view.rules.some(rule => uncertainGates(rule.gateIds)));
}
export const previewInput: SummaryWorkspaceInput = {
  variant: 'calls',
  model: { calls: [
    { id: 'synthetic-pass', callId: 'synthetic-pass', toolName: 'bash', timestamp: 1000, mode: 'observe',
      decision: 'ALLOW', permission: 'released', execution: 'executed', categories: [], missing: [], assessmentStatus: 'validated', failure: null },
    { id: 'synthetic-uncertain', callId: 'synthetic-uncertain', toolName: 'read', timestamp: 2000, mode: 'observe',
      decision: 'BLOCK', permission: 'released', execution: 'unknown', categories: ['uncertainty'], missing: ['execution'], assessmentStatus: 'validated', failure: null },
    ...Object.entries(previewSummaries).filter(([id]) => !id.startsWith('synthetic-')).map(([id, view], index) => ({
      id, callId: id, toolName: view.identity!.toolName, timestamp: 3000 + index * 1000, mode: view.identity!.mode,
      decision: view.decision, permission: view.permission, execution: view.execution, categories: view.categories, missing: view.missing,
      assessmentStatus: view.assessmentStatus, failure: view.failure,
    })),
  ], selected, selectedId: 'synthetic-pass', category: '', coverage: 'Synthetic preview. Best-effort capture, not complete coverage.', loading: false, error: '' },
  actions: { selectCall() {}, filterCategory() {}, refresh() {} },
};
