import type { FindingCategory } from '../../../src/decision/finding-triage.js';
import type { SummaryCall, SummaryDecision } from '../../../src/inspector/summary-model.js';
export type { SummaryJudge, SummaryCall, SummaryDecision, SummaryRule, SummaryScore, SummaryEvaluatorState, SummaryExplanation } from '../../../src/inspector/summary-model.js';

import type { SafeThreadRules } from '../../../src/inspector/thread-rules-model.js';
export interface SummaryWorkspaceModel {
  calls: SummaryCall[]; selected: SummaryDecision | null; selectedId?: string;
  category: FindingCategory | ''; coverage: string; loading: boolean; error: string;
  moreCalls?: boolean; moreRules?: boolean;
  unavailable?: boolean;
  sessions?: { id: string; started: number; calls: number; categoryCounts: Record<FindingCategory, number> }[];
  sessionId?: string; moreSessions?: boolean; archiveWarnings?: string[];
}
export interface SummaryWorkspaceActions {
  selectCall(id: string): void; filterCategory(category: FindingCategory | ''): void;
  refresh(): void; loadMoreCalls?(): void; loadMoreRules?(): void; restartRules?(): void;
  selectSession?(id: string): void; loadMoreSessions?(): void;
  backToRules?(): void;
}
export interface CallsWorkspaceInput { variant: 'calls'; model: SummaryWorkspaceModel; actions: SummaryWorkspaceActions }
export interface ThreadRuleWorkspaceInput {
  variant: 'thread-rules';
  model: SummaryWorkspaceModel & { rules: SafeThreadRules | null };
  actions: SummaryWorkspaceActions & { selectRule(id: string): void; selectCheck(sessionId: string, callId: string): void;
    back(): void; browseCalls(): void; loadMore(): void };
}
export type SummaryWorkspaceInput = CallsWorkspaceInput | ThreadRuleWorkspaceInput;
