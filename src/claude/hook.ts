import { lstat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { ActivationStore } from '../runtime/activation.js';
import { readMode } from '../runtime/config.js';
import { defaultDirectory, deleteLocalState, exchange, MAX_FRAME, readLocalState, writeLocalState, type BridgeRequest } from './bridge.js';

const PASS = '{}\n';
export function denial(reason: 'unavailable' | 'approval-unavailable' | 'policy'): string {
  const message = reason === 'approval-unavailable' ? 'TENET approval unavailable for this invocation.'
    : reason === 'policy' ? 'TENET denied this invocation.' : 'TENET unavailable for this invocation.';
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: message } }) + '\n';
}
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function parseHook(data: string, event: string): BridgeRequest {
  if (Buffer.byteLength(data) > MAX_FRAME || !['SessionStart', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'SubagentStop', 'SessionEnd', 'PreCompact'].includes(event)) throw new Error('invalid-event');
  const raw: unknown = JSON.parse(data);
  if (!object(raw) || raw.hook_event_name !== event || !id(raw.session_id) || typeof raw.cwd !== 'string' || !isAbsolute(raw.cwd)) throw new Error('invalid-hook');
  const contextId = raw.agent_id === undefined ? 'main' : id(raw.agent_id) ? `agent:${raw.agent_id}` : null;
  if (!contextId) throw new Error('invalid-context');
  const common = { version: 1 as const, sessionId: raw.session_id, contextId, cwd: raw.cwd };
  if (event === 'SessionStart') return { ...common, event: 'start' };
  if (event === 'SessionEnd') return { ...common, event: 'end' };
  if (event === 'PreToolUse') {
    if (!id(raw.tool_use_id) || !id(raw.tool_name) || !object(raw.tool_input)) throw new Error('invalid-call');
    return { ...common, event: 'call', callId: raw.tool_use_id, toolName: raw.tool_name, input: raw.tool_input };
  }
  if (event === 'PostToolUse' || event === 'PostToolUseFailure') {
    if (!id(raw.tool_use_id) || !id(raw.tool_name)) throw new Error('invalid-result');
    return { ...common, event: 'result', callId: raw.tool_use_id, toolName: raw.tool_name, isError: event === 'PostToolUseFailure',
      ...(Object.hasOwn(raw, 'tool_response') ? { content: raw.tool_response } : {}) };
  }
  return { ...common, event: 'invalidate' };
}
/** Only SessionStart can establish a new dormant session. Missing state never implies dormancy. */
async function eligible(cwd: string): Promise<boolean> {
  try { await lstat(join(cwd, 'TENET.md')); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ENOENT'; }
}
export async function handleHook(data: string, options: { event?: string; directory?: string; env?: Record<string, string | undefined>; deadlineMs?: number } = {}): Promise<string> {
  const env = options.env ?? process.env;
  const mode = readMode(env).mode;
  const directory = options.directory ?? defaultDirectory();
  const fail = () => mode === 'enforce' && options.event !== 'SessionStart' ? denial('unavailable') : PASS;
  try {
    if (Buffer.byteLength(data) > MAX_FRAME) throw new Error('oversize');
    const request = parseHook(data, options.event ?? (JSON.parse(data) as { hook_event_name: string }).hook_event_name);
    if (request.event === 'end') {
      await deleteLocalState(directory, request.sessionId);
      await exchange(directory, request, options.deadlineMs ?? 3300);
      return PASS;
    }
    const control = new ActivationStore(env.TENET_CONTROL_PATH).read();
    if (control === 'off' && request.event !== 'start') return PASS;
    if (control === 'unavailable') return fail();
    if (request.event === 'start') {
      const previous = await readLocalState(directory, request.sessionId).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      });
      if (previous && previous.cwd !== request.cwd) return PASS; // Conflicting session identity cannot replace its marker.
      const current = await eligible(request.cwd);
      const source = (JSON.parse(data) as { source?: unknown }).source;
      if (!previous && !current && source !== 'startup') return PASS; // Lost state or resume is not a new dormant session.
      const isEligible = previous?.eligible || current;
      const probe = !previous && isEligible ? await exchange(directory, { ...request, event: 'status' }, options.deadlineMs ?? 3300) : undefined;
      const generation = previous?.generation ?? (probe?.decision === 'pass' && probe.mode === mode ? probe.generation : undefined);
      const state = { cwd: request.cwd, eligible: isEligible, deferred: control === 'off', generation };
      await writeLocalState(directory, request.sessionId, state);
      if (!state.eligible || control === 'off' || !state.generation) return PASS;
      await exchange(directory, request, options.deadlineMs ?? 3300);
      return PASS; // SessionStart cannot block tools; pre-tool work still requires a live bridge session.
    }
    const state = await readLocalState(directory, request.sessionId);
    if (!state || state.cwd !== request.cwd) return fail();
    if (!state.eligible) return PASS;
    if (state.deferred) {
      if (request.event !== 'call') return PASS;
      const resumed = await exchange(directory, { version: 1, event: 'resume', sessionId: request.sessionId, contextId: request.contextId, cwd: request.cwd }, options.deadlineMs ?? 3300);
      if (resumed.decision !== 'pass' || resumed.mode !== mode || new ActivationStore(env.TENET_CONTROL_PATH).read() !== 'on') return fail();
      await writeLocalState(directory, request.sessionId, { cwd: state.cwd, eligible: true, deferred: false, generation: state.generation });
    }
    const response = await exchange(directory, request, options.deadlineMs ?? 3300);
    if (request.event !== 'call' || mode !== 'enforce') return PASS;
    const latestControl = new ActivationStore(env.TENET_CONTROL_PATH).read();
    if (latestControl === 'off') return mode === 'enforce' ? denial('unavailable') : PASS;
    if (latestControl === 'unavailable') return fail();
    if (response.mode !== mode) return denial('unavailable');
    if (response.decision === 'pass') return PASS;
    return denial(response.reason === 'approval-unavailable' ? 'approval-unavailable' : 'policy');
  } catch { return fail(); }
}
