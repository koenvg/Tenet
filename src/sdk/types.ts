import type { Decision, Judge, RuleDiagnostic } from '../decision/contracts.js';
import type { Approval, ApprovalRequest, Capabilities, InvocationIdentity } from '../runtime/guard.js';
import type { ActionResolver } from '../runtime/resolved-action.js';
import type { Activation } from '../runtime/activation.js';
import type { Mode } from '../runtime/config.js';
import type { RecordingSink } from '../recording/contract.js';

export type { Judge, JudgeRequest, Assessment, RuleAssessment, Policy, Action, RuleDiagnostic, Json } from '../decision/contracts.js';
export type { Approval, ApprovalRequest, Capabilities } from '../runtime/guard.js';
export type { ActionResolver, ActionFacts, ActionBinding, ResolvedAction, OperationSemantics } from '../runtime/resolved-action.js';
export type { RecordingSink } from '../recording/contract.js';
export type { Mode } from '../runtime/config.js';
export type { Activation } from '../runtime/activation.js';

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
export interface AssessmentStatus {
  status: 'not-requested' | 'pending' | 'completed' | 'unavailable' | 'dropped' | 'cancelled';
  wouldDecision?: Decision['decision'];
  reason?: string;
  diagnostics: readonly RuleDiagnostic[];
  ruleIds: readonly string[];
}
export interface BeforeToolResult {
  permission: 'released' | 'blocked';
  reason: string;
  bypassReason?: 'off' | 'dormant';
  invocationId?: string;
  assessment: AssessmentStatus;
  /** Permission is not evidence that the host executed anything. */
  execution: 'unknown';
}
export interface SessionStatus {
  state: 'uninitialized' | 'ready' | 'dormant' | 'unavailable' | 'closed';
  reason?: string;
  identity: SessionIdentity;
  mode: Mode;
  modeWarning?: string;
  activation: Activation;
  capabilities: Capabilities;
  profile: string;
  questionVersion: string;
  policy: { source: string; digest: string | null; ruleCount: number };
}
export type OwnerEvent =
  | { type: 'permission'; identity: SessionIdentity; callId: string; result: BeforeToolResult }
  | { type: 'assessment'; identity: SessionIdentity; invocationId: string; callId: string; assessment: AssessmentStatus }
  | { type: 'execution'; identity: SessionIdentity; invocationId: string; callId: string; outcome: Execution['outcome'] }
  | { type: 'activation'; activation: Activation };
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
  /** Replaces local archive capture. The SDK owns no resources in this caller-owned sink. */
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
export interface GuardStatus {
  closed: boolean;
  sessions: number;
  mode: Mode;
  activation: Activation;
  observations: { running: number; waiting: number; retainedBytes: number; completed: number; unavailable: number;
    dropped: number; cancelled: number; limits: Readonly<{ running: number; waiting: number; bytes: number; ageMs: number }> };
  capture: { enabled: boolean; directory?: string; issue?: string; failed: number; dropped: number; pending: number; drainTimeouts: number };
}
export interface Guard {
  /** One handle per host session. Close the old handle before replacing its context. */
  openSession(identity: SessionIdentity, cwd: string): GuardSession;
  /** Cooperative owner control shared by sessions and other local Tenet processes. */
  setActivation(value: 'on' | 'off'): Promise<Activation>;
  status(): GuardStatus;
  close(): Promise<boolean>;
}
