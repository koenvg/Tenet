import { FixtureArchiveWriter } from '../../../test/archive-fixture.js';
import { recordInvocationKey, recordSessionKey } from '../../../src/recording/archive.js';

// Authored fictional recordings only. No tools, evaluator, current policy or private files.
export const statusCases = [
  { id: 'uncertain', decision: 'BLOCK' },
  { id: 'success', decision: 'ALLOW', execution: 'executed' },
  { id: 'failed-tool', decision: 'ALLOW', execution: 'failed' },
  { id: 'blocked', decision: 'BLOCK', mode: 'enforce', permission: 'blocked' },
  { id: 'observe-blocked', decision: 'BLOCK', permission: 'blocked' },
  { id: 'contradiction', decision: 'BLOCK', permission: 'blocked', execution: 'executed' },
  { id: 'pending', lifecycle: 'pending' },
  { id: 'dropped', lifecycle: 'dropped' },
  { id: 'cancelled', lifecycle: 'cancelled' },
  { id: 'unavailable', lifecycle: 'unavailable' },
  { id: 'incomplete', lifecycle: 'incomplete' },
  { id: 'invalid', decision: 'ALLOW', invalid: true },
  { id: 'observe-ask', decision: 'ASK' },
  { id: 'approved', decision: 'ASK', mode: 'enforce', approval: 'approved' },
  { id: 'overlap', decision: 'BLOCK', overlap: true },
] as const;
type StatusCase = { id: string; decision?: string; mode?: string; permission?: string; execution?: string; lifecycle?: string; invalid?: boolean; approval?: string; overlap?: boolean };
const identity = (item: StatusCase) => ({ schemaVersion: 4 as const, host: 'pi', contextId: 'main', sessionId: 'fictional-call-facts', invocationId: item.id, callId: item.id, toolName: 'edit', cwd: '/fictional-status', mode: item.mode === 'enforce' ? 'enforce' as const : 'observe' as const });
export const statusLink = (id: string) => {
  const item = statusCases.find(c => c.id === id)!;
  return `/?session=${recordSessionKey(identity(item))}&invocation=${recordInvocationKey(identity(item))}`;
};
export async function seedCallFacts(directory: string) {
  const writer = new FixtureArchiveWriter({ enabled: true, directory });
  const policy = { source: '/fictional-status/TENET.md', target: '/fictional-status/TENET.md', digest: 'fictional-status', rules: [
    { id: 'local', text: 'Keep fictional customer data local.', line: 1, enforcement: 'BLOCK' },
    { id: 'context', text: 'Use the recorded project context.', line: 2, enforcement: 'BLOCK' },
    { id: 'approval', text: 'Confirm publication with the owner.', line: 3, enforcement: 'BLOCK' },
  ] };
  for (const item of statusCases as readonly StatusCase[]) {
    const sink = writer.bindHistorical(identity(item), 4);
    sink('begin', { policy, profile: 'legacy', config: { effectThreshold: .9, evidenceThreshold: .9 } });
    sink('request', { policy, questionVersion: 'fictional-status-v1', mapping: [], payload: { model: 'offline', questions: {}, state: {
      action: { arguments: { path: `src/billing/${item.id}.ts`, oldText: 'fictional old value', newText: 'fictional new value' } }, policy, context: {}, trajectory: {}, integrity: {},
    } } });
    if (!item.lifecycle) {
      sink('response', { value: {}, truncated: false, bytes: 2 });
      sink('validation', { valid: true });
      sink('assessment', { ...(item.invalid ? { valid: false } : {}), assessment: { model: 'offline', rules: policy.rules.map((rule, i) => {
        const choice = item.overlap ? ['FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED'][i]! : item.decision === 'ASK' && i === 2 ? 'APPROVAL_REQUIRED' : 'PASS';
        return { ruleId: rule.id, outcome: { choice, probabilities: { PASS: choice === 'PASS' ? 1 : 0, FAIL: choice === 'FAIL' ? 1 : 0, UNKNOWN: choice === 'UNKNOWN' ? 1 : 0, APPROVAL_REQUIRED: choice === 'APPROVAL_REQUIRED' ? 1 : 0 } }, evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } };
      }) } });
      sink('decision', { decision: item.decision, reason: item.overlap ? 'rule-failed' : item.decision === 'BLOCK' ? 'insufficient-evidence' : item.decision === 'ASK' ? 'approval-required' : 'all-rules-pass', contributions: policy.rules.map((r, i) => ({
        ruleId: r.id, gates: item.overlap ? i === 0 ? ['rule-fail'] : i === 1 ? ['outcome-unknown'] : [] : item.decision === 'BLOCK' && i === 0 ? ['outcome-confidence-below-threshold'] : [],
        contribution: (item.decision === 'ASK' || item.overlap) && i === 2 ? 'approval-required' : item.decision === 'BLOCK' && (i === 0 || item.overlap) ? 'blocking-gates' : 'pass', effectThreshold: .9, evidenceThreshold: .9,
      })) });
      sink('assessment-status', { status: 'completed', profile: 'legacy' });
    } else if (item.lifecycle !== 'incomplete') {
      sink('assessment-status', { status: item.lifecycle, profile: 'legacy', reason: item.lifecycle === 'pending' ? 'not-started' : item.lifecycle === 'dropped' ? 'queue-capacity' : item.lifecycle === 'unavailable' ? 'provider-error' : 'session-shutdown' });
    }
    sink('permission', { outcome: item.permission ?? 'released' });
    if (item.execution) sink('execution', { outcome: item.execution });
    if (item.approval) sink('approval', { outcome: item.approval });
    await writer.settle();
  }
  await writer.complete();
}
