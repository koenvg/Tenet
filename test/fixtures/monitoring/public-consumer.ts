import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { capturePiRun, replayCapture, type ExpectedScope, type RunObservations } from "../../../src/monitoring/index.js";

export function compileOnlyConsumer(supplied: AgentSession, scope: ExpectedScope): RunObservations | undefined {
  const capture = capturePiRun(supplied, { ...scope, reporter: "compile-only" });
  capture.observe({ kind: "revision.reported", label: "selected-files", files: [] });
  const replay = replayCapture(capture.close(), scope);
  return replay.kind === "available" ? replay.view : undefined;
}
