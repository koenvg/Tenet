import { assessmentShapeIssue, HISTORICAL_QUESTION_VERSION, SCOPED_INPUT_VERSION, SCOPED_QUESTION_VERSION } from '../decision/assessment-shape.js';
import { recordedPolicyIdentity, recordedOrigin } from '../recording/policy-contract.js';
import { recordedInputs } from '../recording/scoped.js';
import { sessionKey } from '../recording/archive.js';
import type { ArchiveRecord } from '../recording/contract.js';
import { object, recordedAssessmentInvalid } from './view.js';
import { recordedRulePreviews } from './action-preview.js';
import type { RuleCheck, RuleStatus, SessionRule, SessionRuleSummary } from './session-rules-model.js';
import { evaluatorFailureCodes } from './finding-view.js';

const FACT_LIMIT = 64;
export const SESSION_RULE_LIMIT = 1024;
export const RULE_CHECK_LIMIT = 4096;
type Declaration = { revision: string; wordingDigest: string | null; id: string; builtin: boolean; preview: string | null; origin: SessionRule['origin'] };
type AssessmentRuleFacts = { id: string; outcome: string; evidence: string | null; applicabilitySupported: boolean | null };
type AssessmentFacts = {
  digest: string; membership: string; legacy: boolean; applicability: boolean; integrityCandidate: string | null;
  forbiddenIntegrity: string[]; forbiddenOverflow: boolean;
  rules: AssessmentRuleFacts[]; failures: AssessmentRuleFacts[];
};
type GateFacts = { membership: string; entries: { id: string; gates: string[] | null }[]; nonemptyOverflow: boolean };
export interface SessionRuleStage {
  stage: string; timestamp: number; sequence: number; writerId: string; eventId: string; digest: string;
  snapshot?: { identity: string | null; declarations: Declaration[]; membership: string; valid: boolean;
    declarationsDigest: string; integrityDigest: string | null; integrity: string | null; omitted: number };
  assessment?: AssessmentFacts;
  invalid: boolean; valid: boolean; attempted: boolean; reason: string | null;
  lifecycle: string | null; profile: string | null; questionVersion: string | null; inputVersion: string | null;
  gates?: GateFacts;
}
export interface InvocationRuleFacts {
  invocation: string; revision: string; status: RuleStatus; inventoryReasons: string[]; omitted: number;
  rules: { row: SessionRule; wordingDigest: string | null; check: RuleCheck | null }[];
}
const bounded = (value: unknown, limit = 256): string | null => typeof value === 'string' && value.length > 0 && value.length <= limit ? value : null;
const membership = (ids: string[]) => sessionKey(JSON.stringify([...ids].sort()));
const idsOf = (rules: any[]) => rules.map(rule => object(rule).ruleId);
const rank: Record<RuleStatus, number> = { unchecked: 0, clear: 1, unclear: 2, violation: 3 };
export const combineRuleStatus = (a: RuleStatus, b: RuleStatus): RuleStatus => rank[a] >= rank[b] ? a : b;

function declarationOrigin(record: ArchiveRecord, rule: Record<string, any>, policy: Record<string, any>): SessionRule['origin'] {
  const origin = recordedOrigin(record.schemaVersion, rule, policy);
  return { ...origin, source: bounded(origin.source, 8192), target: bounded(origin.target, 8192), digest: bounded(origin.digest) };
}
function assessmentFacts(value: unknown): AssessmentFacts {
  const assessment = object(value), rules = Array.isArray(assessment.rules) ? assessment.rules : [];
  const ids = idsOf(rules);
  const safeIds = ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 256);
  const legacyCandidate = rules.find(rule => ['PASS', 'FAIL', 'UNKNOWN'].includes(object(object(rule).outcome).choice));
  const applicabilityCandidate = rules.find(rule => Object.keys(object(object(rule).outcome).probabilities ?? {}).length === 4);
  const validate = (profile: string, candidate: any) => safeIds && candidate !== undefined
    && assessmentShapeIssue(value, ids.filter(id => id !== candidate.ruleId), candidate.ruleId, profile) === undefined;
  const forbidden = rules.filter(rule => !['PASS', 'FAIL', 'UNKNOWN'].includes(object(object(rule).outcome).choice)).map(rule => object(rule).ruleId);
  const facts: AssessmentRuleFacts[] = rules.map(rule => ({ id: bounded(object(rule).ruleId) ?? '',
    outcome: bounded(object(object(rule).outcome).choice) ?? '',
    evidence: bounded(object(object(rule).evidence).choice),
    applicabilitySupported: typeof object(rule).applicabilitySupported === 'boolean' ? rule.applicabilitySupported : null }));
  return { digest: sessionKey(JSON.stringify(value)), membership: safeIds ? membership(ids) : '', legacy: validate('legacy', legacyCandidate),
    applicability: validate('applicability-v1', applicabilityCandidate), integrityCandidate: bounded(applicabilityCandidate?.ruleId),
    forbiddenIntegrity: forbidden.filter(id => typeof id === 'string').slice(0, FACT_LIMIT), forbiddenOverflow: forbidden.length > FACT_LIMIT,
    rules: facts.slice(0, FACT_LIMIT), failures: facts.filter(rule => rule.outcome === 'FAIL').slice(0, FACT_LIMIT) };
}

function recordedGateFacts(contributions: unknown, diagnostics: unknown): GateFacts | undefined {
  const lists = [contributions, diagnostics].filter(value => value !== undefined);
  if (!Array.isArray(lists[0])) return undefined;
  const maps = lists.map(list => {
    const map = new Map<string, any[]>();
    for (const item of Array.isArray(list) ? list : []) {
      const id = bounded(object(item).ruleId) ?? '';
      const matches = map.get(id) ?? []; matches.push(item); map.set(id, matches);
    }
    return map;
  });
  const ids = [...new Set(maps.flatMap(map => [...map.keys()]))];
  const validLists = lists.every(Array.isArray);
  const entries = ids.map(id => {
    const matches = maps.map(map => map.get(id) ?? []);
    const valid = validLists && id !== '' && matches.every((items, index) => (index === 0 ? items.length === 1 : items.length <= 1)
      && items.every(item => Array.isArray(object(item).gates) && object(item).gates.length <= 16
        && object(item).gates.every((gate: unknown) => bounded(gate, 128) !== null)));
    const gates = valid ? [...new Set<string>(matches.flatMap(items => items.flatMap(item => object(item).gates)))] : null;
    return { id, gates: gates !== null && gates.length <= 16 ? gates : null };
  });
  const nonempty = entries.filter(entry => entry.gates === null || entry.gates.length > 0);
  return { membership: entries.every(entry => entry.gates !== null) ? membership(ids) : '',
    entries: [...nonempty, ...entries.filter(entry => entry.gates?.length === 0)].slice(0, FACT_LIMIT + 1),
    nonemptyOverflow: nonempty.length > FACT_LIMIT + 1 };
}

function recordedRuleStatus(rule: AssessmentRuleFacts, gates: string[] | null): RuleStatus {
  if (rule.outcome === 'UNKNOWN' || gates === null || gates.some(gate => gate !== 'rule-fail' || rule.outcome !== 'FAIL')
    || rule.evidence === 'INSUFFICIENT' || rule.applicabilitySupported === false) return 'unclear';
  return rule.outcome === 'FAIL' ? rule.evidence === 'SUFFICIENT' ? 'violation' : 'unclear' : 'clear';
}

export function sessionRuleStage(record: ArchiveRecord): SessionRuleStage {
  const { data, stage } = record;
  const inputs = stage === 'request' ? recordedInputs(data) : null;
  const fact: SessionRuleStage = { stage, timestamp: record.timestamp, sequence: record.sequence, writerId: record.writerId,
    eventId: record.eventId, digest: sessionKey(JSON.stringify(record)), invalid: recordedAssessmentInvalid(record) || stage === 'assessment' && data.assessment == null
      || [data.profile, object(data.config).assessmentProfile, data.questionVersion, data.inputVersion]
        .some(value => value !== undefined && bounded(value, 128) === null),
    valid: stage === 'validation' && data.valid === true, reason: bounded(data.reason), lifecycle: stage === 'assessment-status' ? bounded(data.status) : null,
    profile: bounded(data.profile ?? object(data.config).assessmentProfile ?? object(data.assessment).profile, 128),
    questionVersion: bounded(data.questionVersion, 128), inputVersion: bounded(data.inputVersion, 128),
    attempted: ['assessment', 'assessment-status'].includes(stage) || stage === 'validation' && data.request !== 'not-submitted' || data.request === 'submitted' || data.requestStatus === 'submitted'
      || stage === 'response' && (object(data.value).kind !== 'scope-submission' || ['attempted', 'completed', 'failed'].includes(object(data.value).status)) };
  if (stage === 'begin' || stage === 'request') {
    const policy = object(data.policy), integrity = object(stage === 'begin' ? data.integrity : inputs?.integrity);
    const rules: any[] = Array.isArray(policy.rules) ? policy.rules : [];
    const integrityId = bounded(integrity.id);
    const ids = rules.map(rule => object(rule).id);
    const valid = Array.isArray(policy.rules) && rules.length > 0 && rules.every(rule => !!bounded(object(rule).id)
      && typeof object(rule).text === 'string' && ['BLOCK', 'WARN'].includes(object(rule).enforcement))
      && new Set([...ids, integrityId]).size === ids.length + 1;
    const previews = recordedRulePreviews(data, stage) ?? [];
    const declarations: Declaration[] = rules.slice(0, FACT_LIMIT).flatMap(rule => bounded(object(rule).id) === null ? [] : [{
      id: rule.id, wordingDigest: typeof rule.text === 'string' && rule.text.length > 0 ? sessionKey(rule.text) : null, revision: sessionKey(JSON.stringify(rule)), builtin: false, origin: declarationOrigin(record, rule, policy), preview: previews.find(preview => preview.id === rule.id)?.preview.value ?? null }]);
    if (integrityId !== null) declarations.push({ id: integrityId, wordingDigest: typeof integrity.text === 'string' && integrity.text.length > 0 ? sessionKey(integrity.text) : null, revision: sessionKey(JSON.stringify([integrity.id, integrity.text])), builtin: true, origin: null, preview: previews.find(preview => preview.id === integrityId)?.preview.value ?? null });
    const knownIdentity = record.schemaVersion === 5 || bounded(policy.source, 8192) !== null && bounded(policy.digest) !== null
      && (policy.target == null || bounded(policy.target, 8192) !== null);
    fact.snapshot = { identity: knownIdentity ? bounded(recordedPolicyIdentity(record.schemaVersion, policy), 8192) : null, declarations,
      membership: valid && integrityId !== null ? membership([...ids, integrityId]) : '', valid,
      declarationsDigest: sessionKey(JSON.stringify(policy.rules ?? null)),
      integrityDigest: integrityId === null ? null : sessionKey(JSON.stringify([integrity.id, integrity.text])),
      integrity: integrityId, omitted: Math.max(0, rules.length - FACT_LIMIT) };
  }
  if ((stage === 'assessment' || stage === 'validation') && data.assessment != null) fact.assessment = assessmentFacts(data.assessment);
  if (stage === 'decision') fact.gates = recordedGateFacts(data.contributions, data.diagnostics);
  return fact;
}

export function foldInvocationRules(invocation: string, callId: string, stages: SessionRuleStage[]): InvocationRuleFacts {
  stages.sort((a, b) => a.writerId === b.writerId ? a.sequence - b.sequence : a.timestamp - b.timestamp || a.eventId.localeCompare(b.eventId));
  const last = (stage: string) => stages.findLast(value => value.stage === stage);
  const begin = last('begin'), request = last('request');
  const snapshot = request?.snapshot ?? begin?.snapshot;
  const assessment = last('assessment')?.assessment ?? last('validation')?.assessment;
  const profile = [...stages].reverse().find(stage => stage.profile !== null)?.profile ?? 'legacy';
  const questionVersion = request?.questionVersion ?? begin?.questionVersion ?? null;
  const inputVersion = request?.inputVersion ?? begin?.inputVersion ?? null;
  const lifecycle = last('assessment-status');
  const attempted = stages.some(stage => stage.attempted);
  const revision = sessionKey(JSON.stringify(stages.map(stage => stage.digest)));
  const reasons: string[] = [];
  if (!snapshot?.valid) reasons.push('rule-inventory-unavailable');
  if (!snapshot?.identity) reasons.push('policy-identity-unavailable');
  if (!snapshot?.integrity) reasons.push('missing-recorded-integrity');
  if (snapshot?.omitted) reasons.push('rule-facts-overflow');
  const snapshotConflict = stages.some(stage => stage.snapshot && (stage.snapshot.identity !== snapshot?.identity
    || stage.snapshot.declarationsDigest !== snapshot.declarationsDigest || stage.snapshot.integrityDigest !== null && snapshot.integrityDigest !== null
      && stage.snapshot.integrityDigest !== snapshot.integrityDigest));
  if (snapshotConflict) reasons.push('conflicting-recorded-inventory');
  const supportedIdentity = inputVersion === null && (profile === 'legacy'
    ? questionVersion === null || questionVersion === 'policy-rules-v5-resolved-action'
    : profile === 'applicability-v1' && ['policy-rules-v6-applicability', 'policy-rules-v7-evidence-selection',
      'policy-rules-v7-ordinary-evidence', HISTORICAL_QUESTION_VERSION].includes(questionVersion ?? ''))
    || profile === 'applicability-v1' && questionVersion === SCOPED_QUESTION_VERSION && inputVersion === SCOPED_INPUT_VERSION;
  const consistent = stages.every(stage => (!stage.assessment || stage.assessment.digest === assessment?.digest)
    && (stage.profile === null || stage.profile === profile)
    && (stage.questionVersion === null || stage.questionVersion === questionVersion)
    && (stage.inputVersion === null || stage.inputVersion === inputVersion)
    && !snapshotConflict
    && (stage.lifecycle === null || stage.lifecycle === 'pending' || stage.lifecycle === 'completed'));
  const shapeValid = profile === 'legacy' ? assessment?.legacy && !assessment.forbiddenOverflow
    && !assessment.forbiddenIntegrity.includes(snapshot?.integrity ?? '')
    : profile === 'applicability-v1' && assessment?.applicability && assessment.integrityCandidate === snapshot?.integrity;
  const trusted = !!(snapshot?.valid && snapshot.integrity && supportedIdentity && consistent && shapeValid
    && assessment?.membership === snapshot.membership && last('validation')?.valid
    && !stages.some(stage => stage.invalid || stage.reason !== null && (evaluatorFailureCodes as readonly string[]).includes(stage.reason) && ['assessment', 'validation'].includes(stage.stage))
    && (!lifecycle || lifecycle.lifecycle === 'completed'));
  const reason = !attempted ? 'No recorded check attempt.' : trusted ? 'Validated recorded assessment.'
    : lifecycle?.reason ?? stages.findLast(stage => stage.reason !== null)?.reason
      ?? (lifecycle?.lifecycle && lifecycle.lifecycle !== 'completed' ? `Recorded assessment ${lifecycle.lifecycle}.`
        : 'Recorded assessment unavailable or invalid.');
  const gates = last('decision')?.gates;
  const gatesFor = (id: string): string[] | null => {
    const entry = gates?.entries.find(rule => rule.id === id);
    if (entry) return entry.gates;
    return gates && gates.membership !== '' && gates.membership === assessment?.membership && !gates.nonemptyOverflow ? [] : null;
  };
  const rules = (snapshot?.declarations ?? []).map(declaration => {
    const id = sessionKey(JSON.stringify([snapshot?.identity ?? `invocation:${invocation}`, declaration.id]));
    const selected = assessment?.rules.find(rule => rule.id === declaration.id)
      ?? assessment?.failures.find(rule => rule.id === declaration.id);
    const gateIds = gatesFor(declaration.id);
    const status: RuleStatus = !attempted ? 'unchecked' : !trusted || !selected ? 'unclear' : recordedRuleStatus(selected, gateIds);
    const row: SessionRule = { id, declarationId: declaration.id, policyIdentity: snapshot?.identity ?? null,
      builtin: declaration.builtin, origin: declaration.origin, preview: declaration.preview, status, checks: attempted ? 1 : 0,
      declarationRevision: declaration.revision, wordingConflict: snapshotConflict,
      unassessedObservations: attempted ? 0 : 1, timestamp: stages.at(-1)?.timestamp ?? 0,
      representative: { invocation, revision } };
    const checkReason = !trusted || !selected ? reason : `Validated recorded ${selected.outcome}. ${gateIds === null
      ? 'Uncertainty gates were not recorded.' : gateIds.length ? `Recorded gates: ${gateIds.join(', ')}.`
        : selected.evidence === 'INSUFFICIENT' ? 'Recorded evidence was insufficient.'
          : selected.applicabilitySupported === false ? 'Recorded applicability was unresolved.' : 'Recorded uncertainty gates are empty.'}`;
    const check: RuleCheck | null = !attempted ? null : { id: sessionKey(JSON.stringify([id, invocation])), invocation,
      callId: bounded(callId), callIdOmitted: bounded(callId) === null,
      timestamp: row.timestamp, status, outcome: trusted ? selected?.outcome ?? null : null, gates: gateIds, trusted, reason: checkReason,
      profile, questionVersion, inputVersion };
    return { row, check, wordingDigest: declaration.wordingDigest };
  });
  let status: RuleStatus = attempted ? trusted ? 'unchecked' : 'unclear' : 'unchecked';
  for (const rule of rules) status = combineRuleStatus(status, rule.row.status);
  if (trusted) for (const failure of assessment?.failures ?? []) status = combineRuleStatus(status, recordedRuleStatus(failure, gatesFor(failure.id)));
  if (attempted && reasons.length && status !== 'violation') status = 'unclear';
  return { invocation, revision, status, inventoryReasons: reasons, omitted: snapshot?.omitted ?? 0, rules };
}

export function foldSessionRules(invocations: Iterable<InvocationRuleFacts>, indexing: boolean, gaps: string[]) {
  const rows = new Map<string, SessionRule>(), reasons = new Set(gaps);
  if (indexing) reasons.add('indexing-in-progress');
  const diagnostics: SessionRuleSummary['ruleCoverage']['diagnostics'] = [];
  let omittedDiagnostics = 0;
  let status: RuleStatus = 'unchecked', omittedRules = 0;
  for (const invocation of invocations) {
    status = combineRuleStatus(status, invocation.status);
    invocation.inventoryReasons.forEach(reason => reasons.add(reason));
    if (invocation.inventoryReasons.includes('missing-recorded-integrity')) {
      if (diagnostics.length < FACT_LIMIT) diagnostics.push({ id: sessionKey(`missing-integrity:${invocation.invocation}`),
        kind: 'missing-recorded-integrity', invocation: invocation.invocation });
      else omittedDiagnostics++;
    }
    omittedRules += invocation.omitted;
    for (const { row } of invocation.rules) {
      const previous = rows.get(row.id);
      if (previous) {
        previous.status = combineRuleStatus(previous.status, row.status);
        if (row.wordingConflict || previous.declarationRevision !== row.declarationRevision) {
          previous.wordingConflict = true; reasons.add('recorded-declaration-conflict');
          previous.status = combineRuleStatus(previous.status, 'unclear');
        }
        previous.checks += row.checks; previous.unassessedObservations += row.unassessedObservations;
        if (row.timestamp > previous.timestamp) { previous.timestamp = row.timestamp; previous.representative = row.representative; }
      } else if (rows.size < SESSION_RULE_LIMIT) rows.set(row.id, { ...row });
      else { omittedRules++; reasons.add('rule-aggregation-overflow'); }
    }
  }
  if (reasons.size && status === 'clear') status = 'unclear';
  const summary: SessionRuleSummary = { status,
    inventory: reasons.size ? { state: 'unknown', reasons: [...reasons].sort() }
      : { state: 'known', rules: rows.size, unchecked: [...rows.values()].filter(row => row.status === 'unchecked').length },
    ruleCoverage: { capture: 'best-effort', indexing, incomplete: reasons.size > 0, reasons: [...reasons].sort(), omittedRules, omittedChecks: 0, diagnostics, omittedDiagnostics } };
  return { ...summary, rows: [...rows.values()] };
}
