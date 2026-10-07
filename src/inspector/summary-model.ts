import type { FindingCategory } from '../decision/finding-triage.js';
import type { RecordedOrigin } from '../recording/policy-contract.js';
// Presentation inputs only. Host adapters must validate and bound these before transport.
export interface SummaryRule {
  id: string; text: string; line: number | null; enforcement: string; builtin: boolean;
  result: { outcome?: SummaryScore | null; evidence?: SummaryScore | null } | null;
  gateIds: string[] | null; contribution: string;
  thresholds: { effectThreshold: number | null; evidenceThreshold: number | null };
  evidenceGate: string; profile: string;
  textStatus?: 'recorded' | 'truncated' | 'missing'; omittedTextChars?: number;
  origin?: RecordedOrigin | null;
}
// Supplied by the shared recorded fold. This workspace does not classify outcomes.
export interface SummaryEvaluatorState {
  status: 'completed' | 'unavailable' | 'pending' | 'dropped' | 'cancelled' | 'incomplete';
  reason: string | null;
}
export interface SummaryScore { choice: string; probabilities: Record<string, number> }
export interface SummaryCall {
  id: string; callId: string; toolName: string; timestamp: number;
  mode: string; decision: string; permission: string; execution: string;
  categories: FindingCategory[]; missing: string[]; assessmentStatus: string; failure: string | null;
  evaluatorState?: SummaryEvaluatorState;
}
// Whole-call facts, separate from the currently browsed rule page. No raw rule text.
export interface SummaryExplanation {
  blockerCount: number; uncertaintyOnly: boolean;
  firstBlocker: (Pick<SummaryRule, 'builtin' | 'line' | 'result' | 'thresholds'> & { gate: string }) | null;
}
export interface SummaryDecision {
  identity: { callId: string; toolName: string; mode: string } | null;
  decision: string; reason: string; permission: string; execution: string; approval: string;
  categories: FindingCategory[]; missing: string[]; assessmentStatus: string; failure: string | null;
  evaluatorState?: SummaryEvaluatorState;
  noRulesClassifiedViolated: boolean; rules: SummaryRule[];
  explanation?: SummaryExplanation;
  metadata?: { schemas: number[]; questionVersion: string; profile: string; policyDigest: string | null };
  omittedRules?: number;
  missingRuleSnapshots?: number;
  rulePage?: { snapshot: string; offset: number; total: number; next: string | null };
}
