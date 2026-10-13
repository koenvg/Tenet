import { recordedOrigin } from '../recording/policy-contract.js';
import { validationIssue } from '../decision/response-validation.js';
import { findingStage, foldFindingStages } from './finding-view.js';
import { nativeHistory, recordedJudge, validNativeContract } from '../recording/native.js';
import { recordedInputs, recordedSubmissions } from '../recording/scoped.js';
import type { ArchiveRecord } from '../recording/contract.js';
import { validEvidenceContext } from '../decision/evidence-context-contract.js';
import { freeze } from '../decision/immutable.js';
import { noRulesClassifiedViolated } from './assessment-completeness.js';
import { recordedDecisionFacts } from './recorded-decision.js';
export const object = (value: unknown): Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = (value: unknown): Record<string, any>[] => Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown, fallback = 'unavailable'): string => typeof value === 'string' ? value : fallback;
export function captureHealth(records: ArchiveRecord[]) {
  const latest = new Map<string, ArchiveRecord>();
  for (const record of records) if (record.stage === 'health' && record.sequence > (latest.get(record.writerId)?.sequence ?? 0)) latest.set(record.writerId, record);
  return [...latest.values()].map(r => ({ writerId: r.writerId, failed: Number(r.data.failed),
    dropped: Number(r.data.dropped), drainTimeouts: Number(r.data.drainTimeouts) }));
}
export type CaptureHealth = ReturnType<typeof captureHealth>;
// Private presentation fact. Do not change finding classification or BB status.
export function recordedAssessmentInvalid(record: Pick<ArchiveRecord, 'stage' | 'data'>): boolean {
  return ['assessment', 'validation', 'decision', 'assessment-status'].includes(record.stage)
    && (record.data.valid === false || record.data.validationIssue !== undefined);
}
export function invocationView(records: ArchiveRecord[]) {
  const findings = foldFindingStages(records.map(findingStage));
  const stage = (name: string) => object(records.findLast(r => r.stage === name)?.data);
  const begin = stage('begin'), request = stage('request');
  // Scope submission status is provenance, not a returned provider response.
  const response = object(records.findLast(r => r.stage === 'response' && object(r.data.value).kind !== 'scope-submission')?.data);
  const assessment = object(stage('assessment').assessment ?? stage('validation').assessment);
  const decision = stage('decision'), permission = stage('permission');
  const payload = object(request.payload), inputs = recordedInputs(request), state = object(inputs.sharedState);
  const submissions = recordedSubmissions(records);
  const policy = object(request.policy ?? begin.policy);
  const integrity = object(inputs.integrity ?? begin.integrity);
  const config = object(stage('assessment').config ?? begin.config);
  const rules = [...list(policy.rules), ...(typeof integrity.id === 'string' ? [{ ...integrity, enforcement: 'BLOCK', line: null }] : [])];
  const validation = stage('validation');
  const lifecycle = stage('assessment-status');
  const notSubmitted = validation.request === 'not-submitted' || permission.requestStatus === 'not-submitted';
  const submitted = validation.request === 'submitted' || permission.requestStatus === 'submitted';
  const contexts = [...records].reverse().map(r => r.data.evidenceContext).filter(validEvidenceContext);
  const recordedContext = contexts.find(c => c.preparation === 'completed') ?? contexts[0];
  const invalidRecordedAssessment = records.some(recordedAssessmentInvalid);
  return {
    identity: records[0] ? { host: records[0].host ?? 'pi', contextId: records[0].contextId ?? 'main',
      schemas: [...new Set(records.map(r => r.schemaVersion))],
      schemaVersion: records[0].schemaVersion, sessionId: records[0].sessionId, invocationId: records[0].invocationId,
      callId: records[0].callId, toolName: records[0].toolName, cwd: records[0].cwd, mode: records[0].mode } : null,
    categories: findings.categories,
    ...recordedDecisionFacts(records),
    adapterCoverage: records[0]?.schemaVersion !== 1 ? object(begin.adapterCoverage) : { limitations: ['legacy-pi-coverage-not-recorded'] },
    config, questionVersion: request.questionVersion ?? begin.questionVersion ?? null,
    assessmentProfile: findings.profile,
    judge: recordedJudge(records), native: nativeHistory(records),
    failure: findings.failure, assessmentStatus: findings.assessmentStatus,
    evaluatorState: findings.evaluatorState,
    assessmentInvalid: invalidRecordedAssessment,
    evidenceContext: recordedContext ? freeze(structuredClone(recordedContext)) : null,
    noRulesClassifiedViolated: ['ALLOW', 'ASK', 'BLOCK'].includes(decision.decision)
      && !invalidRecordedAssessment && !findings.failure && ['completed', 'validated'].includes(findings.assessmentStatus)
      && noRulesClassifiedViolated(policy, integrity, object(stage('assessment').assessment), validation, findings.profile),
    validationIssue: validationIssue(decision.validationIssue ?? stage('assessment').validationIssue ?? validation.validationIssue ?? lifecycle.validationIssue),
    queueWaitMs: typeof lifecycle.queueWaitMs === 'number' ? lifecycle.queueWaitMs : null,
    providerDurationMs: typeof lifecycle.providerDurationMs === 'number' ? lifecycle.providerDurationMs : null,
    requestStatus: inputs.layout === 'scoped' ? submissions.some(s => ['attempted', 'completed', 'failed'].includes(s.status))
      ? 'scoped submissions attempted; processing is not inferred' : 'prepared scopes captured; submission unavailable'
      : validNativeContract(request.nativeContract) ? 'captured canonical payload; native exchanges are separate'
      : request.payload ? 'submitted application payload' : submitted ? 'submitted; payload unavailable'
      : notSubmitted ? 'not submitted' : 'payload unavailable; capture incomplete',
    captureHealth: captureHealth(records),
    coverage: 'Best-effort capture. Missing stages are unknown, not proof of success.',
    missing: ['begin', 'request', 'response', 'validation', 'assessment', 'decision', 'permission', 'execution'].filter(name => !records.some(r => r.stage === name && (name !== 'response' || object(r.data.value).kind !== 'scope-submission'))),
    policy, evidence: inputs.sharedState, inputLayout: inputs.layout, inputScopes: inputs.scopes, submissions, response: Object.keys(response).length ? response : null,
    validation: stage('validation'),
    rules: rules.map(rule => {
      const result = list(assessment.rules).find(r => r.ruleId === rule.id);
      const mapping = list(request.mapping).find(m => m.id === rule.id);
      const questions = object(inputs.questions);
      const diagnostic = list(decision.diagnostics).find(r => r.ruleId === rule.id);
      const contribution = list(decision.contributions).find(r => r.ruleId === rule.id);
      const recorded = contribution ?? diagnostic;
      return { origin: rule.id === integrity.id ? null : recordedOrigin(records.findLast(r => r.stage === 'request' || r.stage === 'begin')?.schemaVersion, rule, policy), id: text(rule.id), text: text(rule.text), line: rule.line ?? null, enforcement: text(rule.enforcement),
        builtin: rule.id === integrity.id, result: result ?? null,
        gates: diagnostic ?? null, gateIds: Array.isArray(recorded?.gates) ? recorded.gates.filter((g: unknown): g is string => typeof g === 'string') : null,
        contribution: text(contribution?.contribution),
        thresholds: { effectThreshold: recorded?.effectThreshold ?? config.effectThreshold ?? null,
          evidenceThreshold: recorded && Object.hasOwn(recorded, 'evidenceThreshold') ? recorded.evidenceThreshold : config.evidenceThreshold ?? null },
        evidenceGate: text(contribution?.evidenceGate, 'unavailable'),
        profile: text(contribution?.profile, findings.profile),
        mapping: mapping ?? null,
        questions: mapping ? { outcome: questions[mapping.outcomeKey] ?? null, evidence: questions[mapping.evidenceKey] ?? null,
          ...(typeof mapping.factsKey === 'string' ? { facts: questions[mapping.factsKey] ?? null } : {}) } : null };
    }),
  };
}
export type InvocationView = ReturnType<typeof invocationView>;
