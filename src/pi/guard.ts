import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Judge } from '../decision/contracts.js';
import { QUESTION_VERSION } from '../decision/decide.js';
import { display } from '../decision/evidence.js';
import { createJevJudge } from '../decision/jev.js';
import { recoverObservations } from '../decision/trajectory.js';
import { GuardRuntime, type RuntimeIdentity } from '../runtime/guard.js';
import { ActivationStore } from '../runtime/activation.js';
import { ApprovalQueue } from './approval.js';
import { GuardBoundary } from './boundary.js';
import { OwnerReports } from './owner-reports.js';
import { ArchiveWriter, recordingConfig } from '../recording/archive.js';

/** Translate native Pi events into the shared contract. Native UI and transcript parsing stay here. */
export function registerGuard(pi: ExtensionAPI, options: { judge?: Judge; createJudge?: () => Judge; env?: Record<string, string | undefined>; controlPath?: string; onEligible?: () => void } = {}): void {
  const env = { ...(options.env ?? process.env) };
  const activation = new ActivationStore(options.controlPath);
  const reportRecording = (work: () => void) => { try { work(); } catch { /* Capture UI must not veto. */ } };
  let recordingStatus = () => {};
  const archive = new ArchiveWriter(recordingConfig(env), undefined, () => recordingStatus());
  let provider = options.judge;
  const judge: Judge = async (request, signal, recording) => {
    provider ??= options.createJudge ? options.createJudge() : createJevJudge({ apiKey: env.TYPESAFE_API_KEY });
    return provider(request, signal, recording);
  };
  const runtime = new GuardRuntime({ env, activation, judge,
    bindRecording: identity => archive.bind({ sessionId: identity.sessionId, invocationId: identity.invocationId,
      callId: identity.callId, toolName: identity.toolName, cwd: identity.cwd, mode: identity.mode }),
    emit: (stage, data) => boundary.attempt(() => pi.appendEntry('tenet', { version: 3, stage, time: Date.now(), ...data, mode: runtime.mode })),
  }, { host: 'pi', version: null, profile: 'native-extension', interception: true, resultCorrelation: false,
    lifecycleInvalidation: true, argumentStability: false, trustedApproval: true,
    limitations: ['host-dispatch-not-execution-proof', 'native-result-has-no-invocation-id', 'arguments-not-frozen-after-hook-release', 'host-version-unverified'] });
  const { mode, modeWarning } = runtime;
  const boundary = new GuardBoundary(pi, mode);
  const on = boundary.on;
  const reports = new OwnerReports(mode, boundary, activation, () => archive.health().enabled, (ctx: ExtensionContext) => {
    activation.refresh(); reports.status(ctx); recordingStatus();
  }, () => {
    const { adapter } = runtime.coverageStatus();
    const missing = [!adapter.resultCorrelation && 'result correlation', !adapter.argumentStability && 'argument stability',
      !adapter.lifecycleInvalidation && 'lifecycle', !adapter.interception && 'interception',
      !adapter.trustedApproval && 'trusted approval'].filter(Boolean).join(', ');
    return `${adapter.host} ${adapter.version ?? 'version unverified'} (${adapter.profile ?? 'profile unverified'}); coverage ${missing || 'declared'}; limits ${adapter.limitations.join(', ')}`;
  });
  const approvals = new ApprovalQueue();
  let commandsRegistered = false;
  const identity = (ctx: ExtensionContext): RuntimeIdentity => ({ host: 'pi', sessionId: ctx.sessionManager.getSessionId(), contextId: 'main' });
  const recover = (ctx: ExtensionContext) => {
    const config = runtime.readiness.config;
    if (!config) return;
    const session = identity(ctx);
    const branch = ctx.sessionManager.getBranch?.();
    const assessed = new Set<string>();
    for (const raw of branch ?? []) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw as { type?: unknown; customType?: unknown; data?: unknown };
      if (entry.type !== 'custom' || entry.customType !== 'tenet' || !entry.data || typeof entry.data !== 'object') continue;
      const data = entry.data as Record<string, unknown>;
      if (data.stage === 'permission' && data.sessionId === session.sessionId && typeof data.callId === 'string'
        && (data.mode === 'observe' || data.mode === 'enforce')) assessed.add(data.callId);
    }
    runtime.setObservations(session, recoverObservations(session.sessionId, branch, config.evidence, config.sensitiveFields, assessed));
  };

  on('session_start', async (_event, ctx) => {
    // Pi has one active native session; embedding may retain other sessions independently.
    runtime.invalidate('session-start');
    activation.close();
    const session = identity(ctx);
    const ready = await runtime.start(session, ctx.cwd, !!(options.judge || options.createJudge || env.TYPESAFE_API_KEY?.trim()));
    if (!ready || !ready.eligible) { recordingStatus = () => {}; return; }
    if (!commandsRegistered) {
      boundary.attempt(() => reports.register(pi));
      boundary.attempt(() => options.onEligible?.());
      commandsRegistered = true;
    }
    recordingStatus = () => {
      if (ctx.hasUI) reportRecording(() => {
        const health = archive.health();
        ctx.ui.setStatus('tenet-recording', `TENET capture ${activation.read() === 'on' && health.enabled ? 'ON' : 'OFF'}; ${health.failed + health.dropped} lost; ${health.pending} pending; ${health.drainTimeouts} drain timeouts`);
      });
    };
    activation.watch(value => {
      runtime.activationChanged(value);
      if (value === 'on' && runtime.readiness.config) recover(ctx);
      reports.status(ctx);
      recordingStatus();
    });
    if (activation.read() === 'on') recover(ctx);
    reports.reset(ready.unavailable ?? `ready: ${ready.ruleCount} rules [${QUESTION_VERSION}]`);
    boundary.attempt(() => reports.restore(ctx.sessionManager.getBranch?.()));
    runtime.status();
    if (ctx.hasUI) {
      reports.status(ctx);
      recordingStatus();
      if (activation.read() === 'on') {
        reportRecording(() => ctx.ui.notify(`TENET recording ${archive.config.enabled ? 'ON' : 'OFF'}: ${display(archive.config.directory)}. Submitted evidence may contain secrets. TENET_RECORDING=off disables capture.${archive.config.issue ? ` ${archive.config.issue}` : ''}`, 'info'));
        ctx.ui.notify(`TENET ${mode.toUpperCase()} ${modeWarning ?? ''} ${ready.unavailable ? `unavailable (${ready.unavailable}); ${mode === 'enforce' ? 'intercepted calls BLOCK' : 'observation unavailable'}.` : `ready: ${ready.ruleCount} rules plus policy integrity.`} Judge questions: ${QUESTION_VERSION}. ${ready.policy.available ? `Policy ${display(ready.policy.source)}, SHA-256 ${ready.policy.digest}.` : 'Load a UTF-8 policy with nonempty Rule; declarations, then reload or restart.'} Rule text, selected tool evidence and bounded recent observations reach TypeSafe. No filesystem sandbox or subprocess observation.`, ready.unavailable || modeWarning ? 'error' : 'info');
      }
    }
  });

  on('tool_call', (event, ctx) => {
    const session = identity(ctx);
    return runtime.call({ ...session, cwd: ctx.cwd, callId: event.toolCallId, toolName: event.toolName, input: event.input,
      metadata: () => { const tool = pi.getAllTools().find(item => item.name === event.toolName);
        return { description: tool?.description, parameters: tool?.parameters }; }, signal: ctx.signal,
      current: () => ({ ...identity(ctx), callId: event.toolCallId, toolName: event.toolName, input: event.input }),
      approve: ({ policy, action, ruleIds, timeoutMs, signal, valid }) => approvals.confirm(ctx, policy, action, ruleIds, timeoutMs, signal, valid),
      onPolicyStale: () => {
        if (ctx.hasUI) {
          reports.setCoverage('policy-stale'); reports.status(ctx);
          if (mode === 'enforce') ctx.ui.notify('TENET policy changed or is unreadable. Calls BLOCK until policy reload or restart.', 'error');
        }
      },
      onPermission: (id, permission) => {
        boundary.attempt(() => reports.add({ ...id, ...permission, mode }));
        recordingStatus(); reports.status(ctx);
      },
    });
  });
  on('tool_result', (event, ctx) => runtime.result({ ...identity(ctx), callId: event.toolCallId, toolName: event.toolName,
    content: event.content, details: event.details, isError: event.isError }));
  on('agent_end', () => { runtime.invalidate('agent-end'); });
  on('session_before_switch', () => { runtime.invalidate('session-switch'); });
  on('session_before_fork', () => { runtime.invalidate('session-fork'); });
  on('session_before_tree', () => { runtime.invalidate('session-tree'); });
  on('session_tree', (_event, ctx) => {
    if (!runtime.readiness.eligible) return;
    runtime.invalidate('session-tree');
    runtime.setObservations(identity(ctx), undefined);
    if (activation.refresh() === 'on') recover(ctx);
    boundary.attempt(() => reports.restore(ctx.sessionManager.getBranch?.()));
    reports.status(ctx);
  });
  on('session_shutdown', async (_event, ctx) => {
    if (!runtime.readiness.eligible) { activation.close(); return; }
    runtime.shutdown();
    activation.close();
    const drained = await archive.drain();
    if (ctx.hasUI) reportRecording(() => {
      const health = archive.health();
      ctx.ui.setStatus('tenet-recording', `TENET capture ${activation.read() === 'on' && health.enabled ? 'ON' : 'OFF'}; ${health.failed + health.dropped} lost; ${drained ? 'drained' : 'incomplete drain'}`);
    });
  });
}
