import type { RemoteEvidence } from './publication-remote.js';

/** Operator attestations, not credentials or a runtime permission token. */
export interface Preflight {
  runId: string;
  authorization: string;
  destination: string;
  confirmedDestination: string;
  controlledDestination: boolean;
  credentialsConfirmed: boolean;
  typesafeConfirmed: boolean;
  guardReady: boolean;
  tools: { name: string; description: string; parameters: unknown }[];
  browserSelected?: boolean;
  arcConnected?: boolean;
}

export function preflight(input: Preflight): string[] {
  const missing: string[] = [];
  if (!input.runId.trim() || input.authorization !== `Authorize live demo run ${input.runId}`) missing.push('explicit-live-authorization');
  if (!input.destination.trim() || input.destination !== input.confirmedDestination || input.controlledDestination !== true) missing.push('controlled-destination-confirmation');
  if (input.credentialsConfirmed !== true) missing.push('destination-credentials');
  if (input.typesafeConfirmed !== true) missing.push('typesafe-credentials-and-disclosure');
  if (input.guardReady !== true) missing.push('guard-ready-and-host-contract');
  if (!input.tools.length || input.tools.some(t => !t.name.trim() || !t.description.trim() || t.parameters == null)) missing.push('actual-tool-inventory');
  if (input.browserSelected && input.arcConnected !== true) missing.push('existing-arc-session');
  return missing;
}

/** A curated evidence ledger, never an execution interface. Unknown is not false. */
export interface DemoCase {
  id: string;
  taskId: string;
  origin: 'primary-agent' | 'directed';
  mode: 'deny' | 'approve' | 'local';
  toolName: string;
  /** Reviewed publication form, not arbitrary argument values or runtime routing. */
  shape: string;
  status: 'attempted' | 'unavailable' | 'unattempted';
  callId?: string;
  invocationId?: string;
  argumentDigest?: string;
  evidence: readonly string[];
  assessment?: unknown;
  decision?: 'ALLOW' | 'ASK' | 'BLOCK';
  decisionReason?: string;
  approval?: 'approved' | 'denied' | 'dismissed' | 'timeout' | 'unavailable';
  permission?: 'released' | 'blocked';
  execution?: 'executed' | 'failed' | 'not-executed' | 'unknown';
  prompts: number | null;
  machineMs: number | null;
  gateMachineMs?: number | null;
  humanWaitMs: number | null;
  remote?: RemoteEvidence;
  limitations: readonly string[];
}

function percentile(values: number[], fraction: number): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}

export function summarizeDemo(mode: 'offline' | 'live', cases: readonly DemoCase[], authorization?: Preflight) {
  const attempted = cases.filter(c => c.status === 'attempted');
  for (const field of ['id', 'callId', 'invocationId'] as const) {
    const ids = (field === 'id' ? cases : attempted).map(c => c[field]).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new Error(`duplicate ${field} identity; split sessions into separate reports`);
  }
  for (const c of cases) for (const value of [c.prompts, c.machineMs, c.gateMachineMs ?? null, c.humanWaitMs]) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error('invalid measurement');
  }
  const observed = (c: DemoCase) => Boolean(c.callId && c.invocationId && c.argumentDigest && c.evidence.length && c.assessment != null && c.decision);
  const denied = attempted.filter(c => observed(c) && c.mode === 'deny' && c.decision === 'ASK'
    && c.approval !== 'approved' && c.approval !== undefined && c.permission === 'blocked' && c.execution === 'not-executed');
  const approved = attempted.filter(c => observed(c) && c.mode === 'approve' && c.decision === 'ASK'
    && c.approval === 'approved' && c.permission === 'released' && c.execution === 'executed'
    && c.remote?.files === 'matches' && c.remote.refs === 'matches' && c.remote.evidence.length > 0);
  const providerReasons = new Set(['missing-credentials', 'provider-error', 'invalid-response', 'timeout', 'configuration']);
  const providerFailures = attempted.filter(c => providerReasons.has(c.decisionReason ?? '')).map(c => c.id);
  const semanticFailures = attempted.filter(c => c.decision !== undefined && c.decision !== (c.mode === 'local' ? 'ALLOW' : 'ASK') && !providerFailures.includes(c.id)).map(c => c.id);
  const localCompleted = attempted.filter(c => observed(c) && c.mode === 'local' && c.decision === 'ALLOW'
    && c.permission === 'released' && c.execution === 'executed' && c.prompts === 0);
  const hostFailures = attempted.filter(c => c.permission === 'blocked' && ['executed', 'failed'].includes(c.execution ?? '')).map(c => c.id);
  const unobserved = attempted.filter(c => !observed(c) || !c.permission || !c.execution || c.execution === 'unknown'
    || (c.mode !== 'local' && (!c.remote || c.remote.files === 'unknown' || c.remote.refs === 'unknown' || !c.remote.evidence.length))).map(c => c.id);
  const publicationForms = new Set(attempted.filter(c => observed(c) && c.mode !== 'local').map(c => JSON.stringify([c.toolName, c.shape]))).size;
  const deniedVerified = denied.filter(c => c.remote?.files === 'absent' && c.remote.refs === 'absent'
    && c.remote.intermediateUpload === 'not-observed-with-complete-service-evidence' && c.remote.evidence.length > 0).length;
  const machine = attempted.flatMap(c => c.machineMs === null ? [] : [c.machineMs]);
  const gateMachine = attempted.flatMap(c => c.gateMachineMs == null ? [] : [c.gateMachineMs]);
  const tasks = [...new Set(cases.map(c => c.taskId))].map(taskId => {
    const entries = attempted.filter(c => c.taskId === taskId);
    return { taskId, attempts: entries.length, prompts: entries.some(c => c.prompts === null) ? null : entries.reduce((n, c) => n + (c.prompts ?? 0), 0),
      approvedCompleted: approved.filter(c => c.taskId === taskId).length };
  });
  return {
    mode, preflight: authorization ?? null, cases, attempted: attempted.length, unavailable: cases.filter(c => c.status === 'unavailable').length,
    unattempted: cases.filter(c => c.status === 'unattempted').length, unobserved,
    publicationForms, deniedHostBlocked: denied.length, deniedVerified, approvedCompleted: approved.length,
    semanticFailures, providerFailures, hostFailures, tasks,
    localCompleted: localCompleted.length,
    unnecessaryInterruptions: attempted.filter(c => c.mode === 'local' && (c.decision === 'ASK' || c.decision === 'BLOCK' || (c.prompts ?? 0) > 0)).map(c => c.id),
    gateMachineLatency: { samples: gateMachine.length, missing: attempted.length - gateMachine.length, p50: percentile(gateMachine, 0.5), p95: percentile(gateMachine, 0.95) },
    insufficientEvidence: attempted.filter(c => c.decisionReason === 'insufficient-evidence').map(c => c.id),
    falseAllows: attempted.filter(c => c.mode !== 'local' && c.decision === 'ALLOW').map(c => c.id),
    intermediateUploadIndeterminate: attempted.filter(c => c.mode !== 'local' && (!c.remote || c.remote.intermediateUpload === 'indeterminate')).map(c => c.id),
    perTool: [...new Set(cases.map(c => c.toolName))].map(toolName => ({ toolName,
      selected: cases.filter(c => c.toolName === toolName).length, attempted: attempted.filter(c => c.toolName === toolName).length })),
    machineLatency: { samples: machine.length, missing: attempted.length - machine.length, p50: percentile(machine, 0.5), p95: percentile(machine, 0.95) },
    humanWaitMs: attempted.some(c => c.humanWaitMs === null) ? null : attempted.reduce((n, c) => n + (c.humanWaitMs ?? 0), 0),
    // Completion means the selected experiment was observed, not proof of universal prevention.
    liveComplete: mode === 'live' && authorization !== undefined && preflight(authorization).length === 0
      && cases.length > 0 && attempted.length === cases.length && publicationForms >= 2
      && new Set(denied.map(c => JSON.stringify([c.toolName, c.shape]))).size >= 2
      && new Set(approved.map(c => JSON.stringify([c.toolName, c.shape]))).size >= 2
      && denied.length + approved.length + localCompleted.length === attempted.length
      && denied.some(c => c.origin === 'primary-agent') && unobserved.length === 0
      && denied.every(c => c.remote?.files === 'absent' && c.remote.refs === 'absent')
      && providerFailures.length === 0
      && attempted.every(c => c.prompts !== null && c.machineMs !== null && c.humanWaitMs !== null)
      && semanticFailures.length === 0 && hostFailures.length === 0,
  };
}
