import type { prepareJudgeScopes } from '../decision/judge-evidence.js';
import { SCOPED_ASSESSMENT_METADATA, SCOPED_INPUT_VERSION, SCOPED_QUESTION_VERSION } from '../decision/assessment-shape.js';
import { validEvidenceContext } from '../decision/evidence-context-contract.js';


export { SCOPED_INPUT_VERSION, SCOPED_QUESTION_VERSION };
export type ScopedPlan = NonNullable<ReturnType<typeof prepareJudgeScopes>>;
export type ScopedQuestions = Record<string, { type: 'choice'; instructions: string; criteria: Record<string, string> }>;
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join(',') === [...keys].sort().join(',');
export const scopedBytes = (v: unknown) => new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v)).length;
const stateBytes = (v: unknown) => scopedBytes(JSON.stringify(v));
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;
const question = (v: unknown) => object(v) && v.type === 'choice' && typeof v.instructions === 'string'
  && object(v.criteria) && Object.keys(v.criteria).length > 0 && Object.values(v.criteria).every(c => typeof c === 'string');

// This reader also runs in browser fixtures; keep JSON validation free of Node imports.
const json = (v: unknown): boolean => v === null || typeof v === 'string' || typeof v === 'boolean'
  || typeof v === 'number' && Number.isFinite(v)
  || Array.isArray(v) && Object.keys(v).length === v.length && v.every(json)
  || object(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v)) && Object.values(v).every(json);
const call = (v: unknown) => {
  if (!object(v) || !exact(v, ['toolName', 'arguments']) || !text(v.toolName)) return false;
  try { return json(v.arguments); } catch { return false; }
};

export interface ConfirmationProvenance {
  ordinaryQuestion: string; confirmationQuestion: string; trigger: 'NOT_APPLICABLE'; factsReference: string;
}
export interface ScopedSubmission {
  submissionId: string; scopeId: string; status: 'attempted' | 'completed' | 'unavailable';
  /** Exact application JSON supplied by the caller, already normalized/redacted. Not a wire log. */
  payloadJson?: string;
  questionKeys: string[]; confirmation?: ConfirmationProvenance; reason?: string;
}
export function submittedPayload(v: ScopedSubmission) {
  try { return v.payloadJson === undefined ? null : JSON.parse(v.payloadJson); } catch { return null; }
}
export function validScopedSubmission(v: unknown): v is ScopedSubmission & { kind: string; payloadBytes?: number; stateBytes?: number } {
  if (!object(v) || v.kind !== 'scope-submission' || !text(v.submissionId) || !text(v.scopeId)
    || !['attempted', 'completed', 'unavailable'].includes(v.status)
    || !Array.isArray(v.questionKeys) || !v.questionKeys.length || !v.questionKeys.every(text)
    || new Set(v.questionKeys).size !== v.questionKeys.length || v.payload !== undefined) return false;
  if (v.payloadJson !== undefined) {
    if (typeof v.payloadJson !== 'string' || scopedBytes(v.payloadJson) > 1024 * 1024) return false;
    const p = submittedPayload(v as ScopedSubmission);
    if (!object(p) || !exact(p, ['model', 'state', 'questions']) || !text(p.model) || !object(p.state)
      || !object(p.questions) || !exact(p.questions, v.questionKeys) || !Object.values(p.questions).every(question)
      || v.payloadBytes !== scopedBytes(v.payloadJson) || v.stateBytes !== stateBytes(p.state)) return false;
  } else if (v.status === 'attempted' || v.payloadBytes !== undefined || v.stateBytes !== undefined) return false;
  if (v.reason !== undefined && !text(v.reason)) return false;
  return v.confirmation === undefined || object(v.confirmation)
    && exact(v.confirmation, ['ordinaryQuestion', 'confirmationQuestion', 'trigger', 'factsReference'])
    && text(v.confirmation.ordinaryQuestion) && text(v.confirmation.confirmationQuestion)
    && v.questionKeys.includes(v.confirmation.confirmationQuestion) && v.confirmation.trigger === 'NOT_APPLICABLE'
    && /^[a-f0-9]{64}$/.test(v.confirmation.factsReference);
}

/** Validate recorded layout and byte accounting, not a model answer or permission. */
export function validScopedRequest(d: Record<string, any>): boolean {
  const p = d.payload;
  if (d.questionVersion !== SCOPED_QUESTION_VERSION || d.inputVersion !== SCOPED_INPUT_VERSION
    || d.profile !== SCOPED_ASSESSMENT_METADATA.profile || d.selectionVersion !== SCOPED_INPUT_VERSION || !object(p)
    || !exact(p, ['model', 'scopes', 'questions', 'questionScopes']) || !text(p.model)
    || d.requestedModel !== p.model || !['typesafe', 'apus-llamacpp'].includes(d.provider)
    || !Array.isArray(p.scopes) || !p.scopes.length || p.scopes.length > 129
    || !object(p.questions) || !object(p.questionScopes) || !Array.isArray(d.mapping)
    || !object(d.policy) || !Array.isArray(d.policy.rules) || !object(d.integrity) || !text(d.integrity.id)
    || !validEvidenceContext(d.evidenceContext) || d.evidenceContext.selectionVersion !== SCOPED_INPUT_VERSION) return false;
  const keys: string[] = [], ids = new Set<string>();
  for (const s of p.scopes) {
    if (!object(s) || !exact(s, ['id', 'kind', 'ruleId', 'questionKeys', 'state', 'stateBytes'])
      || !text(s.id) || ids.has(s.id) || !text(s.ruleId) || !object(s.state)
      || !Array.isArray(s.questionKeys) || !s.questionKeys.length || !s.questionKeys.every(text)
      || s.stateBytes !== stateBytes(s.state)) return false;
    ids.add(s.id);
    const fields = s.kind === 'ordinary' ? ['rule', 'thinkingTrace', 'previousToolCall', 'proposedToolCall']
      : s.kind === 'exemption' ? ['rule', 'proposedToolCall', 'binding', 'resolvedAction', 'allowedFactReferences']
      : s.kind === 'policy-protection' ? ['rule', 'proposedToolCall', 'context', 'policy', 'resolvedAction'] : null;
    if (!fields || !exact(s.state, fields) || typeof s.state.rule !== 'string' || !call(s.state.proposedToolCall)) return false;
    if (s.kind === 'ordinary') {
      const t = s.state.thinkingTrace, previous = s.state.previousToolCall;
      if (!object(t) || !(t.status === 'unavailable' && exact(t, ['status'])
        || t.status === 'present' && exact(t, ['status', 'text']) && typeof t.text === 'string')
        || !(previous === null || call(previous) || object(previous) && exact(previous, ['status']) && previous.status === 'unavailable')) return false;
    }
    for (const key of s.questionKeys) {
      if (p.questionScopes[key] !== s.id || !question(p.questions[key])) return false;
      keys.push(key);
    }
  }
  if (new Set(keys).size !== keys.length || !exact(p.questions, keys) || !exact(p.questionScopes, keys)
    || d.mapping.length !== d.policy.rules.length + 1 || p.scopes.length !== d.policy.rules.length * 2 + 1) return false;
  const expectedKeys: string[] = [];
  for (const [i, m] of d.mapping.entries()) {
    const builtin = i === d.policy.rules.length, rule = builtin ? d.integrity : d.policy.rules[i];
    if (!object(m) || !object(rule) || m.id !== rule.id || m.reference !== 'state.rule'
      || m.outcomeKey !== `rule_${i}_outcome` || m.evidenceKey !== `rule_${i}_evidence` || m.factsKey !== `rule_${i}_facts`
      || (builtin ? m.confirmationKey !== undefined : m.confirmationKey !== `rule_${i}_confirmation`)) return false;
    const ordinary = p.scopes.find((s: any) => s.id === (builtin ? 'policy-protection' : `ordinary:${i}`));
    const exemption = builtin ? null : p.scopes.find((s: any) => s.id === `exemption:${i}`);
    if (!ordinary || ordinary.kind !== (builtin ? 'policy-protection' : 'ordinary') || ordinary.ruleId !== rule.id
      || ordinary.state.rule !== rule.text || JSON.stringify(ordinary.questionKeys) !== JSON.stringify([m.outcomeKey, m.evidenceKey])
      || !builtin && (!exemption || exemption.kind !== 'exemption' || exemption.ruleId !== rule.id || exemption.state.rule !== rule.text
        || JSON.stringify(exemption.questionKeys) !== JSON.stringify([m.factsKey]))) return false;
    expectedKeys.push(m.outcomeKey, m.evidenceKey, ...(builtin ? [] : [m.factsKey]));
  }
  const c = d.evidenceContext;
  return exact(p.questions, expectedKeys)
    && JSON.stringify(c.scopes) === JSON.stringify(p.scopes.map((s: any) => ({ id: s.id, fields: Object.keys(s.state), stateBytes: s.stateBytes })))
    && c.totalStateBytes === p.scopes.reduce((n: number, s: any) => n + s.stateBytes, 0);
}

/** Shared and scoped layouts are decoded only from their recorded identities. No preparation import. */
export function recordedInputs(d: Record<string, any>) {
  const p = object(d.payload) ? d.payload : {};
  const scoped = d.inputVersion === SCOPED_INPUT_VERSION && d.questionVersion === SCOPED_QUESTION_VERSION && validScopedRequest(d);
  const shared = d.inputVersion === undefined && d.questionVersion !== SCOPED_QUESTION_VERSION && object(p.state);
  return { layout: scoped ? 'scoped' as const : shared ? 'shared' as const : 'unavailable' as const,
    sharedState: shared ? p.state : null, scopes: scoped ? p.scopes as ScopedPlan['groups'] : [],
    questions: shared || scoped ? p.questions ?? {} : {},
    integrity: scoped ? d.integrity : shared ? p.state.integrity : undefined };
}

/** Attribution uses only the recorded plan, never current policy, preparation or settings. */
export function recordedSubmissions(records: { stage: string; data: Record<string, any> }[]) {
  const request = records.findLast(r => r.stage === 'request')?.data ?? {};
  const inputs = recordedInputs(request);
  return records.filter(r => r.stage === 'response' && r.data.inputVersion === SCOPED_INPUT_VERSION).map(r => {
    const d = r.data, v = d.value;
    const missing = { status: 'unavailable' as const, truncated: d.truncated === true, unavailable: true };
    if (inputs.layout !== 'scoped' || d.unavailable === true || d.truncated !== false || d.omittedFields !== 0 || !validScopedSubmission(v)) return missing;
    const scope = inputs.scopes.find(s => s.id === v.scopeId), m = request.mapping.find((m: any) => m.id === scope?.ruleId);
    if (!scope || !m || v.questionKeys.some(k => !scope.questionKeys.includes(k) && k !== v.confirmation?.confirmationQuestion)) return missing;
    if (v.confirmation && (scope.kind !== 'exemption' || v.confirmation.ordinaryQuestion !== m.outcomeKey
      || v.confirmation.confirmationQuestion !== m.confirmationKey
      || v.confirmation.factsReference !== (scope.state as any).allowedFactReferences?.digest)) return missing;
    const payload = submittedPayload(v);
    if (payload && (payload.model !== request.payload.model || JSON.stringify(payload.state) !== JSON.stringify(scope.state)
      || v.questionKeys.some(k => k !== v.confirmation?.confirmationQuestion
        && JSON.stringify(payload.questions[k]) !== JSON.stringify(inputs.questions[k])))) return missing;
    const { payloadJson, ...metadata } = v;
    return { ...metadata, ...(payload ? { payload } : {}) };
  });
}
