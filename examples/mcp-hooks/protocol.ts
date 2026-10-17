import { Buffer } from 'node:buffer';
import { isDeepStrictEqual } from 'node:util';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Observed 2026-10-16. Only the local wire contract is exercised here.
export const hookSource = 'https://learn.chatgpt.com/docs/hooks#mcp-tool-hooks';
export const limits = { eventBytes: 65_536, sessions: 16, pending: 32, records: 256, attemptsPerSession: 1024 } as const;
export interface HookEvent {
  hook_event_name: 'PreToolUse' | 'PostToolUse';
  session_id: string;
  turn_id: string;
  tool_use_id: string;
  tool_name: string;
  tool_input: unknown;
  tool_response?: unknown;
}
export const identity = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
export const eventKey = (event: HookEvent) => JSON.stringify([event.session_id, event.turn_id, event.tool_use_id]);
export const sameAction = (a: HookEvent, b: HookEvent) => a.session_id === b.session_id && a.turn_id === b.turn_id
  && a.tool_use_id === b.tool_use_id && a.tool_name === b.tool_name && isDeepStrictEqual(a.tool_input, b.tool_input);

export function parseEvent(value: unknown, kind: HookEvent['hook_event_name']): HookEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-hook-input');
  const bytes = JSON.stringify(value);
  if (Buffer.byteLength(bytes) > limits.eventBytes) throw new Error('hook-input-too-large');
  const event = JSON.parse(bytes) as Record<string, unknown>;
  const allowed = ['hook_event_name', 'session_id', 'turn_id', 'tool_use_id', 'tool_name', 'tool_input',
    ...(kind === 'PostToolUse' ? ['tool_response'] : [])];
  if (Object.keys(event).some(key => !allowed.includes(key)) || event.hook_event_name !== kind
    || !['session_id', 'turn_id', 'tool_use_id', 'tool_name'].every(key => identity(event[key]))
    || !Object.hasOwn(event, 'tool_input') || kind === 'PostToolUse' && !Object.hasOwn(event, 'tool_response'))
    throw new Error('invalid-hook-input');
  return event as unknown as HookEvent;
}

export function hookResponse(permission: 'released' | 'blocked'): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'PreToolUse', permissionDecision: permission === 'blocked' ? 'deny' : 'allow',
    ...(permission === 'blocked' ? { permissionDecisionReason: 'Action blocked by policy hook.' } : {}),
  } }) }] };
}

export function readDecision(response: CallToolResult): 'allow' | 'deny' {
  if (response.isError) throw new Error('hook-tool-failed');
  const content = response.content;
  if (content.length !== 1 || content[0]?.type !== 'text') throw new Error('malformed-hook-response');
  const output = JSON.parse(content[0].text);
  const decision: unknown = output?.hookSpecificOutput?.permissionDecision;
  if (output?.hookSpecificOutput?.hookEventName !== 'PreToolUse' || decision !== 'allow' && decision !== 'deny')
    throw new Error('malformed-hook-response');
  return decision;
}

export const hookInputSchema = {
  type: 'object' as const,
  properties: { hook_event_name: { enum: ['PreToolUse', 'PostToolUse'] }, session_id: { type: 'string' },
    turn_id: { type: 'string' }, tool_use_id: { type: 'string' }, tool_name: { type: 'string' }, tool_input: {}, tool_response: {} },
  required: ['hook_event_name', 'session_id', 'turn_id', 'tool_use_id', 'tool_name', 'tool_input'], additionalProperties: false,
};
