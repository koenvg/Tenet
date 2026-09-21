import type { ArchiveRecord } from '../recording/contract.js';
export const object = (value: unknown): Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = (value: unknown): Record<string, any>[] => Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown, fallback = 'unavailable'): string => typeof value === 'string' ? value : fallback;
export function invocationView(records: ArchiveRecord[]) {
  const stage = (name: string) => object(records.find(r => r.stage === name)?.data);
  const begin = stage('begin'), request = stage('request'), response = stage('response');
  const assessment = object(stage('assessment').assessment ?? stage('validation').assessment);
  const decision = stage('decision'), permission = stage('permission');
  const payload = object(request.payload), state = object(payload.state);
  const policy = object(request.policy ?? begin.policy);
  const integrity = object(state.integrity);
  const rules = [...list(policy.rules), ...(typeof integrity.id === 'string' ? [{ ...integrity, enforcement: 'BLOCK', line: null }] : [])];
  return {
    identity: records[0] ? { sessionId: records[0].sessionId, invocationId: records[0].invocationId,
      callId: records[0].callId, toolName: records[0].toolName, cwd: records[0].cwd, mode: records[0].mode } : null,
    decision: text(decision.decision), reason: text(decision.reason), permission: text(permission.outcome, 'unknown'),
    execution: text(stage('execution').outcome, 'unknown'), approval: text(stage('approval').outcome, 'not recorded'),
    config: begin.config ?? stage('assessment').config ?? null,
    requestStatus: request.payload ? 'submitted application payload' : permission.requestStatus === 'not-submitted' ? 'not submitted' : 'payload unavailable; capture incomplete',
    coverage: 'Best-effort capture. Missing stages are unknown, not proof of success.',
    missing: ['begin', 'request', 'response', 'validation', 'assessment', 'decision', 'permission', 'execution'].filter(name => !records.some(r => r.stage === name)),
    policy, evidence: payload.state ?? null, response: Object.keys(response).length ? response : null,
    validation: stage('validation'),
    rules: rules.map(rule => {
      const result = list(assessment.rules).find(r => r.ruleId === rule.id);
      const mapping = list(request.mapping).find(m => m.id === rule.id);
      const questions = object(payload.questions);
      return { id: text(rule.id), text: text(rule.text), line: rule.line ?? null, enforcement: text(rule.enforcement),
        builtin: rule.id === integrity.id, result: result ?? null,
        gates: list(decision.diagnostics).find(r => r.ruleId === rule.id) ?? null,
        questions: mapping ? { outcome: questions[mapping.outcomeKey] ?? null, evidence: questions[mapping.evidenceKey] ?? null } : null };
    }),
  };
}
export type InvocationView = ReturnType<typeof invocationView>;
