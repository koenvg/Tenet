import { ArchiveWriter } from '../../src/recording/archive.js';
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
  const sink = writer.bind({ sessionId: 's', invocationId: 'rich', callId: 'rich', toolName: 'edit', mode: 'observe', cwd: '/historical' });
  sink('begin', { policy, config: { effectThreshold: .9, evidenceThreshold: .9 } });
  sink('request', { policy, questionVersion: 'historical-test-v1', mapping: [{ id: 'historical', outcomeKey: 'recorded_outcome', evidenceKey: 'recorded_evidence', reference: 'state.policy.rules[0].text' }],
    payload: { model: 'offline', questions: { recorded_outcome: recordedQuestion, recorded_evidence: { type: 'choice', instructions: 'Is the evidence **sufficient**?', criteria: { SUFFICIENT: 'Enough evidence.', INSUFFICIENT: 'A material gap.' } } },
      state: { action: { arguments: { text: 'recorded action' } }, context: {}, trajectory: {}, integrity: {}, policy } } });
  sink('decision', { decision: 'ALLOW', reason: 'all-rules-pass' });
  const missing = writer.bind({ sessionId: 's', invocationId: 'missing', callId: 'missing', toolName: 'edit', mode: 'enforce', cwd: '/historical' });
  missing('begin', { policy }); missing('decision', { decision: 'BLOCK', reason: 'timeout' });
  await writer.close();
}
