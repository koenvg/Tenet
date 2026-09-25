import { classifyFinding, uncertaintyKeys } from '../decision/finding-triage.js';
import type { ArchiveRecord, Stage } from '../recording/contract.js';

export type RuleFacts = { ruleId: string; outcome?: string; gates: string[] };
export type FindingStage = { stage: Stage; timestamp: number; reason?: string; valid?: boolean; status?: string;
  model?: string; rules?: RuleFacts[]; policyIdentity?: string; profile?: string };
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const reason = (v: unknown) => typeof v === 'string' && v.length <= 256 ? v : undefined;
const ruleFacts = (v: unknown): RuleFacts[] => Array.isArray(v) ? v.slice(0, 17).map(object)
  .filter(r => typeof r.ruleId === 'string' && r.ruleId.length <= 256)
  .map(r => ({ ruleId: r.ruleId, ...(typeof r.outcome?.choice === 'string' && r.outcome.choice.length <= 64 ? { outcome: r.outcome.choice }
    : typeof r.outcome === 'string' && r.outcome.length <= 64 ? { outcome: r.outcome } : {}),
    gates: Array.isArray(r.gates) ? r.gates.filter((g: unknown): g is string => typeof g === 'string' && g.length <= 128).slice(0, 8) : [] })) : [];

/** Only bounded, non-evidence fields survive in the summary index. Detail uses the same projection. */
export function findingStage(record: Pick<ArchiveRecord, 'stage' | 'data' | 'timestamp'>): FindingStage {
  const { stage, timestamp, data } = record;
  if (stage === 'begin') {
    const policy = object(data.policy), config = object(data.config);
    const source = typeof policy.source === 'string' && policy.source.length <= 8192 ? policy.source : null;
    const target = typeof policy.target === 'string' && policy.target.length <= 8192 ? policy.target : null;
    return { stage, timestamp, policyIdentity: typeof policy.digest === 'string' && policy.digest.length <= 256
      && source !== null ? JSON.stringify([source, policy.digest, target]) : undefined,
      profile: typeof config.assessmentProfile === 'string' && config.assessmentProfile.length <= 128 ? config.assessmentProfile : 'legacy (historical)' };
  }
  if (stage === 'assessment' || stage === 'validation') {
    const assessment = object(data.assessment);
    return { stage, timestamp, reason: reason(data.reason), valid: stage === 'validation' ? data.valid === true : undefined,
      model: typeof assessment.model === 'string' && Array.isArray(assessment.rules) ? 'recorded' : undefined,
      rules: ruleFacts(assessment.rules) };
  }
  if (stage === 'decision') return { stage, timestamp, reason: reason(data.reason), rules: ruleFacts(data.contributions ?? data.diagnostics) };
  if (stage === 'permission') return { stage, timestamp, reason: reason(data.reason) };
  if (stage === 'assessment-status') return { stage, timestamp, status: String(data.status), reason: reason(data.reason),
    profile: typeof data.profile === 'string' && data.profile.length <= 128 ? data.profile : undefined };
  return { stage, timestamp };
}

const failures = new Set(['missing-credentials', 'provider-error', 'invalid-response', 'timeout', 'cancelled',
  'configuration', 'policy-unavailable', 'policy-format', 'policy-file-limit', 'policy-rule-count-limit', 'policy-rule-size-limit',
  'guard-error', 'guard-state-changed', 'session-shutdown']);

export function foldFindingStages(records: readonly FindingStage[]) {
  const stage = (name: Stage) => records.findLast(r => r.stage === name);
  const validation = stage('validation'), assessment = stage('assessment'), lifecycle = stage('assessment-status');
  const failure = [assessment?.reason, stage('decision')?.reason, validation?.reason, stage('permission')?.reason]
    .find(value => value && failures.has(value)) ?? (validation?.valid === false ? 'validation-failed' : null);
  const selectedAssessment = assessment?.model ? assessment : validation;
  const legacyStatus = failure ? 'failed' : selectedAssessment?.model ? 'validated' : 'incomplete';
  const assessmentStatus = lifecycle && ['pending', 'dropped', 'cancelled', 'unavailable'].includes(lifecycle.status ?? '')
    ? lifecycle.status! : legacyStatus;
  const rules = new Map<string, RuleFacts>();
  for (const record of [selectedAssessment, stage('decision')]) for (const rule of record?.rules ?? []) {
    const previous = rules.get(rule.ruleId);
    rules.set(rule.ruleId, { ruleId: rule.ruleId, outcome: rule.outcome ?? previous?.outcome,
      gates: [...new Set([...(previous?.gates ?? []), ...rule.gates])] });
  }
  const facts = { assessmentStatus, reason: failure, rules: [...rules.values()] };
  const begin = stage('begin');
  return { assessmentStatus, failure: lifecycle?.status === 'unavailable' ? lifecycle.reason ?? 'assessment-unavailable' : failure,
    categories: classifyFinding(facts), uncertainty: uncertaintyKeys(facts),
    policyIdentity: begin?.policyIdentity ?? 'unrecorded policy identity',
    profile: lifecycle?.profile ?? begin?.profile ?? 'legacy (historical)',
    occurrence: stage('decision')?.timestamp ?? selectedAssessment?.timestamp ?? records[0]?.timestamp ?? 0 };
}
