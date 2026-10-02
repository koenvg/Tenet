import type { HistoryCaptureMetadata, ObservedHistory } from 'tenet';
import type { EvidenceLimits } from '../decision/contracts.js';
import { historyCount } from '../decision/history-capture.js';
import { HISTORY_ADMISSION_SLOTS } from '../decision/history-groups.js';
import { historySlot, ownHistoryFields } from '../decision/history-envelope.js';

export interface NativeHistory {
  readonly history: readonly ObservedHistory[];
  readonly capture: HistoryCaptureMetadata;
}

/** One bounded native translator. Findings and consent never become tool evidence.
 * Branch entries and assistant blocks share one reverse-chronological slot budget.
 * An uninspected entry can contain unknown additional blocks or eligible events. */
export function nativeHistory(sessionId: string, branch: readonly unknown[] | undefined, limits: EvidenceLimits): NativeHistory {
  const entries = branch ?? [];
  const length = Object.getOwnPropertyDescriptor(entries, 'length')?.value;
  if (!Number.isSafeInteger(length) || length < 0) throw new Error('invalid-native-history-length');
  // Preserve known zero-history input-slot drops without inspecting eligibility or blocks.
  if (limits.recentEvents === 0) return { history: new Array(length), capture: { priorOmittedEvents: 0, admissionLimited: false } };
  const assessed = new Set<string>();
  const history: ObservedHistory[] = [];
  let remaining = HISTORY_ADMISSION_SLOTS, priorOmittedEvents = 0, admissionLimited = false;
  const identity = (id: unknown): id is string => typeof id === 'string' && id.length <= Math.floor(limits.maxBytes / 3);
  const omit = (count = 1) => { priorOmittedEvents = historyCount(priorOmittedEvents, count); };
  for (let index = length - 1; index >= 0; index--) {
    if (!remaining) { omit(index + 1); admissionLimited = true; break; }
    remaining--;
    const entry = ownHistoryFields(historySlot(entries, index), ['type', 'timestamp', 'customType', 'data', 'message']);
    if (!entry) { omit(); continue; }
    if (entry.type === 'custom' && entry.customType === 'tenet') {
      const data = ownHistoryFields(entry.data, ['stage', 'mode', 'sessionId', 'callId', 'wouldDecision', 'status']);
      if (!data) { omit(); continue; }
      if (data.sessionId === sessionId && identity(data.callId) && (data.mode === 'observe' || data.mode === 'enforce')
        && (data.stage === 'permission' && typeof data.wouldDecision === 'string'
          || data.stage === 'assessment-status' && data.status === 'completed')) assessed.add(data.callId);
      continue;
    }
    if (entry.type !== 'message') continue;
    const message = ownHistoryFields(entry.message, ['role', 'toolCallId', 'toolName', 'content', 'details', 'isError']);
    if (!message) { omit(); continue; }
    const time = typeof entry.timestamp === 'string' && entry.timestamp.length <= limits.maxBytes ? Date.parse(entry.timestamp) : NaN;
    const timestamp = Number.isFinite(time) ? time : null;
    if (message.role === 'toolResult' && identity(message.toolCallId)) {
      history.push({ kind: 'tool-result', callId: message.toolCallId, toolName: message.toolName as string ?? null,
        data: { content: message.content, details: message.details, isError: message.isError }, timestamp });
    }
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      const blocks = message.content;
      const blockLength = Object.getOwnPropertyDescriptor(blocks, 'length')?.value;
      if (!Number.isSafeInteger(blockLength) || blockLength < 0) { omit(); continue; }
      for (let blockIndex = blockLength - 1; blockIndex >= 0; blockIndex--) {
        if (!remaining) { omit(blockIndex + 1); admissionLimited = true; break; }
        remaining--;
        const block = ownHistoryFields(historySlot(blocks, blockIndex), ['type', 'id', 'name', 'arguments']);
        if (!block) { omit(); continue; }
        if (block.type === 'toolCall' && identity(block.id)) {
          history.push({ kind: 'tool-call', callId: block.id, toolName: block.name as string ?? null, data: block.arguments, timestamp });
        }
      }
    }
  }
  // Discover assessed IDs only inside the same inspected window, then filter. Never
  // scan an older prefix just to authorize recovery or normalize ineligible payloads.
  return { history: history.reverse().filter(event => assessed.has(event.callId!)), capture: { priorOmittedEvents, admissionLimited } };
}
