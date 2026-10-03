import { validEvidenceContext } from '../decision/evidence-context-contract.js';
// Recording is a one-way diagnostic channel, never a decision input.
export const SCHEMA_VERSION = 4;
// Readers preserve original payloads from historical schemas.
export const READER_SCHEMAS = [1, 2, 3, 4] as const;
export const STAGES = ['begin', 'request', 'response', 'validation', 'assessment', 'assessment-status', 'decision', 'approval', 'permission', 'execution', 'health'] as const;
export type Stage = typeof STAGES[number];
export type RecordingSink = (stage: Stage, data: Record<string, unknown>) => void;
export interface RecordingIdentity {
  sessionId: string; invocationId: string; callId: string; toolName: string;
  cwd: string; mode: 'observe' | 'enforce';
  /** Canonical cwd captured by the writer; absent in older archives. */
  project?: string;
  /** BB-provided routing hint for newly captured Pi records; never an authorization claim. */
  bbThreadId?: string;
}
export type HostIdentity = { host: string; contextId: string };
export type ArchiveRecord = RecordingIdentity & {
  writerId: string; sequence: number; eventId: string;
  timestamp: number; stage: Stage; data: Record<string, unknown>;
} & ({ schemaVersion: 1; host?: never; contextId?: never } | { schemaVersion: 2 | 3 | 4; host: string; contextId: string });
export function capture(sink: RecordingSink | undefined, stage: Stage, data: () => Record<string, unknown>): void {
  try { sink?.(stage, data()); } catch { /* A diagnostic callback cannot affect the caller. */ }
}
// Only application JSON is eligible. Never invoke toJSON/accessors or serialize Error instances.
function applicationJson(value: unknown, state: { nodes: number; omittedFields: number }, depth = 0): unknown {
  if (++state.nodes > 100000 || depth > 64) throw new Error('snapshot-limit');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) throw new Error('non-json-response');
  const entries = Object.entries(Object.getOwnPropertyDescriptors(value)).filter(([, d]) => d.enumerable);
  if (Array.isArray(value) && (entries.length !== value.length || entries.some(([key], index) => key !== String(index)))) throw new Error('non-json-array');
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, descriptor] of entries) {
    if (!Object.hasOwn(descriptor, 'value')) throw new Error('response-accessor');
    if (/^(headers|requestheaders|responseheaders|authorization|proxyauthorization|cookie|setcookie|apikey|xapikey|token|accesstoken|refreshtoken|idtoken|password|passwd|secret|clientsecret|privatekey|credentials|awsaccesskeyid|awssecretaccesskey|awssessiontoken)$/.test(key.toLowerCase().replace(/[-_\s]/g, ''))) { state.omittedFields++; continue; }
    result[key] = applicationJson(descriptor.value, state, depth + 1);
  }
  return Array.isArray(value) ? Object.values(result) : result;
}
export function responseSnapshot(value: unknown): Record<string, unknown> {
  try {
    const state = { nodes: 0, omittedFields: 0 };
    const text = JSON.stringify(applicationJson(value, state));
    const bytes = Buffer.byteLength(text);
    const limit = 1024 * 1024;
    const markers = { untrusted: true, omittedFields: state.omittedFields, bytes };
    if (bytes <= limit) return { ...markers, value: JSON.parse(text), truncated: false };
    let preview = Buffer.from(text).subarray(0, limit).toString('utf8');
    while (Buffer.byteLength(preview) > limit) preview = preview.slice(0, -1);
    return { ...markers, preview, truncated: true };
  } catch { return { untrusted: true, unavailable: true, reason: 'non-json-or-snapshot-limit' }; }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validStage(r: ArchiveRecord): boolean {
  const d = r.data;
  if (r.schemaVersion === 4 && ['request', 'assessment', 'decision', 'permission', 'assessment-status'].includes(r.stage)
    && !validEvidenceContext(d.evidenceContext)) return false;
  if (r.schemaVersion === 4 && r.stage === 'request' && d.selectionVersion !== (d.evidenceContext as { selectionVersion: string }).selectionVersion) return false;
  switch (r.stage) {
    case 'request': {
      const p = d.payload;
      const state = object(p) ? p.state : undefined;
      return object(p) && typeof p.model === 'string' && object(state) && object(p.questions)
        && ['action', 'policy', 'context', 'trajectory', 'integrity'].every(k => object(state[k]))
        && object(d.policy) && typeof d.questionVersion === 'string' && Array.isArray(d.mapping)
        && d.mapping.every(m => object(m) && ['id', 'outcomeKey', 'evidenceKey'].every(k => typeof m[k] === 'string'));
    }
    case 'response': return d.unavailable === true || (Number.isSafeInteger(d.bytes) && (d.bytes as number) >= 0
      && (d.truncated === true ? typeof d.preview === 'string' : d.truncated === false && Object.hasOwn(d, 'value')));
    case 'validation': return typeof d.valid === 'boolean';
    case 'assessment-status': return r.schemaVersion >= 3 && ['pending', 'completed', 'unavailable', 'dropped', 'cancelled'].includes(d.status as string)
      && (d.reason === undefined || (typeof d.reason === 'string' && d.reason.length <= 256))
      && (d.profile === undefined || (typeof d.profile === 'string' && d.profile.length > 0 && d.profile.length <= 128));
    case 'decision': return ['ALLOW', 'ASK', 'BLOCK'].includes(d.decision as string);
    case 'permission': return ['released', 'blocked'].includes(d.outcome as string);
    case 'execution': return ['executed', 'failed', 'unknown'].includes(d.outcome as string);
    case 'health': return d.scope === 'writer' && ['failed', 'dropped', 'drainTimeouts', 'pending']
      .every(key => Number.isSafeInteger(d[key]) && (d[key] as number) >= 0);
    default: return true;
  }
}
export function validRecord(value: unknown): value is ArchiveRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as ArchiveRecord;
  return (r.schemaVersion === 1 && r.host === undefined && r.contextId === undefined && r.bbThreadId === undefined
    || (r.schemaVersion === 2 || r.schemaVersion === 3 || r.schemaVersion === 4) && typeof r.host === 'string' && r.host.length > 0 && r.host.length <= 256
      && typeof r.contextId === 'string' && r.contextId.length > 0 && r.contextId.length <= 256
      && (r.schemaVersion === 2 ? r.bbThreadId === undefined
        : r.bbThreadId === undefined || typeof r.bbThreadId === 'string' && /^thr_[a-z0-9]{8,64}$/.test(r.bbThreadId))) && STAGES.includes(r.stage)
    && ['sessionId', 'invocationId', 'callId', 'toolName', 'cwd', 'writerId', 'eventId'].every(k => typeof (r as any)[k] === 'string' && (r as any)[k].length > 0)
    && (r.project === undefined || (typeof r.project === 'string' && r.project.length > 0))
    && /^[a-f0-9-]{36}$/.test(r.writerId) && /^[a-f0-9-]{36}$/.test(r.eventId)
    && Number.isSafeInteger(r.sequence) && r.sequence > 0 && Number.isFinite(r.timestamp)
    && ['observe', 'enforce'].includes(r.mode) && object(r.data) && validStage(r);
}
