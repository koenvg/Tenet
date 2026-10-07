import type { ThreadOverview } from '../src/inspector/bb-summary.js';
import { previewSummaries } from '../inspector/src/shared/preview-fixture.js';
import { summarizeBlockingRules } from '../src/inspector/summary-explanation.js';
const id = (n: number) => n.toString(16).padStart(64, '0');
const pass = { ...previewSummaries['synthetic-pass']!, metadata: { schemas: [4], questionVersion: 'synthetic-v1',
  profile: 'synthetic-recorded-profile', policyDigest: id(10) }, omittedRules: 0, explanation: summarizeBlockingRules(previewSummaries['synthetic-pass']!.rules), evaluatorState: { status: 'completed' as const, reason: null } };
const failed = { ...pass, identity: { toolName: 'bash', callId: 'synthetic-provider-error-1', mode: 'observe' },
  decision: 'BLOCK', reason: 'provider-error', assessmentStatus: 'unavailable', failure: 'provider-error',
  evaluatorState: { status: 'unavailable' as const, reason: 'provider-error' }, categories: ['unavailable' as const],
  noRulesClassifiedViolated: false, explanation: summarizeBlockingRules([]), rules: pass.rules.map(rule => ({ ...rule, result: null, gateIds: null })) };
export const syntheticOverview: ThreadOverview = {
  state: 'available', coverage: 'partial', linkedCalls: 3, failures: 0, issues: ['corrupt-record'],
  sessions: [{ id: id(1), timestamp: 2000, started: 1000, calls: 3,
    categoryCounts: { violation: 0, uncertainty: 0, approval: 0, unavailable: 2, pending: 0 } }],
  nextSession: null, sessionId: id(1), nextCall: null, selectedId: id(3), selected: failed,
  calls: [pass, failed, { ...failed, identity: { ...failed.identity, callId: 'synthetic-provider-error-2' } }].map((view, n) => ({
    id: id(n + 2), callId: view.identity!.callId, toolName: view.identity!.toolName, timestamp: 1000 + n * 500,
    mode: 'observe', decision: view.decision, permission: view.permission, execution: view.execution,
    categories: view.categories, missing: view.missing, assessmentStatus: view.evaluatorState.status,
    failure: view.failure, evaluatorState: view.evaluatorState,
  })),
};
export function syntheticRead(selection: { callId?: string; category?: string }): ThreadOverview {
  const data = structuredClone(syntheticOverview);
  data.selectedId = selection.callId ?? data.selectedId;
  const call = data.calls.find(row => row.id === data.selectedId)!;
  data.selected = call.id === id(2) ? structuredClone(pass) : { ...structuredClone(failed), identity: { ...failed.identity, callId: call.callId } };
  data.calls = data.calls.filter(row => !selection.category || row.categories.includes(selection.category as any));
  return data;
}
