import type { Body, Payload, Report, Scope, WireEvent } from "./contract.js";

type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export type ExpectedScope = Readonly<Scope>;
export type ReportedObservation = Immutable<Report>;
export type Unknown = { readonly kind: "unknown"; readonly reason: string };
export type RevisionContext = Unknown | {
  readonly kind: "reported-context-only";
  readonly revision: string;
  readonly label: string;
  readonly files: readonly { readonly path: string; readonly sha256: string }[];
};
export type Observation = Immutable<Exclude<Body, { kind: "segment.opened" }> | { kind: "segment.opened"; nativeSessionId: string }>;
export interface ObservedEvent {
  readonly id: string;
  readonly sequence: number;
  readonly segment: number;
  readonly source: string;
  readonly provenance: Immutable<WireEvent["origin"]>;
  readonly authentication: "unavailable";
  readonly observation: Observation;
}
export interface CallObservation {
  readonly dispatch: string;
  readonly nativeCallId: string;
  readonly toolName: string;
  readonly parent: Unknown | { readonly kind: "observed"; readonly dispatch: string } | { readonly kind: "root" };
  readonly association: Unknown | { readonly kind: "matched"; readonly result: string };
  readonly revisionContext: RevisionContext;
  readonly executorRevision: "unavailable";
}
export interface ResultObservation {
  readonly result: string;
  readonly nativeCallId: string;
  readonly association: Unknown | { readonly kind: "matched"; readonly dispatch: string };
  readonly revisionContext: RevisionContext;
  readonly executorRevision: "unavailable";
}
export interface PermissionObservation {
  readonly response: string;
  readonly decision: "allow" | "deny" | "cancel";
  readonly association: Unknown | { readonly kind: "matched-report"; readonly request: string; readonly dispatch: string };
  readonly timing: "reported-before-result" | "after-result" | "unknown";
  readonly authorization: "unavailable";
}
export interface HandoffObservation {
  readonly assistant: string;
  readonly settlement: string;
  readonly text: string;
  readonly evidenceThrough: number;
  readonly boundary: "sdk-after-transforms-before-persistence";
}
export interface RunObservations {
  readonly scope: ExpectedScope;
  readonly events: readonly ObservedEvent[];
  readonly calls: readonly CallObservation[];
  readonly results: readonly ResultObservation[];
  readonly permissions: readonly PermissionObservation[];
  readonly handoffs: readonly HandoffObservation[];
  readonly candidates: readonly { readonly assistant: string; readonly evidenceThrough: number }[];
  readonly completion: "settled" | "interrupted" | "unknown";
  readonly coverage: readonly string[];
}
export type ReplayResult = { readonly kind: "available"; readonly view: RunObservations } | { readonly kind: "unavailable"; readonly reason: string };
export type ObserveResult = { readonly kind: "recorded"; readonly eventId: string } | { readonly kind: "rejected"; readonly reason: "closed" | "invalid-report" | "limit" | "source-changed" };
export interface Capture {
  observe(value: ReportedObservation): ObserveResult;
  close(): Uint8Array;
}
export type RetainedPayload = Immutable<Payload>;
