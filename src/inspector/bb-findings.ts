import { recordedOrigin } from '../recording/policy-contract.js';
import type { ArchiveRecord } from '../recording/contract.js';
import { findingStage, foldFindingStages } from './finding-view.js';
import { createHash } from 'node:crypto';

export interface ThreadFinding {
  id: string; callId: string; toolName: string; timestamp: number; mode: 'observe' | 'enforce';
  snapshot: string;
  rules: { ruleId: string; severity: 'BLOCK' | 'WARN'; origin: import('../recording/policy-contract.js').RecordedOrigin | null; policyText: string | null; confidence: number | null; uncertain: boolean; kind: 'policy' | 'integrity' }[];
  wouldDecision: 'ALLOW' | 'ASK' | 'BLOCK' | 'unknown';
  actualPermission: 'released' | 'blocked' | 'unknown';
  observedExecution: 'executed' | 'failed' | 'unknown';
  missingStages: string[];
}

const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const STAGES = ['begin', 'request', 'response', 'validation', 'assessment', 'decision', 'permission', 'execution'];

/** Allowlisted owner projection: never send actions, evidence, provider responses or cwd to BB. */
export function projectThreadFinding(records: ArchiveRecord[], id: string, threadId: string): { item: ThreadFinding | null; gaps: string[] } {
  const gaps: string[] = [];
  if (!records.length || records.some(r => ![3, 4, 5].includes(r.schemaVersion) || r.host !== 'pi' || r.bbThreadId !== threadId))
    return { item: null, gaps: ['detail-unavailable'] };
  const stage = (name: string) => object(records.findLast(r => r.stage === name)?.data);
  const facts = foldFindingStages(records.map(findingStage));
  if (stage('validation').valid !== true || facts.evaluatorState.status !== 'completed')
    return { item: null, gaps: ['detail-unavailable'] };
  const assessment = object(stage('assessment').assessment);
  if (typeof assessment.model !== 'string' || !Array.isArray(assessment.rules)) return { item: null, gaps: ['detail-unavailable'] };
  const request = stage('request'), begin = stage('begin');
  const policy = object(Object.keys(request).length ? request.policy : begin.policy);
  const integrity = object(Object.keys(request).length ? object(object(request.payload).state).integrity : begin.integrity);
  const rules = [...(Array.isArray(policy.rules) ? policy.rules : []),
    ...(typeof integrity.id === 'string' ? [{ ...integrity, enforcement: 'BLOCK' }] : [])];
  const selected = new Map<string, ThreadFinding['rules'][number]>();
  const diagnostics = stage('decision').contributions ?? stage('decision').diagnostics;
  const threshold = object(stage('assessment').config ?? begin.config).effectThreshold;
  for (const result of assessment.rules) {
    if (result?.outcome?.choice !== 'FAIL' || typeof result.ruleId !== 'string' || selected.has(result.ruleId)) continue;
    const rule = rules.find(r => r?.id === result.ruleId && (r.enforcement === 'BLOCK' || r.enforcement === 'WARN'));
    if (!rule) continue;
    if (selected.size >= 16) { gaps.push('detail-rule-limit'); break; }
    const text = typeof rule.text === 'string' ? rule.text : null;
    if (text === null || text.length > 2048) gaps.push('policy-text-unavailable');
    const confidence = result.outcome.probabilities?.FAIL;
    selected.set(result.ruleId, { ruleId: result.ruleId, severity: rule.enforcement,
      origin: result.ruleId === integrity.id ? null : recordedOrigin(records.findLast(r => r.stage === 'request' || r.stage === 'begin')?.schemaVersion, rule, policy),
      policyText: text !== null && text.length <= 2048 ? text : null,
      confidence: typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null,
      kind: result.ruleId === integrity.id ? 'integrity' : 'policy',
      uncertain: !Number.isFinite(confidence) || !Number.isFinite(threshold) || confidence < threshold
        || !Array.isArray(diagnostics) || !diagnostics.some(d => d?.ruleId === result.ruleId && Array.isArray(d.gates))
        || facts.uncertainty.some(value => value.ruleId === result.ruleId) });
  }
  if (!selected.size) return { item: null, gaps: ['detail-unavailable'] };
  const decision = stage('decision').decision, permission = stage('permission').outcome, execution = stage('execution').outcome;
  const first = records[0]!;
  return { item: { id, callId: first.callId.slice(0, 256), toolName: first.toolName.slice(0, 256), timestamp: first.timestamp, mode: first.mode,
    snapshot: createHash('sha256').update(JSON.stringify([policy, integrity])).digest('hex'),
    rules: [...selected.values()], wouldDecision: ['ALLOW', 'ASK', 'BLOCK'].includes(decision) ? decision : 'unknown',
    actualPermission: ['released', 'blocked'].includes(permission) ? permission : 'unknown',
    observedExecution: ['executed', 'failed'].includes(execution) ? execution : 'unknown',
    missingStages: STAGES.filter(name => !records.some(r => r.stage === name)) }, gaps };
}
