import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Action, Judge, Policy, RuleDiagnostic } from '../decision/contracts.js';
import { decide } from '../decision/decide.js';
import { argumentDigest, captureAction } from '../decision/evidence.js';
import { loadPolicy, policyIsCurrent, INTEGRITY_ID, INTEGRITY_TEXT } from '../decision/policy.js';
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
export interface Call extends RuntimeIdentity {
  cwd: string; callId: string; toolName: string; input: unknown;
  description?: string; parameters?: unknown; metadata?: () => { description?: string; parameters?: unknown }; signal?: AbortSignal;
  /** Read original host values again immediately before permission is released. */
  current: () => Pick<Call, 'host' | 'sessionId' | 'contextId' | 'callId' | 'toolName' | 'input'>;
  onPermission?: (identity: InvocationIdentity, permission: Permission) => void;
  onPolicyStale?: () => void;
  approve?: (request: ApprovalRequest) => Promise<Approval>;
}
export type Approval = 'approved' | 'denied-or-dismissed' | 'unavailable' | 'cancelled' | 'timeout' | 'invalidated' | 'ui-error';
export interface ApprovalRequest {
  policy: Extract<Policy, { available: true }>;
  action: Action; ruleIds: readonly string[]; timeoutMs: number; signal: AbortSignal;
  valid: () => Promise<boolean>;
}
export interface InvocationIdentity extends Pick<Action, 'sessionId' | 'callId' | 'toolName' | 'argumentDigest'> {
  invocationId: string; policyDigest: string | null;
  profile: string; questionVersion: string;
}
export interface RuntimeOptions {
  env: Record<string, string | undefined>;
  judge: Judge;
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
  private policy: Policy = { available: false, source: '', reason: 'policy-unavailable' };
  private config?: GuardConfig;
  private unavailable?: string = 'not-started';
  private session?: RuntimeIdentity;
  private loadToken = 0;
  private generation = new AbortController();
  private contexts = new Map<string, AbortController>();
  private observations = new Map<string, Observations>();
  private pending = new Map<string, { context: string; block: (reason: string) => unknown }>();
  private seen = new Set<string>();
  private released = new Map<string, InvocationIdentity & RuntimeIdentity>();
  private resultCallIds: Set<string>;
  private resultTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private ambiguousResults: Set<string>;
  private disabled = new Set<string>();
  private recordings = new Map<string, { sink: RecordingSink; assessmentDone: boolean; executionDone: boolean }>();

  constructor(private options: RuntimeOptions, capabilities: Capabilities, shared: { resultCallIds: Set<string>; ambiguousResults: Set<string> }, private queue: ObservationQueue, private resolution: ActionResolution) {
    const selected = readMode(options.env);
    this.mode = selected.mode;
    this.modeWarning = selected.warning;
    this.capabilities = Object.freeze({ ...capabilities, limitations: Object.freeze([...capabilities.limitations]) });
    this.resultCallIds = shared.resultCallIds;
    this.ambiguousResults = shared.ambiguousResults;
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
    if (!this.eligible || this.options.activation.read() !== 'on') return;
    const time = Date.now();
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
    if (this.mode === 'enforce' && (stage === 'decision' || stage === 'approval')
      && typeof data.sessionId === 'string' && typeof data.contextId === 'string' && typeof data.host === 'string') {
      this.observations.get(scope(data as unknown as RuntimeIdentity))?.add(`tenet-${stage}`,
        typeof data.callId === 'string' ? data.callId : null, typeof data.toolName === 'string' ? data.toolName : null, data, time);
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
    if (selected) {
      this.contexts.get(selected)?.abort(reason);
      this.contexts.set(selected, new AbortController());
    } else {
      this.generation.abort(reason);
      this.generation = new AbortController();
      for (const controller of this.contexts.values()) controller.abort(reason);
      this.contexts.clear();
    }
    try {
      for (const entry of this.pending.values()) if (!selected || entry.context === selected) entry.block(reason);
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

  shutdown(): void { this.unavailable = 'session-shutdown'; this.invalidate('session-shutdown'); }

  async start(identity: RuntimeIdentity, cwd: string, hasJudge = true): Promise<Readiness | undefined> {
    this.invalidate('session-start');
    this.session = { ...identity };
    const starting = this.loadToken;
    const selected = await this.localPolicyEligible(cwd);
    if (starting !== this.loadToken) return undefined;
    this.eligible = selected;
    if (!selected) {
      this.config = undefined;
      this.observations.clear();
      return this.readiness;
    }
    this.unavailable = 'starting';
    this.config = undefined;
    this.observations.clear();
    try {
      const config = readConfig(cwd, this.options.env);
      const policy = await loadPolicy(config.policyPath);
      if (starting !== this.loadToken) return undefined;
      this.config = config;
      this.policy = policy;
      this.unavailable = !policy.available ? policy.reason : !hasJudge ? 'missing-credentials' : undefined;
    } catch {
      if (starting !== this.loadToken) return undefined;
      this.unavailable = 'configuration';
    }
    return this.readiness;
  }

  private async localPolicyEligible(cwd: string): Promise<boolean> {
    if (this.options.env.TENET_POLICY !== undefined) return true;
    try { await lstat(join(cwd, 'TENET.md')); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code !== 'ENOENT'; }
  }

  status(): void {
    const { policy, config, unavailable, ruleCount } = this.readiness;
    this.record('status', { status: unavailable ? 'unavailable' : 'ready', reason: unavailable ?? null, modeWarning: this.modeWarning ?? null,
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
    const generation = this.generation;
    const context = scope(call);
    let contextController = this.contexts.get(context);
    if (!contextController) { contextController = new AbortController(); this.contexts.set(context, contextController); }
    const signal = AbortSignal.any([generation.signal, contextController.signal, ...(call.signal ? [call.signal] : [])]);
    const observationSignal = AbortSignal.any([generation.signal, contextController.signal]);
    const identity: InvocationIdentity & RuntimeIdentity = { ...ASSESSMENT_METADATA, host: call.host, contextId: call.contextId, sessionId: call.sessionId,
      callId: call.callId, toolName: call.toolName, argumentDigest: '', policyDigest: selectedPolicy.available ? selectedPolicy.digest : null, invocationId: randomUUID() };
    let submitted = false;
    let sink: RecordingSink | undefined;
    try { sink = this.options.bindRecording?.({ ...identity, cwd: call.cwd, mode: this.mode }); }
    catch { /* Capture failure cannot change permission. */ }
    const recording: RecordingSink = (stage, data) => {
      if (this.options.activation.read() !== 'on' || (stage !== 'execution' && ((this.mode === 'observe' ? observationSignal : signal).aborted || generation !== this.generation))) return;
      data = { ...data, ...this.metadata };
      if (stage === 'request') submitted = true;
      capture(sink, stage, () => stage === 'permission' ? { ...data, requestStatus: submitted ? 'submitted' : 'not-submitted' } : data);
    };
    this.recordings.set(identity.invocationId, { sink: recording, assessmentDone: false, executionDone: false });
    capture(recording, 'begin', () => ({ policy: selectedPolicy, config: selectedConfig?.decision ?? null,
      integrity: { id: INTEGRITY_ID, text: INTEGRITY_TEXT }, evidenceLimits: selectedConfig?.evidence ?? null,
      ...this.metadata, request: 'not-yet-submitted', adapterCoverage: this.capabilities }));
    const consequences = new Consequences(this.mode, selectedPolicy);
    let permissionRecorded = false;
    const finish = (failure?: string, ruleIds?: string[], diagnostics?: RuleDiagnostic[], preserveAsk = false) => {
      const state = this.options.activation.refresh();
      if (state !== 'on') failure = state === 'off' ? 'tenet-off' : 'control-unavailable';
      const permission = consequences.permission(failure, ruleIds, diagnostics);
      if (preserveAsk && failure === 'approval-unavailable') permission.wouldDecision = 'ASK';
      if (!permissionRecorded) {
        permissionRecorded = true;
        this.pending.delete(identity.invocationId);
        if (state === 'on') {
          this.record('permission', { ...identity, ...permission });
          try { call.onPermission?.(identity, permission); } catch { /* Owner UI cannot veto. */ }
          if (permission.outcome === 'released') this.trackRelease(callKey, identity);
        }
      }
      return consequences.veto(permission);
    };
    const block = (reason: string, ruleIds?: string[], diagnostics?: RuleDiagnostic[], preserveAsk = false) => {
      if (reason === 'tenet-off' || reason === 'control-unavailable') this.disabled.add(callKey);
      return finish(reason, ruleIds, diagnostics, preserveAsk);
    };
    this.pending.set(identity.invocationId, { context, block });
    const current = () => this.options.activation.refresh() === 'on' && !(this.mode === 'observe' ? observationSignal : signal).aborted && generation === this.generation
      && contextController === this.contexts.get(context) && !this.unavailable && this.policy === selectedPolicy
      && this.session?.host === identity.host && this.session.sessionId === identity.sessionId;
    const dropOversized = () => {
      const permission: Permission = { ...this.metadata, outcome: 'released', reason: 'snapshot-capacity', assessmentAvailable: false,
        ruleIds: [], diagnostics: [], rules: selectedPolicy.available ? selectedPolicy.rules.map(({ id, line, enforcement, text }) => ({ id, line, enforcement, text })) : [], approvalRules: [] };
      this.pending.delete(identity.invocationId);
      permissionRecorded = true;
      this.record('permission', { ...identity, ...permission });
      try { call.onPermission?.(identity, permission); } catch { /* Owner UI cannot veto. */ }
      this.trackRelease(callKey, identity);
      this.queue.submit(Number.POSITIVE_INFINITY, observationSignal, async () => 'unavailable', (status, reason) => {
        if (this.options.activation.read() !== 'on') return;
        this.record('assessment-status', { ...identity, status, reason, profile: this.profile, queueWaitMs: 0 });
        try { this.options.onAssessment?.(identity, status, undefined, reason); } catch { /* Best effort. */ }
      });
      return undefined;
    };
    try {
      if (this.seen.has(callKey)) {
        this.invalidate('duplicate-call-identity', call);
        return block(this.mode === 'enforce' && this.unavailable ? this.unavailable : 'duplicate-call-identity');
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
      const { policyDigest: _policyDigest, ...binding } = identity;
      let resolved: ResolvedInvocation;
      try {
        resolved = await this.resolution.capture({ ...binding, cwd: call.cwd }, call.input, selectedConfig.sensitiveFields, signal);
      } catch { return block('action-resolution-unavailable'); }
      if (!current()) return block('guard-state-changed');
      if (this.mode === 'observe') {
        if (call.signal?.aborted) return block('guard-state-changed');
        const snapshot = freeze({ policy: structuredClone(selectedPolicy), action, trajectory, resolvedAction: resolved.evidence,
          config: structuredClone(selectedConfig.decision), evidence: structuredClone(selectedConfig.evidence),
          cwd: call.cwd, profile: this.profile, generation: this.loadToken });
        let bytes: number;
        try { bytes = Buffer.byteLength(JSON.stringify(snapshot)); } catch { bytes = Number.POSITIVE_INFINITY; }
        const permission: Permission = { ...this.metadata, outcome: 'released', reason: 'assessment-pending', assessmentAvailable: false,
          ruleIds: [], diagnostics: [], rules: selectedPolicy.rules.map(({ id, line, enforcement, text }) => ({ id, line, enforcement, text })), approvalRules: [] };
        this.pending.delete(identity.invocationId);
        permissionRecorded = true;
        this.record('permission', { ...identity, ...permission });
        try { call.onPermission?.(identity, permission); } catch { /* Owner UI cannot veto. */ }
        this.trackRelease(callKey, identity);
        let resultPermission: Permission | undefined;
        let terminalReason: string | undefined;
        let providerDuration = 0;
        const status = (state: ObservationState, reason?: string, waitMs?: number) => {
          if (state === 'pending' || this.options.activation.read() === 'on')
            this.record('assessment-status', { ...identity, status: state, reason: reason ?? terminalReason,
              ...(resultPermission?.validationIssue ? { validationIssue: resultPermission.validationIssue } : {}),
              profile: snapshot.profile, queueWaitMs: waitMs ?? 0, providerDurationMs: providerDuration });
          if (state !== 'pending' && this.options.activation.read() === 'on')
            try { this.options.onAssessment?.(identity, state, resultPermission, reason ?? terminalReason); } catch { /* Best effort. */ }
        };
        this.queue.submit(bytes, observationSignal, async () => {
          if (!current()) return 'unavailable';
          const result = await decide({ policy: snapshot.policy, action: snapshot.action, trajectory: snapshot.trajectory, resolvedAction: snapshot.resolvedAction,
            evidenceLimits: snapshot.evidence, cwd: snapshot.cwd, judge: this.options.judge, config: snapshot.config, signal: observationSignal, recording });
          providerDuration = result.durationMs;
          if (!current()) return 'unavailable';
          if (!await policyIsCurrent(selectedPolicy)) {
            if (current()) {
              this.unavailable = 'policy-stale'; this.invalidate('policy-stale');
              this.record('status', { status: 'unavailable', reason: 'policy-stale', policyDigest: selectedPolicy.digest });
              try { call.onPolicyStale?.(); } catch { /* Best effort. */ }
            }
            return 'unavailable';
          }
          if (!current()) return 'unavailable';
          this.record('assessment', { ...identity, assessment: result.assessment, reason: result.reason,
            ...(result.validationIssue ? { validationIssue: result.validationIssue } : {}),
            durationMs: result.durationMs, requestedModel: result.requestedModel, questionVersion: result.questionVersion,
            config: result.config, evidenceLimits: snapshot.evidence, redactedFields: action.redactedFields, limitations: action.limitations, resolvedAction: snapshot.resolvedAction });
          terminalReason = result.reason;
          if (!result.assessment) {
            const outcome = new Consequences('observe', selectedPolicy); outcome.assessed(result);
            resultPermission = outcome.permission();
            resultPermission.wouldDecision = undefined;
            return 'unavailable';
          }
          this.record('decision', { ...identity, decision: result.decision, reason: result.reason, ruleIds: result.ruleIds,
            diagnostics: result.diagnostics, questionVersion: result.questionVersion }, { contributions: ruleContributions(result, selectedPolicy) });
          const outcome = new Consequences('observe', selectedPolicy); outcome.assessed(result);
          resultPermission = outcome.permission();
          return 'completed';
        }, status);
        return undefined;
      }
      const result = await decide({ policy: selectedPolicy, action, trajectory, resolvedAction: resolved.evidence, evidenceLimits: selectedConfig.evidence,
        cwd: call.cwd, judge: this.options.judge, config: selectedConfig.decision, signal, recording });
      consequences.assessed(result);
      if (!current()) return block('guard-state-changed');
      this.record('assessment', { ...identity, assessment: result.assessment, reason: result.reason,
        ...(result.validationIssue ? { validationIssue: result.validationIssue } : {}),
        durationMs: result.durationMs, requestedModel: result.requestedModel, questionVersion: result.questionVersion,
        config: result.config, evidenceLimits: selectedConfig.evidence, redactedFields: action.redactedFields, limitations: action.limitations, resolvedAction: resolved.evidence });
      this.record('decision', { ...identity, decision: result.decision, reason: result.reason, ruleIds: result.ruleIds,
        ...(result.validationIssue ? { validationIssue: result.validationIssue } : {}),
        diagnostics: result.diagnostics, questionVersion: result.questionVersion }, { contributions: ruleContributions(result, selectedPolicy) });
      const fresh = async () => {
        const upToDate = await policyIsCurrent(selectedPolicy);
        if (!current()) return false;
        if (upToDate) return true;
        this.unavailable = 'policy-stale';
        this.invalidate('policy-stale');
        this.record('status', { status: 'unavailable', reason: 'policy-stale', policyDigest: selectedPolicy.digest });
        call.onPolicyStale?.();
        return false;
      };
      if (!await fresh()) return block('policy-stale');
      if (result.decision === 'BLOCK') return block(result.reason, result.ruleIds, result.diagnostics);
      const unchanged = () => {
        const now = call.current();
        return now.host === identity.host && now.sessionId === identity.sessionId && now.contextId === identity.contextId && now.toolName === identity.toolName
          && now.callId === identity.callId && argumentDigest(now.input) === action.argumentDigest;
      };
      if (!unchanged()) return block('arguments-changed');
      if (result.decision === 'ASK' && this.mode === 'enforce') {
        if (!this.capabilities.trustedApproval || !call.approve) return block('approval-unavailable', result.ruleIds, result.diagnostics, true);
        const approval = await call.approve({ policy: selectedPolicy, action, ruleIds: result.ruleIds,
          timeoutMs: selectedConfig.approvalTimeoutMs, signal,
          valid: async () => current() && unchanged() && await fresh() && current() && unchanged() });
        if (!current()) return block('guard-state-changed');
        this.record('approval', { ...identity, outcome: approval, ruleIds: result.ruleIds });
        if (approval !== 'approved') return block(`approval-${approval}`);
      }
      if (result.decision === 'ASK' && !await fresh()) return block('policy-stale');
      if (!current()) return block('guard-state-changed');
      if (!unchanged()) return block('arguments-changed');
      if (!await resolved.revalidate(signal)) return block('action-resolution-stale');
      if (!await fresh()) return block('policy-stale');
      if (!current()) return block('guard-state-changed');
      if (!unchanged()) return block('arguments-changed');
      return finish();
    } catch {
      return block('guard-error');
    }
  }

  result(result: RuntimeIdentity & { callId: string; toolName: string; content?: unknown; details?: unknown; isError?: boolean }): { invocationId: string; outcome: 'executed' | 'failed' | 'unknown' } | undefined {
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
    const outcome = ambiguous ? 'unknown' : result.isError ? 'failed' : 'executed';
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
      || { ...this.assessmentMetadata, eligible: true, policy: { available: false, source: '', reason: 'policy-unavailable' }, unavailable: 'not-started', ruleCount: 0 };
  }
  coverageStatus(identity?: RuntimeIdentity): { adapter: Capabilities; activation: Activation; mode: Mode; readiness: Readiness } {
    return { adapter: this.capabilities, activation: this.options.activation.read(), mode: this.mode,
      readiness: identity ? this.session(identity)?.readiness ?? { ...this.assessmentMetadata, eligible: true, policy: { available: false, source: '', reason: 'policy-unavailable' }, unavailable: 'session-unavailable', ruleCount: 0 } : this.readiness };
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
  result(result: RuntimeIdentity & { callId: string; toolName: string; content?: unknown; details?: unknown; isError?: boolean }): { invocationId: string; outcome: 'executed' | 'failed' | 'unknown' } | undefined {
    return this.session(result)?.result(result);
  }
  endTurn(): void { for (const session of this.sessions.values()) session.endTurn(); }
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
