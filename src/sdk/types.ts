import type { Decision, Judge, RuleDiagnostic as RuntimeRuleDiagnostic } from '../decision/contracts.js';
import type { Approval, ApprovalRequest, Capabilities as RuntimeCapabilities, InvocationIdentity } from '../runtime/guard.js';
import type { ActionResolver } from '../runtime/resolved-action.js';
import type { Activation } from '../runtime/activation.js';
import type { Mode } from '../runtime/config.js';
import type { RecordingSink } from '../recording/contract.js';

export type { Judge, JudgeRequest, Assessment, RuleAssessment, Policy, Action, Json } from '../decision/contracts.js';
export type { Approval, ApprovalRequest } from '../runtime/guard.js';
export type { ActionResolver, ActionFacts, ActionBinding, ResolvedAction, OperationSemantics } from '../runtime/resolved-action.js';
export type { RecordingSink } from '../recording/contract.js';
export type { Mode } from '../runtime/config.js';
export type { Activation } from '../runtime/activation.js';

export type Capabilities = Readonly<RuntimeCapabilities>;
export type Capability = 'interception' | 'result-correlation' | 'lifecycle-invalidation' | 'argument-stability' | 'trusted-approval';
export interface SessionIdentity { sessionId: string; contextId: string }
export interface CurrentInvocation extends SessionIdentity { callId: string; toolName: string; input: unknown }
export interface ToolInvocation {
  callId: string; toolName: string; input: unknown;
  metadata?: () => { description?: string; parameters?: unknown };
  signal?: AbortSignal;
  /** Reread live host identity and original arguments, not an assessed snapshot. */
  current: () => CurrentInvocation;
  /** Trusted host UI only. Never deserialize this callback from agent input. */
  approve?: (request: ApprovalRequest) => Promise<Approval>;
}
export interface ToolResult { callId: string; toolName: string; content?: unknown; details?: unknown; isError?: boolean }
export interface Execution { invocationId?: string; outcome: 'executed' | 'failed' | 'unknown' }
export interface ObservedHistory {
  kind: 'tool-call' | 'tool-result'; callId: string | null; toolName: string | null;
  data: unknown; timestamp?: number | null;
}
export type RuleDiagnostic = Readonly<Omit<RuntimeRuleDiagnostic, 'gates'>> & {
  readonly gates: readonly RuntimeRuleDiagnostic['gates'][number][];
};
interface AssessmentDetails {
  readonly reason?: string;
  readonly diagnostics: readonly RuleDiagnostic[];
  readonly ruleIds: readonly string[];
}
/** Findings only. A would-decision never grants permission to execute. */
export type AssessmentStatus = AssessmentDetails & (
  | { readonly status: 'completed'; readonly wouldDecision: Decision['decision'] }
  | { readonly status: 'not-requested' | 'pending' | 'unavailable' | 'dropped' | 'cancelled'; readonly wouldDecision?: never }
);
export interface BeforeToolResult {
  readonly permission: 'released' | 'blocked';
  readonly reason: string;
  readonly bypassReason?: 'off' | 'dormant';
  readonly invocationId?: string;
  readonly assessment: AssessmentStatus;
  /** Permission is not evidence that the host executed anything. */
  readonly execution: 'unknown';
}
export interface SessionStatus {
  readonly state: 'uninitialized' | 'ready' | 'dormant' | 'unavailable' | 'closed';
  readonly reason?: string;
  readonly identity: Readonly<SessionIdentity>;
  readonly mode: Mode;
  readonly modeWarning?: string;
  readonly activation: Activation;
  readonly capabilities: Capabilities;
  readonly profile: string;
  readonly questionVersion: string;
  readonly policy: { readonly source: string; readonly digest: string | null; readonly ruleCount: number };
}
export type OwnerEvent =
  | { readonly type: 'permission'; readonly identity: Readonly<SessionIdentity>; readonly callId: string; readonly result: BeforeToolResult }
  | { readonly type: 'assessment'; readonly identity: Readonly<SessionIdentity>; readonly invocationId: string; readonly callId: string; readonly assessment: AssessmentStatus }
  | { readonly type: 'execution'; readonly identity: Readonly<SessionIdentity>; readonly invocationId: string; readonly callId: string; readonly outcome: Execution['outcome'] }
  | { readonly type: 'activation'; readonly activation: Activation };
export interface GuardOptions {
  host: string;
  /** Only list guarantees the host actually provides. Omitted capabilities stay unsupported. */
  capabilities?: readonly Capability[];
  /** Optional verified host metadata, distinct from the assessment contract. */
  hostVersion?: string;
  hostProfile?: string;
  limitations?: readonly string[];
  /** Defaults to a snapshot of process.env. Supply a complete isolated environment in tests. */
  env?: Record<string, string | undefined>;
  judge?: Judge;
  createJudge?: () => Judge;
  actionResolver?: ActionResolver;
  controlPath?: string;
  /** Replaces local archive capture, even when TENET_RECORDING=off. External health stays unknown; the caller owns disposal. */
  bindRecording?: (identity: InvocationIdentity & SessionIdentity & { host: string; cwd: string; mode: Mode }) => RecordingSink;
  /** Owner-only. Callbacks must be bounded; never forward findings into agent history. */
  onOwnerEvent?: (event: OwnerEvent) => void;
  observationLimits?: Partial<{ running: number; waiting: number; bytes: number; ageMs: number }>;
  /** Archive drain deadline, 0 to 5000 ms. Default 1000 ms. */
  disposalTimeoutMs?: number;
}
export interface GuardSession {
  /** Initialization runs asynchronously. Before this resolves, enforcement is unavailable. */
  readonly ready: Promise<SessionStatus>;
  beforeTool(invocation: ToolInvocation): Promise<BeforeToolResult>;
  afterTool(result: ToolResult): Execution;
  setHistory(history: readonly ObservedHistory[]): void;
  endTurn(): void;
  invalidate(reason: string): void;
  status(): SessionStatus;
  close(): Promise<boolean>;
}
/** Configured recording destination, not proof of current capture or durability. */
export type CaptureStatus =
  | { readonly kind: 'local-archive' | 'disabled'; readonly directory: string; readonly issue?: string; readonly failed: number; readonly dropped: number;
      readonly written: number; readonly pending: number; readonly drainTimeouts: number }
  | { readonly kind: 'external'; readonly health: 'unknown' };
export interface GuardStatus {
  readonly closed: boolean;
  readonly sessions: number;
  readonly mode: Mode;
  readonly activation: Activation;
  readonly observations: { readonly running: number; readonly waiting: number; readonly retainedBytes: number; readonly completed: number;
    readonly unavailable: number; readonly dropped: number; readonly cancelled: number;
    readonly limits: Readonly<{ running: number; waiting: number; bytes: number; ageMs: number }> };
  readonly capture: CaptureStatus;
}
export interface Guard {
  /** One handle per host session. Close the old handle before replacing its context. */
  openSession(identity: SessionIdentity, cwd: string): GuardSession;
  /** Cooperative owner control shared by sessions and other local Tenet processes. */
  setActivation(value: 'on' | 'off'): Promise<Activation>;
  status(): GuardStatus;
  close(): Promise<boolean>;
}
