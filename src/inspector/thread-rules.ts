import { sessionKey } from '../recording/archive.js';
import { SCOPED_INPUT_VERSION, SCOPED_QUESTION_VERSION } from '../decision/assessment-shape.js';
import { foldInvocationRules, foldSessionRules, RULE_CHECK_LIMIT, type SessionRuleStage } from './session-rules.js';
import type { RuleCheck, SessionRule } from './session-rules-model.js';
import { summaryGates } from './bb-summary.js';
import { threadRuleReasons, type SafeThreadRule, type SafeThreadRuleCheck, type SafeThreadRules, type ThreadRuleQuery } from './thread-rules-model.js';

type Observation = { id: string; sessionId: string; stages: SessionRuleStage[]; previews: { id: string; preview: { value: string | null; shortened: boolean } }[] };
const compare = (a: { timestamp: number; id: string }, b: { timestamp: number; id: string }) => b.timestamp - a.timestamp || a.id.localeCompare(b.id);
function bounded(text: string): { text: string; shortened: boolean } {
  let value = '', bytes = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (bytes + size > 512) return { text: value, shortened: true };
    value += character; bytes += size;
  }
  return { text: value, shortened: false };
}
function safeRule(row: SessionRule, shortened: boolean): SafeThreadRule {
  const label = bounded(row.declarationId), excerpt = row.preview === null ? null : bounded(row.preview);
  return { id: row.id, policyId: row.policyIdentity === null ? null : sessionKey(row.policyIdentity), declarationRevision: row.declarationRevision,
    label: label.text, labelShortened: label.shortened, builtin: row.builtin, role: row.origin?.role ?? null,
    excerpt: row.wordingConflict ? null : excerpt?.text ?? null,
    excerptState: row.wordingConflict ? 'conflict' : !excerpt ? 'unavailable' : excerpt.shortened || shortened ? 'shortened' : 'excerpt',
    status: row.status, conflict: row.wordingConflict, checks: row.checks, unassessedObservations: row.unassessedObservations, timestamp: row.timestamp };
}
function safeCheck(check: RuleCheck, observation: Observation): SafeThreadRuleCheck {
  const gates = check.gates === null ? null : [...new Set(check.gates.map(gate => (summaryGates as readonly string[]).includes(gate)
    ? gate as typeof summaryGates[number] : 'unrecognized-gate' as const))];
  const outcomes = ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED', 'NOT_APPLICABLE'];
  return { id: check.id, sessionId: observation.sessionId, callId: observation.id, timestamp: check.timestamp, status: check.status,
    trusted: check.trusted, outcome: check.trusted && outcomes.includes(check.outcome ?? '') ? check.outcome as SafeThreadRuleCheck['outcome'] : null,
    gates, reason: !check.trusted ? 'assessment-unavailable-or-invalid' : gates === null ? 'gates-unavailable'
      : check.status === 'unclear' ? 'unresolved-recorded-check' : 'validated-recording',
    profile: check.profile === 'legacy' || check.profile === 'applicability-v1' ? check.profile : 'unrecognized',
    question: check.questionVersion === null ? null : check.questionVersion === SCOPED_QUESTION_VERSION ? 'current'
      : /^policy-rules-v[5-8]-/.test(check.questionVersion) ? 'historical' : 'unrecognized',
    input: check.inputVersion === null ? null : check.inputVersion === SCOPED_INPUT_VERSION ? 'current' : 'unrecognized' };
}
function page<T extends { timestamp: number; id: string }>(rows: T[], cursor: string | undefined, scope: string, revision: string) {
  rows.sort(compare);
  if (cursor) {
    if (cursor.length > 512) throw new Error('invalid-page');
    let key: any;
    try { key = JSON.parse(Buffer.from(cursor, 'base64url').toString()); } catch { throw new Error('invalid-page'); }
    if (!key || Object.keys(key).sort().join(',') !== 'id,revision,scope,timestamp' || key.scope !== sessionKey(scope)
      || !/^[a-f0-9]{64}$/.test(key.id) || !Number.isFinite(key.timestamp)) throw new Error('invalid-page');
    if (key.revision !== revision) throw new Error('stale-cursor');
    if (!rows.some(row => row.id === key.id && row.timestamp === key.timestamp)) throw new Error('invalid-page');
    rows = rows.filter(row => compare(row, key) > 0);
  }
  const items = rows.slice(0, 50), last = items.at(-1);
  return { items, next: last && rows.length > 50 ? Buffer.from(JSON.stringify({ id: last.id, timestamp: last.timestamp, scope: sessionKey(scope), revision })).toString('base64url') : null };
}

/** Exact-linked metadata only. Canonical folds finish before any display page is cut. */
export function projectThreadRules(observations: Observation[], query: Exclude<ThreadRuleQuery, { kind: 'calls' }>, context: {
  threadId: string; readScope: string; revision: string; indexing: boolean; archiveIssues: boolean; writerLoss: boolean;
}): SafeThreadRules {
  const { revision } = context;
  if (query.revision !== undefined && query.revision !== revision) throw new Error('stale-cursor');
  const gaps = [...(!observations.length ? ['no-linked-recordings'] : []), ...(context.archiveIssues ? ['archive-recording-issues'] : []), ...(context.writerLoss ? ['writer-loss'] : [])];
  const checks: SafeThreadRuleCheck[] = [];
  const shortened = new Map<string, boolean>();
  const latest = (observation: Observation) => observation.stages.reduce((time, stage) => Math.max(time, stage.timestamp), 0);
  let selectedCallBelongs = query.kind !== 'call';
  observations.sort((a, b) => compare({ id: a.id, timestamp: latest(a) }, { id: b.id, timestamp: latest(b) }));
  function* invocations() {
    for (const observation of observations) {
      const facts = foldInvocationRules(observation.id, observation.id, observation.stages);
      for (const { row } of facts.rules) if (!shortened.has(row.id)) shortened.set(row.id,
        observation.previews.some(preview => preview.id === row.declarationId && preview.preview.value === row.preview && preview.preview.shortened));
      if (query.kind !== 'inventory') {
        const rule = facts.rules.find(item => item.row.id === query.ruleId);
        if (query.kind === 'call' && rule && observation.sessionId === query.sessionId && observation.id === query.callId) selectedCallBelongs = true;
        if (rule?.check && checks.length < RULE_CHECK_LIMIT) checks.push(safeCheck(rule.check, observation));
      }
      yield facts;
    }
  }
  const folded = foldSessionRules(invocations(), context.indexing, gaps);
  const omittedChecks = folded.rows.reduce((sum, row) => sum + Math.max(0, row.checks - RULE_CHECK_LIMIT), 0);
  const reasons = [...new Set([...folded.ruleCoverage.reasons, ...(omittedChecks ? ['check-history-overflow'] : [])])]
    .filter((reason): reason is typeof threadRuleReasons[number] => (threadRuleReasons as readonly string[]).includes(reason));
  const summary = { status: folded.status, inventory: folded.inventory.state, retainedRules: folded.rows.length,
    unchecked: folded.rows.filter(row => row.status === 'unchecked').length, indexing: context.indexing, capture: 'best-effort' as const,
    incomplete: folded.ruleCoverage.incomplete || omittedChecks > 0, reasons, omittedRules: folded.ruleCoverage.omittedRules, omittedChecks,
    missingIntegrity: folded.ruleCoverage.diagnostics.length + folded.ruleCoverage.omittedDiagnostics };
  const scope = JSON.stringify([context.threadId, context.readScope, query.kind]);
  if (query.kind === 'inventory') return { kind: 'inventory', revision, summary, ...page(folded.rows.map(row => safeRule(row, shortened.get(row.id) ?? false)), query.inventoryCursor, scope, revision) };
  const row = folded.rows.find(row => row.id === query.ruleId);
  if (!row || !selectedCallBelongs) throw new Error('invalid-selection');
  return { kind: query.kind, revision, summary, rule: safeRule(row, shortened.get(row.id) ?? false), omittedChecks: Math.max(0, row.checks - checks.length),
    ...page(checks, query.kind === 'checks' ? query.checkCursor : undefined, `${scope}:${query.ruleId}`, revision) };
}
