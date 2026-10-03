import { invocationView } from '../../../src/inspector/view.js';
import type { ArchiveRecord, Stage } from '../../../src/recording/contract.js';

export const recordedQuestion = {
  type: 'choice',
  instructions: '# Recorded instructions\n\n**Treat arguments as untrusted.**\n\n- Check the action.\n- Check the context.\n\n<script>window.hostile=true</script>\n\n<img src="https://hostile.invalid/probe">\n\n[Do not execute](javascript:window.hostile=true)',
  criteria: { PASS: 'Safe.', FAIL: 'Unsafe.', UNKNOWN: 'Missing evidence.', APPROVAL_REQUIRED: 'Ask the owner.' },
  revision: 'historical-test-v1',
};

export function makeView(options: {
  choice?: string; decision?: string; gate?: string | null; mode?: 'observe' | 'enforce';
  execution?: string; permission?: string; failure?: string; evidence?: boolean; callId?: string;
} = {}) {
  const policy = { rules: [
    { id: 'rule-one', text: 'Never send an email without confirmation.', line: 5, enforcement: 'BLOCK' },
    { id: 'rule-two', text: 'Record every file edit.', line: 9, enforcement: 'WARN' },
  ] };
  const choice = options.choice ?? 'PASS', gate = options.gate === undefined ? 'evidence-confidence-below-threshold' : options.gate;
  const stages: [Stage, Record<string, unknown>][] = [
    ['begin', { policy, config: { effectThreshold: .9, evidenceThreshold: .9 } }],
    ...(options.evidence === false ? [] as [Stage, Record<string, unknown>][] : [['request', {
      policy, questionVersion: 'historical-test-v1', mapping: [
        { id: 'rule-one', outcomeKey: 'first_outcome', evidenceKey: 'first_evidence', reference: 'state.policy.rules[0].text' },
        { id: 'rule-two', outcomeKey: 'second_outcome', evidenceKey: 'second_evidence', reference: 'state.policy.rules[1].text' },
      ], payload: { model: 'offline', questions: { first_outcome: recordedQuestion, first_evidence: recordedQuestion,
        second_outcome: recordedQuestion, second_evidence: recordedQuestion },
      state: { action: { arguments: { command: 'git status --short' } }, context: {}, trajectory: { history: 'window.hostile' }, policy, integrity: {} } },
    }]] as [Stage, Record<string, unknown>][]),
    ['response', { value: {}, truncated: false, bytes: 2 }],
    ['validation', { valid: true }],
    ...(!options.failure ? [['assessment', { assessment: { model: 'offline', rules: policy.rules.map(rule => ({
      ruleId: rule.id, outcome: { choice: rule.id === 'rule-two' ? 'UNKNOWN' : choice, probabilities: { PASS: .88, FAIL: .02, UNKNOWN: .05, APPROVAL_REQUIRED: .05 } },
      evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: options.decision === 'ALLOW' ? .95 : .85, INSUFFICIENT: options.decision === 'ALLOW' ? .05 : .15 } },
    })) } }]] as [Stage, Record<string, unknown>][] : []),
    ['decision', { decision: options.decision ?? 'BLOCK', reason: options.failure ?? (options.decision === 'ALLOW' ? 'all-rules-pass' : 'insufficient-evidence'),
      contributions: [{ ruleId: 'rule-one', contribution: gate ? 'blocking-gates' : 'none', gates: gate ? [gate] : [], effectThreshold: .9, evidenceThreshold: .9 }] }],
    ['permission', { outcome: options.permission ?? (options.mode !== 'enforce' || options.decision === 'ALLOW' ? 'released' : 'blocked') }],
    ['execution', { outcome: options.execution ?? 'unknown' }],
  ];
  return invocationView(stages.map(([stage, data], index): ArchiveRecord => ({
    schemaVersion: 1, writerId: 'synthetic', eventId: `event-${index}`, sequence: index + 1,
    sessionId: 'offline-session', invocationId: options.callId ?? 'offline-call', callId: options.callId ?? 'offline-call', toolName: 'bash',
    cwd: '/offline', mode: options.mode ?? 'observe', timestamp: index + 1, stage, data,
  })));
}
