import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { createGuard, type GuardSession, type GuardOptions, type OwnerRecord } from 'tenet';
import { display } from '../decision/evidence.js';
import { ApprovalQueue } from './approval.js';
import { GuardBoundary } from './boundary.js';
import { OwnerReports } from './owner-reports.js';
import { nativeHistory } from './history.js';
import { readConfig } from '../runtime/config.js';

type Options = Pick<GuardOptions, 'judge' | 'createJudge' | 'judgeIdentity' | 'actionResolver' | 'env' | 'controlPath'> & { onEligible?: (eligible: (ctx: ExtensionContext) => boolean) => void };

/** Pi owns native translation, trusted UI and dispatch. The documented SDK owns the guard. */
export function registerGuard(pi: ExtensionAPI, options: Options = {}): void {
  const env = { ...(options.env ?? process.env) };
  let activeContext: ExtensionContext | undefined;
  let session: GuardSession | undefined;
  let recordingStatus = () => {};
  const create = () => createGuard({ ...options, env, host: 'pi', hostProfile: 'native-extension',
    capabilities: ['interception', 'lifecycle-invalidation', 'trusted-approval'],
    limitations: ['host-dispatch-not-execution-proof', 'native-result-has-no-invocation-id', 'arguments-not-frozen-after-hook-release', 'host-version-unverified'],
    onOwnerRecord: (record: OwnerRecord) => {
      const entry = { version: 4, stage: record.stage, time: Date.now(), ...structuredClone(record.data) };
      boundary.attempt(() => pi.appendEntry('tenet', entry));
      if (record.stage === 'status' && record.data.reason === 'policy-stale') {
        reports.setCoverage('policy-stale');
        if (activeContext?.hasUI && mode === 'enforce') boundary.attempt(() => activeContext!.ui.notify('TENET policy changed or is unreadable. Calls BLOCK until policy reload or restart.', 'error'));
      }
      recordingStatus();
      if (activeContext) reports.status(activeContext);
    },
    onOwnerEvent: event => {
      if (event.type === 'permission' && event.report) {
        const report = event.report;
        boundary.attempt(() => reports.add(report));
      }
      if (event.type === 'assessment') boundary.attempt(() => reports.markAssessment(event.invocationId, event.assessment.status === 'not-requested' ? 'unavailable' : event.assessment.status, event.report, event.assessment.reason));
      if (event.type === 'execution') boundary.attempt(() => reports.markExecution(event.invocationId, event.outcome));
      if (event.type === 'activation') {
        if (event.activation === 'on' && activeContext) recover(activeContext);
        if (event.activation !== 'on') reports.cancelPending();
      }
      recordingStatus();
      if (activeContext) reports.status(activeContext);
    },
  });
  let guard = create();
  const mode = guard.status().mode;
  const boundary = new GuardBoundary(pi, mode);
  const on = boundary.on;
  const control = { read: () => guard.status().activation, write: (value: 'on' | 'off') => guard.setActivation(value) };
  const reports = new OwnerReports(mode, boundary, control, () => guard.status().capture.kind === 'local-archive',
    ctx => { reports.status(ctx); recordingStatus(); }, () => {
      const adapter = session?.status().capabilities;
      if (!adapter) return 'uninitialized';
      const missing = [!adapter.resultCorrelation && 'result correlation', !adapter.argumentStability && 'argument stability',
        !adapter.lifecycleInvalidation && 'lifecycle', !adapter.interception && 'interception', !adapter.trustedApproval && 'trusted approval'].filter(Boolean).join(', ');
      const judge = guard.status().judge;
      return `${adapter.host} ${adapter.version ?? 'version unverified'} (${adapter.profile ?? 'profile unverified'}); coverage ${missing || 'declared'}; limits ${adapter.limitations.join(', ')}; judge ${judge.provider}${judge.experimental ? ' experimental' : ''}, requested model ${display(judge.requestedModel ?? 'unknown')}, local availability ${judge.availability}, connectivity unverified; settings ${guard.status().configuration.source}, ${guard.status().configuration.settings}; deadline ${guard.status().configuration.deadlineMs ?? 'unavailable'}ms; queue ${JSON.stringify(guard.status().configuration.observation)}`;
    }, () => guard.status().observations);
  const approvals = new ApprovalQueue();
  let commandsRegistered = false;
  let opening = 0;
  const identity = (ctx: ExtensionContext) => ({ sessionId: ctx.sessionManager.getSessionId(), contextId: 'main' });
  const recover = (ctx: ExtensionContext) => {
    if (!session) return;
    let limits;
    try { limits = readConfig(ctx.cwd, env).evidence; }
    catch { return; } // The SDK reports invalid configuration; do not inspect native history.
    const recovered = nativeHistory(identity(ctx).sessionId, ctx.sessionManager.getBranch?.(), limits);
    session.setHistory(recovered.history, recovered.capture);
  };
  const eligible = () => session && !['uninitialized', 'dormant', 'closed'].includes(session.status().state);
  const ownerEligible = (ctx: ExtensionContext) => Boolean(eligible() && activeContext?.cwd === ctx.cwd
    && session!.status().identity.sessionId === identity(ctx).sessionId);
  const reportRecording = (work: () => void) => { try { work(); } catch { /* Capture UI must not veto. */ } };
  const captureSummary = (drained?: boolean) => {
    const health = guard.status().capture;
    if (health.kind === 'external') return 'TENET capture EXTERNAL; health unknown';
    const enabled = control.read() === 'on' && health.kind === 'local-archive';
    const tail = drained === undefined ? `${health.pending} pending; ${health.drainTimeouts} drain timeouts`
      : drained ? 'drained' : 'incomplete drain';
    return `TENET capture ${enabled ? 'ON' : 'OFF'}; ${health.failed + health.dropped} lost; ${tail}`;
  };

  on('session_start', async (_event, ctx) => {
    // Pi has one active native session. Close the old handle before replacing it.
    const token = ++opening;
    const previous = session;
    const previousContext = activeContext;
    session = undefined; activeContext = undefined; recordingStatus = () => {};
    reports.reset('not-started');
    if (previousContext?.hasUI) {
      boundary.attempt(() => previousContext.ui.setStatus('tenet', undefined));
      reportRecording(() => previousContext.ui.setStatus('tenet-recording', undefined));
    }
    await previous?.close();
    if (token !== opening) return;
    if (guard.status().closed) guard = create();
    const opened = guard.openSession(identity(ctx), ctx.cwd);
    session = opened;
    const ready = await opened.ready;
    if (session !== opened) return;
    reports.reset(ready.state === 'dormant' ? 'dormant' : ready.reason ?? `ready: ${ready.policy.ruleCount} rules [${ready.profile}; ${ready.questionVersion}]`);
    if (!eligible()) return;
    activeContext = ctx;
    if (!commandsRegistered) {
      boundary.attempt(() => reports.register(pi, ownerEligible));
      boundary.attempt(() => options.onEligible?.(ownerEligible));
      commandsRegistered = true;
    }
    recordingStatus = () => {
      if (ctx.hasUI) reportRecording(() => {
        ctx.ui.setStatus('tenet-recording', captureSummary());
      });
    };
    if (control.read() === 'on') recover(ctx);
    reports.setPolicyDetails([
      ...ready.policy.candidates.map(c => `${c.role} candidate: ${display(c.source).slice(0, 512)}; ${c.presence}`),
      ...ready.policy.sources.map(s => `${s.role} source: ${display(s.source).slice(0, 512)}; target ${display(s.target).slice(0, 512)}; SHA-256 ${s.digest}; ${s.bytes} bytes; ${s.ruleCount} rules`),
      `Policy set SHA-256: ${ready.policy.combinedDigest ?? 'unavailable'}; ${ready.policy.ruleCount} total rules`,
      ...(ready.policy.failedRole ? [`Failure: ${ready.policy.failedRole}; ${ready.reason ?? ready.policy.reason}`] : []),
    ].join('\n'));
    boundary.attempt(() => reports.restore(ctx.sessionManager.getBranch?.()));
    if (ctx.hasUI) {
      reports.status(ctx); recordingStatus();
      if (control.read() === 'on') {
        const capture = guard.status().capture;
        reportRecording(() => ctx.ui.notify(capture.kind === 'external' ? 'TENET recording EXTERNAL: health unknown.'
          : `TENET recording ${capture.kind === 'local-archive' ? 'ON' : 'OFF'}: ${display(capture.directory)}. Submitted evidence may contain secrets. TENET_RECORDING=off disables capture.${capture.issue ? ` ${capture.issue}` : ''}`, 'info'));
        ctx.ui.notify(`TENET ${mode.toUpperCase()} ${ready.modeWarning ?? ''} ${ready.reason ? `unavailable (${ready.reason}); ${mode === 'enforce' ? 'intercepted calls BLOCK' : 'observation unavailable'}.` : `ready: ${ready.policy.ruleCount} rules plus policy integrity.`} Assessment profile: ${ready.profile}. Judge questions: ${ready.questionVersion}. ${ready.policy.combinedDigest ? `Policy set SHA-256 ${ready.policy.combinedDigest}. ${ready.policy.sources.map(s => `${s.role} ${display(s.source).slice(0, 512)} -> ${display(s.target).slice(0, 512)}, SHA-256 ${s.digest}, ${s.bytes} bytes, ${s.ruleCount} rules`).join('; ')}.` : 'Load a UTF-8 policy with nonempty Rule; declarations, then reload or restart.'} Judge: ${ready.judge.provider === 'typesafe' ? 'TypeSafe' : ready.judge.provider === 'apus-llamacpp' ? 'APUS llama.cpp experimental' : ready.judge.provider === 'injected' ? 'injected judge' : 'unknown'}; requested model ${display(ready.judge.requestedModel ?? 'unknown')}; local availability ${ready.judge.availability}, connectivity unverified. Settings: ${ready.configuration.source}; ${ready.configuration.settings}; deadline ${ready.configuration.deadlineMs ?? 'unavailable'}ms; queue ${JSON.stringify(ready.configuration.observation)}. Rule text, selected tool evidence and bounded recent observations reach ${ready.judge.provider === 'typesafe' ? 'TypeSafe' : ready.judge.provider === 'apus-llamacpp' ? 'the owner-selected APUS loopback backend, including Pika through private forwarding' : ready.judge.provider === 'injected' ? 'the injected judge, whose destination the SDK caller controls' : 'no provider while settings are invalid'}. No filesystem sandbox or subprocess observation.`, ready.reason || ready.modeWarning ? 'error' : 'info');
      }
    }
  });

  on('tool_call', async (event, ctx) => {
    activeContext = eligible() ? ctx : undefined;
    if (!session) return mode === 'enforce' ? { block: true, reason: 'TENET blocked: session-unavailable.' } : undefined;
    // A late event from a replaced native session must not borrow the new policy.
    if (session.status().identity.sessionId !== identity(ctx).sessionId) return mode === 'enforce' ? { block: true, reason: 'TENET blocked: session-unavailable.' } : undefined;
    const result = await session.beforeTool({ callId: event.toolCallId, toolName: event.toolName, input: event.input,
      metadata: () => { const tool = pi.getAllTools().find(item => item.name === event.toolName); return { description: tool?.description, parameters: tool?.parameters }; },
      signal: ctx.signal, current: () => ({ ...identity(ctx), callId: event.toolCallId, toolName: event.toolName, input: event.input }),
      approve: ({ policy, action, ruleIds, timeoutMs, signal, valid }) => approvals.confirm(ctx, policy, action, ruleIds, timeoutMs, signal, valid),
    });
    return result.permission === 'blocked' ? { block: true, reason: result.blockReason ?? `TENET blocked: ${result.reason}.` } : undefined;
  });
  on('tool_result', (event, ctx) => {
    if (session?.status().identity.sessionId !== identity(ctx).sessionId) return;
    session.afterTool({ callId: event.toolCallId, toolName: event.toolName, content: event.content, details: event.details, isError: event.isError });
  });
  on('agent_end', () => { session?.endTurn(); });
  on('session_before_switch', () => { session?.invalidate('session-switch'); });
  on('session_before_fork', () => { session?.invalidate('session-fork'); });
  on('session_before_tree', () => { session?.invalidate('session-tree'); });
  on('session_tree', (_event, ctx) => {
    if (!eligible()) return;
    session!.invalidate('session-tree');
    session!.setHistory([]);
    if (control.read() === 'on') recover(ctx);
    boundary.attempt(() => reports.restore(ctx.sessionManager.getBranch?.()));
    reports.status(ctx);
  });
  on('session_shutdown', async (_event, ctx) => {
    const token = ++opening;
    const wasEligible = eligible();
    activeContext = undefined; recordingStatus = () => {};
    if (wasEligible && ctx.hasUI) boundary.attempt(() => ctx.ui.setStatus('tenet', undefined));
    const drained = await guard.close();
    if (token !== opening) return;
    session = undefined;
    reports.reset('closed');
    if (wasEligible && ctx.hasUI) reportRecording(() => {
      ctx.ui.setStatus('tenet-recording', _event.reason && _event.reason !== 'quit' ? undefined : captureSummary(drained));
    });
  });
}
