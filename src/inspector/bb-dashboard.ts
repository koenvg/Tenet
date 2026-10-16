import { foldInvocationRules, type SessionRuleStage } from './session-rules.js';
import { sessionKey } from '../recording/archive.js';

export type RuleObservation = {
  key: string; preview: string | null; builtin: boolean; state: 'passed' | 'failed' | 'unscored';
  threadId: string; sessionId: string; callId: string; timestamp: number; toolName: string;
};
export type ProjectRuleRow = Pick<RuleObservation, 'key' | 'preview' | 'builtin'> & {
  passed: number; failed: number; unscored: number; passing: number | null; failing: number | null; threads: number;
};
export type RetainedRule = ProjectRuleRow & { contributions: RuleObservation[] };

/** The canonical fold owns declaration selection and trust. Only compact recorded facts leave the host. */
export function projectDashboardInvocation(qualified: string, threadId: string, sessionId: string, callId: string,
  toolName: string, stages: SessionRuleStage[]): RuleObservation[] {
  const observations = new Map<string, RuleObservation>();
  for (const { row, check, wordingDigest } of foldInvocationRules(qualified, callId, stages).rules) {
    const key = sessionKey(JSON.stringify([row.builtin, wordingDigest ?? [qualified, row.id]]));
    const state = check?.trusted && check.outcome === 'FAIL' ? 'failed'
      : check?.trusted && check.outcome === 'PASS' ? 'passed' : 'unscored';
    const previous = observations.get(key);
    observations.set(key, { key, preview: row.preview, builtin: row.builtin,
      state: previous?.state === 'failed' || state === 'failed' ? 'failed'
        : previous?.state === 'unscored' || state === 'unscored' ? 'unscored' : 'passed',
      threadId, sessionId, callId, timestamp: row.timestamp, toolName: toolName.slice(0, 256) });
  }
  return [...observations.values()];
}

/** One observation per logical rule and qualified invocation, even under retry/replay. */
export function reduceDashboardContribution(previous: RetainedRule | undefined, contribution: RuleObservation): RetainedRule {
  if (previous?.contributions.some(c => c.threadId === contribution.threadId && c.sessionId === contribution.sessionId && c.callId === contribution.callId)) return previous;
  const contributions = [...(previous?.contributions ?? []), contribution];
  const passed = (previous?.passed ?? 0) + Number(contribution.state === 'passed');
  const failed = (previous?.failed ?? 0) + Number(contribution.state === 'failed');
  const unscored = (previous?.unscored ?? 0) + Number(contribution.state === 'unscored');
  const scored = passed + failed;
  return { key: contribution.key, preview: previous?.preview ?? contribution.preview, builtin: contribution.builtin,
    passed, failed, unscored, passing: scored ? passed / scored * 100 : null, failing: scored ? failed / scored * 100 : null,
    threads: new Set(contributions.map(c => c.threadId)).size, contributions };
}
