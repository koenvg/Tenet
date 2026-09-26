import { createHash, randomUUID } from 'node:crypto';
import { readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { SCHEMA_VERSION, READER_SCHEMAS, type ArchiveRecord, type HostIdentity, type RecordingIdentity, type RecordingSink, validRecord } from './contract.js';
import { directory, MAX_RECORD_BYTES, readPrivateFile, writeStageFile } from './files.js';

export function parseBbThreadId(value: unknown): string | undefined {
  return typeof value === 'string' && /^thr_[a-z0-9]{8,64}$/.test(value) ? value : undefined;
}
export interface RecordingConfig { enabled: boolean; directory: string; issue?: string }
export function recordingConfig(env: Record<string, string | undefined>): RecordingConfig {
  const path = env.TENET_RECORDING_DIR ?? join(homedir(), '.tenet', 'recordings');
  const issue = !isAbsolute(path) ? 'invalid-recording-directory'
    : env.TENET_RECORDING !== undefined && !['on', 'off'].includes(env.TENET_RECORDING) ? 'invalid-recording-setting' : undefined;
  return { enabled: env.TENET_RECORDING !== 'off' && !issue, directory: isAbsolute(path) ? resolve(path) : path, issue };
}
export const sessionKey = (id: string) => createHash('sha256').update(id).digest('hex');
/** Schema-1 hashes are permanent URLs. New keys include every identity dimension. */
export const qualifiedSessionKey = (host: string, sessionId: string, contextId: string) => sessionKey(JSON.stringify([host, sessionId, contextId]));
type Address = { schemaVersion: number; host?: string; sessionId: string; contextId?: string; invocationId: string };
export const recordSessionKey = (record: Address) => record.schemaVersion === 1 ? sessionKey(record.sessionId)
  : qualifiedSessionKey(record.host!, record.sessionId, record.contextId!);
export const recordInvocationKey = (record: Address) => record.schemaVersion === 1 ? sessionKey(record.invocationId)
  : sessionKey(JSON.stringify([record.host, record.sessionId, record.contextId, record.invocationId]));
type BoundIdentity = RecordingIdentity & ({ schemaVersion: 1; host?: never; contextId?: never } | ({ schemaVersion: 2 | 3 } & HostIdentity));
type Pending = { text: string; bytes: number; record: ArchiveRecord };
export class ArchiveWriter {
  private readonly writerId = randomUUID();
  private sequence = 0;
  private queue: Pending[] = [];
  private bytes = 0;
  private running?: Promise<void>;
  private failed = 0;
  private dropped = 0;
  private written = 0;
  private drainTimeouts = 0;
  private lossVersion = 0;
  private reportedVersion = 0;
  private lastIdentity?: BoundIdentity;
  private closed = false;
  private projects = new Map<string, Promise<string>>();
  constructor(readonly config: RecordingConfig, private limits = { events: 64, bytes: 16 * 1024 * 1024 },
    private onChange?: () => void, private persist = writeStageFile) {}
  private changed(): void { queueMicrotask(() => { try { this.onChange?.(); } catch { /* Owner UI is also best-effort. */ } }); }
  health() { return { ...this.config, failed: this.failed, dropped: this.dropped, written: this.written, pending: this.queue.length, drainTimeouts: this.drainTimeouts }; }
  private schedule(): void { this.running ??= Promise.resolve().then(() => this.flush()); }
  private loss(kind: 'failed' | 'dropped' | 'drainTimeouts'): void {
    this[kind]++; this.lossVersion++; this.changed();
  }
  private record(identity: BoundIdentity, stage: ArchiveRecord['stage'], data: Record<string, unknown>): ArchiveRecord {
    return { ...identity, writerId: this.writerId, sequence: ++this.sequence,
      eventId: randomUUID(), timestamp: Date.now(), stage, data };
  }
  bind(identity: RecordingIdentity & HostIdentity): RecordingSink {
    if (![identity.host, identity.contextId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256)
      || (identity.bbThreadId !== undefined && parseBbThreadId(identity.bbThreadId) !== identity.bbThreadId))
      throw new Error('invalid-recording-identity');
    return this.bindRecord({ ...identity, schemaVersion: SCHEMA_VERSION });
  }
  /** Explicit schema-1 path for test-only fixture subclasses; production callers use bind(). */
  protected bindRecord(identity: BoundIdentity): RecordingSink {
    const snapshot = { ...identity };
    return (stage, data) => {
      if (!this.config.enabled || this.closed) return;
      this.lastIdentity = snapshot;
      try {
        const record = this.record(snapshot, stage, data);
        const text = JSON.stringify(record), bytes = Buffer.byteLength(text);
        if (bytes > MAX_RECORD_BYTES || this.queue.length >= this.limits.events || this.bytes + bytes > this.limits.bytes) this.loss('dropped');
        else { this.queue.push({ record, text, bytes }); this.bytes += bytes; }
      } catch { this.loss('failed'); }
      // Scheduling keeps filesystem work out of the evaluator and permission path.
      this.schedule();
    };
  }
  private async write(record: ArchiveRecord, text: string): Promise<void> {
    let project = this.projects.get(record.cwd);
    if (!project) {
      project = realpath(record.cwd).catch(() => record.cwd);
      this.projects.set(record.cwd, project);
    }
    text = JSON.stringify({ ...JSON.parse(text), project: await project });
    if (Buffer.byteLength(text) > MAX_RECORD_BYTES) throw new Error('record-too-large');
    const folder = join(this.config.directory, recordSessionKey(record));
    const name = `${this.writerId}-${String(record.sequence).padStart(12, '0')}-${record.eventId}`;
    await this.persist(this.config.directory, folder, name, text);
    this.written++;
  }
  private async flush(): Promise<void> {
    for (;;) {
      while (this.queue.length) {
        const item = this.queue[0]!;
        try { await this.write(item.record, item.text); }
        catch { this.loss('failed'); }
        finally { this.queue.shift(); this.bytes -= item.bytes; this.changed(); }
      }
      // One reserved health write bypasses the full queue. Never recursively enqueue health.
      // Counts are writer-wide, not claims about the invocation used to locate this record.
      if (this.lastIdentity && this.lossVersion !== this.reportedVersion) {
        const version = this.lossVersion;
        const record = this.record(this.lastIdentity, 'health', { scope: 'writer', failed: this.failed,
          dropped: this.dropped, drainTimeouts: this.drainTimeouts, pending: this.queue.length });
        try {
          await this.write(record, JSON.stringify(record));
          this.reportedVersion = version;
          if (version !== this.lossVersion) continue;
        } catch { this.loss('failed'); /* Retry only on a later event or drain, not in a busy loop. */ }
      }
      if (!this.queue.length) break;
    }
    this.running = undefined;
    this.changed();
  }
  async drain(timeoutMs = 1000): Promise<boolean> {
    if (!this.running && this.lastIdentity && this.lossVersion !== this.reportedVersion) this.schedule();
    if (!this.running) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const drained = await Promise.race([this.running.then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
      if (!drained) this.loss('drainTimeouts');
      return drained;
    } finally { if (timer) clearTimeout(timer); }
  }
  async close(timeoutMs = 1000): Promise<boolean> { this.closed = true; return this.drain(timeoutMs); }
}
export interface ArchiveIssue { session: string | null; file: string; reason: string }
export async function readArchive(root: string, selectedSession?: string): Promise<{ records: ArchiveRecord[]; issues: ArchiveIssue[] }> {
  const records: ArchiveRecord[] = [], issues: ArchiveIssue[] = [];
  try { await directory(root); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') issues.push({ session: null, file: '', reason: 'archive-unavailable' });
    return { records, issues };
  }
  let sessions: string[];
  try { sessions = await readdir(root); }
  catch { return { records, issues: [{ session: null, file: '', reason: 'archive-unavailable' }] }; }
  for (const session of sessions) {
    if (!/^[a-f0-9]{64}$/.test(session) || (selectedSession && selectedSession !== session)) continue;
    const folder = join(root, session);
    try {
      await directory(folder);
      for (const file of await readdir(folder)) {
        if (file.endsWith('.tmp')) { issues.push({ session, file, reason: 'temporary-record' }); continue; }
        if (!file.endsWith('.json')) continue;
        let text: string;
        try { text = await readPrivateFile(root, join(folder, file)); }
        catch { issues.push({ session, file, reason: 'unsafe-or-unreadable-record' }); continue; }
        let record: unknown;
        try { record = JSON.parse(text); }
        catch { issues.push({ session, file, reason: 'corrupt-record' }); continue; }
        if (record && typeof record === 'object' && 'schemaVersion' in record && !READER_SCHEMAS.includes(record.schemaVersion as typeof READER_SCHEMAS[number])) {
          issues.push({ session, file, reason: 'unsupported-schema' }); continue;
        }
        if (!validRecord(record) || recordSessionKey(record) !== session) {
          issues.push({ session, file, reason: 'corrupt-record' }); continue;
        }
        records.push(record);
      }
    } catch { issues.push({ session, file: '', reason: 'unsafe-session-directory' }); }
  }
  records.sort((a, b) => a.writerId === b.writerId ? a.sequence - b.sequence : a.timestamp - b.timestamp || a.writerId.localeCompare(b.writerId));
  return { records, issues };
}
