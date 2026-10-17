import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createGuard, type CurrentInvocation, type GuardSession, type Judge, type OwnerEvent } from 'tenet';
import { join } from 'node:path';
import { eventKey, hookInputSchema, hookResponse, limits, parseEvent, sameAction, type HookEvent } from './protocol.js';

export interface Binding {
  event: HookEvent;
  current: () => CurrentInvocation;
  controller: AbortController;
}
export interface ServiceOptions {
  root: string;
  judge: Judge;
  mode: 'observe' | 'enforce';
  onOwnerEvent?: (event: OwnerEvent) => void;
}
export interface ServiceRecord { stage: 'received' | 'completed' | 'invalid'; callId?: string; assessment?: string; permission?: string }

// Only the fixture's trusted host can register bindings. MCP callers cannot.
export function createHookService(options: ServiceOptions) {
  const ownerEvents: OwnerEvent[] = [];
  const records: ServiceRecord[] = [];
  const append = <T>(target: T[], value: T) => { target.push(value); if (target.length > limits.records) target.shift(); };
  const guard = createGuard({ host: 'mcp-hook-fixture', hostVersion: '1', hostProfile: 'offline-in-memory',
    capabilities: ['interception', 'result-correlation', 'lifecycle-invalidation'],
    limitations: ['fixture-only-not-dots', 'remote-binding-unverified', 'arguments-not-frozen-after-hook'],
    env: { TENET_MODE: options.mode, TENET_RECORDING: 'off' }, judge: options.judge,
    controlPath: join(options.root, 'control.json'), onOwnerEvent: event => {
      append(ownerEvents, event); options.onOwnerEvent?.(event);
    } });
  const sessions = new Map<string, { contextId: string; session: GuardSession; used: Set<string> }>();
  const pending = new Map<string, { binding: Binding; session: GuardSession; phase: 'registered' | 'assessing' | 'released' }>();
  let closed = false;
  const server = new Server({ name: 'tenet-offline-hook', version: '1' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ['before_tool', 'after_tool'].map(name => ({
    name, description: 'Offline fixture only; not a deployed dots integration.', inputSchema: hookInputSchema,
  })) }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      if (closed) throw new Error('hook-service-closed');
      const name = request.params.name;
      if (name !== 'before_tool' && name !== 'after_tool') throw new Error('unknown-hook');
      const event = parseEvent(request.params.arguments, name === 'before_tool' ? 'PreToolUse' : 'PostToolUse');
      const key = eventKey(event);
      const entry = pending.get(key);
      if (name === 'after_tool' && !entry) return { content: [{ type: 'text', text: '{"execution":"unknown"}' }] };
      if (!entry || !sameAction(entry.binding.event, event)) throw new Error('invalid-fixture-binding');
      if (name === 'after_tool') {
        if (entry.phase !== 'released') throw new Error('result-without-release');
        pending.delete(key);
        const execution = entry.session.afterTool({ callId: event.tool_use_id, toolName: event.tool_name, content: event.tool_response });
        return { content: [{ type: 'text', text: JSON.stringify({ execution: execution.outcome }) }] };
      }
      if (entry.phase !== 'registered') throw new Error('duplicate-invocation');
      entry.phase = 'assessing';
      append(records, { stage: 'received', callId: event.tool_use_id });
      const result = await entry.session.beforeTool({ callId: event.tool_use_id, toolName: event.tool_name, input: event.tool_input,
        current: entry.binding.current, signal: AbortSignal.any([entry.binding.controller.signal, extra.signal]) });
      append(records, { stage: 'completed', callId: event.tool_use_id, assessment: result.assessment.status, permission: result.permission });
      if (result.permission === 'released') entry.phase = 'released'; else pending.delete(key);
      return hookResponse(result.permission);
    } catch {
      append(records, { stage: 'invalid' });
      // Never echo untrusted input, provider errors, rule text or scores into tool errors.
      throw new Error('hook-request-rejected');
    }
  });
  return {
    server, ownerEvents, records,
    async register(binding: Binding) {
      if (closed) throw new Error('hook-service-closed');
      const event = parseEvent(binding.event, 'PreToolUse');
      const key = eventKey(event);
      if (pending.size >= limits.pending) throw new Error('pending-capacity');
      let context = sessions.get(event.session_id);
      if (!context) {
        if (sessions.size >= limits.sessions) throw new Error('session-capacity');
        context = { contextId: event.turn_id, session: guard.openSession({ sessionId: event.session_id, contextId: event.turn_id }, options.root), used: new Set() };
        sessions.set(event.session_id, context);
      }
      if (context.contextId !== event.turn_id) throw new Error('context-replacement-required');
      if (context.used.has(event.tool_use_id)) throw new Error('duplicate-invocation');
      if (context.used.size >= limits.attemptsPerSession) throw new Error('attempt-capacity');
      context.used.add(event.tool_use_id);
      pending.set(key, { binding: { ...binding, event }, session: context.session, phase: 'registered' });
      try {
        if ((await context.session.ready).state !== 'ready') throw new Error('fixture-session-not-ready');
      } catch (error) { pending.delete(key); throw error; }
    },
    abandon(event: HookEvent) { pending.delete(eventKey(event)); },
    async replaceContext(sessionId: string) {
      const context = sessions.get(sessionId);
      if (!context) return;
      // Revoke executor authority before awaiting teardown, including responses already in transit.
      for (const [key, entry] of pending) if (entry.binding.event.session_id === sessionId) {
        entry.binding.controller.abort();
        pending.delete(key);
      }
      context.session.invalidate('fixture-context-replaced');
      await context.session.close();
      sessions.delete(sessionId);
    },
    async close() {
      if (closed) return;
      closed = true;
      await guard.close(); pending.clear(); sessions.clear(); await server.close();
    },
  };
}
