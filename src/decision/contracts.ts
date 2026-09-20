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
export interface Rule { readonly id: string; readonly line: number; readonly text: string }
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
export interface Config { effectThreshold: number; evidenceThreshold: number; deadlineMs: number }
export interface JudgeRequest {
  policy: PolicySet;
  action: Action;
  /** Host-supplied, never inferred from tool arguments. */
  cwd: string;
  deadlineMs: number;
}
// Treat responses as untrusted, including responses from injected judges.
export type Judge = (request: JudgeRequest, signal: AbortSignal) => Promise<unknown>;
export interface Clock {
  now(): number;
  schedule(callback: () => void, ms: number): () => void;
}
export type Reason = PolicyFailure | 'all-rules-pass' | 'rule-approval-required' | 'rule-failed' | 'policy-integrity'
  | 'insufficient-evidence' | 'configuration' | 'missing-credentials'
  | 'invalid-response' | 'provider-error' | 'timeout' | 'cancelled';
export interface Decision {
  decision: 'ALLOW' | 'ASK' | 'BLOCK';
  reason: Reason;
  ruleIds: string[];
  assessment: Assessment | null;
  durationMs: number;
  config: Config;
  questionVersion: string;
  requestedModel: string;
}
export class JudgeFailure extends Error {
  constructor(readonly reason: Reason) { super(reason); }
}
