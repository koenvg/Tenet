import type { FindingCategory } from '../decision/finding-triage.js';
// Presentation inputs only. Host adapters must validate and bound these before transport.
export interface SummaryRule {
  id: string; text: string; line: number | null; enforcement: string; builtin: boolean;
  result: { outcome?: SummaryScore | null; evidence?: SummaryScore | null } | null;
  gateIds: string[] | null; contribution: string;
  thresholds: { effectThreshold: number | null; evidenceThreshold: number | null };
  evidenceGate: string; profile: string;
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
export interface SummaryDecision {
  identity: { callId: string; toolName: string; mode: string } | null;
  decision: string; reason: string; permission: string; execution: string; approval: string;
  categories: FindingCategory[]; missing: string[]; assessmentStatus: string; failure: string | null;
  evaluatorState?: SummaryEvaluatorState;
  noRulesClassifiedViolated: boolean; rules: SummaryRule[];
  metadata?: { schemas: number[]; questionVersion: string; profile: string; policyDigest: string | null };
  omittedRules?: number;
}
