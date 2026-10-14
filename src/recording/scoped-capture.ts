import type { JudgeRequest } from '../decision/contracts.js';
import { SCOPED_ASSESSMENT_METADATA } from '../decision/assessment-shape.js';
import { evidenceContext } from '../decision/evidence-context.js';
import { freeze } from '../decision/immutable.js';
import { policyIntegrity } from '../decision/policy-contract.js';
import { capture, responseSnapshot, type RecordingSink } from './contract.js';
import { SCOPED_INPUT_VERSION, scopedBytes, submittedPayload, validScopedRequest,
  type ScopedPlan, type ScopedQuestions, type ScopedSubmission } from './scoped.js';

/** Scoped capture support. No provider calls or always-on logging. */
export function captureScopedPlan(sink: RecordingSink | undefined, request: JudgeRequest, plan: ScopedPlan,
  questions: ScopedQuestions, identity: { provider: 'system-one' | 'typesafe' | 'apus-llamacpp'; model: string; nativeContract?: unknown }) {
  capture(sink, 'request', () => {
    const owner = evidenceContext(request);
    const scopes = plan.groups.map(g => ({ id: g.id, fields: Object.keys(g.state), stateBytes: g.stateBytes }));
    const mapping = plan.entries.map((entry, i) => ({ ...entry,
      ...(i < request.policy.rules.length ? { confirmationKey: `rule_${i}_confirmation` } : {}) }));
    const data = { ...SCOPED_ASSESSMENT_METADATA, provider: identity.provider, requestedModel: identity.model,
      ...(identity.nativeContract ? { nativeContract: identity.nativeContract,
        renderingVersion: (identity.nativeContract as any).renderingVersion, rendererRevision: (identity.nativeContract as any).rendererRevision } : {}),
      policy: request.policy, integrity: policyIntegrity(request.policy), mapping,
      payload: { model: identity.model, scopes: plan.groups, questions, questionScopes: plan.questionScopes },
      evidenceContext: { ...owner, version: 'evidence-context-v2', selectionVersion: SCOPED_INPUT_VERSION,
        preparation: 'completed', history: null, scopes, totalStateBytes: plan.totalStateBytes }, selectionVersion: SCOPED_INPUT_VERSION };
    if (!validScopedRequest(data)) throw new Error('invalid-scoped-capture');
    return freeze(structuredClone(data));
  });
}
export function captureScopedSubmission(sink: RecordingSink | undefined, submission: ScopedSubmission) {
  capture(sink, 'response', () => {
    const payload = submittedPayload(submission);
    // Capture the exact normalized application JSON as a string, so snapshot field
    // omission cannot silently remove even already-redacted argument keys.
    const value = { kind: 'scope-submission', ...submission,
      ...(submission.payloadJson !== undefined ? { payloadBytes: scopedBytes(submission.payloadJson),
        stateBytes: payload ? scopedBytes(JSON.stringify(payload.state)) : null } : {}) };
    return { inputVersion: SCOPED_INPUT_VERSION, ...responseSnapshot(value) };
  });
}
