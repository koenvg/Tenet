import type { ThreadOverview } from '../src/inspector/bb-summary.js';
import type { OverviewSelection } from '../src/inspector/bb-summary.js';
import type { SafeThreadRule, SafeThreadRules } from '../src/inspector/thread-rules-model.js';
import { previewSummaries } from '../inspector/src/shared/preview-fixture.js';
import { summarizeBlockingRules } from '../src/inspector/summary-explanation.js';
import { reportedViolations } from '../src/inspector/summary-display.js';
const id = (n: number) => n.toString(16).padStart(64, '0');
const pass = { ...previewSummaries['synthetic-pass']!, metadata: { schemas: [4], questionVersion: 'synthetic-v1',
  profile: 'synthetic-recorded-profile', policyDigest: id(10) }, omittedRules: 0, explanation: summarizeBlockingRules(previewSummaries['synthetic-pass']!.rules), evaluatorState: { status: 'completed' as const, reason: null } };
const failed = { ...pass, identity: { toolName: 'bash', callId: 'synthetic-provider-error-1', mode: 'observe' },
  reportedViolations: { assessment: 'unavailable' as const, uncertain: true, items: [], total: 0, missingRuleSnapshots: 0 },
  judge: { ...pass.judge, returnedModel: null },
  decision: 'BLOCK', reason: 'provider-error', assessmentStatus: 'unavailable', failure: 'provider-error',
  evaluatorState: { status: 'unavailable' as const, reason: 'provider-error' }, categories: ['unavailable' as const],
  noRulesClassifiedViolated: false, explanation: summarizeBlockingRules([]), rules: pass.rules.map(rule => ({ ...rule, result: null, gateIds: null })) };
export const syntheticThreadRules: SafeThreadRule[] = [
  ['publication', 'Ask before publishing changes.', 'violation'],
  ['tests', 'Run the focused offline tests.', 'clear'],
  ['scope', 'Keep changes within the assigned scope.', 'unclear'],
  ['retention', 'Retain the owner’s recorded files.', 'unchecked'],
  ['integrity', 'Protect the recorded policy.', 'clear'],
].map(([label, excerpt, status], n) => ({ id: id(100 + n), policyId: id(99), declarationRevision: id(200 + n),
  label: label!, labelShortened: false, builtin: n === 4, role: n === 4 ? null : 'project', excerpt: excerpt!, excerptState: 'excerpt',
  status: status as SafeThreadRule['status'], conflict: false, checks: n === 3 ? 0 : 1, unassessedObservations: n === 3 ? 1 : 0, timestamp: 5000 - n }));
const threadRuleSummary: SafeThreadRules['summary'] = { status: 'violation', inventory: 'known', retainedRules: 5, unchecked: 1,
  indexing: false, capture: 'best-effort', incomplete: false, reasons: [], omittedRules: 0, omittedChecks: 0, missingIntegrity: 0 };
export function projectSyntheticThread(data: ThreadOverview, selection: OverviewSelection): ThreadOverview {
  const query = selection.query ?? (Object.keys(selection).some(key => key !== 'threadId') ? { kind: 'calls' as const } : { kind: 'inventory' as const });
  data.readScope = id(900); data.revision = id(901);
  if (query.kind === 'checks' || query.kind === 'call') {
    const rule = syntheticThreadRules.find(rule => rule.id === query.ruleId);
    if (!rule) throw new Error('invalid-selection');
    data.threadRules = { kind: query.kind, revision: data.revision, summary: threadRuleSummary, rule, next: null, omittedChecks: 0,
      items: rule.checks ? [{ id: id(700), sessionId: data.sessionId!, callId: data.calls[0]!.id, timestamp: 5000, status: rule.status,
        trusted: rule.status !== 'unclear', outcome: rule.status === 'violation' ? 'FAIL' : rule.status === 'clear' ? 'PASS' : null,
        gates: rule.status === 'unclear' ? null : [], reason: rule.status === 'unclear' ? 'assessment-unavailable-or-invalid' : 'validated-recording',
        profile: 'legacy', question: 'historical', input: null }] : [] };
    if (query.kind === 'call' && data.selected) {
      const choice = rule.status === 'violation' ? 'FAIL' : rule.status === 'unclear' ? 'UNKNOWN' : 'PASS';
      data.selected.evaluatorState = { status: 'completed', reason: null }; data.selected.failure = null; data.selected.assessmentStatus = 'completed';
      data.selected.rules = data.selected.rules.map((item, index) => ({ ...item,
        result: { outcome: { choice: index === 0 ? choice : 'PASS', probabilities: { [index === 0 ? choice : 'PASS']: 1 } }, evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1 } } },
        gateIds: index === 0 && choice === 'FAIL' ? ['rule-fail'] : index === 0 && choice === 'UNKNOWN' ? ['outcome-unknown'] : [] }));
      data.selected.reportedViolations = reportedViolations(data.selected.rules, true, choice === 'UNKNOWN');
      data.selected.noRulesClassifiedViolated = choice !== 'FAIL';
      data.selected.explanation = summarizeBlockingRules(data.selected.rules);
    }
  } else data.threadRules = { kind: 'inventory', revision: data.revision, summary: threadRuleSummary, items: structuredClone(syntheticThreadRules), next: null };
  if (query.kind === 'inventory' || query.kind === 'checks') {
    data.selected = null; data.selectedId = null; data.calls = []; data.sessions = []; data.sessionId = null;
  }
  return data;
}
export const syntheticOverview: ThreadOverview = {
  readScope: id(900), revision: id(901), threadRules: { kind: 'inventory', revision: id(901), summary: threadRuleSummary, items: syntheticThreadRules, next: null },
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
export function syntheticRead(selection: OverviewSelection): ThreadOverview {
  const data = structuredClone(syntheticOverview);
  data.selectedId = (selection.query?.kind === 'call' ? selection.query.callId : selection.callId) ?? data.selectedId;
  const call = data.calls.find(row => row.id === data.selectedId)!;
  data.selected = call.id === id(2) ? structuredClone(pass) : { ...structuredClone(failed), identity: { ...failed.identity, callId: call.callId } };
  data.calls = data.calls.filter(row => !selection.category || row.categories.includes(selection.category as any));
  return projectSyntheticThread(data, selection);
}
export function syntheticEmptyOverview(): ThreadOverview {
  const data = syntheticRead({});
  data.coverage = 'unknown'; data.issues = []; data.linkedCalls = data.failures = 0;
  data.threadRules = { kind: 'inventory', revision: data.revision!, next: null, items: [], summary: {
    status: 'unchecked', inventory: 'unknown', retainedRules: 0, unchecked: 0, indexing: false, capture: 'best-effort', incomplete: true,
    reasons: ['no-linked-recordings'], omittedRules: 0, omittedChecks: 0, missingIntegrity: 0 } };
  return data;
}
