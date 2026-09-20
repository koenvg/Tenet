import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { Action, Judge, Policy } from '../decision/contracts.js';
import { decide, QUESTION_VERSION } from '../decision/decide.js';
import { argumentDigest, captureAction, display } from '../decision/evidence.js';
import { createJevJudge } from '../decision/jev.js';
import { loadPolicy, policyIsCurrent } from '../decision/policy.js';
import { confirmRules } from './approval.js';
import { readConfig, type GuardConfig } from './config.js';

type Identity = Pick<Action, 'sessionId' | 'callId' | 'toolName' | 'argumentDigest'> & { policyDigest: string | null };

export function registerGuard(pi: ExtensionAPI, options: { judge?: Judge; env?: Record<string, string | undefined> } = {}): void {
  const env = { ...(options.env ?? process.env) };
  const judge = options.judge ?? createJevJudge({ apiKey: env.TYPESAFE_API_KEY });
  let policy: Policy = { available: false, source: '', reason: 'policy-unavailable' };
  let config: GuardConfig | undefined;
  let unavailable: string | undefined = 'not-started';
  const released = new Map<string, Identity>();
  const key = (session: string, call: string) => JSON.stringify([session, call]);
  const record = (stage: string, data: Record<string, unknown>) => pi.appendEntry('tenet', { version: 2, stage, time: Date.now(), ...data });
  const unknownOutcomes = () => {
    for (const identity of released.values()) record('execution', { ...identity, outcome: 'unknown', origin: 'no-tool-result-observed' });
    released.clear();
  };

  pi.on('session_start', async (_event, ctx) => {
    unavailable = 'starting';
    config = undefined;
    unknownOutcomes();
    try {
      config = readConfig(ctx.cwd, env);
      policy = await loadPolicy(config.policyPath);
      unavailable = !policy.available ? policy.reason : !options.judge && !env.TYPESAFE_API_KEY?.trim() ? 'missing-credentials' : undefined;
    } catch {
      unavailable = 'configuration';
    }
    const ruleCount = policy.available ? policy.rules.length : 0;
    record('status', { status: unavailable ? 'unavailable' : 'ready', reason: unavailable ?? null,
      policy, ruleCount, questionVersion: QUESTION_VERSION, config: config?.decision ?? null, scope: 'configured-rules', evidence: 'action-only' });
    if (ctx.hasUI) {
      ctx.ui.setStatus('tenet', `TENET ${unavailable ? `unavailable: ${unavailable}` : `ready: ${ruleCount} rules`} [${QUESTION_VERSION}]`);
      ctx.ui.notify(`TENET ${unavailable ? `unavailable (${unavailable}); intercepted calls BLOCK.` : `ready: ${ruleCount} rules plus policy integrity.`} Judge questions: ${QUESTION_VERSION}. ${policy.available ? `Policy ${display(policy.source)}, SHA-256 ${policy.digest}.` : 'Load a UTF-8 policy with nonempty Rule; declarations, then reload or restart.'} Rule text and selected tool evidence reach TypeSafe. No trajectory, filesystem sandbox or subprocess observation.`, unavailable ? 'error' : 'info');
    }
  });

  pi.on('tool_call', async (event, ctx) => {
    const selectedPolicy = policy;
    const identity: Identity = { sessionId: ctx.sessionManager.getSessionId(), callId: event.toolCallId,
      toolName: event.toolName, argumentDigest: '', policyDigest: selectedPolicy.available ? selectedPolicy.digest : null };
    const block = (reason: string, ruleIds: string[] = []) => {
      record('permission', { ...identity, outcome: 'blocked', reason, ruleIds });
      const locations = selectedPolicy.available ? ruleIds.map(id => {
        const rule = selectedPolicy.rules.find(r => r.id === id);
        return rule ? `line ${rule.line}` : 'built-in policy integrity';
      }) : [];
      return { block: true as const, reason: `TENET blocked: ${reason}.${locations.length ? ` Rules: ${locations.join(', ')}.` : ''}${reason === 'policy-stale' ? ' Reload or restart to load the changed policy.' : ''}` };
    };
    try {
      if (unavailable || !config || !selectedPolicy.available) {
        const reason = unavailable ?? 'policy-unavailable';
        record('decision', { ...identity, decision: 'BLOCK', reason, assessment: null });
        return block(reason);
      }
      // Refresh the complete inventory at call time. No tool family dispatch or allowlist.
      const metadata = pi.getAllTools().find(tool => tool.name === event.toolName);
      const action = captureAction({ sessionId: identity.sessionId, callId: identity.callId,
        toolName: event.toolName, arguments: event.input, description: metadata?.description,
        parameters: metadata?.parameters }, config.sensitiveFields);
      identity.argumentDigest = action.argumentDigest;
      const result = await decide({ policy: selectedPolicy, action, cwd: ctx.cwd, judge, config: config.decision, signal: ctx.signal });
      record('assessment', { ...identity, assessment: result.assessment, reason: result.reason,
        durationMs: result.durationMs, requestedModel: result.requestedModel, questionVersion: result.questionVersion,
        config: result.config, redactedFields: action.redactedFields, limitations: action.limitations });
      record('decision', { ...identity, decision: result.decision, reason: result.reason, ruleIds: result.ruleIds });
      if (result.decision === 'BLOCK') return block(result.reason, result.ruleIds);
      const fresh = async () => {
        if (await policyIsCurrent(selectedPolicy)) return true;
        if (policy === selectedPolicy) unavailable = 'policy-stale';
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
        const approval = await confirmRules(ctx, selectedPolicy, action, result.ruleIds);
        record('approval', { ...identity, outcome: approval, ruleIds: result.ruleIds });
        if (approval !== 'approved') return block(`approval-${approval}`);
      }
      if (result.decision === 'ASK' && !await fresh()) return block('policy-stale');
      if (ctx.signal?.aborted) return block('cancelled');
      if (policy !== selectedPolicy || unavailable) return block('guard-state-changed');
      if (!unchanged()) return block('arguments-changed');
      // Permission is not evidence of execution. Only tool_result records an observed outcome.
      record('permission', { ...identity, outcome: 'released' });
      released.set(key(identity.sessionId, identity.callId), identity);
      return undefined;
    } catch {
      // Never expose raw exceptions: they can contain arguments or provider response bodies.
      return block('guard-error');
    }
  });

  pi.on('tool_result', async (event, ctx) => {
    const id = key(ctx.sessionManager.getSessionId(), event.toolCallId);
    const identity = released.get(id);
    if (!identity) return;
    record('execution', { ...identity, origin: 'pi-tool-result', outcome: event.isError ? 'failed' : 'executed' });
    released.delete(id);
  });
  pi.on('agent_end', async () => { unknownOutcomes(); });
  pi.on('session_shutdown', async () => { unavailable = 'session-shutdown'; unknownOutcomes(); });
}
