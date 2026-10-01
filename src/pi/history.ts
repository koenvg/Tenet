import type { ObservedHistory } from 'tenet';

/** Native branch translation only. Findings and consent never become tool evidence. */
export function nativeHistory(sessionId: string, branch: readonly unknown[] | undefined): ObservedHistory[] {
  const assessed = new Set<string>();
  for (const raw of branch ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as { type?: unknown; customType?: unknown; data?: unknown };
    if (entry.type !== 'custom' || entry.customType !== 'tenet' || !entry.data || typeof entry.data !== 'object') continue;
    const data = entry.data as Record<string, unknown>;
    if ((data.stage === 'permission' && typeof data.wouldDecision === 'string'
      || data.stage === 'assessment-status' && data.status === 'completed') && data.sessionId === sessionId
      && typeof data.callId === 'string' && (data.mode === 'observe' || data.mode === 'enforce')) assessed.add(data.callId);
  }
  const history: ObservedHistory[] = [];
  for (const raw of branch ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as { type?: unknown; timestamp?: unknown; message?: any };
    if (entry.type !== 'message') continue;
    const message = entry.message;
    const time = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN;
    const timestamp = Number.isFinite(time) ? time : null;
    if (message?.role === 'toolResult' && assessed.has(message.toolCallId)) {
      history.push({ kind: 'tool-result', callId: message.toolCallId, toolName: message.toolName ?? null,
        data: { content: message.content, details: message.details, isError: message.isError }, timestamp });
    }
    if (message?.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) if (block?.type === 'toolCall' && assessed.has(block.id)) {
        history.push({ kind: 'tool-call', callId: block.id, toolName: block.name ?? null, data: block.arguments, timestamp });
      }
    }
  }
  return history;
}
