import { FixtureArchiveWriter } from '../../../test/archive-fixture.js';
import { ruleRecording, writeRuleRecording } from '../../../test/session-rules-fixture.js';
import { sessionKey } from '../../../src/recording/archive.js';
export const ruleSessions = ['rule-violation', 'rule-clear', 'rule-unclear', 'rule-unchecked'];
export const ruleSessionLink = (session = ruleSessions[0]!) => `/?session=${sessionKey(session)}`;
export async function seedSessionRules(directory: string) {
  const writer = new FixtureArchiveWriter({ enabled: true, directory });
  const wording = ['Ask for approval before deploying to production.', 'Only change files inside this project.', 'Do not write secrets to logs.', 'Do not remove or weaken existing tests.', 'Ask before adding a dependency.'];
  for (const [index, session] of ruleSessions.entries()) {
    for (let n = 0; n < (index === 0 ? 55 : 1); n++) {
      const data = ruleRecording({ outcome: index === 0 ? 'FAIL' : index === 2 ? 'UNKNOWN' : 'PASS', rules: 5 });
      data.begin.policy.rules.forEach((rule: { text: string }, i: number) => { rule.text = wording[i]!; });
      data.begin.config = { effectThreshold: .9, evidenceThreshold: .9 };
      data.request = { policy: data.begin.policy, questionVersion: 'policy-rules-v5-resolved-action', mapping: [], payload: { model: 'offline', state: { action: { arguments: { command: 'inert synthetic action', text: 'Long exact recorded string.\n'.repeat(600) } }, policy: data.begin.policy, context: {}, trajectory: {}, integrity: data.begin.integrity }, questions: {} } };
      if (index === 3) { delete data.validation; delete data.assessment; delete data.decision; delete data.request; delete data['assessment-status']; }
      writeRuleRecording(writer, session, `recorded-${n}`, data);
      await writer.settle();
    }
  }
  await writer.complete();
}
