import type { ArchiveRecord, Stage } from '../recording/contract.js';
import { recordedOrigin } from '../recording/policy-contract.js';
import { recordedInputs } from '../recording/scoped.js';
import { findingStage, foldFindingStages } from './finding-view.js';
import { recordedDecisionFacts } from './recorded-decision.js';
import { summaryAction, uncertainGates } from './summary-display.js';

const object = (value: unknown): Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = (value: unknown): Record<string, any>[] => Array.isArray(value) ? value.map(object) : [];
const requiredStages = ['begin', 'request', 'response', 'validation', 'assessment', 'decision', 'permission', 'execution'] as const;

/** Interpret recorded facts, not current policy or assessment contracts.
 * This is not a transport projection. Each reader must select, validate and bound its output.
 * Private evidence presentation is built only by invocationView, never here. */
export function recordedInvocation(records: readonly ArchiveRecord[]) {
  const stage = (name: Stage) => object(records.findLast(record => record.stage === name)?.data);
  const begin = stage('begin'), request = stage('request'), assessmentStage = stage('assessment');
  const validation = stage('validation'), decision = stage('decision'), permission = stage('permission');
  const lifecycle = stage('assessment-status');
  const inputs = recordedInputs(request);
  const proposedCall = inputs.layout === 'shared' ? inputs.sharedState?.action
    : (inputs.scopes.find(scope => scope.kind === 'ordinary') ?? inputs.scopes.find(scope => scope.kind === 'policy-protection'))?.state.proposedToolCall;
  const config = object(assessmentStage.config ?? begin.config);
  const assessment = object(assessmentStage.assessment ?? validation.assessment);
  const results = list(assessment.rules), contributions = list(decision.contributions), diagnostics = list(decision.diagnostics);
  // Finding certainty uses the selected array, not per-rule diagnostic fallback.
  const selectedDiagnostics = decision.contributions ?? decision.diagnostics;
  const originSchema = records.findLast(record => record.stage === 'request' || record.stage === 'begin')?.schemaVersion;
  function snapshot(policyValue: unknown, integrityValue: unknown) {
    const policy = object(policyValue), integrity = object(integrityValue);
    const rules = [...list(policy.rules), ...(typeof integrity.id === 'string' ? [{ ...integrity, enforcement: 'BLOCK', line: null }] : [])];
    return { policy, integrity, rules: rules.map(rule => ({ rule, builtin: rule.id === integrity.id,
      origin: rule.id === integrity.id ? null : recordedOrigin(originSchema, rule, policy) })) };
  }
  const availableSnapshot = snapshot(request.policy ?? begin.policy, inputs.integrity ?? begin.integrity);
  // A retained request owns attribution even when it contains no policy snapshot.
  const submittedSnapshot = records.some(record => record.stage === 'request') ? snapshot(request.policy, inputs.integrity) : snapshot(begin.policy, begin.integrity);
  const ruleIds = new Set([...submittedSnapshot.rules.map(({ rule }) => rule.id), ...results.map(result => result.ruleId)]);
  const assessmentUncertain = [...ruleIds].some(id => uncertainGates(list(selectedDiagnostics).find(rule => rule.ruleId === id)?.gates));
  return {
    begin, request, assessmentStage, validation, decision, permission, lifecycle, inputs, config, assessment,
    recordedAction: summaryAction(proposedCall),
    findings: foldFindingStages(records.map(findingStage)), facts: recordedDecisionFacts(records),
    snapshot: availableSnapshot,
    submittedSnapshot, assessmentUncertain,
    missing: requiredStages.filter(name => !records.some(record => record.stage === name)),
    forRule(ruleId: unknown) {
      const contribution = contributions.find(value => value.ruleId === ruleId);
      const diagnostic = diagnostics.find(value => value.ruleId === ruleId);
      const recorded = contribution ?? diagnostic;
      return { result: results.find(value => value.ruleId === ruleId), contribution, diagnostic, recorded,
        hasRecordedGates: Array.isArray(selectedDiagnostics) && selectedDiagnostics.some(value => value?.ruleId === ruleId && Array.isArray(value.gates)),
        thresholds: { effectThreshold: recorded?.effectThreshold ?? config.effectThreshold ?? null,
          evidenceThreshold: recorded && Object.hasOwn(recorded, 'evidenceThreshold') ? recorded.evidenceThreshold : config.evidenceThreshold ?? null } };
    },
  };
}
