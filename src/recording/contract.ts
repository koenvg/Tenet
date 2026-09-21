// Recording is a one-way diagnostic channel, never a decision input.
export const SCHEMA_VERSION = 1;
export const STAGES = ['begin', 'request', 'response', 'validation', 'assessment', 'decision', 'approval', 'permission', 'execution', 'health'] as const;
export type Stage = typeof STAGES[number];
export type RecordingSink = (stage: Stage, data: Record<string, unknown>) => void;
export interface RecordingIdentity {
  sessionId: string; invocationId: string; callId: string; toolName: string;
  cwd: string; mode: 'observe' | 'enforce';
  /** Canonical cwd captured by the writer; absent in older archives. */
  project?: string;
}
export interface ArchiveRecord extends RecordingIdentity {
  schemaVersion: 1; writerId: string; sequence: number; eventId: string;
  timestamp: number; stage: Stage; data: Record<string, unknown>;
}
export function capture(sink: RecordingSink | undefined, stage: Stage, data: () => Record<string, unknown>): void {
  try { sink?.(stage, data()); } catch { /* A diagnostic callback cannot affect the caller. */ }
}
export function responseSnapshot(value: unknown): Record<string, unknown> {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return { unavailable: true };
    const bytes = Buffer.byteLength(text);
    const limit = 1024 * 1024;
    if (bytes <= limit) return { value: JSON.parse(text), bytes, truncated: false };
    let preview = Buffer.from(text).subarray(0, limit).toString('utf8');
    while (Buffer.byteLength(preview) > limit) preview = preview.slice(0, -1);
    return { preview, bytes, truncated: true };
  } catch { return { unavailable: true }; }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validStage(r: ArchiveRecord): boolean {
  const d = r.data;
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
    case 'decision': return ['ALLOW', 'ASK', 'BLOCK'].includes(d.decision as string);
    case 'permission': return ['released', 'blocked'].includes(d.outcome as string);
    case 'execution': return ['executed', 'failed', 'unknown'].includes(d.outcome as string);
    default: return true;
  }
}
export function validRecord(value: unknown): value is ArchiveRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as ArchiveRecord;
  return r.schemaVersion === SCHEMA_VERSION && STAGES.includes(r.stage)
    && ['sessionId', 'invocationId', 'callId', 'toolName', 'cwd', 'writerId', 'eventId'].every(k => typeof (r as any)[k] === 'string' && (r as any)[k].length > 0)
    && (r.project === undefined || (typeof r.project === 'string' && r.project.length > 0))
    && /^[a-f0-9-]{36}$/.test(r.writerId) && /^[a-f0-9-]{36}$/.test(r.eventId)
    && Number.isSafeInteger(r.sequence) && r.sequence > 0 && Number.isFinite(r.timestamp)
    && ['observe', 'enforce'].includes(r.mode) && object(r.data) && validStage(r);
}
