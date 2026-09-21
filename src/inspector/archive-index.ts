import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type ArchiveIssue, sessionKey } from '../recording/archive.js';
import { type ArchiveRecord, validRecord } from '../recording/contract.js';
import { directory, MAX_RECORD_BYTES, readPrivateFile } from '../recording/files.js';
import { captureHealth, invocationView, type CaptureHealth } from './view.js';

export interface PageOptions { limit?: number; cursor?: string; offset?: number }
export interface InvocationSummary {
  id: string; invocationId: string; callId: string; toolName: string;
  timestamp: number; updated: number; decision: string; missing: string[];
  failure: string | null; assessmentStatus: string;
}
export interface SessionSummary {
  id: string; sessionId: string; projects: string[]; timestamp: number; started: number;
  invocations: number; concerns: number; unavailable: number; coverage: string;
}
type Metadata = Omit<ArchiveRecord, 'data'> & { decision?: string; failure: string | null; assessmentStatus: string; health?: CaptureHealth[number] };
type Entry = { fingerprint: string; bytes: number; metadata?: Metadata; issue?: ArchiveIssue };
const compare = (a: { timestamp: number; id: string }, b: { timestamp: number; id: string }) => b.timestamp - a.timestamp || a.id.localeCompare(b.id);

// Cursors contain only a sort key and a hash binding them to a query, never evidence.
function page<T extends { timestamp: number; id: string }>(rows: T[], options: PageOptions, scope: string, time = (row: T) => row.timestamp) {
  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid-page');
  let offset = options.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new Error('invalid-page');
  const keyOf = (row: T) => ({ id: row.id, timestamp: time(row) });
  rows.sort((a, b) => compare(keyOf(a), keyOf(b)));
  if (options.cursor) {
    let key: { timestamp: number; id: string; scope: string };
    try { key = JSON.parse(Buffer.from(options.cursor, 'base64url').toString()); } catch { throw new Error('invalid-page'); }
    if (!key || !Number.isFinite(key.timestamp) || !/^[a-f0-9]{64}$/.test(key.id) || key.scope !== sessionKey(scope)) throw new Error('invalid-page');
    rows = rows.filter(row => compare(keyOf(row), key) > 0); offset = 0;
  }
  const items = rows.slice(offset, offset + limit), last = items.at(-1);
  return { items, next: last && offset + limit < rows.length ? Buffer.from(JSON.stringify({ ...keyOf(last), scope: sessionKey(scope) })).toString('base64url') : null };
}

/** Rebuildable metadata-only cache. Cold indexing reads each legacy stage once,
 * sequentially; subsequent refreshes stat files, not evidence. Detail is uncached.
 * Each refresh parses at most 256 stages / 16 MiB and reports indexing gaps. */
export class ArchiveIndex {
  private entries = new Map<string, Entry>();
  private pending?: Promise<void>;
  private scanIssues: ArchiveIssue[] = [];
  indexing = false;
  constructor(private root: string, private read = readPrivateFile) {}

  refresh(): Promise<void> {
    if (!this.pending) this.pending = this.scan().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async scan(): Promise<void> {
    const found = new Map<string, Entry>();
    this.scanIssues = []; this.indexing = false;
    let budget = 256, byteBudget = 16 * 1024 * 1024;
    try {
      await directory(this.root);
      for (const session of await readdir(this.root)) {
        if (!/^[a-f0-9]{64}$/.test(session)) continue;
        const folder = join(this.root, session);
        try {
          await directory(folder);
          for (const file of await readdir(folder)) {
            if (file.endsWith('.tmp')) { this.scanIssues.push({ session, file, reason: 'temporary-record' }); continue; }
            if (!file.endsWith('.json')) continue;
            const path = join(folder, file);
            try {
              const stat = await lstat(path);
              const fingerprint = [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode, stat.uid, stat.nlink].join(':');
              const cached = this.entries.get(path);
              if (cached?.fingerprint === fingerprint) { found.set(path, cached); continue; }
              const cost = Math.min(stat.size, MAX_RECORD_BYTES);
              if (budget-- <= 0 || cost > byteBudget) { this.indexing = true; continue; }
              byteBudget -= cost;
              const entry: Entry = { fingerprint, bytes: stat.size };
              let reason = 'unsafe-or-unreadable-record';
              try {
                const text = await this.read(this.root, path);
                reason = 'corrupt-record';
                const record: unknown = JSON.parse(text);
                if (record && typeof record === 'object' && 'schemaVersion' in record && record.schemaVersion !== 1) {
                  reason = 'unsupported-schema'; throw new Error(reason);
                }
                if (!validRecord(record) || sessionKey(record.sessionId) !== session) throw new Error('invalid-record');
                const { data, ...metadata } = record;
                const summary = invocationView([record]);
                entry.metadata = { ...metadata, decision: record.stage === 'decision' ? String(data.decision) : undefined,
                  failure: summary.failure, assessmentStatus: summary.assessmentStatus, health: captureHealth([record])[0] };
              } catch { entry.issue = { session, file, reason }; }
              found.set(path, entry);
            } catch { this.scanIssues.push({ session, file, reason: 'record-unavailable' }); }
          }
        } catch { this.scanIssues.push({ session, file: '', reason: 'unsafe-session-directory' }); }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.scanIssues.push({ session: null, file: '', reason: 'archive-unavailable' });
    }
    this.entries = found;
  }
  issues(session?: string): ArchiveIssue[] {
    const issues = [...this.scanIssues, ...[...this.entries.values()].flatMap(e => e.issue ? [e.issue] : [])]
      .filter(i => !session || i.session === null || i.session === session);
    if (this.indexing) issues.push({ session: null, file: '', reason: 'indexing-in-progress' });
    return issues.length > 100 ? [...issues.slice(0, 99), { session: null, file: '', reason: 'additional-archive-issues' }] : issues;
  }
  captureHealth(session?: string): CaptureHealth {
    const latest = new Map<string, Metadata>();
    for (const entry of this.entries.values()) {
      const record = entry.metadata;
      if (!record?.health || (session && sessionKey(record.sessionId) !== session)) continue;
      if (record.sequence > (latest.get(record.writerId)?.sequence ?? 0)) latest.set(record.writerId, record);
    }
    return [...latest.values()].map(record => record.health!);
  }
  private groups(session?: string) {
    const groups = new Map<string, Metadata[]>();
    for (const entry of this.entries.values()) {
      const record = entry.metadata;
      if (!record || (session && sessionKey(record.sessionId) !== session)) continue;
      const key = session ? record.invocationId : record.sessionId;
      const group = groups.get(key) ?? []; group.push(record); groups.set(key, group);
    }
    return groups;
  }
  sessions(options: PageOptions & { project?: string } = {}) {
    const rows: SessionSummary[] = [];
    for (const [sessionId, records] of this.groups()) {
      const projects = [...new Set(records.map(r => r.project ?? r.cwd))].sort();
      if (options.project && !projects.includes(options.project)) continue;
      const decisions = new Map<string, string>();
      let timestamp = -Infinity, started = Infinity;
      for (const record of records) {
        timestamp = Math.max(timestamp, record.timestamp); started = Math.min(started, record.timestamp);
        if (!decisions.has(record.invocationId) || record.decision) decisions.set(record.invocationId, record.decision ?? 'unavailable');
      }
      rows.push({ id: sessionKey(sessionId), sessionId, projects, timestamp, started, invocations: decisions.size,
        concerns: [...decisions.values()].filter(d => d === 'ASK' || d === 'BLOCK').length,
        unavailable: [...decisions.values()].filter(d => d === 'unavailable').length, coverage: 'best-effort' });
    }
    // Resume updates the visible timestamp, not the pagination position.
    return page(rows, options, `sessions:${options.project ?? ''}`, row => row.started);
  }
  invocations(session: string, options: PageOptions = {}) {
    const rows: InvocationSummary[] = [];
    for (const [invocationId, records] of this.groups(session)) {
      records.sort((a, b) => a.writerId === b.writerId ? a.sequence - b.sequence : a.timestamp - b.timestamp || a.eventId.localeCompare(b.eventId));
      const first = records[0]!;
      const failure = ['assessment', 'decision', 'validation', 'permission']
        .map(stage => records.findLast(r => r.stage === stage)?.failure).find(Boolean) ?? null;
      const assessmentStatus = failure ? 'failed' : records.some(r => r.assessmentStatus === 'validated') ? 'validated' : 'incomplete';
      rows.push({ id: sessionKey(invocationId), invocationId, callId: first.callId, toolName: first.toolName,
        timestamp: first.timestamp, updated: records.reduce((latest, r) => Math.max(latest, r.timestamp), first.timestamp),
        decision: records.find(r => r.decision)?.decision ?? 'unavailable',
        failure, assessmentStatus,
        missing: ['begin', 'request', 'response', 'validation', 'assessment', 'decision', 'permission', 'execution'].filter(s => !records.some(r => r.stage === s)) });
    }
    return page(rows, options, `invocations:${session}`);
  }
  async detail(session: string, invocation: string) {
    const records: ArchiveRecord[] = [], issues = this.issues(session);
    let bytes = 0, count = 0;
    for (const [path, entry] of this.entries) {
      const metadata = entry.metadata;
      if (!metadata || sessionKey(metadata.sessionId) !== session || sessionKey(metadata.invocationId) !== invocation) continue;
      if (++count > 64 || (bytes += entry.bytes) > 16 * 1024 * 1024) {
        issues.push({ session, file: '', reason: 'invocation-detail-limit' }); break;
      }
      try {
        const text = await this.read(this.root, path);
        bytes += Buffer.byteLength(text) - entry.bytes;
        if (bytes > 16 * 1024 * 1024) { issues.push({ session, file: '', reason: 'invocation-detail-limit' }); break; }
        const record: unknown = JSON.parse(text);
        if (!validRecord(record) || record.eventId !== metadata.eventId || sessionKey(record.sessionId) !== session || sessionKey(record.invocationId) !== invocation) throw new Error('invalid-record');
        records.push(record);
      } catch { issues.push({ session, file: '', reason: 'record-unavailable' }); }
    }
    records.sort((a, b) => a.writerId === b.writerId ? a.sequence - b.sequence : a.timestamp - b.timestamp || a.eventId.localeCompare(b.eventId));
    return { records, issues: issues.slice(0, 100) };
  }
}
