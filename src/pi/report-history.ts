import { validationIssue } from '../decision/response-validation.js';
import type { BlockingGate, RuleDiagnostic } from '../decision/contracts.js';
import type { OwnerReport } from './owner-reports.js';
import { POLICY_LIMITS } from '../decision/policy.js';

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 256;
const probability = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const gates = new Set(['rule-fail', 'outcome-unknown', 'outcome-confidence-below-threshold', 'evidence-insufficient', 'evidence-confidence-below-threshold', 'applicability-unresolved']);
const reasons = new Set(['all-rules-pass', 'advisory-findings', 'rule-approval-required', 'rule-failed', 'policy-integrity',
  'insufficient-evidence', 'configuration', 'missing-credentials', 'invalid-response', 'provider-error', 'timeout', 'cancelled',
  'policy-unavailable', 'policy-format', 'policy-file-limit', 'policy-rule-count-limit', 'policy-rule-size-limit', 'policy-stale',
  'guard-error', 'guard-state-changed', 'duplicate-call-identity', 'arguments-changed', 'session-start', 'session-switch',
  'session-fork', 'session-tree', 'session-shutdown', 'agent-end', 'not-started', 'starting',
  'assessment-pending', 'queue-capacity', 'snapshot-capacity', 'queue-expired', 'generation-invalidated', 'host-cancelled',
  'approval-denied-or-dismissed', 'approval-ui-error', 'approval-invalidated', 'action-resolution-unavailable', 'action-resolution-stale',
  'approval-denied', 'approval-dismissed', 'approval-timeout', 'approval-unavailable', 'approval-cancelled', 'approval-stale']);

/** Accept bounded contract fields, including snapshot rule text, but no extra payloads. */
export function recoverReport(entry: unknown): OwnerReport | undefined {
  if (!object(entry) || entry.type !== 'custom' || entry.customType !== 'tenet' || !object(entry.data)) return;
  const d = entry.data;
  if (d.version !== 3 || d.stage !== 'permission' || !['observe', 'enforce'].includes(String(d.mode))
    || !['released', 'blocked'].includes(String(d.outcome)) || d.wouldDecision !== undefined && !['ALLOW', 'ASK', 'BLOCK'].includes(String(d.wouldDecision))
    || typeof d.assessmentAvailable !== 'boolean' || !text(d.reason) || !reasons.has(d.reason)
    || !text(d.callId) || !text(d.toolName) || !text(d.invocationId)
    || !Array.isArray(d.rules) || d.rules.length > 16 || !Array.isArray(d.diagnostics) || d.diagnostics.length > 17
    || !Array.isArray(d.ruleIds) || d.ruleIds.length > 17 || !d.ruleIds.every(text)
    || !Array.isArray(d.approvalRules) || d.approvalRules.length > 16 || !d.approvalRules.every(text)) return;
  const rules: OwnerReport['rules'][number][] = [];
  for (const r of d.rules) {
    if (!object(r) || !text(r.id) || typeof r.line !== 'number' || !Number.isSafeInteger(r.line) || r.line < 1 || r.line > 65536
      || (r.enforcement !== 'BLOCK' && r.enforcement !== 'WARN')) return;
    if (r.text !== undefined && (typeof r.text !== 'string' || Buffer.byteLength(r.text, 'utf8') > POLICY_LIMITS.ruleBytes)) return;
    rules.push({ id: r.id, line: r.line, enforcement: r.enforcement, ...(typeof r.text === 'string' ? { text: r.text } : {}) });
  }
  const diagnostics: RuleDiagnostic[] = [];
  for (const r of d.diagnostics) {
    if (!object(r) || !text(r.ruleId) || (r.enforcement !== 'BLOCK' && r.enforcement !== 'WARN')
      || !['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED', 'NOT_APPLICABLE'].includes(String(r.outcome))
      || !probability(r.outcomeProbability) || !probability(r.effectThreshold)
      || (r.outcome === 'NOT_APPLICABLE'
        ? d.profile !== 'applicability-v1' || r.evidence !== null || r.evidenceProbability !== null || r.evidenceThreshold !== null
        : (r.evidence !== 'SUFFICIENT' && r.evidence !== 'INSUFFICIENT') || !probability(r.evidenceProbability) || !probability(r.evidenceThreshold))
      || !Array.isArray(r.gates) || r.gates.length > 6 || !r.gates.every(g => typeof g === 'string' && gates.has(g))) return;
    diagnostics.push({ ruleId: r.ruleId, enforcement: r.enforcement, outcome: r.outcome as RuleDiagnostic['outcome'],
      evidence: r.evidence as RuleDiagnostic['evidence'], outcomeProbability: r.outcomeProbability, evidenceProbability: r.evidenceProbability as number | null,
      effectThreshold: r.effectThreshold, evidenceThreshold: r.evidenceThreshold as number | null, gates: [...r.gates] as BlockingGate[] });
  }
  return { mode: d.mode as OwnerReport['mode'], outcome: d.outcome as OwnerReport['outcome'],
    ...(d.profile === 'legacy' || d.profile === 'applicability-v1' ? { profile: d.profile } : {}),
    ...(text(d.questionVersion) ? { questionVersion: d.questionVersion } : {}),
    ...(d.reason === 'invalid-response' && validationIssue(d.validationIssue) ? { validationIssue: validationIssue(d.validationIssue) } : {}),
    wouldDecision: d.wouldDecision as OwnerReport['wouldDecision'], reason: d.reason, assessmentAvailable: d.assessmentAvailable,
    callId: d.callId, toolName: d.toolName, invocationId: d.invocationId, rules, diagnostics,
    ruleIds: [...d.ruleIds] as string[], approvalRules: [...d.approvalRules] as string[] };
}

/** Restore only correlated, bounded execution facts for an already validated permission report. */
export function recoverExecution(entry: unknown): { invocationId: string; callId: string; toolName: string; mode: OwnerReport['mode']; outcome: 'executed' | 'failed' | 'unknown' } | undefined {
  if (!object(entry) || entry.type !== 'custom' || entry.customType !== 'tenet' || !object(entry.data)) return;
  const d = entry.data;
  if (d.version !== 3 || d.stage !== 'execution' || !['observe', 'enforce'].includes(String(d.mode))
    || !['executed', 'failed', 'unknown'].includes(String(d.outcome))
    || !text(d.invocationId) || !text(d.callId) || !text(d.toolName)) return;
  return { invocationId: d.invocationId, callId: d.callId, toolName: d.toolName, mode: d.mode as OwnerReport['mode'],
    outcome: d.outcome as 'executed' | 'failed' | 'unknown' };
}
