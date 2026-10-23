import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { LIMITS, payload, type Body, type Payload } from "./contract.js";

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("notification-shape");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value || Buffer.byteLength(value) > LIMITS.labelBytes) throw new Error("notification-label");
  return value;
}
function visible(content: unknown): Payload {
  if (!Array.isArray(content)) return { kind: "omitted", reason: "unsupported" };
  if (content.length > 128) return { kind: "omitted", reason: "nodes" };
  let output = "";
  for (const raw of content) {
    const block = record(raw);
    if (block.type === "thinking" || block.type === "toolCall") continue;
    if (block.type !== "text" || typeof block.text !== "string") return { kind: "omitted", reason: "unsupported" };
    if (output.length + block.text.length > LIMITS.payloadBytes) return { kind: "omitted", reason: "size" };
    output += block.text;
  }
  return payload(output);
}

export function project(event: AgentSessionEvent, revision: string | null): Body | undefined {
  switch (event.type) {
    case "agent_start": return { kind: "agent.started" };
    case "tool_execution_start": return {
      kind: "tool.dispatched", nativeCallId: text(event.toolCallId), toolName: text(event.toolName),
      parentNativeCallId: event.parentToolCallId === undefined ? null : text(event.parentToolCallId),
      declaredInput: payload(event.args), revision,
    };
    case "tool_execution_end": {
      if (typeof event.isError !== "boolean" || event.durationMs !== undefined && (!Number.isFinite(event.durationMs) || event.durationMs < 0)) throw new Error("notification-result");
      return {
        kind: "tool.finished", nativeCallId: text(event.toolCallId), toolName: text(event.toolName),
        parentNativeCallId: event.parentToolCallId === undefined ? null : text(event.parentToolCallId),
        result: visible(record(event.result).content), isError: event.isError, durationMs: event.durationMs ?? null,
      };
    }
    case "message_end": {
      const message = record(event.message);
      if (message.role === "toolResult") return undefined;
      if (message.role !== "assistant") return { kind: "activity.boundary", activity: "other-message" };
      if (!Array.isArray(message.content) || message.content.length > 128) throw new Error("notification-content");
      const declaredCalls: Extract<Body, { kind: "assistant.completed" }>["declaredCalls"] = [];
      for (const raw of message.content) {
        const block = record(raw);
        if (block.type === "toolCall") declaredCalls.push({ nativeCallId: text(block.id), toolName: text(block.name), declaredInput: payload(block.arguments) });
      }
      const stopReason = message.stopReason;
      if (stopReason !== "stop" && stopReason !== "pending" && stopReason !== "length" && stopReason !== "toolUse" && stopReason !== "error" && stopReason !== "aborted" && stopReason !== "deferred") throw new Error("notification-stop-reason");
      return { kind: "assistant.completed", text: visible(message.content), stopReason, declaredCalls };
    }
    case "agent_settled":
      if (typeof event.aborted !== "boolean") throw new Error("notification-settlement");
      return { kind: "run.settled", aborted: event.aborted };
    case "agent_end":
      if (typeof event.willRetry !== "boolean") throw new Error("notification-continuation");
      return event.willRetry ? { kind: "activity.boundary", activity: "retry" } : undefined;
    case "turn_end": return undefined;
    case "turn_start": return { kind: "activity.boundary", activity: "turn-start" };
    case "message_start": return { kind: "activity.boundary", activity: "message-start" };
    case "message_update": return { kind: "activity.boundary", activity: "message-update" };
    case "tool_execution_update": return { kind: "activity.boundary", activity: "tool-update" };
    case "auto_retry_start":
    case "summarization_retry_scheduled":
    case "summarization_retry_attempt_start":
    case "summarization_retry_finished": return { kind: "activity.boundary", activity: "retry" };
    case "auto_retry_end": {
      const success = event.success;
      if (typeof success !== "boolean") throw new Error("notification-retry");
      return success ? undefined : { kind: "activity.boundary", activity: "retry" };
    }
    case "compaction_start":
    case "compaction_end": return { kind: "activity.boundary", activity: "compaction" };
    case "queue_update":
      if (!Array.isArray(event.steering) || !Array.isArray(event.followUp)) throw new Error("notification-queue");
      return event.steering.length || event.followUp.length ? { kind: "activity.boundary", activity: "queue" } : undefined;
    case "bash_execution_update": return { kind: "activity.boundary", activity: "external-bash" };
    case "entry_appended": return { kind: "activity.boundary", activity: "entry" };
    case "session_info_changed":
    case "thinking_level_changed": return { kind: "activity.boundary", activity: "configuration" };
    default: {
      const unhandled: never = event;
      throw new Error(`unsupported-notification:${typeof unhandled}`);
    }
  }
}
