import type { ArchiveRecord, Stage } from '../src/recording/contract.js';

export function selectedRecords(count = 1): ArchiveRecord[] {
  const policy = { rules: Array.from({ length: count }, (_, i) => ({ id: `r${i}`, text: `Recorded rule ${i}.`, enforcement: 'BLOCK', line: i + 1 })) };
  const assessment = { model: 'offline', rules: policy.rules.map(rule => ({ ruleId: rule.id,
    outcome: { choice: 'FAIL', probabilities: { FAIL: 1 } }, evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1 } } })) };
  const stages: [Stage, Record<string, unknown>][] = [
    ['begin', { policy, arguments: 'PRIVATE-BEGIN' }],
    ['request', { policy, payload: { state: { action: { arguments: { command: 'printf "a  b"\n  echo 雪', path: 'PRIVATE-SECOND-FIELD', token: 'PRIVATE-TOKEN' } }, trajectory: 'PRIVATE-HISTORY' }, questions: { q: 'PRIVATE-QUESTION' } } }],
    ['response', { value: 'PRIVATE-RESPONSE' }], ['validation', { valid: true }], ['assessment', { assessment }],
    ['decision', { decision: 'BLOCK', contributions: policy.rules.map(rule => ({ ruleId: rule.id, gates: ['rule-fail'], contribution: 'blocking-gates' })) }],
    ['permission', { outcome: 'released' }],
  ];
  return stages.map(([stage, data], index) => ({ schemaVersion: 4, host: 'pi', contextId: 'main', bbThreadId: 'thr_selectedfixture',
    writerId: 'fixture', eventId: `event-${index}`, sequence: index + 1, timestamp: index + 1, sessionId: 'selected', invocationId: 'selected',
    callId: 'selected', toolName: 'bash', cwd: '/PRIVATE-CWD', mode: 'observe', stage, data }));
}

export function selectedPassRecords(lastGate: string | null = 'outcome-confidence-below-threshold'): ArchiveRecord[] {
  const rows = selectedRecords(20);
  const assessment = rows.find(r => r.stage === 'assessment')!.data.assessment as any;
  assessment.rules.forEach((rule: any) => {
    rule.outcome = { choice: 'PASS', probabilities: { PASS: 1, FAIL: 0, UNKNOWN: 0, APPROVAL_REQUIRED: 0 } };
    rule.evidence = { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } };
  });
  const begin = rows.find(r => r.stage === 'begin')!.data as any;
  const request = rows.find(r => r.stage === 'request')!.data as any;
  const integrity = begin.policy.rules.pop();
  begin.integrity = integrity;
  request.payload.state.integrity = integrity;
  const decision = rows.find(r => r.stage === 'decision')!.data as any;
  decision.contributions.forEach((rule: any, index: number) => {
    rule.gates = index === 19 ? lastGate === null ? undefined : [lastGate] : [];
    rule.contribution = rule.gates?.length ? 'blocking-gates' : 'pass';
  });
  return rows;
}
