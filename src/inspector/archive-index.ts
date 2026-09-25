import { type FindingCategory } from '../decision/finding-triage.js';
import { findingStage, foldFindingStages, type FindingStage } from './finding-view.js';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type ArchiveIssue, sessionKey, recordSessionKey, recordInvocationKey } from '../recording/archive.js';
import { READER_SCHEMAS, type ArchiveRecord, validRecord } from '../recording/contract.js';
import { directory, MAX_RECORD_BYTES, readPrivateFile } from '../recording/files.js';
import { captureHealth, invocationView, type CaptureHealth } from './view.js';

export interface PageOptions { limit?: number; cursor?: string; offset?: number }
export interface InvocationSummary {
  id: string; invocationId: string; callId: string; toolName: string; host: string; contextId: string;
  timestamp: number; updated: number; decision: string; missing: string[]; categories: FindingCategory[];
  failure: string | null; assessmentStatus: string;
  mode: string; permission: string; execution: string;
}
export interface SessionSummary {
  id: string; sessionId: string; host: string; contextId: string; projects: string[]; timestamp: number; started: number;
  invocations: number; concerns: number; unavailable: number; coverage: string; categoryCounts: Record<FindingCategory, number>;
}
export type UncertaintyGroup = { policyIdentity: string; profile: string; ruleId: string; gate: string; count: number; first: number; last: number;
  invocations: { id: string; callId: string; timestamp: number }[]; omitted: number };
type Metadata = Omit<ArchiveRecord, 'data'> & { decision?: string; outcome?: string; finding: FindingStage; health?: CaptureHealth[number] };
type Entry = { fingerprint: string; bytes: number; metadata?: Metadata; issue?: ArchiveIssue; unsupportedVersion?: number };
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
                if (record && typeof record === 'object' && 'schemaVersion' in record && !READER_SCHEMAS.includes(record.schemaVersion as typeof READER_SCHEMAS[number])) {
                  reason = 'unsupported-schema';
                  if (typeof record.schemaVersion === 'number' && Number.isSafeInteger(record.schemaVersion)) entry.unsupportedVersion = record.schemaVersion;
                  throw new Error(reason);
                }
                if (!validRecord(record) || recordSessionKey(record) !== session) throw new Error('invalid-record');
                const { data, ...metadata } = record;
                entry.metadata = { ...metadata, finding: findingStage(record),
                  decision: record.stage === 'decision' ? String(data.decision) : undefined,
                  health: captureHealth([record])[0] };
                if ((record.stage === 'permission' || record.stage === 'execution') && typeof record.data.outcome === 'string') entry.metadata.outcome = record.data.outcome;
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
  status() {
    const issues = [...this.scanIssues, ...[...this.entries.values()].flatMap(e => e.issue ? [e.issue] : [])];
    return { supportedSchemas: [...READER_SCHEMAS], unsupported: issues.filter(i => i.reason === 'unsupported-schema').length,
      newerUnsupported: [...this.entries.values()].filter(e => e.unsupportedVersion !== undefined && e.unsupportedVersion > READER_SCHEMAS.at(-1)!).length,
      corrupt: issues.filter(i => i.reason === 'corrupt-record').length, indexing: this.indexing,
      otherIssues: issues.filter(i => !['unsupported-schema', 'corrupt-record'].includes(i.reason)).length };
  }
  captureHealth(session?: string): CaptureHealth {
    const latest = new Map<string, Metadata>();
    for (const entry of this.entries.values()) {
      const record = entry.metadata;
      if (!record?.health || (session && recordSessionKey(record) !== session)) continue;
      if (record.sequence > (latest.get(record.writerId)?.sequence ?? 0)) latest.set(record.writerId, record);
    }
    return [...latest.values()].map(record => record.health!);
  }
  private groups(session?: string) {
    const groups = new Map<string, Metadata[]>();
    for (const entry of this.entries.values()) {
      const record = entry.metadata;
      if (!record || (session && recordSessionKey(record) !== session)) continue;
      const key = session ? recordInvocationKey(record) : recordSessionKey(record);
      const group = groups.get(key) ?? []; group.push(record); groups.set(key, group);
    }
    return groups;
  }
  private summarize(id: string, records: Metadata[]): InvocationSummary {
    records.sort((a, b) => a.writerId === b.writerId ? a.sequence - b.sequence : a.timestamp - b.timestamp || a.eventId.localeCompare(b.eventId));
    const first = records[0]!;
    const findings = foldFindingStages(records.map(r => r.finding));
    return { id, invocationId: first.invocationId, callId: first.callId, toolName: first.toolName,
      host: first.host ?? 'pi', contextId: first.contextId ?? 'main', timestamp: first.timestamp,
      updated: Math.max(...records.map(r => r.timestamp)), decision: records.find(r => r.decision)?.decision ?? 'unavailable',
      failure: findings.failure, assessmentStatus: findings.assessmentStatus, categories: findings.categories, mode: first.mode,
      permission: records.findLast(r => r.stage === 'permission')?.outcome ?? 'unknown',
      execution: records.findLast(r => r.stage === 'execution')?.outcome ?? 'unknown',
      missing: ['begin', 'request', 'response', 'validation', 'assessment', 'decision', 'permission', 'execution'].filter(s => !records.some(r => r.stage === s)) };
  }
  sessions(options: PageOptions & { project?: string } = {}) {
    const rows: SessionSummary[] = [];
    for (const [id, records] of this.groups()) {
      const first = records[0]!;
      const projects = [...new Set(records.map(r => r.project ?? r.cwd))].sort();
      if (options.project && !projects.includes(options.project)) continue;
      const invocations = new Map<string, Metadata[]>();
      for (const record of records) {
        const key = recordInvocationKey(record), group = invocations.get(key) ?? []; group.push(record); invocations.set(key, group);
      }
      const summaries = [...invocations].map(([key, group]) => this.summarize(key, group));
      const categoryCounts = Object.fromEntries(['violation', 'uncertainty', 'approval', 'unavailable', 'pending']
        .map(c => [c, summaries.filter(row => row.categories.includes(c as FindingCategory)).length])) as Record<FindingCategory, number>;
      rows.push({ id, sessionId: first.sessionId, host: first.host ?? 'pi', contextId: first.contextId ?? 'main', projects,
        timestamp: Math.max(...records.map(r => r.timestamp)), started: Math.min(...records.map(r => r.timestamp)),
        invocations: summaries.length, concerns: summaries.filter(row => row.categories.some(c => ['violation', 'uncertainty', 'approval'].includes(c))).length,
        unavailable: categoryCounts.unavailable, categoryCounts, coverage: 'best-effort' });
    }
    return page(rows, options, `sessions:${options.project ?? ''}`, row => row.started);
  }
  invocations(session: string, options: PageOptions & { category?: FindingCategory } = {}) {
    const rows = [...this.groups(session)].map(([id, records]) => this.summarize(id, records))
      .filter(row => !options.category || row.categories.includes(options.category));
    return page(rows, options, `invocations:${session}:${options.category ?? ''}`);
  }
  uncertaintyGroups(session: string): { items: UncertaintyGroup[]; omittedGroups: number } {
    const groups = new Map<string, UncertaintyGroup>();
    for (const [id, records] of this.groups(session)) {
      const row = this.summarize(id, records);
      const findings = foldFindingStages(records.map(r => r.finding));
      const { policyIdentity, profile } = findings;
      for (const { ruleId, gate } of findings.uncertainty) {
        // Unknown policy identity cannot safely establish two calls belong to the same policy.
        const identity = policyIdentity === 'unrecorded policy identity' ? `${policyIdentity}:${id}` : policyIdentity;
        const key = JSON.stringify([identity, ruleId, profile, gate]);
        let group = groups.get(key);
        if (!group) { group = { policyIdentity, profile, ruleId, gate, count: 0, first: row.timestamp, last: row.timestamp, invocations: [], omitted: 0 }; groups.set(key, group); }
        const occurred = findings.occurrence;
        group.count++; group.first = Math.min(group.first, occurred); group.last = Math.max(group.last, occurred);
        if (group.invocations.length < 100) group.invocations.push({ id, callId: row.callId, timestamp: row.timestamp });
        else group.omitted++;
      }
    }
    const sorted = [...groups.values()].sort((a, b) => b.last - a.last);
    return { items: sorted.slice(0, 100), omittedGroups: Math.max(0, sorted.length - 100) };
  }
  async detail(session: string, invocation: string) {
    const records: ArchiveRecord[] = [], issues = this.issues(session);
    let bytes = 0, count = 0;
    for (const [path, entry] of this.entries) {
      const metadata = entry.metadata;
      if (!metadata || recordSessionKey(metadata) !== session || recordInvocationKey(metadata) !== invocation) continue;
      if (++count > 64 || (bytes += entry.bytes) > 16 * 1024 * 1024) {
        issues.push({ session, file: '', reason: 'invocation-detail-limit' }); break;
      }
      try {
        const text = await this.read(this.root, path);
        bytes += Buffer.byteLength(text) - entry.bytes;
        if (bytes > 16 * 1024 * 1024) { issues.push({ session, file: '', reason: 'invocation-detail-limit' }); break; }
        const record: unknown = JSON.parse(text);
        if (!validRecord(record) || record.eventId !== metadata.eventId || recordSessionKey(record) !== session || recordInvocationKey(record) !== invocation) throw new Error('invalid-record');
        records.push(record);
      } catch { issues.push({ session, file: '', reason: 'record-unavailable' }); }
    }
    records.sort((a, b) => a.writerId === b.writerId ? a.sequence - b.sequence : a.timestamp - b.timestamp || a.eventId.localeCompare(b.eventId));
    return { records, issues: issues.slice(0, 100) };
  }
}
