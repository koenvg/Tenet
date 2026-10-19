import type { RuleStatus } from './session-rules-model.js';
import type { summaryGates } from './bb-summary.js';

export type ThreadRuleQuery =
  | { kind: 'calls' }
  | { kind: 'inventory'; inventoryCursor?: string; revision?: string }
  | { kind: 'checks'; ruleId: string; checkCursor?: string; revision?: string }
  | { kind: 'call'; ruleId: string; sessionId: string; callId: string; ruleCursor?: string; revision?: string };
export const threadRuleReasons = ['no-linked-recordings', 'indexing-in-progress', 'archive-recording-issues', 'writer-loss',
  'rule-inventory-unavailable', 'policy-identity-unavailable', 'missing-recorded-integrity', 'rule-facts-overflow',
  'conflicting-recorded-inventory', 'recorded-declaration-conflict', 'rule-aggregation-overflow', 'check-history-overflow'] as const;
export interface SafeThreadRuleSummary {
  status: RuleStatus; inventory: 'known' | 'unknown'; retainedRules: number; unchecked: number;
  indexing: boolean; capture: 'best-effort'; incomplete: boolean;
  reasons: (typeof threadRuleReasons[number])[]; omittedRules: number; omittedChecks: number; missingIntegrity: number;
}
export interface SafeThreadRule {
  id: string; policyId: string | null; declarationRevision: string;
  label: string; labelShortened: boolean; builtin: boolean; role: 'global' | 'project' | null;
  excerpt: string | null; excerptState: 'excerpt' | 'shortened' | 'unavailable' | 'conflict';
  status: RuleStatus; conflict: boolean; checks: number; unassessedObservations: number; timestamp: number;
}
export interface SafeThreadRuleCheck {
  id: string; sessionId: string; callId: string; timestamp: number; status: RuleStatus;
  trusted: boolean; outcome: 'PASS' | 'FAIL' | 'UNKNOWN' | 'APPROVAL_REQUIRED' | 'NOT_APPLICABLE' | null;
  gates: (typeof summaryGates[number] | 'unrecognized-gate')[] | null;
  reason: 'validated-recording' | 'assessment-unavailable-or-invalid' | 'gates-unavailable' | 'unresolved-recorded-check';
  profile: 'legacy' | 'applicability-v1' | 'unrecognized';
  question: 'historical' | 'current' | 'unrecognized' | null;
  input: 'current' | 'unrecognized' | null;
}
type Envelope = { revision: string; summary: SafeThreadRuleSummary };
export type SafeThreadRules = Envelope & (
  | { kind: 'inventory'; items: SafeThreadRule[]; next: string | null }
  | { kind: 'checks' | 'call'; rule: SafeThreadRule; items: SafeThreadRuleCheck[]; next: string | null; omittedChecks: number }
);
