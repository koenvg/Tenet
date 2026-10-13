import { policyEvidence, policyIntegrity } from './policy-contract.js';
import type { JudgeRequest, EvidenceLimits } from './contracts.js';
import { jsonCopy } from './evidence.js';
import { serializedBytes } from './history-selection.js';
import { UNSUPPORTED_ACTION } from '../runtime/resolved-action.js';
import { ASSESSMENT_PROFILE } from './assessment-contract.js';
import { evidenceContext } from './evidence-context.js';
import { freeze } from './evidence.js';
import { captureAction } from './evidence.js';
import { prepareContent } from './history-content.js';
import { EVIDENCE_DEFAULTS, canonicalHistory, prepareScopedHistory, previousToolCall, type PreviousToolCall, type PreparedToolCall } from './history-selection.js';
import { assessmentEntries } from './assessment-contract.js';
import { currentFactReferences, supportsExemption } from './assessment-contract.js';
import { INTEGRITY_ID } from './policy.js';

export function judgeState(request: JudgeRequest) {
  const policy = policyEvidence(request.policy);
  return { profile: ASSESSMENT_PROFILE, policy: jsonCopy(policy), context: { cwd: request.cwd },
    integrity: jsonCopy(policyIntegrity(request.policy)), action: jsonCopy(request.action),
    resolvedAction: jsonCopy(request.resolvedAction ?? UNSUPPORTED_ACTION),
    trajectory: jsonCopy(request.trajectory ?? { observations: [], omitted: 0, limitations: ['history-unavailable'] }) };
}

export function boundEvidence(request: JudgeRequest, limits?: EvidenceLimits): JudgeRequest | null {
  const bounded = { ...request, trajectory: canonicalHistory(prepareScopedHistory(request.trajectory, limits)) };
  const plan = prepareJudgeScopes(bounded, { limits });
  if (!plan) return null;
  return freeze({ ...bounded, judgeScopes: plan, evidenceContext: scopedEvidenceContext(bounded, plan) });
}

export type ThinkingTrace = { readonly status: 'present'; readonly text: string } | { readonly status: 'unavailable' };
export interface OrdinaryJudgeState {
  readonly rule: string;
  readonly thinkingTrace: ThinkingTrace;
  readonly previousToolCall: PreviousToolCall;
  readonly proposedToolCall: PreparedToolCall;
}

/** Freeze the normal check-specific input plan. No transport or host ingestion here. */
export function prepareJudgeScopes(request: JudgeRequest, options: {
  thinkingTrace?: ThinkingTrace; limits?: EvidenceLimits; sensitiveFields?: string[];
} = {}) {
  const limits = options.limits ?? EVIDENCE_DEFAULTS;
  const sensitiveFields = options.sensitiveFields ?? [];
  const history = prepareScopedHistory(request.trajectory, limits, sensitiveFields);
  const preceding = previousToolCall(history, request.action.sessionId);
  const previous = preceding && 'toolName' in preceding ? {
    toolName: preceding.toolName, arguments: captureAction({ sessionId: request.action.sessionId, callId: 'previous',
      toolName: preceding.toolName, arguments: preceding.arguments }, sensitiveFields).arguments,
  } : preceding;
  const action = captureAction({ sessionId: request.action.sessionId, callId: request.action.callId,
    toolName: request.action.toolName, arguments: request.action.arguments }, sensitiveFields);
  const proposedToolCall = { toolName: action.toolName, arguments: action.arguments };
  let thinkingTrace: ThinkingTrace = { status: 'unavailable' };
  if (options.thinkingTrace?.status === 'present') {
    const content = prepareContent(options.thinkingTrace.text, limits.maxBytes, sensitiveFields);
    if (content && !content.shortened) thinkingTrace = { status: 'present', text: (content.data as { content: string }).content };
  }
  // References and support are computed from the original immutable host snapshot,
  // never from sanitized ordinary strings or projected protection resources.
  const references = currentFactReferences(request.resolvedAction);
  const resolvedAction = jsonCopy(request.resolvedAction ?? UNSUPPORTED_ACTION);
  const integrity = policyIntegrity(request.policy);
  const resolution = request.resolvedAction ?? UNSUPPORTED_ACTION;
  const protectedResolution = resolution.status === 'unsupported' ? resolution : {
    status: resolution.status, redactedFields: resolution.redactedFields, limitations: resolution.limitations,
    facts: { binding: resolution.facts.binding, coverage: resolution.facts.coverage,
      limitations: resolution.facts.limitations,
      operations: resolution.facts.operations.map(({ id, semantics, resources }) => ({ id, semantics, resources })) },
  };
  const entries = assessmentEntries(request.policy).map(entry => ({ ...entry, reference: 'state.rule' }));
  const groups: { id: string; kind: 'ordinary' | 'exemption' | 'policy-protection'; ruleId: string;
    questionKeys: string[]; state: OrdinaryJudgeState | Record<string, unknown>; stateBytes: number }[] = [];
  const add = (id: string, kind: typeof groups[number]['kind'], ruleId: string, questionKeys: string[],
    state: typeof groups[number]['state']) => {
    groups.push({ id, kind, ruleId, questionKeys, state, stateBytes: serializedBytes(state) });
  };
  for (const [index, rule] of request.policy.rules.entries()) {
    const entry = entries[index]!;
    add(`ordinary:${index}`, 'ordinary', rule.id, [entry.outcomeKey, entry.evidenceKey],
      { rule: rule.text, thinkingTrace, previousToolCall: previous, proposedToolCall });
    add(`exemption:${index}`, 'exemption', rule.id, [entry.factsKey], {
      rule: rule.text, proposedToolCall,
      binding: { sessionId: request.action.sessionId, callId: request.action.callId, toolName: request.action.toolName,
        argumentDigest: request.action.argumentDigest, cwd: request.cwd },
      resolvedAction, allowedFactReferences: references,
    });
  }
  const protection = entries.at(-1)!;
  add('policy-protection', 'policy-protection', INTEGRITY_ID, [protection.outcomeKey, protection.evidenceKey], {
    rule: integrity.text, proposedToolCall, context: { cwd: request.cwd },
    policy: { candidates: integrity.candidates, targets: integrity.targets }, resolvedAction: jsonCopy(protectedResolution),
  });
  const totalStateBytes = groups.reduce((sum, group) => sum + group.stateBytes, 0);
  // Count every scope, including duplicated mandatory rule/call fields. Never
  // shorten required input, omit a check or send the old all-data state to fit.
  if (totalStateBytes > limits.maxBytes) return null;
  return freeze({ groups: JSON.parse(JSON.stringify(groups)) as typeof groups, entries,
    questionScopes: Object.fromEntries(groups.flatMap(group => group.questionKeys.map(key => [key, group.id]))),
    totalStateBytes, exemptionSupported: !!references && supportsExemption(references, request) });
}


export type JudgeScopes = NonNullable<ReturnType<typeof prepareJudgeScopes>>;
export function scopedEvidenceContext(request: JudgeRequest, plan: JudgeScopes) {
  return freeze({ ...evidenceContext(request), version: 'evidence-context-v2' as const,
    selectionVersion: 'judge-input-scopes-v1' as const, preparation: 'completed' as const, history: null,
    scopes: plan.groups.map(g => ({ id: g.id, fields: Object.keys(g.state), stateBytes: g.stateBytes })),
    totalStateBytes: plan.totalStateBytes });
}
