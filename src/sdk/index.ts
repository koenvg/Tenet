import { isAbsolute } from 'node:path';
import { freeze } from '../decision/evidence.js';
import { evidenceWithinBudget } from '../decision/evidence-budget.js';
import { Observations } from '../decision/trajectory.js';
import type { Decision } from '../decision/contracts.js';
import type { Permission } from '../runtime/consequences.js';
import { createRuntimeResources } from '../runtime/resources.js';
import type { AuthorizationHandoff, RuntimeIdentity } from '../runtime/guard.js';
import type { AssessmentStatus, BeforeToolResult, Guard, GuardOptions, GuardSession, OwnerEvent, SessionIdentity, SessionStatus } from './types.js';
import { declaredCapabilities } from './capabilities.js';
export type * from './types.js';

export const SDK_VERSION = 'alpha-1';
const immutable = <T>(value: T): T => freeze(structuredClone(value));
const unavailableAssessment = (reason: string): AssessmentStatus => ({ status: 'unavailable', reason, diagnostics: [], ruleIds: [] });
const notRequested = (): AssessmentStatus => ({ status: 'not-requested', diagnostics: [], ruleIds: [] });
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;

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
    onAssessment: (id, status, permission, reason) => {
      // Runtime generations suppress late assessments after invalidation or closure.
      const session = sessions.get(id.sessionId);
      if (!session || session.closed || closed) return;
      deliver({ type: 'assessment', identity: session.identity, invocationId: id.invocationId, callId: id.callId,
        assessment: { status, reason: reason ?? permission?.reason,
          ...(status === 'completed' && permission?.assessmentAvailable ? { wouldDecision: permission.wouldDecision } : {}),
          diagnostics: permission?.diagnostics ?? [], ruleIds: permission?.ruleIds ?? [] } });
    },
    emit: (stage, data) => {
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
      const entry = { handle: undefined as unknown as GuardSession, identity: id, initialized: false, closed: false };
      const status = (): SessionStatus => {
        const coverage = runtime.coverageStatus(id);
        const ready = coverage.readiness;
        return immutable({ identity: { sessionId: id.sessionId, contextId: id.contextId },
          state: entry.closed || closed ? 'closed' : !entry.initialized ? 'uninitialized' : !ready.eligible ? 'dormant' : ready.unavailable ? 'unavailable' : 'ready',
          reason: entry.closed || closed ? 'session-closed' : ready.unavailable,
          mode: coverage.mode, modeWarning: runtime.modeWarning, activation: coverage.activation, capabilities: coverage.adapter,
          profile: ready.profile, questionVersion: ready.questionVersion,
          policy: { source: ready.policy.source, digest: ready.policy.available ? ready.policy.digest : null, ruleCount: ready.ruleCount } });
      };
      const unavailable = (reason: string): BeforeToolResult => immutable({
        permission: runtime.mode === 'enforce' ? 'blocked' : 'released', reason, assessment: unavailableAssessment(reason), execution: 'unknown' });
      // Register before starting so closure and callbacks can find the owned handle.
      sessions.set(id.sessionId, entry);
      const ready = runtime.start(id, cwd, resources.hasJudge).then(() => {
        if (!entry.closed && !closed) { entry.initialized = true; syncWatch(); }
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
          if (control === 'off') return immutable({ permission: 'released', reason: 'off', bypassReason: 'off', assessment: notRequested(), execution: 'unknown' });
          if (control === 'unavailable') return unavailable('control-unavailable');
          let permission: Permission | undefined;
          let invocationId: string | undefined;
          let decision: Decision | undefined;
          let observation: AssessmentStatus | undefined;
          let authorization: AuthorizationHandoff | undefined;
          const veto = await runtime.call({ ...invocation, ...id, cwd,
            current: () => ({ ...invocation.current(), host: id.host }),
            onDecision: result => { decision = result; },
            onAuthorization: handoff => { authorization = handoff; },
            onAssessment: (_binding, state, assessed, reason) => { observation = { status: state, reason: reason ?? assessed?.reason,
              ...(state === 'completed' && assessed?.assessmentAvailable ? { wouldDecision: assessed.wouldDecision } : {}),
              diagnostics: assessed?.diagnostics ?? [], ruleIds: assessed?.ruleIds ?? [] }; },
            onPermission: (binding, result) => { invocationId = binding.invocationId; permission = result; },
          });
          let assessment: AssessmentStatus;
          if (decision?.assessment) assessment = { status: 'completed', wouldDecision: decision.decision,
            reason: decision.reason, diagnostics: decision.diagnostics, ruleIds: decision.ruleIds };
          else if (observation) assessment = observation;
          else if (permission?.reason === 'assessment-pending') assessment = { status: 'pending', diagnostics: [], ruleIds: [] };
          else assessment = unavailableAssessment(permission?.reason ?? decision?.reason ?? 'guard-state-changed');
          const live = () => {
            try { return !entry.closed && !closed && !invocation.signal?.aborted && !!authorization?.current(); }
            catch { return false; }
          };
          const revalidate = async () => {
            if (!live()) return false;
            try { return await authorization!.revalidate() && live(); } catch { return false; }
          };
          const snapshot = (released: boolean): BeforeToolResult => immutable({ permission: released ? 'released' : 'blocked',
            reason: permission?.reason ?? decision?.reason ?? 'guard-state-changed', invocationId, assessment, execution: 'unknown' });
          let released = !veto;
          if (runtime.mode === 'enforce' && released && !await revalidate()) {
            permission = authorization?.commit(false) ?? permission; released = false;
          }
          let result = snapshot(released);
          const report = () => {
            if (!entry.closed && !closed && activation.read() === 'on') deliver({ type: 'permission', identity: id, callId: invocation.callId, result });
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
          if (entry.closed || closed || !entry.initialized || !runtime.capabilities.resultCorrelation) return { outcome: 'unknown' };
          return runtime.result({ ...result, ...id }) ?? { outcome: 'unknown' };
        },
        setHistory(history) {
          if (entry.closed || closed || !entry.initialized || !Array.isArray(history)) return;
          const readiness = runtime.coverageStatus(id).readiness;
          if (!readiness.eligible || !readiness.config || activation.refresh() !== 'on') return;
          const config = readiness.config;
          const observations = new Observations(id.sessionId, config.evidence, config.sensitiveFields, ['host-history-untrusted']);
          // Bound inspection as well as retained bytes. Count exclusions without reading them.
          const length = history.length;
          const start = Math.max(0, length - config.evidence.recentEvents);
          observations.omit(start);
          for (let index = start; index < length; index++) {
            const event = history[index];
            if (!event || !['tool-call', 'tool-result'].includes(event.kind)
              || !evidenceWithinBudget([event], config.evidence.maxBytes)) { observations.omit(); continue; }
            observations.add(`host-${event.kind}`, event.callId, event.toolName, event.data, event.timestamp ?? null);
          }
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
        observations: runtime.observationQueue.health(),
        capture: archive?.health() ?? { enabled: false, failed: 0, dropped: 0, pending: 0, drainTimeouts: 0 } });
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
