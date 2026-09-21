import { createHash, randomUUID } from 'node:crypto';
import { open, readdir, realpath, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { type ArchiveRecord, type RecordingIdentity, type RecordingSink, validRecord } from './contract.js';
import { directory, ensureArchive, MAX_RECORD_BYTES, readPrivateFile } from './files.js';

export interface RecordingConfig { enabled: boolean; directory: string; issue?: string }
export function recordingConfig(env: Record<string, string | undefined>): RecordingConfig {
  const path = env.TENET_RECORDING_DIR ?? join(homedir(), '.tenet', 'recordings');
  const issue = !isAbsolute(path) ? 'invalid-recording-directory'
    : env.TENET_RECORDING !== undefined && !['on', 'off'].includes(env.TENET_RECORDING) ? 'invalid-recording-setting' : undefined;
  return { enabled: env.TENET_RECORDING !== 'off' && !issue, directory: isAbsolute(path) ? resolve(path) : path, issue };
}
export const sessionKey = (id: string) => createHash('sha256').update(id).digest('hex');
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
  private closed = false;
  private projects = new Map<string, Promise<string>>();
  constructor(readonly config: RecordingConfig, private limits = { events: 64, bytes: 16 * 1024 * 1024 }, private onChange?: () => void) {}
  private changed(): void { queueMicrotask(() => { try { this.onChange?.(); } catch { /* Owner UI is also best-effort. */ } }); }
  health() { return { ...this.config, failed: this.failed, dropped: this.dropped, written: this.written, pending: this.queue.length }; }
  bind(identity: RecordingIdentity): RecordingSink {
    const snapshot = { ...identity };
    return (stage, data) => {
      if (!this.config.enabled || this.closed) return;
      try {
        const record: ArchiveRecord = { ...snapshot, schemaVersion: 1, writerId: this.writerId, sequence: ++this.sequence,
          eventId: randomUUID(), timestamp: Date.now(), stage, data };
        const text = JSON.stringify(record), bytes = Buffer.byteLength(text);
        if (bytes > MAX_RECORD_BYTES || this.queue.length >= this.limits.events || this.bytes + bytes > this.limits.bytes) { this.dropped++; this.changed(); return; }
        this.queue.push({ record, text, bytes }); this.bytes += bytes;
        // Scheduling keeps filesystem work out of the evaluator and permission path.
        this.running ??= Promise.resolve().then(() => this.flush());
      } catch { this.failed++; this.changed(); }
    };
  }
  private async flush(): Promise<void> {
    while (this.queue.length) {
      const item = this.queue[0]!;
      let temporary: string | undefined;
      try {
        let project = this.projects.get(item.record.cwd);
        if (!project) {
          project = realpath(item.record.cwd).catch(() => item.record.cwd);
          this.projects.set(item.record.cwd, project);
        }
        const text = JSON.stringify({ ...JSON.parse(item.text), project: await project });
        if (Buffer.byteLength(text) > MAX_RECORD_BYTES) throw new Error('record-too-large');
        await ensureArchive(this.config.directory);
        const folder = join(this.config.directory, sessionKey(item.record.sessionId));
        await directory(folder, true);
        const name = `${this.writerId}-${String(item.record.sequence).padStart(12, '0')}-${item.record.eventId}`;
        temporary = join(folder, `${name}.tmp`);
        const handle = await open(temporary, 'wx', 0o600);
        try { await handle.writeFile(text); } finally { await handle.close(); }
        await rename(temporary, join(folder, `${name}.json`));
        this.written++;
      } catch { this.failed++; }
      finally {
        if (temporary) await rm(temporary, { force: true }).catch(() => {});
        this.queue.shift(); this.bytes -= item.bytes;
        this.changed();
      }
    }
    this.running = undefined;
  }
  async drain(timeoutMs = 1000): Promise<boolean> {
    if (!this.running) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([this.running.then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  async close(): Promise<boolean> { this.closed = true; return this.drain(); }
}
export interface ArchiveIssue { session: string | null; file: string; reason: string }
export async function readArchive(root: string, selectedSession?: string): Promise<{ records: ArchiveRecord[]; issues: ArchiveIssue[] }> {
  const records: ArchiveRecord[] = [], issues: ArchiveIssue[] = [];
  try { await directory(root); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') issues.push({ session: null, file: '', reason: 'archive-unavailable' });
    return { records, issues };
  }
  for (const session of await readdir(root)) {
    if (!/^[a-f0-9]{64}$/.test(session) || (selectedSession && selectedSession !== session)) continue;
    const folder = join(root, session);
    try {
      await directory(folder);
      for (const file of await readdir(folder)) {
        if (!file.endsWith('.json')) continue;
        try {
          const record: unknown = JSON.parse(await readPrivateFile(root, join(folder, file)));
          if (!validRecord(record) || sessionKey(record.sessionId) !== session) throw new Error('invalid-record');
          records.push(record);
        } catch { issues.push({ session, file, reason: 'corrupt-unsupported-or-unsafe-record' }); }
      }
    } catch { issues.push({ session, file: '', reason: 'unsafe-session-directory' }); }
  }
  records.sort((a, b) => a.writerId === b.writerId ? a.sequence - b.sequence : a.timestamp - b.timestamp || a.writerId.localeCompare(b.writerId));
  return { records, issues };
}
