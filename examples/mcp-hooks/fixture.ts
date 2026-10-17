import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Judge, OwnerEvent } from 'tenet';
import { eventKey, identity, limits, parseEvent, readDecision, sameAction, type HookEvent } from './protocol.js';
import { createHookService } from './service.js';
import { scriptedJudge, type Outcome } from './scripted-judge.js';

export { scriptedJudge } from './scripted-judge.js';
export interface FixtureCall { readonly event: HookEvent; readonly marker: string }
export interface FixtureOptions {
  root: string;
  outcome?: Outcome;
  judge?: Judge;
  mode?: 'observe' | 'enforce';
  onOwnerEvent?: (event: OwnerEvent) => void;
}
export type Fault = 'omit' | 'disconnect' | 'missing-handler' | 'malformed-response' | 'timeout';
export interface HostRecord {
  callId: string;
  hook: 'explicit' | 'failed' | 'omitted';
  decision: 'denied' | 'executed' | 'continued-without-assessment';
  effect: boolean;
}

// This host and its live invocation registry are a simulation, NOT a dots runtime.
export async function createHookFixture(options: FixtureOptions) {
  await writeFile(join(options.root, 'TENET.md'), 'Rule; BLOCK; fixture secret policy: require approval before writing a marker.');
  const service = createHookService({ root: options.root, mode: options.mode ?? 'enforce',
    judge: options.judge ?? scriptedJudge(options.outcome ?? 'FAIL'), onOwnerEvent: options.onOwnerEvent });
  const effects: string[] = [];
  const hostRecords: HostRecord[] = [];
  const append = <T>(target: T[], value: T) => { target.push(value); if (target.length > limits.records) target.shift(); };
  const bindings = new WeakMap<FixtureCall, { live: HookEvent; controller: AbortController; attempted: boolean }>();
  const client = new Client({ name: 'fixture-host', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try { await service.server.connect(serverTransport); await client.connect(clientTransport); }
  catch (error) { await service.close(); await client.close(); throw error; }
  let closed = false;
  let nextMarker = 0;
  return {
    client, effects, hostRecords, ownerEvents: service.ownerEvents, serviceRecords: service.records,
    async register(callId: string, sessionId = 'fixture', contextId = 'main'): Promise<FixtureCall> {
      if (closed || !identity(callId) || !identity(sessionId) || !identity(contextId)) throw new Error('invalid-fixture-identity');
      const event = parseEvent({ hook_event_name: 'PreToolUse', session_id: sessionId, turn_id: contextId,
        tool_use_id: callId, tool_name: 'fixture_write', tool_input: { command: 'write fixture marker' } }, 'PreToolUse');
      const binding = { live: structuredClone(event), controller: new AbortController(), attempted: false };
      await service.register({ event, controller: binding.controller, current: () => ({
        sessionId: binding.live.session_id, contextId: binding.live.turn_id, callId: binding.live.tool_use_id,
        toolName: binding.live.tool_name, input: structuredClone(binding.live.tool_input),
      }) });
      const call: FixtureCall = { event: structuredClone(event), marker: join(options.root, `${nextMarker++}.marker`) };
      bindings.set(call, binding);
      return call;
    },
    changeInput(call: FixtureCall, input: unknown) {
      const binding = bindings.get(call);
      if (!binding) throw new Error('unknown-fixture-call');
      binding.live.tool_input = structuredClone(input);
    },
    cancel(call: FixtureCall) {
      const binding = bindings.get(call);
      if (!binding) throw new Error('unknown-fixture-call');
      binding.controller.abort(); service.abandon(call.event);
    },
    replaceContext: (sessionId: string) => service.replaceContext(sessionId),
    async run(call: FixtureCall, simulation: { fault?: Fault; timeoutMs?: number } = {}) {
      const binding = bindings.get(call);
      if (closed || !binding || binding.attempted) throw new Error('invalid-fixture-dispatch');
      binding.attempted = true;
      let response: CallToolResult | undefined;
      let decision: 'allow' | 'deny' | undefined;
      let failed = false;
      try {
        if (simulation.fault === 'omit') throw new Error('simulated-omission');
        if (simulation.fault === 'disconnect') await client.close();
        response = await client.callTool({ name: simulation.fault === 'missing-handler' ? 'missing' : 'before_tool',
          arguments: { ...call.event } }, undefined, { timeout: simulation.timeoutMs ?? 1000 }) as CallToolResult;
        if (simulation.fault === 'malformed-response') response = { content: [{ type: 'text', text: '{' }] };
        decision = readDecision(response);
      } catch (error) {
        if (!simulation.fault) throw error;
        // Explicitly simulate the documented host failure policy, not a Tenet permission.
        failed = true;
      }
      const effect = (decision === 'allow' || failed) && !closed && !binding.controller.signal.aborted && sameAction(call.event, binding.live);
      const result: HostRecord = { callId: call.event.tool_use_id,
        hook: simulation.fault === 'omit' ? 'omitted' : failed ? 'failed' : 'explicit',
        decision: effect ? failed ? 'continued-without-assessment' : 'executed' : 'denied', effect };
      if (effect) { await writeFile(call.marker, 'fixture effect'); append(effects, eventKey(call.event)); }
      append(hostRecords, result);
      if (effect && !failed) {
        await client.callTool({ name: 'after_tool', arguments: { ...call.event, hook_event_name: 'PostToolUse', tool_response: 'fixture marker written' } });
      } else service.abandon(call.event);
      return { decision: result.decision, response };
    },
    async close() {
      if (closed) return;
      closed = true;
      await service.close(); await client.close();
    },
  };
}
