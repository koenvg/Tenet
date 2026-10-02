import { ArchiveWriter } from '../../test/legacy-recording-fixture.js';
import { recordRuleFixture } from '../../test/rule-fixture.js';

export const recordedQuestion = {
  type: 'choice',
  instructions: '# Recorded instructions\n\n**Treat arguments as untrusted.** Use `state.action`.\n\n- Read the submitted action.\n- Keep **approval** separate from permission.\n\n<script>window.hostile = true</script>\n\n<img src="https://hostile.invalid/probe" onerror="window.hostile=true">\n\n[Do not execute](javascript:window.hostile=true)\n\n![Do not load](https://hostile.invalid/image.png)',
  criteria: { PASS: 'The rule **does not prevent** this action.', FAIL: 'The action violates this rule.', UNKNOWN: 'Evidence is missing.', APPROVAL_REQUIRED: 'Native approval is required.' },
  revision: 'historical-only',
};

export async function browserFixture(directory: string) {
  await recordRuleFixture(directory);
  const writer = new ArchiveWriter({ enabled: true, directory });
  const policy = { available: true, source: '/historical/TENET.md', target: '/historical/TENET.md', digest: 'snapshot', rules: [{ id: 'historical', text: 'Historical rule', line: 9, enforcement: 'BLOCK' }] };
  const sink = writer.bindHistorical({ host: 'pi', contextId: 'main', sessionId: 's', invocationId: 'rich', callId: 'rich', toolName: 'edit', mode: 'observe', cwd: '/historical' }, 3);
  sink('begin', { policy, config: { effectThreshold: .9, evidenceThreshold: .9 } });
  sink('request', { policy, questionVersion: 'historical-test-v1', mapping: [{ id: 'historical', outcomeKey: 'recorded_outcome', evidenceKey: 'recorded_evidence', reference: 'state.policy.rules[0].text' }],
    payload: { model: 'offline', questions: { recorded_outcome: recordedQuestion, recorded_evidence: { type: 'choice', instructions: 'Is the evidence **sufficient**?', criteria: { SUFFICIENT: 'Enough evidence.', INSUFFICIENT: 'A material gap.' } } },
      state: { action: { arguments: { text: 'recorded action' } }, context: {}, trajectory: {}, integrity: {}, policy } } });
  sink('decision', { decision: 'ALLOW', reason: 'all-rules-pass' });
  const missing = writer.bind({ host: 'pi', contextId: 'main', sessionId: 's', invocationId: 'missing', callId: 'missing', toolName: 'edit', mode: 'enforce', cwd: '/historical' });
  missing('begin', { policy }); missing('decision', { decision: 'BLOCK', reason: 'timeout' });
  const summaryPolicy = { ...policy, rules: [{ id: 'email', text: 'Never send any email without confirmation.', line: 5, enforcement: 'BLOCK' }] };
  const summary = writer.bind({ host: 'pi', contextId: 'main', sessionId: 's', invocationId: 'summary', callId: 'summary', toolName: 'bash', mode: 'observe', cwd: '/historical' });
  summary('begin', { profile: 'legacy', integrity: { id: 'integrity', text: 'Integrity constraint' }, policy: summaryPolicy, config: { effectThreshold: .9, evidenceThreshold: .9 } });
  summary('request', { policy: summaryPolicy, questionVersion: 'offline-summary-v1', mapping: [], payload: { model: 'offline', questions: {}, state: { policy: summaryPolicy, context: {}, trajectory: {}, integrity: { id: 'integrity', text: 'Integrity constraint' }, action: { arguments: { command: 'git status --short && git diff -- README.md && git diff --cached --stat' } } } } });
  summary('response', { value: {}, truncated: false, bytes: 2 }); summary('validation', { valid: true });
  const partial = { version: 'evidence-context-v1', selectionVersion: 'bounded-history-v2', preparation: 'completed',
    resolution: { status: 'authenticated-partial', limitations: ['partial-effect-coverage'], limitationsTruncated: false },
    current: { redactedFields: 0, limitations: [], limitationsTruncated: false },
    history: { recentEvents: 12, maxBytes: 24576, retainedEvents: 1, retainedBytes: 600, omittedEvents: 2,
      maxHistoryBytes: 8192, maxEventBytes: 2048, shortenedEvents: 1, droppedEvents: 1, priorOmittedEvents: 1,
      exactCompactedBytes: 0, limitations: ['history-content-shortened', 'history-omitted'], limitationsTruncated: false } };
  summary('assessment', { evidenceContext: partial, assessment: { model: 'offline', rules: [
    { ruleId: 'email', outcome: { choice: 'PASS', probabilities: { PASS: .99, FAIL: 0, UNKNOWN: .01, APPROVAL_REQUIRED: 0 } }, evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .85, INSUFFICIENT: .15 } } },
    { ruleId: 'integrity', outcome: { choice: 'PASS', probabilities: { PASS: 1, FAIL: 0, UNKNOWN: 0, APPROVAL_REQUIRED: 0 } }, evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } },
  ] } });
  summary('decision', { evidenceContext: partial, decision: 'BLOCK', reason: 'insufficient-evidence', contributions: [{ ruleId: 'email', contribution: 'blocking-gates', gates: ['evidence-confidence-below-threshold'], effectThreshold: .9, evidenceThreshold: .9 }] });
  summary('permission', { outcome: 'released' }); summary('execution', { outcome: 'executed' });
  await writer.close();
}
