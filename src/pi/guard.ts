import { randomUUID } from 'node:crypto';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { Action, Judge, Policy, RuleDiagnostic } from '../decision/contracts.js';
import { decide, QUESTION_VERSION } from '../decision/decide.js';
import { argumentDigest, captureAction, display } from '../decision/evidence.js';
import { createJevJudge } from '../decision/jev.js';
import { loadPolicy, policyIsCurrent } from '../decision/policy.js';
import { ApprovalQueue } from './approval.js';
import { readConfig, type GuardConfig } from './config.js';
import { Observations, recoverObservations } from '../decision/trajectory.js';

type Identity = Pick<Action, 'sessionId' | 'callId' | 'toolName' | 'argumentDigest'> & { policyDigest: string | null; invocationId: string };

export function registerGuard(pi: ExtensionAPI, options: { judge?: Judge; env?: Record<string, string | undefined> } = {}): void {
  const env = { ...(options.env ?? process.env) };
  const judge = options.judge ?? createJevJudge({ apiKey: env.TYPESAFE_API_KEY });
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
    pi.appendEntry('tenet', { version: 2, stage, time, ...data });
    if (['decision', 'approval'].includes(stage) && observations && observations.sessionId === data.sessionId) {
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

  pi.on('session_start', async (_event, ctx) => {
    invalidate('session-start');
    const starting = lifecycle;
    unavailable = 'starting';
    sessionId = ctx.sessionManager.getSessionId();
    config = undefined;
    observations = undefined;
    try {
      const loadedConfig = readConfig(ctx.cwd, env);
      const loadedPolicy = await loadPolicy(loadedConfig.policyPath);
      if (starting !== lifecycle) return;
      config = loadedConfig;
      policy = loadedPolicy;
      observations = recoverObservations(sessionId, ctx.sessionManager.getBranch?.(), config.evidence, config.sensitiveFields);
      unavailable = !policy.available ? policy.reason : !options.judge && !env.TYPESAFE_API_KEY?.trim() ? 'missing-credentials' : undefined;
    } catch {
      if (starting !== lifecycle) return;
      unavailable = 'configuration';
    }
    const ruleCount = policy.available ? policy.rules.length : 0;
    record('status', { status: unavailable ? 'unavailable' : 'ready', reason: unavailable ?? null,
      policy, ruleCount, questionVersion: QUESTION_VERSION, config: config?.decision ?? null, scope: 'configured-rules',
      evidence: config?.evidence ?? null, approvalTimeoutMs: config?.approvalTimeoutMs ?? null });
    if (ctx.hasUI) {
      ctx.ui.setStatus('tenet', `TENET ${unavailable ? `unavailable: ${unavailable}` : `ready: ${ruleCount} rules`} [${QUESTION_VERSION}]`);
      ctx.ui.notify(`TENET ${unavailable ? `unavailable (${unavailable}); intercepted calls BLOCK.` : `ready: ${ruleCount} rules plus policy integrity.`} Judge questions: ${QUESTION_VERSION}. ${policy.available ? `Policy ${display(policy.source)}, SHA-256 ${policy.digest}.` : 'Load a UTF-8 policy with nonempty Rule; declarations, then reload or restart.'} Rule text, selected tool evidence and bounded recent observations reach TypeSafe. No filesystem sandbox or subprocess observation.`, unavailable ? 'error' : 'info');
    }
  });

  pi.on('tool_call', async (event, ctx) => {
    const selectedPolicy = policy;
    const selectedConfig = config;
    const generation = lifecycle;
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, generation.signal]) : generation.signal;
    const identity: Identity = { sessionId: ctx.sessionManager.getSessionId(), callId: event.toolCallId,
      toolName: event.toolName, argumentDigest: '', policyDigest: selectedPolicy.available ? selectedPolicy.digest : null, invocationId: randomUUID() };
    const location = (id: string) => {
      const rule = selectedPolicy.available && selectedPolicy.rules.find(r => r.id === id);
      return rule ? `line ${rule.line}` : 'built-in policy integrity';
    };
    let permissionRecorded = false;
    const block = (reason: string, ruleIds: string[] = [], diagnostics: RuleDiagnostic[] = []) => {
      if (!permissionRecorded) {
        permissionRecorded = true;
        pending.delete(identity.invocationId);
        record('permission', { ...identity, outcome: 'blocked', reason, ruleIds });
      }
      const locations = selectedPolicy.available ? ruleIds.map(location) : [];
      const details = diagnostics.map(d => `${location(d.ruleId)}: ${d.gates.join(', ')}; `
        + `outcome=${d.outcome} p=${d.outcomeProbability} threshold=${d.effectThreshold}; `
        + `evidence=${d.evidence} p(SUFFICIENT)=${d.evidenceProbability} threshold=${d.evidenceThreshold}`).join('\n');
      return { block: true as const, reason: `TENET blocked: ${reason}.${locations.length ? ` Rules: ${locations.join(', ')}.` : ''}${reason === 'policy-stale' ? ' Reload or restart to load the changed policy.' : ''}${details ? `\n${details}` : ''}` };
    };
    pending.set(identity.invocationId, block);
    const current = () => !signal.aborted && generation === lifecycle && !unavailable
      && policy === selectedPolicy && ctx.sessionManager.getSessionId() === identity.sessionId && sessionId === identity.sessionId;
    try {
      if (unavailable || !selectedConfig || !selectedPolicy.available) {
        const reason = unavailable ?? 'policy-unavailable';
        record('decision', { ...identity, decision: 'BLOCK', reason, assessment: null });
        return block(reason);
      }
      if (!current()) return block('guard-state-changed');
      const callKey = key(identity.sessionId, identity.callId);
      if (seen.has(callKey)) {
        invalidate('duplicate-call-identity');
        return block('duplicate-call-identity');
      }
      seen.add(callKey);
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
      const result = await decide({ policy: selectedPolicy, action, trajectory, evidenceLimits: selectedConfig.evidence, cwd: ctx.cwd, judge, config: selectedConfig.decision, signal });
      if (!current()) return block('guard-state-changed');
      record('assessment', { ...identity, assessment: result.assessment, reason: result.reason,
        durationMs: result.durationMs, requestedModel: result.requestedModel, questionVersion: result.questionVersion,
        config: result.config, evidenceLimits: selectedConfig.evidence, redactedFields: action.redactedFields, limitations: action.limitations });
      record('decision', { ...identity, decision: result.decision, reason: result.reason, ruleIds: result.ruleIds,
        diagnostics: result.diagnostics, questionVersion: result.questionVersion });
      if (result.decision === 'BLOCK') return block(result.reason, result.ruleIds, result.diagnostics);
      const fresh = async () => {
        const fresh = await policyIsCurrent(selectedPolicy);
        if (!current()) return false;
        if (fresh) return true;
        unavailable = 'policy-stale';
        invalidate('policy-stale');
        record('status', { status: 'unavailable', reason: 'policy-stale', policyDigest: selectedPolicy.digest });
        if (ctx.hasUI) {
          ctx.ui.setStatus('tenet', `TENET unavailable: policy-stale [${QUESTION_VERSION}]`);
          ctx.ui.notify('TENET policy changed or is unreadable. Calls BLOCK until policy reload or restart.', 'error');
        }
        return false;
      };
      if (!await fresh()) return block('policy-stale');
      const unchanged = () => event.toolName === identity.toolName && event.toolCallId === identity.callId
        && argumentDigest(event.input) === action.argumentDigest;
      if (!unchanged()) return block('arguments-changed');
      if (result.decision === 'ASK') {
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
      record('permission', { ...identity, outcome: 'released' });
      permissionRecorded = true;
      pending.delete(identity.invocationId);
      released.set(key(identity.sessionId, identity.callId), identity);
      return undefined;
    } catch {
      // Never expose raw exceptions: they can contain arguments or provider response bodies.
      return block('guard-error');
    }
  });

  pi.on('tool_result', async (event, ctx) => {
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
  pi.on('agent_end', async () => { invalidate('agent-end'); });
  pi.on('session_before_switch', async () => { invalidate('session-switch'); });
  pi.on('session_before_fork', async () => { invalidate('session-fork'); });
  pi.on('session_before_tree', async () => { invalidate('session-tree'); });
  pi.on('session_tree', async (_event, ctx) => {
    invalidate('session-tree');
    observations = config ? recoverObservations(ctx.sessionManager.getSessionId(), ctx.sessionManager.getBranch?.(), config.evidence, config.sensitiveFields) : undefined;
  });
  pi.on('session_shutdown', async () => { unavailable = 'session-shutdown'; invalidate('session-shutdown'); });
}
