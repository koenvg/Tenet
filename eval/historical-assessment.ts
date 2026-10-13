import { JudgeFailure, type Decision, type JudgeRequest, type PolicySet } from '../src/decision/contracts.js';
import { assessmentDecision, DEFAULTS, validateAssessment } from '../src/decision/decide.js';
import { evidenceContext } from '../src/decision/evidence-context.js';
import { HISTORICAL_QUESTION_VERSION } from './evidence-selection-history.js';

// Offline scripted replay only. No production selector, transport or permission path.
export function historicalAssessment(policy: PolicySet, prepared: JudgeRequest | null,
  scripted: (request: JudgeRequest) => unknown): Decision {
  const result: Decision = { profile: 'applicability-v1', questionVersion: HISTORICAL_QUESTION_VERSION,
    decision: 'BLOCK', reason: 'insufficient-evidence', ruleIds: [], assessment: null, diagnostics: [],
    durationMs: 0, config: DEFAULTS, requestedModel: 'offline-scripted-not-a-model', requestedProvider: 'injected',
    evidenceContext: prepared?.evidenceContext ?? evidenceContext() };
  if (!prepared) return result;
  try {
    const assessment = validateAssessment(scripted(prepared), policy, prepared);
    return { ...result, ...assessmentDecision(assessment, DEFAULTS, policy), assessment };
  } catch (error) {
    return { ...result, reason: error instanceof JudgeFailure ? error.reason : 'provider-error',
      ...(error instanceof JudgeFailure && error.reason === 'invalid-response'
        ? { validationIssue: error.validationIssue ?? 'response-shape' } : {}) };
  }
}
