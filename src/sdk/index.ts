import { isAbsolute } from 'node:path';
import { freeze } from '../decision/evidence.js';
import { Observations } from '../decision/trajectory.js';
import { captureHistoryMetadata } from '../decision/history-capture.js';
import type { Decision } from '../decision/contracts.js';
import { UNAVAILABLE_EVIDENCE_CONTEXT } from '../decision/evidence-context.js';
import { permissionVeto, type Permission } from '../runtime/consequences.js';
import { deliverOwnerRecord } from '../runtime/owner-record.js';
import { createRuntimeResources } from '../runtime/resources.js';
import type { AuthorizationHandoff, RuntimeIdentity } from '../runtime/guard.js';
import type { AssessmentStatus, BeforeToolResult, CaptureStatus, Guard, GuardOptions, GuardSession, OwnerEvent, OwnerReport, OwnerRecord, SessionIdentity, SessionStatus } from './types.js';
import { declaredCapabilities } from './capabilities.js';
export type * from './types.js';

export const SDK_VERSION = 'alpha-1';
const immutable = <T>(value: T): T => freeze(structuredClone(value));
const unavailableAssessment = (reason: string, context = UNAVAILABLE_EVIDENCE_CONTEXT): AssessmentStatus => ({ status: 'unavailable', reason, diagnostics: [], ruleIds: [], evidenceContext: context });
const notRequested = (): AssessmentStatus => ({ status: 'not-requested', diagnostics: [], ruleIds: [] });
// The runtime emits completed only after a validated assessment has a would-decision.
const assessmentStatus = (status: AssessmentStatus['status'], permission?: Permission, reason?: string): AssessmentStatus => {
  const details = { reason: reason ?? permission?.reason, diagnostics: permission?.diagnostics ?? [], ruleIds: permission?.ruleIds ?? [] };
  const context = { evidenceContext: permission?.evidenceContext ?? UNAVAILABLE_EVIDENCE_CONTEXT };
  return status === 'completed'
    ? { status, ...details, ...context, wouldDecision: permission?.wouldDecision! }
    : { status, ...details, ...context };
};
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const ownerReport = (binding: Pick<OwnerReport, 'invocationId' | 'callId' | 'toolName'>, permission: Permission,
  mode: OwnerReport['mode'], assessmentStatus: OwnerReport['assessmentStatus'], judge: import('../runtime/judge.js').JudgeStatus): OwnerReport => ({
  judgeReportVersion: 'judge-report-v1', requestedProvider: judge.provider, requestedModel: judge.requestedModel,
  ...permission, mode, invocationId: binding.invocationId, callId: binding.callId, toolName: binding.toolName, assessmentStatus,
});

/** The application owns event translation, trusted UI and executor dispatch. */
export function createGuard(options: GuardOptions): Guard {
  const timeoutMs = options.disposalTimeoutMs ?? 1000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 5000) throw new Error('invalid-disposal-timeout');
  const capabilities = declaredCapabilities(options);
  const sessions = new Map<string, { handle: GuardSession; identity: RuntimeIdentity; initialized: boolean; closed: boolean }>();
  let closed = false;
  let closing: Promise<boolean> | undefined;
  let watching = false;
  const deliver = (event: OwnerEvent) => {
    try { options.onOwnerEvent?.(immutable(event)); } catch { /* Owner delivery cannot authorize or veto. */ }
  };
  const resources = createRuntimeResources({ ...options, capabilities, env: { ...(options.env ?? process.env) },
    onCaptureHealth: () => deliver({ type: 'capture', capture: captureStatus() }),
    onAssessment: (id, status, permission, reason) => {
      // Runtime generations suppress late assessments after invalidation or closure.
      const session = sessions.get(id.sessionId);
      if (!session || session.closed || closed) return;
      deliver({ type: 'assessment', identity: session.identity, invocationId: id.invocationId, callId: id.callId,
        assessment: assessmentStatus(status, permission, reason),
        report: permission ? ownerReport(id, permission, runtime.mode, status, resources.judgeStatus) : undefined });
    },
    emit: (stage, data) => {
      deliverOwnerRecord(options.onOwnerRecord, stage, data, runtime.mode);
      if (stage !== 'execution' || closed || typeof data.sessionId !== 'string') return;
      const session = sessions.get(data.sessionId);
      if (!session || session.closed) return;
      if (typeof data.invocationId !== 'string' || typeof data.callId !== 'string'
        || !['executed', 'failed', 'unknown'].includes(String(data.outcome))) return;
      deliver({ type: 'execution', identity: session.identity, invocationId: data.invocationId,
        callId: data.callId, outcome: data.outcome as 'executed' | 'failed' | 'unknown' });
    },
  });
  const { runtime, activation, archive } = resources;
  const captureStatus = (): CaptureStatus => {
    if (!archive) return { kind: 'external', health: 'unknown' };
    const { enabled, ...health } = archive.health();
    return { kind: enabled ? 'local-archive' : 'disabled', ...health };
  };
  const syncWatch = () => {
    const needed = !closed && [...sessions.values()].some(s => !s.closed && s.initialized && runtime.coverageStatus(s.identity).readiness.eligible);
    if (needed && !watching) {
      activation.watch(value => { runtime.activationChanged(value); deliver({ type: 'activation', activation: value }); });
      watching = true;
    } else if (!needed && watching) { activation.close(); watching = false; }
  };
  const guard: Guard = {
    openSession(identity: SessionIdentity, cwd: string): GuardSession {
      if (closed) throw new Error('guard-closed');
      if (!text(identity.sessionId) || !text(identity.contextId) || !isAbsolute(cwd)) throw new Error('invalid-session-identity-or-cwd');
      if (sessions.has(identity.sessionId)) throw new Error('session-already-open');
      const id: RuntimeIdentity = immutable({ host: runtime.capabilities.host, sessionId: identity.sessionId, contextId: identity.contextId });
      let sessionClosing: Promise<boolean> | undefined;
      const bypassed = new Set<string>();
      const entry = { handle: undefined as unknown as GuardSession, identity: id, initialized: false, closed: false };
      const status = (): SessionStatus => {
        const coverage = runtime.coverageStatus(id);
        const ready = coverage.readiness;
        return immutable({ identity: { sessionId: id.sessionId, contextId: id.contextId },
          state: entry.closed || closed ? 'closed' : !entry.initialized ? 'uninitialized' : !ready.eligible ? 'dormant' : ready.unavailable ? 'unavailable' : 'ready',
          reason: entry.closed || closed ? 'session-closed' : ready.unavailable,
          mode: coverage.mode, modeWarning: runtime.modeWarning, activation: coverage.activation, capabilities: coverage.adapter,
          profile: ready.profile, questionVersion: ready.questionVersion,
          judge: resources.judgeStatus,
          configuration: resources.configurationStatus,
          policy: { source: ready.policy.source, digest: ready.policy.available ? ready.policy.digest : null, ruleCount: ready.ruleCount } });
      };
      const unavailable = (reason: string): BeforeToolResult => immutable({
        permission: runtime.mode === 'enforce' ? 'blocked' : 'released', reason, ...(runtime.mode === 'enforce' ? { blockReason: `TENET blocked: ${reason}.` } : {}), assessment: unavailableAssessment(reason), execution: 'unknown' });
      // Register before starting so closure and callbacks can find the owned handle.
      sessions.set(id.sessionId, entry);
      const ready = runtime.start(id, cwd, resources.hasJudge).then(() => {
        if (!entry.closed && !closed) { entry.initialized = true; syncWatch(); runtime.status(id); }
        return status();
      });
      const handle: GuardSession = {
        ready, status,
        async beforeTool(invocation) {
          if (entry.closed || closed) return unavailable('session-closed');
          if (!entry.initialized) return unavailable('session-uninitialized');
          if (!text(invocation.callId) || !text(invocation.toolName)) return unavailable('invalid-invocation-identity');
          const initial = status();
          if (initial.state === 'dormant') return immutable({ permission: 'released', reason: 'dormant', bypassReason: 'dormant', assessment: notRequested(), execution: 'unknown' });
          const control = activation.refresh();
          if (control !== 'on') {
            bypassed.add(invocation.callId);
            if (control === 'off') return immutable({ permission: 'released', reason: 'off', bypassReason: 'off', assessment: notRequested(), execution: 'unknown' });
            return unavailable('control-unavailable');
          }
          let permission: Permission | undefined;
          let invocationId: string | undefined;
          let reportBinding: Pick<OwnerReport, 'invocationId' | 'callId' | 'toolName'> | undefined;
          let decision: Decision | undefined;
          let observation: AssessmentStatus | undefined;
          let authorization: AuthorizationHandoff | undefined;
          const veto = await runtime.call({ ...invocation, ...id, cwd,
            current: () => ({ ...invocation.current(), host: id.host }),
            onDecision: result => { decision = result; },
            onAuthorization: handoff => { authorization = handoff; },
            onAssessment: (_binding, state, assessed, reason) => { observation = assessmentStatus(state, assessed, reason); },
            onPermission: (binding, result) => { invocationId = binding.invocationId; reportBinding = binding; permission = result; },
          });
          let assessment: AssessmentStatus;
          if (decision?.assessment) assessment = { status: 'completed', wouldDecision: decision.decision,
            reason: decision.reason, diagnostics: decision.diagnostics, ruleIds: decision.ruleIds, evidenceContext: decision.evidenceContext };
          else if (observation) assessment = observation;
          else if (permission?.reason === 'assessment-pending') assessment = assessmentStatus('pending', permission);
          else assessment = unavailableAssessment(permission?.reason ?? decision?.reason ?? 'guard-state-changed', permission?.evidenceContext ?? decision?.evidenceContext);
          const live = () => {
            try { return !entry.closed && !closed && !invocation.signal?.aborted && !!authorization?.current(); }
            catch { return false; }
          };
          const revalidate = async () => {
            if (!live()) return false;
            try { return await authorization!.revalidate() && live(); } catch { return false; }
          };
          const snapshot = (released: boolean): BeforeToolResult => immutable({ permission: released ? 'released' : 'blocked',
            ...(!released ? { blockReason: permission ? permissionVeto({ ...permission, outcome: 'blocked' })?.reason : veto?.reason ?? 'TENET blocked: guard-state-changed.' } : {}),
            reason: permission?.reason ?? decision?.reason ?? 'guard-state-changed', invocationId, assessment, execution: 'unknown' });
          let released = !veto;
          if (runtime.mode === 'enforce' && released && !await revalidate()) {
            permission = authorization?.commit(false) ?? permission; released = false;
          }
          let result = snapshot(released);
          const report = () => {
            if (!entry.closed && !closed && activation.read() === 'on') deliver({ type: 'permission', identity: id, callId: invocation.callId, result,
              report: permission && reportBinding ? ownerReport(reportBinding, { ...permission, outcome: result.permission, reason: result.reason }, runtime.mode,
                result.assessment.status === 'not-requested' ? undefined : result.assessment.status, resources.judgeStatus) : undefined });
          };
          report();
          // Owner delivery and the runtime await can both revoke a prepared release.
          // Reuse the runtime's policy/resolver checks, then end with a synchronous gate.
          if (runtime.mode === 'enforce' && authorization && released) {
            permission = authorization.commit(await revalidate() && live());
            result = snapshot(permission.outcome === 'released');
            if (result.permission === 'blocked') report();
          }
          return result;
        },
        afterTool(result) {
          if (entry.closed || closed || !entry.initialized || bypassed.has(result.callId)) return { outcome: 'unknown' };
          return runtime.result({ ...result, ...id, ...(!runtime.capabilities.resultCorrelation ? { correlation: 'unknown' as const } : {}) }) ?? { outcome: 'unknown' };
        },
        setHistory(history, capture) {
          const reported = captureHistoryMetadata(capture);
          if (entry.closed || closed || !entry.initialized || !Array.isArray(history)) return;
          const readiness = runtime.coverageStatus(id).readiness;
          if (!readiness.eligible || !readiness.config || activation.refresh() !== 'on') return;
          const config = readiness.config;
          const observations = new Observations(id.sessionId, config.evidence, config.sensitiveFields,
            ['host-history-untrusted', ...(capture === undefined ? [] : ['host-reported-capture-slots-not-tool-event-counts'])]);
          observations.addHistory(history, reported.priorOmittedEvents, reported.admissionLimited);
          runtime.setObservations(id, observations);
        },
        endTurn() { if (!entry.closed && !closed) runtime.endTurn(id); },
        invalidate(reason) { if (!entry.closed && !closed) runtime.invalidate(reason.slice(0, 256), id); },
        close() {
          if (sessionClosing) return sessionClosing;
          if (!entry.closed) {
            // Record unknown outcomes and revoke authorization before detaching ownership.
            runtime.closeSession(id); entry.closed = true;
            sessions.delete(id.sessionId); syncWatch();
          }
          sessionClosing = archive ? archive.drain(timeoutMs) : Promise.resolve(true);
          return sessionClosing;
        },
      };
      entry.handle = handle;
      return handle;
    },
    async setActivation(value) {
      if (closed) throw new Error('guard-closed');
      const result = await activation.write(value);
      runtime.activationChanged(result);
      return result;
    },
    status() {
      return immutable({ closed, sessions: sessions.size, mode: runtime.mode, activation: activation.read(),
        judge: resources.judgeStatus,
        configuration: resources.configurationStatus,
        observations: runtime.observationQueue.health(),
        capture: captureStatus() });
    },
    close() {
      if (closing) return closing;
      // Close each runtime session synchronously; never await a provider or native UI.
      for (const entry of [...sessions.values()]) void entry.handle.close();
      closed = true;
      closing = resources.close(timeoutMs);
      return closing;
    },
  };
  return guard;
}
