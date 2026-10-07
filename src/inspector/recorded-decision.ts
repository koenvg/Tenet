import type { ArchiveRecord } from '../recording/contract.js';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback: string): string => typeof value === 'string' ? value : fallback;

/** Recorded facts only. Transport callers must separately allowlist and bound strings. */
export function recordedDecisionFacts(records: readonly ArchiveRecord[]) {
  const stage = (name: ArchiveRecord['stage']) => object(records.findLast(record => record.stage === name)?.data);
  const decision = stage('decision'), permission = stage('permission');
  return {
    decision: text(decision.decision, 'unavailable'),
    reason: text(decision.reason ?? stage('assessment-status').reason, 'unavailable'),
    permission: text(permission.outcome, 'unknown'),
    execution: text(stage('execution').outcome, 'unknown'),
    approval: text(stage('approval').outcome, decision.decision === 'ASK'
      ? records[0]?.mode === 'observe' ? 'not requested (observe mode)'
        : permission.reason === 'approval-unavailable' ? 'unavailable (host cannot approve)' : 'unknown'
      : typeof decision.decision === 'string' ? 'not required' : 'unknown'),
  };
}
