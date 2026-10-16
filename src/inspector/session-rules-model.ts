import type { RecordedOrigin } from '../recording/policy-contract.js';
export type RuleStatus = 'clear' | 'violation' | 'unclear' | 'unchecked';
export const ruleStatusPresentation = {
  clear: { label: 'No violations found' },
  violation: { label: 'Violation found' },
  unclear: { label: 'Unclear' },
  unchecked: { label: 'Not checked' },
} as const satisfies Record<RuleStatus, { label: string }>;

export type RuleInventory = { state: 'known'; rules: number; unchecked: number }
  | { state: 'unknown'; reasons: string[] };
export interface RuleCoverage {
  capture: 'best-effort'; indexing: boolean; incomplete: boolean;
  reasons: string[]; omittedRules: number; omittedChecks: number;
  diagnostics: { id: string; kind: 'missing-recorded-integrity'; invocation: string }[]; omittedDiagnostics: number;
}
export interface SessionRuleSummary {
  status: RuleStatus; inventory: RuleInventory; ruleCoverage: RuleCoverage;
}
export interface SessionRule {
  id: string; declarationId: string; policyIdentity: string | null; builtin: boolean;
  origin: RecordedOrigin | null;
  declarationRevision: string; wordingConflict: boolean;
  preview: string | null; status: RuleStatus; checks: number; unassessedObservations: number;
  timestamp: number; representative: { invocation: string; revision: string };
}
export interface RuleCheck {
  id: string; invocation: string; callId: string | null; callIdOmitted: boolean; timestamp: number; status: RuleStatus;
  outcome: string | null; gates: string[] | null; trusted: boolean; reason: string;
  profile: string; questionVersion: string | null; inputVersion: string | null;
}
export interface SessionRulesPage extends SessionRuleSummary {
  session: string; revision: string; items: SessionRule[]; next: string | null;
}
export interface RuleChecksPage extends SessionRuleSummary {
  session: string; rule: string; revision: string; items: RuleCheck[]; next: string | null;
}
export type SelectedSessionRule = SessionRuleSummary & {
  session: string; revision: string; rule: SessionRule;
  wording: { state: 'available'; text: string } | { state: 'unavailable'; reason: string };
};
