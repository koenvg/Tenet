// Compiled in an isolated consumer against the built `tenet` package.
import type { AssessmentStatus, BeforeToolResult, Guard, GuardSession, OwnerEvent } from 'tenet';

type Decision = 'ALLOW' | 'ASK' | 'BLOCK';

export function readAssessment(assessment: AssessmentStatus): Decision | undefined {
  switch (assessment.status) {
    case 'completed': {
      const decision: Decision = assessment.wouldDecision;
      return decision;
    }
    case 'not-requested':
    case 'pending':
    case 'unavailable':
    case 'dropped':
    case 'cancelled': {
      const absent: undefined = assessment.wouldDecision;
      return absent;
    }
    default: {
      const exhaustive: never = assessment;
      return exhaustive;
    }
  }
}

const completed: AssessmentStatus = { status: 'completed', wouldDecision: 'ASK', diagnostics: [], ruleIds: [] };
const incomplete = ['not-requested', 'pending', 'unavailable', 'dropped', 'cancelled'] as const;
for (const status of incomplete) {
  const valid: AssessmentStatus = { status, diagnostics: [], ruleIds: [] };
  // @ts-expect-error only completed assessments have a would-decision
  const invalid: AssessmentStatus = { status, wouldDecision: 'ALLOW', diagnostics: [], ruleIds: [] };
  void [valid, invalid];
}
// @ts-expect-error completed assessments require a would-decision
const missingDecision: AssessmentStatus = { status: 'completed', diagnostics: [], ruleIds: [] };
// @ts-expect-error would-decisions are a closed union
const unknownDecision: AssessmentStatus = { status: 'completed', wouldDecision: 'APPROVED', diagnostics: [], ruleIds: [] };

// Assessment describes findings, not authorization. Both ASK outcomes are valid.
const deniedAsk: BeforeToolResult = { permission: 'blocked', reason: 'approval-denied', assessment: completed, execution: 'unknown' };
const approvedAsk: BeforeToolResult = { ...deniedAsk, permission: 'released', reason: 'approved' };
const unavailableObserve: BeforeToolResult = { permission: 'released', reason: 'provider-error',
  assessment: { status: 'unavailable', diagnostics: [], ruleIds: [] }, execution: 'unknown' };
void [missingDecision, unknownDecision, approvedAsk, unavailableObserve];

export async function useResult(session: GuardSession, event: OwnerEvent) {
  const result = await session.beforeTool({ callId: 'call', toolName: 'custom', input: {},
    current: () => ({ sessionId: 'session', contextId: 'main', callId: 'call', toolName: 'custom', input: {} }) });
  const permission: 'released' | 'blocked' = result.permission;
  const execution: 'unknown' = result.execution;
  const decision: Decision | undefined = result.assessment.wouldDecision;
  // @ts-expect-error snapshots cannot be reassigned
  result.permission = 'released';
  // @ts-expect-error shared veto details are immutable
  result.blockReason = 'changed';
  // @ts-expect-error decision cannot be changed after narrowing
  if (result.assessment.status === 'completed') result.assessment.wouldDecision = 'ALLOW';
  // @ts-expect-error reasons are immutable
  result.assessment.reason = 'changed';
  // @ts-expect-error diagnostic collections are immutable
  result.assessment.diagnostics.push();
  // @ts-expect-error rule IDs are immutable
  result.assessment.ruleIds.push('new');
  for (const diagnostic of result.assessment.diagnostics) {
    // @ts-expect-error diagnostic fields are immutable
    diagnostic.outcome = 'PASS';
    // @ts-expect-error nested diagnostic gate arrays are immutable
    diagnostic.gates.push('rule-fail');
  }
  if (event.type === 'assessment') {
    readAssessment(event.assessment);
    // @ts-expect-error event payload cannot be replaced
    event.assessment = completed;
  }
  void [permission, execution, decision];
  // @ts-expect-error assessments cannot be replaced
  result.assessment = completed;
  // @ts-expect-error assessment status cannot be changed
  result.assessment.status = 'pending';
}

export async function useStatus(guard: Guard, session: GuardSession, event: OwnerEvent) {
  const ready = await session.ready;
  const status = session.status();
  // @ts-expect-error readiness snapshots are immutable
  ready.state = 'ready';
  // @ts-expect-error status fields are immutable
  status.mode = 'enforce';
  // @ts-expect-error nested session identity is immutable
  status.identity.contextId = 'replacement';
  // @ts-expect-error nested policy metadata is immutable
  status.policy.digest = null;
  // @ts-expect-error coverage cannot be upgraded by mutation
  status.capabilities.trustedApproval = true;
  // @ts-expect-error capability limitations are immutable
  status.capabilities.limitations.push('new');
  const health = guard.status();
  // @ts-expect-error guard snapshot fields are immutable
  health.closed = true;
  // @ts-expect-error observation health is immutable
  health.observations.running = 0;
  // @ts-expect-error observation limits are immutable
  health.observations.limits.bytes = 0;
  // @ts-expect-error capture health is immutable
  health.capture.kind = 'external';
  if (event.type === 'activation') {
    // @ts-expect-error activation events are immutable
    event.activation = 'off';
  } else if (event.type !== 'capture') {
    // @ts-expect-error event identity is immutable
    event.identity.sessionId = 'other';
    // @ts-expect-error event correlation is immutable
    event.callId = 'other';
    if (event.type === 'permission') {
      // @ts-expect-error nested permission results are immutable
      event.result.execution = 'unknown';
    } else if (event.type === 'execution') {
      // @ts-expect-error execution event outcomes are immutable
      event.outcome = 'executed';
    }
  } else {
    if (event.capture.kind !== 'external') {
      // @ts-expect-error local capture event health is immutable
      event.capture.failed = 0;
    } else {
      // @ts-expect-error external capture health is immutable
      event.capture.health = 'unknown';
    }
    // @ts-expect-error capture event kind is immutable
    event.capture.kind = 'disabled';
  }
  // @ts-expect-error owner event discriminants are immutable
  event.type = 'activation';
}

export function readOwnerReport(event: OwnerEvent) {
  if ((event.type !== 'permission' && event.type !== 'assessment') || !event.report) return;
  const report = event.report;
  // @ts-expect-error owner report snapshots cannot be replaced
  event.report = undefined;
  // @ts-expect-error owner report fields are immutable
  report.reason = 'changed';
  // @ts-expect-error owner report rule IDs are immutable
  report.ruleIds.push('new');
  // @ts-expect-error owner report diagnostic collections are immutable
  report.diagnostics.push();
  // @ts-expect-error owner report approval rules are immutable
  report.approvalRules.push('new');
  for (const rule of report.rules) {
    // @ts-expect-error owner report rule snapshots are immutable
    rule.text = 'changed';
  }
  for (const diagnostic of report.diagnostics) {
    // @ts-expect-error owner report diagnostic gate arrays are immutable
    diagnostic.gates.push('rule-fail');
  }
}
