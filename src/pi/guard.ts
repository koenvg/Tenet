import { randomUUID } from 'node:crypto';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { Action, Judge, Policy, RuleDiagnostic } from '../decision/contracts.js';
import { decide, QUESTION_VERSION } from '../decision/decide.js';
import { argumentDigest, captureAction, display } from '../decision/evidence.js';
import { createJevJudge } from '../decision/jev.js';
import { loadPolicy, policyIsCurrent } from '../decision/policy.js';
import { ApprovalQueue } from './approval.js';
import { readConfig, readMode, type GuardConfig } from './config.js';
import { Observations, recoverObservations } from '../decision/trajectory.js';
import { Consequences } from './consequences.js';
import { GuardBoundary } from './boundary.js';
import { OwnerReports } from './owner-reports.js';
import { ArchiveWriter, recordingConfig } from '../recording/archive.js';
import { capture, STAGES, type RecordingSink, type Stage } from '../recording/contract.js';

type Identity = Pick<Action, 'sessionId' | 'callId' | 'toolName' | 'argumentDigest'> & { policyDigest: string | null; invocationId: string };

export function registerGuard(pi: ExtensionAPI, options: { judge?: Judge; createJudge?: () => Judge; env?: Record<string, string | undefined> } = {}): void {
  const env = { ...(options.env ?? process.env) };
  const reportRecording = (work: () => void) => { try { work(); } catch { /* Capture UI must not veto, even in enforce mode. */ } };
  let recordingStatus = () => {};
  const archive = new ArchiveWriter(recordingConfig(env), undefined, () => recordingStatus());
  const recordings = new Map<string, RecordingSink>();
  const { mode, warning: modeWarning } = readMode(env);
  const boundary = new GuardBoundary(pi, mode);
  const on = boundary.on;
  const reports = new OwnerReports(mode, boundary);
  boundary.attempt(() => reports.register(pi));
  let provider = options.judge;
  const judge: Judge = async (request, signal, recording) => {
    provider ??= options.createJudge ? options.createJudge() : createJevJudge({ apiKey: env.TYPESAFE_API_KEY });
    return provider(request, signal, recording);
  };
  const approvals = new ApprovalQueue();
  let policy: Policy = { available: false, source: '', reason: 'policy-unavailable' };
  let config: GuardConfig | undefined;
  let unavailable: string | undefined = 'not-started';
  let observations: Observations | undefined;
  let lifecycle = new AbortController();
  let sessionId: string | undefined;
  const pending = new Map<string, (reason: string) => unknown>();
  // Host call IDs must be unique within a session. Retain tombstones, never grants.
  const seen = new Set<string>();
  const released = new Map<string, Identity>();
  const key = (session: string, call: string) => JSON.stringify([session, call]);
  const record = (stage: string, data: Record<string, unknown>) => {
    const time = Date.now();
    if (typeof data.invocationId === 'string' && STAGES.includes(stage as Stage)) {
      capture(recordings.get(data.invocationId), stage as Stage, () => data);
      if (stage === 'execution' || (stage === 'permission' && data.outcome !== 'released')) recordings.delete(data.invocationId);
    }
    boundary.attempt(() => pi.appendEntry('tenet', { version: 3, stage, time, ...data, mode }));
    if (mode === 'enforce' && ['decision', 'approval'].includes(stage) && observations && observations.sessionId === data.sessionId) {
      observations.add(`tenet-${stage}`, typeof data.callId === 'string' ? data.callId : null,
        typeof data.toolName === 'string' ? data.toolName : null, data, time);
    }
  };
  const unknownOutcomes = () => {
    const unknown = [...released.values()];
    released.clear();
    for (const identity of unknown) record('execution', { ...identity, outcome: 'unknown', origin: 'no-tool-result-observed' });
  };
  const invalidate = (reason: string) => {
    // Revoke first. Audit failures must never keep an invocation valid.
    lifecycle.abort();
    lifecycle = new AbortController();
    try {
      // Record before the old runtime is torn down and abort continuations run.
      for (const block of pending.values()) block(reason);
    } finally {
      unknownOutcomes();
    }
  };

  on('session_start', async (_event, ctx) => {
    invalidate('session-start');
    const starting = lifecycle;
    unavailable = 'starting';
    sessionId = ctx.sessionManager.getSessionId();
    recordingStatus = () => {
      if (ctx.hasUI && (archive.config.enabled || archive.config.issue)) reportRecording(() => {
        const health = archive.health();
        ctx.ui.setStatus('tenet-recording', `TENET capture ${health.enabled ? 'ON' : 'OFF'}; ${health.failed + health.dropped} lost; ${health.pending} pending`);
      });
    };
    config = undefined;
    observations = undefined;
    try {
      const loadedConfig = readConfig(ctx.cwd, env);
      const loadedPolicy = await loadPolicy(loadedConfig.policyPath);
      if (starting !== lifecycle) return;
      config = loadedConfig;
      policy = loadedPolicy;
      observations = recoverObservations(sessionId, ctx.sessionManager.getBranch?.(), config.evidence, config.sensitiveFields);
      unavailable = !policy.available ? policy.reason : !options.judge && !options.createJudge && !env.TYPESAFE_API_KEY?.trim() ? 'missing-credentials' : undefined;
    } catch {
      if (starting !== lifecycle) return;
      unavailable = 'configuration';
    }
    const ruleCount = policy.available ? policy.rules.length : 0;
    reports.reset(unavailable ?? `ready: ${ruleCount} rules [${QUESTION_VERSION}]`);
    boundary.attempt(() => reports.restore(ctx.sessionManager.getBranch?.()));
    record('status', { status: unavailable ? 'unavailable' : 'ready', reason: unavailable ?? null, modeWarning: modeWarning ?? null,
      policy, ruleCount, questionVersion: QUESTION_VERSION, config: config?.decision ?? null, scope: 'configured-rules',
      evidence: config?.evidence ?? null, approvalTimeoutMs: config?.approvalTimeoutMs ?? null });
    if (ctx.hasUI) {
      reports.status(ctx);
      reportRecording(() => ctx.ui.notify(`TENET recording ${archive.config.enabled ? 'ON' : 'OFF'}: ${display(archive.config.directory)}. Submitted evidence may contain secrets. TENET_RECORDING=off disables capture.${archive.config.issue ? ` ${archive.config.issue}` : ''}`, 'info'));
      ctx.ui.notify(`TENET ${mode.toUpperCase()} ${modeWarning ?? ''} ${unavailable ? `unavailable (${unavailable}); ${mode === 'enforce' ? 'intercepted calls BLOCK' : 'observation unavailable'}.` : `ready: ${ruleCount} rules plus policy integrity.`} Judge questions: ${QUESTION_VERSION}. ${policy.available ? `Policy ${display(policy.source)}, SHA-256 ${policy.digest}.` : 'Load a UTF-8 policy with nonempty Rule; declarations, then reload or restart.'} Rule text, selected tool evidence and bounded recent observations reach TypeSafe. No filesystem sandbox or subprocess observation.`, unavailable || modeWarning ? 'error' : 'info');
    }
  });

  on('tool_call', async (event, ctx) => {
    const selectedPolicy = policy;
    const selectedConfig = config;
    const generation = lifecycle;
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, generation.signal]) : generation.signal;
    const identity: Identity = { sessionId: ctx.sessionManager.getSessionId(), callId: event.toolCallId,
      toolName: event.toolName, argumentDigest: '', policyDigest: selectedPolicy.available ? selectedPolicy.digest : null, invocationId: randomUUID() };
    const sink = archive.bind({ ...identity, cwd: ctx.cwd, mode });
    let submitted = false;
    const recording: RecordingSink = (stage, data) => {
      if (stage === 'request') submitted = true;
      sink(stage, stage === 'permission' ? { ...data, requestStatus: submitted ? 'submitted' : 'not-submitted' } : data);
    };
    recordings.set(identity.invocationId, recording);
    capture(recording, 'begin', () => ({ policy: selectedPolicy, config: selectedConfig?.decision ?? null,
      evidenceLimits: selectedConfig?.evidence ?? null, questionVersion: QUESTION_VERSION, request: 'not-yet-submitted' }));
    const consequences = new Consequences(mode, selectedPolicy);
    let permissionRecorded = false;
    const finish = (failure?: string, ruleIds?: string[], diagnostics?: RuleDiagnostic[]) => {
      const permission = consequences.permission(failure, ruleIds, diagnostics);
      if (!permissionRecorded) {
        permissionRecorded = true;
        pending.delete(identity.invocationId);
        record('permission', { ...identity, ...permission });
        boundary.attempt(() => reports.add({ ...identity, ...permission, mode }));
        recordingStatus();
        reports.status(ctx);
        if (permission.outcome === 'released') released.set(key(identity.sessionId, identity.callId), identity);
      }
      return consequences.veto(permission);
    };
    const block = (reason: string, ruleIds?: string[], diagnostics?: RuleDiagnostic[]) => finish(reason, ruleIds, diagnostics);
    pending.set(identity.invocationId, block);
    const current = () => !signal.aborted && generation === lifecycle && !unavailable
      && policy === selectedPolicy && ctx.sessionManager.getSessionId() === identity.sessionId && sessionId === identity.sessionId;
    try {
      const callKey = key(identity.sessionId, identity.callId);
      if (seen.has(callKey)) {
        invalidate('duplicate-call-identity');
        // Preserve enforcement's unavailable reason while still disambiguating observation results.
        return block(mode === 'enforce' && unavailable ? unavailable : 'duplicate-call-identity');
      }
      seen.add(callKey);
      if (unavailable || !selectedConfig || !selectedPolicy.available) {
        const reason = unavailable ?? 'policy-unavailable';
        record('decision', { ...identity, decision: 'BLOCK', reason, assessment: null });
        return block(reason);
      }
      if (!current()) return block('guard-state-changed');
      // Refresh the complete inventory at call time. No tool family dispatch or allowlist.
      const metadata = pi.getAllTools().find(tool => tool.name === event.toolName);
      let action: Action;
      try {
        action = captureAction({ sessionId: identity.sessionId, callId: identity.callId,
          toolName: event.toolName, arguments: event.input, description: metadata?.description,
          parameters: metadata?.parameters }, selectedConfig.sensitiveFields);
      } catch {
        observations?.add('pi-tool-call', identity.callId, identity.toolName, { limitation: 'unsupported-current-action' });
        record('decision', { ...identity, decision: 'BLOCK', reason: 'insufficient-evidence', outcome: 'UNKNOWN', limitation: 'unsupported-current-action' });
        return block('insufficient-evidence');
      }
      identity.argumentDigest = action.argumentDigest;
      if (observations?.sessionId !== identity.sessionId) observations = new Observations(identity.sessionId, selectedConfig.evidence, selectedConfig.sensitiveFields, ['history-unavailable']);
      const trajectory = observations.snapshot();
      observations.add('pi-tool-call', identity.callId, identity.toolName, action);
      const result = await decide({ policy: selectedPolicy, action, trajectory, evidenceLimits: selectedConfig.evidence, cwd: ctx.cwd, judge, config: selectedConfig.decision, signal, recording });
      consequences.assessed(result);
      if (!current()) return block('guard-state-changed');
      record('assessment', { ...identity, assessment: result.assessment, reason: result.reason,
        durationMs: result.durationMs, requestedModel: result.requestedModel, questionVersion: result.questionVersion,
        config: result.config, evidenceLimits: selectedConfig.evidence, redactedFields: action.redactedFields, limitations: action.limitations });
      record('decision', { ...identity, decision: result.decision, reason: result.reason, ruleIds: result.ruleIds,
        diagnostics: result.diagnostics, questionVersion: result.questionVersion });
      const fresh = async () => {
        const fresh = await policyIsCurrent(selectedPolicy);
        if (!current()) return false;
        if (fresh) return true;
        unavailable = 'policy-stale';
        invalidate('policy-stale');
        record('status', { status: 'unavailable', reason: 'policy-stale', policyDigest: selectedPolicy.digest });
        if (ctx.hasUI) {
          reports.setCoverage('policy-stale');
          reports.status(ctx);
          if (mode === 'enforce') ctx.ui.notify('TENET policy changed or is unreadable. Calls BLOCK until policy reload or restart.', 'error');
        }
        return false;
      };
      if (!await fresh()) return block('policy-stale');
      if (result.decision === 'BLOCK') return block(result.reason, result.ruleIds, result.diagnostics);
      const unchanged = () => event.toolName === identity.toolName && event.toolCallId === identity.callId
        && argumentDigest(event.input) === action.argumentDigest;
      if (!unchanged()) return block('arguments-changed');
      if (result.decision === 'ASK' && mode === 'enforce') {
        const approval = await approvals.confirm(ctx, selectedPolicy, action, result.ruleIds, selectedConfig.approvalTimeoutMs, signal,
          async () => current() && unchanged() && await fresh() && current() && unchanged());
        if (!current()) return block('guard-state-changed');
        record('approval', { ...identity, outcome: approval, ruleIds: result.ruleIds });
        if (approval !== 'approved') return block(`approval-${approval}`);
      }
      if (result.decision === 'ASK' && !await fresh()) return block('policy-stale');
      if (!current()) return block('guard-state-changed');
      if (!unchanged()) return block('arguments-changed');
      // Permission is not evidence of execution. Only tool_result records an observed outcome.
      return finish();
    } catch {
      // Never expose raw exceptions: they can contain arguments or provider response bodies.
      return block('guard-error');
    }
  });

  on('tool_result', async (event, ctx) => {
    if (config && observations?.sessionId === ctx.sessionManager.getSessionId()) {
      observations.add('pi-tool-result', event.toolCallId, event.toolName,
        { content: event.content, details: event.details, isError: event.isError });
    }
    const id = key(ctx.sessionManager.getSessionId(), event.toolCallId);
    const identity = released.get(id);
    if (!identity || identity.toolName !== event.toolName) return;
    record('execution', { ...identity, origin: 'pi-tool-result', outcome: event.isError ? 'failed' : 'executed' });
    released.delete(id);
  });
  on('agent_end', async () => { invalidate('agent-end'); });
  on('session_before_switch', async () => { invalidate('session-switch'); });
  on('session_before_fork', async () => { invalidate('session-fork'); });
  on('session_before_tree', async () => { invalidate('session-tree'); });
  on('session_tree', async (_event, ctx) => {
    invalidate('session-tree');
    observations = config ? recoverObservations(ctx.sessionManager.getSessionId(), ctx.sessionManager.getBranch?.(), config.evidence, config.sensitiveFields) : undefined;
    boundary.attempt(() => reports.restore(ctx.sessionManager.getBranch?.()));
    reports.status(ctx);
  });
  on('session_shutdown', async (_event, ctx) => {
    unavailable = 'session-shutdown'; invalidate('session-shutdown');
    const drained = await archive.drain();
    if (ctx.hasUI) reportRecording(() => {
      const health = archive.health();
      ctx.ui.setStatus('tenet-recording', `TENET capture ${health.enabled ? 'ON' : 'OFF'}; ${health.failed + health.dropped} lost; ${drained ? 'drained' : 'incomplete drain'}`);
    });
  });
}
