export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Outcome = 'PASS' | 'APPROVAL_REQUIRED' | 'FAIL' | 'UNKNOWN';
export type Sufficiency = 'SUFFICIENT' | 'INSUFFICIENT';
export interface Choice<T extends string> { choice: T; probabilities: Record<T, number> }
export interface RuleAssessment {
  ruleId: string;
  outcome: Choice<Outcome>;
  evidence: Choice<Sufficiency>;
}
export interface Assessment { model: string; rules: RuleAssessment[] }
export type Enforcement = 'BLOCK' | 'WARN';
export interface Rule { readonly id: string; readonly line: number; readonly text: string; readonly enforcement: Enforcement }
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
}
export interface EvidenceLimits { recentEvents: number; maxBytes: number }
export interface Config { effectThreshold: number; evidenceThreshold: number; deadlineMs: number }
export interface JudgeRequest {
  policy: PolicySet;
  action: Action;
  /** Host-supplied, never inferred from tool arguments. */
  cwd: string;
  deadlineMs: number;
  trajectory?: Trajectory;
}
// Treat responses as untrusted, including responses from injected judges.
export type Judge = (request: JudgeRequest, signal: AbortSignal) => Promise<unknown>;
export interface Clock {
  now(): number;
  schedule(callback: () => void, ms: number): () => void;
}
export type Reason = PolicyFailure | 'all-rules-pass' | 'advisory-findings' | 'rule-approval-required' | 'rule-failed' | 'policy-integrity'
  | 'insufficient-evidence' | 'configuration' | 'missing-credentials'
  | 'invalid-response' | 'provider-error' | 'timeout' | 'cancelled';
export type BlockingGate = 'rule-fail' | 'outcome-unknown' | 'outcome-confidence-below-threshold'
  | 'evidence-insufficient' | 'evidence-confidence-below-threshold';
export interface RuleDiagnostic {
  ruleId: string;
  enforcement: Enforcement;
  gates: BlockingGate[];
  outcome: Outcome;
  outcomeProbability: number;
  evidence: Sufficiency;
  /** Probability of SUFFICIENT, even when INSUFFICIENT is selected. */
  evidenceProbability: number;
  effectThreshold: number;
  evidenceThreshold: number;
}
export interface Decision {
  decision: 'ALLOW' | 'ASK' | 'BLOCK';
  reason: Reason;
  ruleIds: string[];
  assessment: Assessment | null;
  diagnostics: RuleDiagnostic[];
  durationMs: number;
  config: Config;
  questionVersion: string;
  requestedModel: string;
}
export class JudgeFailure extends Error {
  constructor(readonly reason: Reason) { super(reason); }
}
