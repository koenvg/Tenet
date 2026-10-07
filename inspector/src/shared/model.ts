import type { FindingCategory } from '../../../src/decision/finding-triage.js';
import type { SummaryCall, SummaryDecision } from '../../../src/inspector/summary-model.js';
export type { SummaryCall, SummaryDecision, SummaryRule, SummaryScore, SummaryEvaluatorState } from '../../../src/inspector/summary-model.js';

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
}
export interface SummaryWorkspaceInput { model: SummaryWorkspaceModel; actions: SummaryWorkspaceActions }
