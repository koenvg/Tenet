import type { OverviewSelection, ThreadOverview } from '../src/inspector/bb-summary.js';
import type { SummaryDecision, SummaryRule } from '../src/inspector/summary-model.js';
import { syntheticOverview } from './overview.preview-fixture.js';
import { summarizeBlockingRules } from '../src/inspector/summary-explanation.js';
const id = (n: number) => n.toString(16).padStart(64, '0');
const base = syntheticOverview.selected!;
const rule = (n: number, choice = 'PASS', enforcement = 'BLOCK'): SummaryRule => ({
  id: `recorded-${n}`, text: n === 0 ? '<script>window.archiveExecuted=true</script> Ask before publication.' : `Recorded policy rule ${n}.`,
  line: n + 1, enforcement, builtin: n === 18, textStatus: 'recorded', omittedTextChars: 0,
  result: { outcome: { choice, probabilities: { [choice]: .78 } }, evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .96 } } },
  gateIds: choice === 'FAIL' ? ['rule-fail'] : [], contribution: choice === 'FAIL' ? enforcement === 'WARN' ? 'advisory-gates' : 'blocking-gates' : choice === 'APPROVAL_REQUIRED' ? 'approval-required' : 'pass',
  thresholds: { effectThreshold: .65, evidenceThreshold: .75 }, evidenceGate: 'applicable', profile: 'legacy',
});
const cases = ['pass', 'FAIL', 'WARN', 'integrity', 'approval', 'uncertainty', 'provider failure'];
export function rulesSyntheticRead(selection: OverviewSelection): ThreadOverview {
  const data = structuredClone(syntheticOverview);
  data.linkedCalls = cases.length; data.failures = 3;
  data.calls = cases.map((name, n) => ({ ...data.calls[0]!, id: id(n + 20), callId: `synthetic-${name}`, timestamp: 7000 - n * 1000,
    categories: n === 1 || n === 2 || n === 3 ? ['violation'] : n === 4 ? ['approval'] : n === 5 ? ['uncertainty'] : n === 6 ? ['unavailable'] : [],
    assessmentStatus: n === 6 ? 'unavailable' : 'completed', failure: n === 6 ? 'provider-error' : null,
    evaluatorState: { status: n === 6 ? 'unavailable' : 'completed', reason: n === 6 ? 'provider-error' : null }, execution: 'unknown', decision: n === 4 ? 'ASK' : n === 0 ? 'ALLOW' : 'BLOCK' }));
  const chosen = data.calls.find(c => c.id === selection.callId) ?? data.calls[0]!;
  const n = data.calls.indexOf(chosen), offset = selection.ruleCursor === `synthetic:${chosen.id}:16` ? 16 : 0;
  const rules = Array.from({ length: 19 }, (_, i) => rule(i, n === 1 || n === 2 || n === 3 && i === 18 ? 'FAIL' : n === 4 ? 'APPROVAL_REQUIRED' : 'PASS', n === 2 ? 'WARN' : 'BLOCK'));
  if (n === 5) rules.forEach(r => { r.gateIds = ['outcome-confidence-below-threshold']; r.thresholds.effectThreshold = .9; r.contribution = 'blocking-gates'; });
  if (n === 6) rules.forEach(r => { r.result = null; r.gateIds = null; r.contribution = 'unavailable'; });
  rules[1]!.text = 'Recorded long rule '.repeat(110).slice(0, 2038) + ' [omitted]'; rules[1]!.textStatus = 'truncated'; rules[1]!.omittedTextChars = 962;
  rules[2]!.text = 'Rule text unavailable'; rules[2]!.textStatus = 'missing';
  const selected: SummaryDecision = { ...base, identity: { toolName: 'bash', callId: chosen.callId, mode: 'observe' },
    metadata: { schemas: [3], questionVersion: 'recorded-v3', policyDigest: id(90), profile: 'legacy' },
    decision: n === 4 ? 'ASK' : n === 0 ? 'ALLOW' : 'BLOCK', reason: n === 6 ? 'provider-error' : 'recorded-decision',
    permission: 'released', execution: 'unknown', approval: n === 4 ? 'not requested (observe mode)' : 'not required',
    evaluatorState: chosen.evaluatorState, assessmentStatus: chosen.assessmentStatus, failure: chosen.failure,
    categories: chosen.categories, noRulesClassifiedViolated: n === 0 || n === 4 || n === 5,
    explanation: summarizeBlockingRules(rules),
    rules: rules.slice(offset, offset + 16), omittedRules: 19 - rules.slice(offset, offset + 16).length,
    rulePage: { snapshot: id(90 + n), offset, total: 19, next: offset ? null : `synthetic:${chosen.id}:16` } };
  data.selected = selected; data.selectedId = chosen.id;
  data.sessions[0]!.calls = cases.length; data.sessions[0]!.categoryCounts = { violation: 3, approval: 1, uncertainty: 1, unavailable: 1, pending: 0 };
  data.calls = data.calls.filter(c => !selection.category || c.categories.includes(selection.category));
  return data;
}
