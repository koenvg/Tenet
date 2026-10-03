import type { ValidationIssue } from './response-validation.js';
import type { ResolvedAction } from '../runtime/resolved-action.js';
import type { RecordingSink } from '../recording/contract.js';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Outcome = 'PASS' | 'APPROVAL_REQUIRED' | 'FAIL' | 'UNKNOWN';
export type AssessmentOutcome = Outcome | 'NOT_APPLICABLE';
export type Sufficiency = 'SUFFICIENT' | 'INSUFFICIENT';
export interface Choice<T extends string> { choice: T; probabilities: Record<T, number> }
export interface RuleAssessment {
  ruleId: string;
  outcome: { choice: AssessmentOutcome; probabilities: Record<Outcome, number> & Partial<Record<'NOT_APPLICABLE', number>> };
  evidence: Choice<Sufficiency> | null;
  factReferences?: import('./assessment-contract.js').FactReferences;
  applicabilitySupported?: boolean;
}
export interface Assessment { model: string; rules: RuleAssessment[]; profile?: import('./assessment-contract.js').AssessmentProfile }
export type Enforcement = 'BLOCK' | 'WARN';
export interface Rule { readonly id: string; readonly line: number; readonly text: string; readonly enforcement: Enforcement; readonly evidenceThreshold?: number }
export type PolicyFailure = 'policy-unavailable' | 'policy-format' | 'policy-file-limit' | 'policy-rule-count-limit' | 'policy-rule-size-limit';
export interface PolicySet {
  readonly available: true;
  readonly source: string;
  readonly target: string;
  readonly digest: string;
  readonly rules: readonly Rule[];
}
export type Policy = PolicySet | { available: false; source: string; reason: PolicyFailure };
export interface ActionInput {
  sessionId: string;
  callId: string;
  toolName: string;
  description?: string | null;
  parameters?: unknown;
  arguments: unknown;
}
export interface Action {
  timestamp?: number;
  sessionId: string;
  callId: string;
  toolName: string;
  description: string | null;
  parameters: Json;
  arguments: Json;
  argumentDigest: string;
  redactedFields: number;
  limitations: string[];
}
export interface Observation {
  sessionId: string; callId: string | null; toolName: string | null;
  origin: string; timestamp: number | null; data: Json;
}
export interface Trajectory {
  observations: readonly Observation[]; omitted: number; limitations: readonly string[];
  selection?: HistorySelection;
  /** Runtime-encoded sanitized strings, local to this immutable snapshot. */
  values?: Readonly<Record<string, string>>;
}
export interface HistorySelection {
  readonly version: 'bounded-history-v2'; readonly maxHistoryBytes: number; readonly maxEventBytes: number;
  readonly retainedEvents: number; readonly shortenedEvents: number; readonly droppedEvents: number;
  readonly priorOmittedEvents: number;
  /** Serialized bytes saved versus the same retained, escaped inline snapshot,
   * with identical selection metadata. Never counts excerpts or dropped events. */
  readonly exactCompactedBytes: number;
}
export interface EvidenceLimits { recentEvents: number; maxBytes: number }
/** Host-supplied history is evidence only, never current resolution or permission. */
export interface HistoryEvent {
  kind: 'tool-call' | 'tool-result'; callId: string | null; toolName: string | null;
  data: unknown; timestamp?: number | null;
}
export interface Config { effectThreshold: number; evidenceThreshold: number; deadlineMs: number }
export interface JudgeRequest {
  /** Owner-only preparation diagnostic, excluded from judgeState. */
  evidenceContext?: import('./evidence-context.js').EvidenceContext;
  profile?: import('./assessment-contract.js').AssessmentProfile;
  policy: PolicySet;
  action: Action;
  /** Only the configured host resolver can populate this evidence. */
  resolvedAction?: ResolvedAction;
  /** Host-supplied, never inferred from tool arguments. */
  cwd: string;
  deadlineMs: number;
  trajectory?: Trajectory;
}
// Treat responses as untrusted, including responses from injected judges.
export type Judge = (request: JudgeRequest, signal: AbortSignal, recording?: RecordingSink) => Promise<unknown>;
export interface Clock {
  now(): number;
  schedule(callback: () => void, ms: number): () => void;
}
export type Reason = PolicyFailure | 'all-rules-pass' | 'advisory-findings' | 'rule-approval-required' | 'rule-failed' | 'policy-integrity'
  | 'insufficient-evidence' | 'configuration' | 'missing-credentials'
  | 'invalid-response' | 'provider-error' | 'timeout' | 'cancelled';
export type BlockingGate = 'rule-fail' | 'outcome-unknown' | 'outcome-confidence-below-threshold'
  | 'evidence-insufficient' | 'evidence-confidence-below-threshold' | 'applicability-unresolved';
export interface RuleDiagnostic {
  ruleId: string;
  enforcement: Enforcement;
  gates: BlockingGate[];
  outcome: AssessmentOutcome;
  outcomeProbability: number;
  evidence: Sufficiency | null;
  /** Probability of SUFFICIENT, absent when no evidence assessment applies. */
  evidenceProbability: number | null;
  effectThreshold: number;
  evidenceThreshold: number | null;
}
export interface Decision {
  evidenceContext: import('./evidence-context.js').EvidenceContext;
  profile?: import('./assessment-contract.js').AssessmentProfile;
  decision: 'ALLOW' | 'ASK' | 'BLOCK';
  reason: Reason;
  ruleIds: string[];
  assessment: Assessment | null;
  diagnostics: RuleDiagnostic[];
  validationIssue?: ValidationIssue;
  durationMs: number;
  config: Config;
  questionVersion: string;
  requestedModel: string;
}
export class JudgeFailure extends Error {
  constructor(readonly reason: Reason, readonly validationIssue?: ValidationIssue) { super(reason); }
}
