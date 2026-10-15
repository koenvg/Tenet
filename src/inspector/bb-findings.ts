import type { ArchiveRecord } from '../recording/contract.js';
import { recordedInvocation } from './recorded-invocation.js';
import { createHash } from 'node:crypto';
import { recordedAssessment } from './recorded-assessment.js';

export interface ThreadFinding {
  id: string; callId: string; toolName: string; timestamp: number; mode: 'observe' | 'enforce';
  snapshot: string;
  rules: { ruleId: string; severity: 'BLOCK' | 'WARN'; origin: import('../recording/policy-contract.js').RecordedOrigin | null; policyText: string | null; confidence: number | null; uncertain: boolean; kind: 'policy' | 'integrity' }[];
  wouldDecision: 'ALLOW' | 'ASK' | 'BLOCK' | 'unknown';
  actualPermission: 'released' | 'blocked' | 'unknown';
  observedExecution: 'executed' | 'failed' | 'unknown';
  missingStages: string[];
}


/** Allowlisted owner projection: never send actions, evidence, provider responses or cwd to BB. */
export function projectThreadFinding(records: ArchiveRecord[], id: string, threadId: string): { item: ThreadFinding | null; gaps: string[] } {
  const gaps: string[] = [];
  if (!records.length || records.some(r => ![3, 4, 5].includes(r.schemaVersion) || r.host !== 'pi' || r.bbThreadId !== threadId))
    return { item: null, gaps: ['detail-unavailable'] };
  const invocation = recordedInvocation(records);
  const facts = invocation.findings;
  if (invocation.validation.valid !== true || facts.evaluatorState.status !== 'completed')
    return { item: null, gaps: ['detail-unavailable'] };
  const assessment = recordedAssessment(invocation.assessmentStage.assessment);
  if (!assessment) return { item: null, gaps: ['detail-unavailable'] };
  const { policy, integrity, rules } = invocation.submittedSnapshot;
  const selected = new Map<string, ThreadFinding['rules'][number]>();
  const threshold = invocation.config.effectThreshold;
  for (const result of assessment.rules) {
    if (result.outcome.choice !== 'FAIL') continue;
    const snapshot = rules.find(({ rule }) => rule.id === result.ruleId && (rule.enforcement === 'BLOCK' || rule.enforcement === 'WARN'));
    if (!snapshot) continue;
    const { rule, origin, builtin } = snapshot;
    const recorded = invocation.forRule(result.ruleId);
    if (selected.size >= 16) { gaps.push('detail-rule-limit'); break; }
    const text = typeof rule.text === 'string' ? rule.text : null;
    if (text === null || text.length > 2048) gaps.push('policy-text-unavailable');
    const confidence = result.outcome.probabilities?.FAIL;
    selected.set(result.ruleId, { ruleId: result.ruleId, severity: rule.enforcement,
      origin,
      policyText: text !== null && text.length <= 2048 ? text : null,
      confidence: typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null,
      kind: builtin ? 'integrity' : 'policy',
      uncertain: typeof confidence !== 'number' || !Number.isFinite(confidence) || !Number.isFinite(threshold) || confidence < threshold
        || !recorded.hasRecordedGates
        || facts.uncertainty.some(value => value.ruleId === result.ruleId) });
  }
  if (!selected.size) return { item: null, gaps: ['detail-unavailable'] };
  const { decision, permission, execution } = invocation.facts;
  const first = records[0]!;
  return { item: { id, callId: first.callId.slice(0, 256), toolName: first.toolName.slice(0, 256), timestamp: first.timestamp, mode: first.mode,
    snapshot: createHash('sha256').update(JSON.stringify([policy, integrity])).digest('hex'),
    rules: [...selected.values()], wouldDecision: decision === 'ALLOW' || decision === 'ASK' || decision === 'BLOCK' ? decision : 'unknown',
    actualPermission: permission === 'released' || permission === 'blocked' ? permission : 'unknown',
    observedExecution: execution === 'executed' || execution === 'failed' ? execution : 'unknown',
    missingStages: invocation.missing }, gaps };
}
