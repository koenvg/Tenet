import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Action, Judge, Policy, RuleDiagnostic } from '../decision/contracts.js';
import { decide, QUESTION_VERSION } from '../decision/decide.js';
import { argumentDigest, captureAction, display } from '../decision/evidence.js';
import { createJevJudge } from '../decision/jev.js';
import { loadPolicy, policyIsCurrent, INTEGRITY_ID, INTEGRITY_TEXT } from '../decision/policy.js';
import { ruleContributions } from '../recording/rules.js';
import { ApprovalQueue } from './approval.js';
import { ActivationStore } from './activation.js';
import { readConfig, readMode, type GuardConfig } from './config.js';
import { Observations, recoverObservations } from '../decision/trajectory.js';
import { Consequences } from './consequences.js';
import { GuardBoundary } from './boundary.js';
import { OwnerReports } from './owner-reports.js';
import { ArchiveWriter, recordingConfig } from '../recording/archive.js';
import { capture, STAGES, type RecordingSink, type Stage } from '../recording/contract.js';

type Identity = Pick<Action, 'sessionId' | 'callId' | 'toolName' | 'argumentDigest'> & { policyDigest: string | null; invocationId: string };

export function registerGuard(pi: ExtensionAPI, options: { judge?: Judge; createJudge?: () => Judge; env?: Record<string, string | undefined>; controlPath?: string; onEligible?: () => void } = {}): void {
  const env = { ...(options.env ?? process.env) };
  const activation = new ActivationStore(options.controlPath);
  const reportRecording = (work: () => void) => { try { work(); } catch { /* Capture UI must not veto, even in enforce mode. */ } };
  let recordingStatus = () => {};
  const archive = new ArchiveWriter(recordingConfig(env), undefined, () => recordingStatus());
  const recordings = new Map<string, RecordingSink>();
  const { mode, warning: modeWarning } = readMode(env);
  const boundary = new GuardBoundary(pi, mode);
  const on = boundary.on;
  const reports = new OwnerReports(mode, boundary, activation, () => archive.health().enabled, (ctx: ExtensionContext) => {
    activation.refresh();
    reports.status(ctx);
    recordingStatus();
  });
  let commandsRegistered = false;
  let eligible = true; // Unknown until session_start; unknown is never a bypass.
  const localPolicyEligible = async (cwd: string): Promise<boolean> => {
    if (env.TENET_POLICY !== undefined) return true;
    try { await lstat(join(cwd, 'TENET.md')); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code !== 'ENOENT'; }
  };
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
  let loadToken = 0;
  let sessionId: string | undefined;
  const pending = new Map<string, (reason: string) => unknown>();
  // Host call IDs must be unique within a session. Retain tombstones, never grants.
  const seen = new Set<string>();
  const released = new Map<string, Identity>();
  // tool_result has no invocation/session identity. Reused IDs are ambiguous,
  // including after a switch; never guess which invocation produced a result.
  const resultCallIds = new Set<string>();
  const ambiguousResults = new Set<string>();
  const key = (session: string, call: string) => JSON.stringify([session, call]);
  const disabled = new Set<string>(); // Off calls can report results after on; never turn them into evidence.
  const recoverGuarded = (session: string, branch: readonly unknown[] | undefined, settings: GuardConfig): Observations => {
    const assessed = new Set<string>();
    for (const raw of branch ?? []) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw as { type?: unknown; customType?: unknown; data?: unknown };
      if (entry.type !== 'custom' || entry.customType !== 'tenet' || !entry.data || typeof entry.data !== 'object') continue;
      const data = entry.data as Record<string, unknown>;
      if (data.stage === 'permission' && data.sessionId === session && typeof data.callId === 'string'
        && (data.mode === 'observe' || data.mode === 'enforce')) assessed.add(data.callId);
    }
    return recoverObservations(session, branch, settings.evidence, settings.sensitiveFields, assessed);
  };
  const record = (stage: string, data: Record<string, unknown>, archiveData: Record<string, unknown> = {}) => {
    if (!eligible || activation.read() !== 'on') return;
    const time = Date.now();
    if (typeof data.invocationId === 'string' && STAGES.includes(stage as Stage)) {
      capture(recordings.get(data.invocationId), stage as Stage, () => ({ ...data, ...archiveData }));
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
    if (reason !== 'tenet-off' && reason !== 'control-unavailable') loadToken++;
    // Revoke first. Audit failures must never keep an invocation valid.
    lifecycle.abort();
    lifecycle = new AbortController();
    try {
      // Record before the old runtime is torn down and abort continuations run.
      for (const block of pending.values()) block(reason);
      if (activation.read() !== 'on') recordings.clear();
    } finally {
      unknownOutcomes();
    }
  };

  on('session_start', async (_event, ctx) => {
    invalidate('session-start');
    activation.close();
    const starting = loadToken;
    const selected = await localPolicyEligible(ctx.cwd);
    if (starting !== loadToken) return;
    eligible = selected;
    if (!eligible) {
      recordingStatus = () => {};
      config = undefined;
      observations = undefined;
      return;
    }
    if (!commandsRegistered) {
      boundary.attempt(() => reports.register(pi));
      boundary.attempt(() => options.onEligible?.());
      commandsRegistered = true;
    }
    unavailable = 'starting';
    sessionId = ctx.sessionManager.getSessionId();
    recordingStatus = () => {
      if (ctx.hasUI) reportRecording(() => {
        const health = archive.health();
        ctx.ui.setStatus('tenet-recording', `TENET capture ${activation.read() === 'on' && health.enabled ? 'ON' : 'OFF'}; ${health.failed + health.dropped} lost; ${health.pending} pending; ${health.drainTimeouts} drain timeouts`);
      });
    };
    activation.watch(value => {
      if (value !== 'on') { invalidate(value === 'off' ? 'tenet-off' : 'control-unavailable'); observations = undefined; }
      else if (config && sessionId) observations = recoverGuarded(sessionId, ctx.sessionManager.getBranch?.(), config);
      reports.status(ctx);
      recordingStatus();
    });
    config = undefined;
    observations = undefined;
    try {
      const loadedConfig = readConfig(ctx.cwd, env);
      const loadedPolicy = await loadPolicy(loadedConfig.policyPath);
      if (starting !== loadToken) return;
      config = loadedConfig;
      policy = loadedPolicy;
      observations = activation.read() === 'on' ? recoverGuarded(sessionId, ctx.sessionManager.getBranch?.(), config) : undefined;
      unavailable = !policy.available ? policy.reason : !options.judge && !options.createJudge && !env.TYPESAFE_API_KEY?.trim() ? 'missing-credentials' : undefined;
    } catch {
      if (starting !== loadToken) return;
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
      recordingStatus();
      if (activation.read() === 'on') {
        reportRecording(() => ctx.ui.notify(`TENET recording ${archive.config.enabled ? 'ON' : 'OFF'}: ${display(archive.config.directory)}. Submitted evidence may contain secrets. TENET_RECORDING=off disables capture.${archive.config.issue ? ` ${archive.config.issue}` : ''}`, 'info'));
        ctx.ui.notify(`TENET ${mode.toUpperCase()} ${modeWarning ?? ''} ${unavailable ? `unavailable (${unavailable}); ${mode === 'enforce' ? 'intercepted calls BLOCK' : 'observation unavailable'}.` : `ready: ${ruleCount} rules plus policy integrity.`} Judge questions: ${QUESTION_VERSION}. ${policy.available ? `Policy ${display(policy.source)}, SHA-256 ${policy.digest}.` : 'Load a UTF-8 policy with nonempty Rule; declarations, then reload or restart.'} Rule text, selected tool evidence and bounded recent observations reach TypeSafe. No filesystem sandbox or subprocess observation.`, unavailable || modeWarning ? 'error' : 'info');
      }
    }
  });

  on('tool_call', async (event, ctx) => {
    if (!eligible) return;
    const control = activation.refresh();
    if (control !== 'on') {
      disabled.add(key(ctx.sessionManager.getSessionId(), event.toolCallId));
      return control === 'unavailable' && mode === 'enforce' ? { block: true, reason: 'TENET blocked: control-unavailable.' } : undefined;
    }
    if (resultCallIds.has(event.toolCallId)) ambiguousResults.add(event.toolCallId);
    resultCallIds.add(event.toolCallId);
    const selectedPolicy = policy;
    const selectedConfig = config;
    const generation = lifecycle;
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, generation.signal]) : generation.signal;
    const identity: Identity = { sessionId: ctx.sessionManager.getSessionId(), callId: event.toolCallId,
      toolName: event.toolName, argumentDigest: '', policyDigest: selectedPolicy.available ? selectedPolicy.digest : null, invocationId: randomUUID() };
    const sink = archive.bind({ ...identity, cwd: ctx.cwd, mode });
    let submitted = false;
    const recording: RecordingSink = (stage, data) => {
      if (activation.read() !== 'on' || signal.aborted || generation !== lifecycle) return;
      if (stage === 'request') submitted = true;
      sink(stage, stage === 'permission' ? { ...data, requestStatus: submitted ? 'submitted' : 'not-submitted' } : data);
    };
    recordings.set(identity.invocationId, recording);
    capture(recording, 'begin', () => ({ policy: selectedPolicy, config: selectedConfig?.decision ?? null,
      integrity: { id: INTEGRITY_ID, text: INTEGRITY_TEXT },
      evidenceLimits: selectedConfig?.evidence ?? null, questionVersion: QUESTION_VERSION, request: 'not-yet-submitted' }));
    const consequences = new Consequences(mode, selectedPolicy);
    let permissionRecorded = false;
    const finish = (failure?: string, ruleIds?: string[], diagnostics?: RuleDiagnostic[]) => {
      const state = activation.refresh();
      if (state !== 'on') failure = state === 'off' ? 'tenet-off' : 'control-unavailable';
      const permission = consequences.permission(failure, ruleIds, diagnostics);
      if (!permissionRecorded) {
        permissionRecorded = true;
        pending.delete(identity.invocationId);
        if (state === 'on') {
          record('permission', { ...identity, ...permission });
          boundary.attempt(() => reports.add({ ...identity, ...permission, mode }));
          recordingStatus();
          reports.status(ctx);
          if (permission.outcome === 'released') released.set(key(identity.sessionId, identity.callId), identity);
        }
      }
      return consequences.veto(permission);
    };
    const block = (reason: string, ruleIds?: string[], diagnostics?: RuleDiagnostic[]) => {
      if (reason === 'tenet-off' || reason === 'control-unavailable') disabled.add(key(identity.sessionId, identity.callId));
      return finish(reason, ruleIds, diagnostics);
    };
    pending.set(identity.invocationId, block);
    const current = () => activation.refresh() === 'on' && !signal.aborted && generation === lifecycle && !unavailable
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
        diagnostics: result.diagnostics, questionVersion: result.questionVersion },
        { contributions: ruleContributions(result, selectedPolicy) });
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
    if (!eligible) return;
    if (activation.refresh() !== 'on' || disabled.has(key(ctx.sessionManager.getSessionId(), event.toolCallId))) return;
    if (config && observations?.sessionId === ctx.sessionManager.getSessionId()) {
      observations.add('pi-tool-result', event.toolCallId, event.toolName,
        ambiguousResults.has(event.toolCallId) ? { limitation: 'ambiguous-tool-result' }
          : { content: event.content, details: event.details, isError: event.isError });
    }
    const id = key(ctx.sessionManager.getSessionId(), event.toolCallId);
    const identity = released.get(id);
    if (!identity || identity.toolName !== event.toolName) return;
    const ambiguous = ambiguousResults.has(event.toolCallId);
    record('execution', { ...identity, origin: ambiguous ? 'ambiguous-tool-result' : 'pi-tool-result',
      outcome: ambiguous ? 'unknown' : event.isError ? 'failed' : 'executed' });
    released.delete(id);
  });
  on('agent_end', async () => { invalidate('agent-end'); });
  on('session_before_switch', async () => { invalidate('session-switch'); });
  on('session_before_fork', async () => { invalidate('session-fork'); });
  on('session_before_tree', async () => { invalidate('session-tree'); });
  on('session_tree', async (_event, ctx) => {
    if (!eligible) return;
    invalidate('session-tree');
    observations = activation.refresh() === 'on' && config ? recoverGuarded(ctx.sessionManager.getSessionId(), ctx.sessionManager.getBranch?.(), config) : undefined;
    boundary.attempt(() => reports.restore(ctx.sessionManager.getBranch?.()));
    reports.status(ctx);
  });
  on('session_shutdown', async (_event, ctx) => {
    if (!eligible) { activation.close(); return; }
    unavailable = 'session-shutdown'; invalidate('session-shutdown');
    activation.close();
    const drained = await archive.drain();
    if (ctx.hasUI) reportRecording(() => {
      const health = archive.health();
      ctx.ui.setStatus('tenet-recording', `TENET capture ${activation.read() === 'on' && health.enabled ? 'ON' : 'OFF'}; ${health.failed + health.dropped} lost; ${drained ? 'drained' : 'incomplete drain'}`);
    });
  });
}
