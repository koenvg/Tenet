import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export class ScriptedHost {
  agent = {};
  sessionId = "native-1";
  isIdle = true;
  listeners: Array<(event: AgentSessionEvent) => void> = [];
  persisted: unknown[] = [];

  subscribe(listener: (event: AgentSessionEvent) => void) {
    this.listeners.push(listener);
    return () => { this.listeners.splice(this.listeners.indexOf(listener), 1); };
  }
  emit(event: unknown) {
    for (const listener of this.listeners) listener(event as AgentSessionEvent);
  }
  complete(text: string, stopReason = "stop", transform?: (message: unknown) => unknown) {
    const message: Record<string, unknown> = { role: "assistant", content: [{ type: "text", text }], stopReason };
    if (transform) {
      const replacement = transform(message) as Record<string, unknown>;
      for (const key of Object.keys(message)) delete message[key];
      Object.assign(message, replacement);
    }
    this.emit({ type: "message_end", message });
    this.persisted.push(message);
  }
  dispatch(id: string, name = "bash", args: unknown = { command: "check" }, parent?: string) {
    this.emit({ type: "tool_execution_start", toolCallId: id, toolName: name, args, parentToolCallId: parent });
  }
  finish(id: string, name = "bash", parent?: string) {
    this.emit({ type: "tool_execution_end", toolCallId: id, toolName: name, parentToolCallId: parent, result: { content: [{ type: "text", text: "passed" }] }, isError: false, durationMs: 7 });
  }
  get source() { return this as unknown as AgentSession; }
}
