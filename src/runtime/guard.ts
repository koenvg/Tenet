import { randomUUID } from 'node:crypto';
import { selectPolicies } from './policy-selection.js';
import type { Action, Decision, Judge, Policy } from '../decision/contracts.js';
import { InvocationAuthorizations } from './invocation-authorization.js';
import { decide } from '../decision/decide.js';
import { captureAction } from '../decision/evidence.js';
import { loadPolicy, INTEGRITY_ID, INTEGRITY_TEXT } from '../decision/policy.js';
import { Observations } from '../decision/trajectory.js';
import { ruleContributions } from '../recording/rules.js';
import { capture, STAGES, type RecordingSink, type Stage } from '../recording/contract.js';
import { Consequences, type Permission } from './consequences.js';
import { readConfig, readMode, type GuardConfig, type Mode } from './config.js';
import type { Activation } from './activation.js';
import { ObservationQueue, type ObservationLimits, type ObservationState } from './observation-queue.js';
import { freeze } from '../decision/evidence.js';
import { evidenceWithinBudget } from '../decision/evidence-budget.js';
import { ActionResolution, type ActionResolver, type ResolvedInvocation } from './resolved-action.js';
import { ASSESSMENT_METADATA } from '../decision/assessment-contract.js';
import { UNAVAILABLE_EVIDENCE_CONTEXT } from '../decision/evidence-context.js';
import type { JudgeStatus } from './judge.js';
import type { PreparedConfiguration } from './configuration.js';

export interface RuntimeIdentity { host: string; sessionId: string; contextId: string }
export interface Capabilities {
  host: string;
  version: string | null;
  profile: string | null;
  interception: boolean;
  resultCorrelation: boolean;
  lifecycleInvalidation: boolean;
  argumentStability: boolean;
  trustedApproval: boolean;
  actionResolution?: 'host-supplied' | 'unsupported';
  limitations: readonly string[];
}
/** Internal, invocation-bound handoff. Public adapters never reconstruct these checks. */
export interface AuthorizationHandoff {
  revalidate(): Promise<boolean>;
  current(): boolean;
  commit(release: boolean): Permission;
}
export interface Call extends RuntimeIdentity {
  cwd: string; callId: string; toolName: string; input: unknown;
  description?: string; parameters?: unknown; metadata?: () => { description?: string; parameters?: unknown }; signal?: AbortSignal;
  /** Read original host values again immediately before permission is released. */
  current: () => Pick<Call, 'host' | 'sessionId' | 'contextId' | 'callId' | 'toolName' | 'input'>;
  onPermission?: (identity: InvocationIdentity, permission: Permission) => void;
  onPolicyStale?: () => void;
  onDecision?: (result: Decision) => void;
  onAssessment?: RuntimeOptions['onAssessment'];
  onAuthorization?: (handoff: AuthorizationHandoff) => void;
  approve?: (request: ApprovalRequest) => Promise<Approval>;
}
export type Approval = 'approved' | 'denied-or-dismissed' | 'unavailable' | 'cancelled' | 'timeout' | 'invalidated' | 'ui-error';
export interface ApprovalRequest {
  policy: Extract<Policy, { available: true }>;
  action: Action; ruleIds: readonly string[]; timeoutMs: number; signal: AbortSignal;
  valid: () => Promise<boolean>;
}
export interface InvocationIdentity extends Pick<Action, 'sessionId' | 'callId' | 'toolName' | 'argumentDigest'> {
  invocationId: string; combinedPolicyDigest: string | null;
  profile: string; questionVersion: string;
}
export interface RuntimeOptions {
  env: Record<string, string | undefined>;
  judge: Judge;
  judgeStatus?: JudgeStatus;
  configuration?: PreparedConfiguration;
  actionResolver?: ActionResolver;
  activation: { read(): Activation; refresh(): Activation };
  bindRecording?: (identity: InvocationIdentity & RuntimeIdentity & { cwd: string; mode: Mode }) => RecordingSink;
  emit?: (stage: string, data: Record<string, unknown>, archiveData?: Record<string, unknown>) => void;
  observationLimits?: Partial<ObservationLimits>;
  onAssessment?: (identity: InvocationIdentity, status: ObservationState, result?: ReturnType<Consequences['permission']>, reason?: string) => void;
}
export interface Readiness { profile: string; questionVersion: string; eligible: boolean; policy: Policy; config?: GuardConfig; unavailable?: string; ruleCount: number }
const sessionKey = (identity: RuntimeIdentity) => JSON.stringify([identity.host, identity.sessionId]);
const scope = (identity: RuntimeIdentity) => JSON.stringify([identity.host, identity.sessionId, identity.contextId]);
const key = (identity: RuntimeIdentity, callId: string) => JSON.stringify([scope(identity), callId]);

const resultKey = (identity: RuntimeIdentity, callId: string, correlated: boolean) =>
  identity.host === 'pi' && !correlated ? JSON.stringify([identity.host, callId]) : key(identity, callId);
/** Policy and invocation state for one host/native session. */
class SessionGuard {
  readonly mode: Mode;
  private readonly metadata = ASSESSMENT_METADATA;
  private get profile() { return this.metadata.profile; }
  readonly modeWarning?: string;
  readonly capabilities: Capabilities;
  private eligible = true; // Unknown before start is never a bypass.
  private policy: Policy = { available: false, contractVersion: 'policy-sources-v1', candidates: [], reason: 'policy-unavailable' };
  private config?: GuardConfig;
  private unavailable?: string = 'not-started';
  private session?: RuntimeIdentity;
  private loadToken = 0;
  private readonly authorizations: InvocationAuthorizations;
  private observations = new Map<string, Observations>();
  private seen = new Set<string>();
  private released = new Map<string, InvocationIdentity & RuntimeIdentity>();
  private resultCallIds: Set<string>;
  private resultTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private ambiguousResults: Set<string>;
  private disabled = new Set<string>();
  private recordings = new Map<string, { sink: RecordingSink; assessmentDone: boolean; executionDone: boolean }>();
  private permissionReports = new Set<() => void>();

  constructor(private options: RuntimeOptions, capabilities: Capabilities, shared: { resultCallIds: Set<string>; ambiguousResults: Set<string> }, private queue: ObservationQueue, private resolution: ActionResolution) {
    const selected = readMode(options.env);
    this.mode = selected.mode;
    this.modeWarning = selected.warning;
    this.capabilities = Object.freeze({ ...capabilities, limitations: Object.freeze([...capabilities.limitations]) });
    this.resultCallIds = shared.resultCallIds;
    this.ambiguousResults = shared.ambiguousResults;
    this.authorizations = new InvocationAuthorizations(this.mode, options.activation);
  }

  get readiness(): Readiness { return { ...this.metadata, eligible: this.eligible, policy: this.policy, config: this.config, unavailable: this.unavailable,
    ruleCount: this.policy.available ? this.policy.rules.length : 0 }; }
  coverageStatus(): { adapter: Capabilities; activation: Activation; mode: Mode; readiness: Readiness } {
    return { adapter: this.capabilities, activation: this.options.activation.read(), mode: this.mode, readiness: this.readiness };
  }
  setObservations(identity: RuntimeIdentity, history: Observations | undefined): void {
    if (history) this.observations.set(scope(identity), history);
    else this.observations.delete(scope(identity));
  }

  private record(stage: string, data: Record<string, unknown>, archiveData: Record<string, unknown> = {}): void {
    data = { ...data, ...this.metadata };
    if (['assessment', 'decision', 'permission', 'assessment-status'].includes(stage)) data = { evidenceContext: UNAVAILABLE_EVIDENCE_CONTEXT, ...data };
    if (['assessment', 'decision', 'assessment-status', 'permission'].includes(stage)) data = {
      judgeReportVersion: 'judge-report-v1', requestedProvider: this.options.judgeStatus?.provider ?? 'injected', requestedModel: this.options.judgeStatus?.requestedModel ?? null, ...data };
    if (!this.eligible || this.options.activation.read() !== 'on') return;
    if (typeof data.invocationId === 'string' && STAGES.includes(stage as Stage)) {
      capture(this.recordings.get(data.invocationId)?.sink, stage as Stage, () => ({ ...data, ...archiveData }));
      const entry = this.recordings.get(data.invocationId);
      if (entry) {
        if (stage === 'execution' || (stage === 'permission' && data.outcome !== 'released')) entry.executionDone = true;
        if (stage === 'assessment-status' && data.status !== 'pending' || stage === 'permission' && (this.mode === 'enforce' || data.reason !== 'assessment-pending')) entry.assessmentDone = true;
        if (entry.executionDone && entry.assessmentDone) this.recordings.delete(data.invocationId);
      }
    }
    try { this.options.emit?.(stage, data, archiveData); } catch { /* Owner reporting cannot veto permission. */ }
  }

  private publishPermission(report: () => void, deferred: boolean): void {
    if (!deferred) { report(); return; }
    // No external recording callback may run inside the SDK's final synchronous handoff.
    this.permissionReports.add(report);
    queueMicrotask(() => { if (this.permissionReports.delete(report)) report(); });
  }
  private flushPermissions(): void {
    for (const report of this.permissionReports) {
      this.permissionReports.delete(report); report();
    }
  }
  private trackRelease(callKey: string, identity: InvocationIdentity & RuntimeIdentity): void {
    this.released.set(callKey, identity);
    const timer = setTimeout(() => {
      if (this.released.get(callKey) === identity) {
        this.released.delete(callKey);
        this.record('execution', { ...identity, outcome: 'unknown', origin: 'result-timeout' });
      }
      this.resultTimers.delete(callKey);
    }, 60_000);
    timer.unref();
    this.resultTimers.set(callKey, timer);
  }
  private clearResultTimer(callKey: string): void {
    const timer = this.resultTimers.get(callKey);
    if (timer) clearTimeout(timer);
    this.resultTimers.delete(callKey);
  }
  private unknownOutcomes(context?: string): void {
    this.flushPermissions();
    for (const [id, identity] of this.released) {
      if (context && scope(identity) !== context) continue;
      this.clearResultTimer(id);
      this.released.delete(id);
      this.record('execution', { ...identity, outcome: 'unknown', origin: 'no-tool-result-observed' });
    }
  }

  endTurn(): void { if (this.mode === 'enforce') this.invalidate('agent-end'); else this.unknownOutcomes(); }
  /** Revoke before reporting; a failing audit callback cannot keep permission valid. */
  invalidate(reason: string, context?: RuntimeIdentity): void {
    if (!context && reason !== 'tenet-off' && reason !== 'control-unavailable') this.loadToken++;
    const selected = context ? scope(context) : undefined;
    try {
      this.authorizations.invalidate(reason, context);
      if (this.options.activation.read() !== 'on') this.recordings.clear();
    } finally {
      if (reason === 'tenet-off' || reason === 'control-unavailable')
        for (const [id, identity] of this.released) if (!selected || scope(identity) === selected) this.disabled.add(id);
      this.unknownOutcomes(selected);
    }
  }

  activationChanged(value: Activation): void {
    if (value !== 'on') { this.invalidate(value === 'off' ? 'tenet-off' : 'control-unavailable'); this.observations.clear(); }
  }

  shutdown(): void {
    this.unavailable = 'session-shutdown'; this.invalidate('session-shutdown');
    this.observations.clear(); this.recordings.clear(); this.seen.clear(); this.disabled.clear();
  }

  async start(identity: RuntimeIdentity, cwd: string, hasJudge = true): Promise<Readiness | undefined> {
    this.invalidate('session-start');
    this.session = { ...identity };
    const starting = this.loadToken;
    const env = { ...this.options.env };
    const selected = await selectPolicies(cwd, env);
    if (starting !== this.loadToken) return undefined;
    this.eligible = selected.eligible;
    this.policy = freeze({ available: false, contractVersion: 'policy-sources-v1', candidates: selected.candidates, failedRole: selected.candidates.find(c => c.failure)?.role, reason: 'policy-unavailable' });
    if (!selected.eligible) {
      this.config = undefined;
      this.unavailable = undefined;
      this.observations.clear();
      return this.readiness;
    }
    this.unavailable = 'starting';
    this.config = undefined;
    this.observations.clear();
    try {
      if (this.options.configuration && !this.options.configuration.common) throw new Error('configuration');
      const config: GuardConfig = this.options.configuration?.common
        ? { ...this.options.configuration.common, policyPath: selected.candidates.find(c => c.role === 'project')!.source }
        : readConfig(cwd, env);
      const policy = await loadPolicy(selected.candidates);
      if (starting !== this.loadToken) return undefined;
      this.config = config;
      this.policy = policy;
      this.unavailable = !policy.available ? policy.reason : !hasJudge ? this.options.judgeStatus?.reason ?? 'missing-credentials' : undefined;
    } catch {
      if (starting !== this.loadToken) return undefined;
      this.unavailable = 'configuration';
    }
    return this.readiness;
  }

  status(): void {
    const { policy, config, unavailable, ruleCount } = this.readiness;
    this.record('status', { status: unavailable ? 'unavailable' : 'ready', reason: unavailable ?? null, modeWarning: this.modeWarning ?? null,
      judge: this.options.judgeStatus,
      configuration: this.options.configuration?.status,
      policy, ruleCount, ...this.metadata, config: config?.decision ?? null, scope: 'configured-rules',
      evidence: config?.evidence ?? null, approvalTimeoutMs: config?.approvalTimeoutMs ?? null });
  }

  async call(call: Call): Promise<{ block: true; reason: string } | undefined> {
    if (this.session?.host !== call.host || this.session.sessionId !== call.sessionId)
      return this.mode === 'enforce' ? { block: true, reason: 'TENET blocked: session-unavailable.' } : undefined;
    if (!this.eligible) return;
    const control = this.options.activation.refresh();
    if (control !== 'on') {
      this.disabled.add(key(call, call.callId));
      return control === 'unavailable' && this.mode === 'enforce' ? { block: true, reason: 'TENET blocked: control-unavailable.' } : undefined;
    }
    const callKey = key(call, call.callId);
    const correlation = resultKey(call, call.callId, this.capabilities.resultCorrelation);
    if (this.resultCallIds.has(correlation)) this.ambiguousResults.add(correlation);
    this.resultCallIds.add(correlation);
    const selectedPolicy = this.policy, selectedConfig = this.config;
    const invocationContext = this.authorizations.context(call);
    const context = scope(call);
    const { signal, observationSignal } = invocationContext;
    const identity: InvocationIdentity & RuntimeIdentity = { ...ASSESSMENT_METADATA, host: call.host, contextId: call.contextId, sessionId: call.sessionId,
      callId: call.callId, toolName: call.toolName, argumentDigest: '', combinedPolicyDigest: selectedPolicy.available ? selectedPolicy.combinedDigest : null, invocationId: randomUUID() };
    let submitted = false;
    let sink: RecordingSink | undefined;
    try { sink = this.options.bindRecording?.({ ...identity, cwd: call.cwd, mode: this.mode }); }
    catch { /* Capture failure cannot change permission. */ }
    const recording: RecordingSink = (stage, data) => {
      // Terminal permission is owed even when cancellation invalidated the assessment.
      if (this.options.activation.read() !== 'on' || (!['permission', 'execution'].includes(stage)
        && !invocationContext.current())) return;
      data = { evidenceContext: UNAVAILABLE_EVIDENCE_CONTEXT, ...data, ...this.metadata };
      if (stage === 'request') submitted = true;
      capture(sink, stage, () => stage === 'permission' ? { ...data, requestStatus: submitted ? 'submitted' : 'not-submitted' } : data);
    };
    this.recordings.set(identity.invocationId, { sink: recording, assessmentDone: false, executionDone: false });
    capture(recording, 'begin', () => ({ policy: selectedPolicy, config: selectedConfig?.decision ?? null,
      integrity: { id: INTEGRITY_ID, text: INTEGRITY_TEXT }, evidenceLimits: selectedConfig?.evidence ?? null,
      requestedProvider: this.options.judgeStatus?.provider ?? 'injected', requestedModel: this.options.judgeStatus?.requestedModel ?? null,
      ...this.metadata, request: 'not-yet-submitted', adapterCoverage: this.capabilities }));
    const authorization = this.authorizations.begin(invocationContext, {
      call, identity, policy: selectedPolicy,
      ready: () => !this.unavailable && this.policy === selectedPolicy
        && this.session?.host === identity.host && this.session.sessionId === identity.sessionId,
      unavailable: () => this.unavailable,
      policyStale: () => {
        this.unavailable = 'policy-stale'; this.invalidate('policy-stale');
        this.record('status', { status: 'unavailable', reason: 'policy-stale', combinedPolicyDigest: identity.combinedPolicyDigest });
      },
      approval: (outcome, ruleIds) => this.record('approval', { ...identity, outcome, ruleIds }),
      disabled: () => { this.disabled.add(callKey); },
      finalized: permission => {
        if (permission.outcome === 'released') this.trackRelease(callKey, identity);
        this.publishPermission(() => this.record('permission', { ...identity, ...permission }),
          !!call.onAuthorization && permission.outcome === 'released');
        try { call.onPermission?.(identity, permission); } catch { /* Owner UI cannot veto. */ }
      },
    });
    const { current, block } = authorization;
    const dropOversized = () => {
      const permission: Permission = { ...this.metadata, outcome: 'released', reason: 'snapshot-capacity', assessmentAvailable: false,
        evidenceContext: UNAVAILABLE_EVIDENCE_CONTEXT,
        ruleIds: [], diagnostics: [], rules: selectedPolicy.available ? selectedPolicy.rules.map(({ id, line, enforcement, text, origin }) => ({ id, line, enforcement, text, origin })) : [], approvalRules: [] };
      authorization.commit(permission);
      this.queue.submit(Number.POSITIVE_INFINITY, observationSignal, async () => 'unavailable', (status, reason) => {
        if (this.options.activation.read() !== 'on') return;
        this.record('assessment-status', { ...identity, status, reason, profile: this.profile, queueWaitMs: 0 });
        try { call.onAssessment?.(identity, status, undefined, reason); } catch { /* Best effort. */ }
        try { this.options.onAssessment?.(identity, status, undefined, reason); } catch { /* Best effort. */ }
      });
      return undefined;
    };
    try {
      if (this.seen.has(callKey)) {
        const reason = this.mode === 'enforce' && this.unavailable ? this.unavailable : 'duplicate-call-identity';
        this.invalidate(reason, call);
        return block(reason);
      }
      this.seen.add(callKey);
      if (this.unavailable || !selectedConfig || !selectedPolicy.available) {
        const reason = this.unavailable ?? 'policy-unavailable';
        if (this.mode === 'enforce') this.record('decision', { ...identity, decision: 'BLOCK', reason, assessment: null });
        return block(reason);
      }
      if (!current()) return block('guard-state-changed');
      if (this.mode === 'observe' && !evidenceWithinBudget([call.input], this.queue.limits.bytes))
        return call.signal?.aborted ? block('guard-state-changed') : dropOversized();
      let action: Action;
      let metadata: { description?: string; parameters?: unknown } | undefined;
      try { metadata = call.metadata?.(); } catch { return block('guard-error'); }
      if (this.mode === 'observe' && !evidenceWithinBudget([call.input, metadata?.description ?? call.description, metadata?.parameters ?? call.parameters], this.queue.limits.bytes))
        return call.signal?.aborted ? block('guard-state-changed') : dropOversized();
      try {
        action = captureAction({ sessionId: identity.sessionId, callId: identity.callId, toolName: call.toolName,
          arguments: call.input, description: metadata?.description ?? call.description,
          parameters: metadata?.parameters ?? call.parameters }, selectedConfig.sensitiveFields);
      } catch {
        this.observations.get(context)?.add(`${call.host}-tool-call`, identity.callId, identity.toolName, { limitation: 'unsupported-current-action' });
        if (this.mode === 'enforce') this.record('decision', { ...identity, decision: 'BLOCK', reason: 'insufficient-evidence', outcome: 'UNKNOWN', limitation: 'unsupported-current-action' });
        return block('insufficient-evidence');
      }
      identity.argumentDigest = action.argumentDigest;
      let observations = this.observations.get(context);
      if (!observations || observations.sessionId !== identity.sessionId) {
        observations = new Observations(identity.sessionId, selectedConfig.evidence, selectedConfig.sensitiveFields, ['history-unavailable']);
        this.observations.set(context, observations);
      }
      // Preserve invocation order and exclude events that arrive while resolution awaits.
      const trajectory = observations.snapshot();
      observations.add(`${call.host}-tool-call`, identity.callId, identity.toolName, action);
      const { combinedPolicyDigest: _combinedPolicyDigest, ...binding } = identity;
      let resolved: ResolvedInvocation;
      try {
        resolved = await this.resolution.capture({ ...binding, cwd: call.cwd }, call.input, selectedConfig.sensitiveFields, signal);
      } catch { return block('action-resolution-unavailable'); }
      if (!current()) return block('guard-state-changed');
      const fresh = () => authorization.policyCurrent();
      if (this.mode === 'observe') {
        if (call.signal?.aborted) return block('guard-state-changed');
        const snapshot = freeze({ policy: structuredClone(selectedPolicy), action, trajectory, resolvedAction: resolved.evidence,
          config: structuredClone(selectedConfig.decision), evidence: structuredClone(selectedConfig.evidence),
          cwd: call.cwd, profile: this.profile, generation: this.loadToken });
        let bytes: number;
        try { bytes = Buffer.byteLength(JSON.stringify(snapshot)); } catch { bytes = Number.POSITIVE_INFINITY; }
        const permission: Permission = { ...this.metadata, outcome: 'released', reason: 'assessment-pending', assessmentAvailable: false,
          evidenceContext: UNAVAILABLE_EVIDENCE_CONTEXT,
          ruleIds: [], diagnostics: [], rules: selectedPolicy.rules.map(({ id, line, enforcement, text, origin }) => ({ id, line, enforcement, text, origin })), approvalRules: [] };
        authorization.commit(permission);
        let resultPermission: Permission | undefined;
        let terminalReason: string | undefined;
        let providerDuration = 0;
        const status = (state: ObservationState, reason?: string, waitMs?: number) => {
          if (state === 'pending' || this.options.activation.read() === 'on')
            this.record('assessment-status', { ...identity, status: state, reason: reason ?? terminalReason,
              evidenceContext: resultPermission?.evidenceContext ?? UNAVAILABLE_EVIDENCE_CONTEXT,
              ...(resultPermission?.returnedModel ? { returnedModel: resultPermission.returnedModel } : {}),
              ...(resultPermission?.validationIssue ? { validationIssue: resultPermission.validationIssue } : {}),
              profile: snapshot.profile, queueWaitMs: waitMs ?? 0, providerDurationMs: providerDuration });
          try { call.onAssessment?.(identity, state, resultPermission, reason ?? terminalReason); } catch { /* Best effort. */ }
          if (state !== 'pending' && this.options.activation.read() === 'on')
            try { this.options.onAssessment?.(identity, state, resultPermission, reason ?? terminalReason); } catch { /* Best effort. */ }
        };
        this.queue.submit(bytes, observationSignal, async () => {
          if (!current()) return 'unavailable';
          if (!await fresh()) return 'unavailable';
          const result = await decide({ policy: snapshot.policy, action: snapshot.action, trajectory: snapshot.trajectory, resolvedAction: snapshot.resolvedAction,
            evidenceLimits: snapshot.evidence, cwd: snapshot.cwd, judge: this.options.judge, judgeIdentity: this.options.judgeStatus, config: snapshot.config, signal: observationSignal, recording });
          providerDuration = result.durationMs;
          if (!current()) return 'unavailable';
          if (!await fresh()) return 'unavailable';
          if (!current()) return 'unavailable';
          this.record('assessment', { ...identity, assessment: result.assessment, reason: result.reason,
            evidenceContext: result.evidenceContext,
            ...(result.validationIssue ? { validationIssue: result.validationIssue } : {}),
            durationMs: result.durationMs, requestedModel: result.requestedModel, requestedProvider: result.requestedProvider, questionVersion: result.questionVersion,
            config: result.config, evidenceLimits: snapshot.evidence, redactedFields: action.redactedFields, limitations: action.limitations, resolvedAction: snapshot.resolvedAction });
          terminalReason = result.reason;
          if (!result.assessment) {
            const outcome = new Consequences('observe', selectedPolicy); outcome.assessed(result);
            resultPermission = outcome.permission();
            resultPermission.wouldDecision = undefined;
            return 'unavailable';
          }
          this.record('decision', { ...identity, decision: result.decision, reason: result.reason, ruleIds: result.ruleIds,
            evidenceContext: result.evidenceContext,
            diagnostics: result.diagnostics, questionVersion: result.questionVersion }, { contributions: ruleContributions(result, selectedPolicy) });
          const outcome = new Consequences('observe', selectedPolicy); outcome.assessed(result);
          resultPermission = outcome.permission();
          return 'completed';
        }, status);
        return undefined;
      }
      if (!await fresh()) return block('policy-stale');
      const result = await decide({ policy: selectedPolicy, action, trajectory, resolvedAction: resolved.evidence, evidenceLimits: selectedConfig.evidence,
        cwd: call.cwd, judge: this.options.judge, judgeIdentity: this.options.judgeStatus, config: selectedConfig.decision, signal, recording });
      authorization.assessed(result);
      try { call.onDecision?.(result); } catch { /* Owner reporting cannot change authorization. */ }
      if (!current()) return block('guard-state-changed');
      this.record('assessment', { ...identity, assessment: result.assessment, reason: result.reason,
        evidenceContext: result.evidenceContext,
        ...(result.validationIssue ? { validationIssue: result.validationIssue } : {}),
        durationMs: result.durationMs, requestedModel: result.requestedModel, requestedProvider: result.requestedProvider, questionVersion: result.questionVersion,
        config: result.config, evidenceLimits: selectedConfig.evidence, redactedFields: action.redactedFields, limitations: action.limitations, resolvedAction: resolved.evidence });
      this.record('decision', { ...identity, decision: result.decision, reason: result.reason, ruleIds: result.ruleIds,
        evidenceContext: result.evidenceContext,
        ...(result.validationIssue ? { validationIssue: result.validationIssue } : {}),
        diagnostics: result.diagnostics, questionVersion: result.questionVersion }, { contributions: ruleContributions(result, selectedPolicy) });
      return await authorization.authorize(action, resolved, result,
        { timeoutMs: selectedConfig.approvalTimeoutMs, trusted: this.capabilities.trustedApproval });
    } catch {
      return block('guard-error');
    }
  }

  result(result: RuntimeIdentity & { callId: string; toolName: string; content?: unknown; details?: unknown; isError?: boolean; correlation?: 'unknown' }): { invocationId: string; outcome: 'executed' | 'failed' | 'unknown' } | undefined {
    if (!this.eligible || this.session?.host !== result.host || this.session.sessionId !== result.sessionId) return;
    const id = key(result, result.callId);
    if (this.options.activation.refresh() !== 'on' || this.disabled.has(id)) return;
    const correlation = resultKey(result, result.callId, this.capabilities.resultCorrelation);
    const observations = this.observations.get(scope(result));
    if (this.config && observations?.sessionId === result.sessionId) observations.add(`${result.host}-tool-result`, result.callId, result.toolName,
      this.ambiguousResults.has(correlation) ? { limitation: 'ambiguous-tool-result' }
        : { content: result.content, details: result.details, isError: result.isError });
    const identity = this.released.get(id);
    if (!identity || identity.toolName !== result.toolName) return;
    const ambiguous = this.ambiguousResults.has(correlation);
    const outcome = ambiguous || result.correlation === 'unknown' ? 'unknown' : result.isError ? 'failed' : 'executed';
    this.record('execution', { ...identity, origin: ambiguous ? 'ambiguous-tool-result' : `${result.host}-tool-result`, outcome });
    this.released.delete(id);
    this.clearResultTimer(id);
    return { invocationId: identity.invocationId, outcome };
  }
}

/** Embeddable owner of independent host/session policies and generations. */
export class GuardRuntime {
  readonly mode: Mode;
  readonly assessmentMetadata = ASSESSMENT_METADATA;
  readonly modeWarning?: string;
  readonly capabilities: Capabilities;
  private readonly resolution: ActionResolution;
  private sessions = new Map<string, SessionGuard>();
  private latest?: string;
  readonly observationQueue: ObservationQueue;
  // Pi results have no invocation ID. Retain ambiguity across native session switches.
  private results = { resultCallIds: new Set<string>(), ambiguousResults: new Set<string>() };
  constructor(private options: RuntimeOptions, capabilities: Capabilities) {
    this.options = { ...options, env: Object.freeze({ ...options.env }) };
    const selected = readMode(options.env);
    this.mode = selected.mode;
    this.modeWarning = selected.warning;
    this.resolution = new ActionResolution(options.actionResolver);
    this.capabilities = Object.freeze({ ...capabilities, actionResolution: this.resolution.supported ? 'host-supplied' : 'unsupported',
      limitations: Object.freeze([...capabilities.limitations, ...(!this.resolution.supported ? ['target-resolution-unavailable'] : [])]) });
    this.observationQueue = new ObservationQueue(options.observationLimits);
  }
  private session(identity: RuntimeIdentity): SessionGuard | undefined { return this.sessions.get(sessionKey(identity)); }
  get readiness(): Readiness {
    return this.latest && this.sessions.get(this.latest)?.readiness
      || { ...this.assessmentMetadata, eligible: true, policy: { available: false, contractVersion: 'policy-sources-v1', candidates: [], reason: 'policy-unavailable' }, unavailable: 'not-started', ruleCount: 0 };
  }
  coverageStatus(identity?: RuntimeIdentity): { adapter: Capabilities; activation: Activation; mode: Mode; readiness: Readiness } {
    return { adapter: this.capabilities, activation: this.options.activation.read(), mode: this.mode,
      readiness: identity ? this.session(identity)?.readiness ?? { ...this.assessmentMetadata, eligible: true, policy: { available: false, contractVersion: 'policy-sources-v1', candidates: [], reason: 'policy-unavailable' }, unavailable: 'session-unavailable', ruleCount: 0 } : this.readiness };
  }
  async start(identity: RuntimeIdentity, cwd: string, hasJudge = true): Promise<Readiness | undefined> {
    if (identity.host !== this.capabilities.host) throw new Error('host-mismatch');
    const id = sessionKey(identity);
    let session = this.sessions.get(id);
    if (!session) { session = new SessionGuard(this.options, this.capabilities, this.results, this.observationQueue, this.resolution); this.sessions.set(id, session); }
    this.latest = id;
    return session.start(identity, cwd, hasJudge);
  }
  setObservations(identity: RuntimeIdentity, history: Observations | undefined): void {
    this.session(identity)?.setObservations(identity, history);
  }
  status(identity?: RuntimeIdentity): void {
    const selected = identity ? this.session(identity) : this.latest ? this.sessions.get(this.latest) : undefined;
    selected?.status();
  }
  call(call: Call): Promise<{ block: true; reason: string } | undefined> {
    const session = this.session(call);
    if (session) return session.call(call);
    return Promise.resolve(this.mode === 'enforce' ? { block: true, reason: 'TENET blocked: session-unavailable.' } : undefined);
  }
  result(result: RuntimeIdentity & { callId: string; toolName: string; content?: unknown; details?: unknown; isError?: boolean; correlation?: 'unknown' }): { invocationId: string; outcome: 'executed' | 'failed' | 'unknown' } | undefined {
    return this.session(result)?.result(result);
  }
  endTurn(identity?: RuntimeIdentity): void {
    if (identity) this.session(identity)?.endTurn();
    else for (const session of this.sessions.values()) session.endTurn();
  }
  invalidate(reason: string, context?: RuntimeIdentity): void {
    if (context) this.session(context)?.invalidate(reason, context);
    else for (const session of this.sessions.values()) session.invalidate(reason);
  }
  activationChanged(value: Activation): void { for (const session of this.sessions.values()) session.activationChanged(value); }
  /** Discard one ended host session; Pi's active-session shutdown contract remains unchanged. */
  closeSession(identity: RuntimeIdentity): void {
    const id = sessionKey(identity);
    this.sessions.get(id)?.shutdown();
    this.sessions.delete(id);
    if (this.latest === id) this.latest = undefined;
    for (const value of this.results.resultCallIds) {
        try {
          const [context] = JSON.parse(value) as [string, string];
          const [host, sessionId] = JSON.parse(context) as [string, string, string];
          if (host === identity.host && sessionId === identity.sessionId) {
            this.results.resultCallIds.delete(value);
            this.results.ambiguousResults.delete(value);
          }
        } catch { /* Older non-correlated host keys cannot be pruned by context. */ }
      }
  }
  shutdown(identity?: RuntimeIdentity): void {
    if (identity) this.session(identity)?.shutdown();
    else for (const session of this.sessions.values()) session.shutdown();
  }
}
