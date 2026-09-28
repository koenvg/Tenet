import { type FindingCategory } from '../decision/finding-triage.js';
import { findingStage, foldFindingStages, type FindingStage } from './finding-view.js';
import { lstat, opendir } from 'node:fs/promises';
import type { Dir } from 'node:fs';
import { join } from 'node:path';
import { type ArchiveIssue, sessionKey, recordSessionKey, recordInvocationKey } from '../recording/archive.js';
import { READER_SCHEMAS, type ArchiveRecord, validRecord } from '../recording/contract.js';
import { directory, MAX_RECORD_BYTES, readPrivateFile } from '../recording/files.js';
import { captureHealth, invocationView, type CaptureHealth } from './view.js';
import { projectThreadFinding, type ThreadFinding } from './bb-findings.js';

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
type Metadata = Omit<ArchiveRecord, 'data'> & { decision?: string; outcome?: string; finding: FindingStage; health?: CaptureHealth[number];
  valid?: boolean; selectedFailIds?: string[]; policyRuleIds?: string[]; integrityRuleId?: string | null };
type Entry = { fingerprint: string; bytes: number; metadata?: Metadata; issue?: ArchiveIssue; unsupportedVersion?: number };
type Counts = { unsupported: number; newerUnsupported: number; corrupt: number; otherIssues: number };
const counts = (): Counts => ({ unsupported: 0, newerUnsupported: 0, corrupt: 0, otherIssues: 0 });
function addCounts(target: Counts, source: Counts, sign = 1): void {
  for (const key of ['unsupported', 'newerUnsupported', 'corrupt', 'otherIssues'] as const) target[key] += sign * source[key];
}
function countIssue(target: Counts, reason: string, sign = 1): void {
  if (reason === 'unsupported-schema') target.unsupported += sign;
  else if (reason === 'corrupt-record') target.corrupt += sign;
  else target.otherIssues += sign;
}
export interface ThreadStatus {
  coverage: 'unknown' | 'partial'; linkedCalls: number; failures: number; issues: string[];
  notices: { approvals: number; uncertain: number; incomplete: number };
}

/** Persist only bounded rule facts for the BB thread summary, never assessment evidence. */
function bbFacts(record: ArchiveRecord): Pick<Metadata, 'valid' | 'policyRuleIds' | 'integrityRuleId' | 'selectedFailIds'> {
  const { stage, data } = record;
  const policy = data.policy && typeof data.policy === 'object' && !Array.isArray(data.policy)
    ? data.policy as { rules?: unknown } : null;
  const policyRuleIds = (stage === 'begin' || stage === 'request') && policy
    ? Array.isArray(policy.rules)
      ? policy.rules.filter((rule: any) => rule && typeof rule.id === 'string' && rule.id.length <= 256
        && ['BLOCK', 'WARN'].includes(rule.enforcement)).slice(0, 64).map((rule: any) => rule.id) as string[]
      : [] : undefined;
  const payload = stage === 'request' && data.payload && typeof data.payload === 'object'
    ? data.payload as { state?: unknown } : null;
  const state = payload?.state && typeof payload.state === 'object' ? payload.state as { integrity?: unknown } : null;
  const integrity = stage === 'begin' ? data.integrity : stage === 'request' ? state?.integrity : undefined;
  const integrityRuleId = integrity === undefined || integrity === null ? undefined
    : typeof integrity === 'object' && !Array.isArray(integrity) && typeof (integrity as { id?: unknown }).id === 'string'
      && (integrity as { id: string }).id.length <= 256 ? (integrity as { id: string }).id : null;
  const selected = stage === 'assessment' && data.assessment && typeof data.assessment === 'object'
    ? data.assessment as { model?: unknown; rules?: unknown } : null;
  let selectedFailIds: string[] | undefined;
  if (typeof selected?.model === 'string' && Array.isArray(selected.rules)) {
    selectedFailIds = [];
    const seen = new Set<string>();
    for (const rule of selected.rules) {
      if (!rule || typeof rule.ruleId !== 'string' || rule.ruleId.length > 256 || seen.has(rule.ruleId)) continue;
      seen.add(rule.ruleId);
      if (rule.outcome?.choice === 'FAIL' && selectedFailIds.length < 64) selectedFailIds.push(rule.ruleId);
    }
  }
  return { valid: stage === 'validation' ? data.valid === true : undefined, policyRuleIds, integrityRuleId, selectedFailIds };
}
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

type SessionScan = { session: string; cursor?: Dir; files: Map<string, Entry>; entryIssues: Map<string, ArchiveIssue>;
  seen: Set<string>; issues: Map<string, ArchiveIssue>; nextIssues: Map<string, ArchiveIssue>;
  totals: Counts; scanCounts: Counts; nextCounts: Counts; deferred?: string; identity?: string;
  complete: boolean; rootSeen?: number; prune?: MapIterator<[string, Entry]>; pruneSeen?: Set<string> };
const ROOT_ENTRIES_PER_REFRESH = 128;
const STAGE_ENTRIES_PER_REFRESH = 512;
const MAX_OPEN_SESSIONS = 256;

/** Rebuildable metadata-only cache. Directory entries and file stats are swept in bounded
 * rounds; unchanged evidence is not reread. Detail is always read and validated anew.
 * Each refresh parses at most 256 stages / 16 MiB and reports incomplete cold sweeps. */
export class ArchiveIndex {
  private *allEntries(): IterableIterator<[string, Entry]> {
    for (const state of this.sessionScans.values()) yield* state.files;
  }
  private totals = counts();
  private issueStates = new Set<SessionScan>();
  private newState(session: string, complete = false, identity?: string): SessionScan {
    return { session, files: new Map(), entryIssues: new Map(), seen: new Set(), issues: new Map(),
      nextIssues: new Map(), totals: counts(), scanCounts: counts(), nextCounts: counts(), complete, identity };
  }
  private trackIssues(state: SessionScan): void {
    if (state.issues.size || state.nextIssues.size || state.entryIssues.size) this.issueStates.add(state);
    else this.issueStates.delete(state);
  }
  private replaceEntry(state: SessionScan, path: string, entry?: Entry): void {
    const old = state.files.get(path);
    if (old?.issue) { countIssue(state.totals, old.issue.reason, -1); countIssue(this.totals, old.issue.reason, -1); }
    if (old?.unsupportedVersion !== undefined && old.unsupportedVersion > READER_SCHEMAS.at(-1)!) {
      state.totals.newerUnsupported--; this.totals.newerUnsupported--;
    }
    if (entry) {
      state.files.set(path, entry);
      if (entry.issue) {
        state.entryIssues.set(path, entry.issue);
        countIssue(state.totals, entry.issue.reason); countIssue(this.totals, entry.issue.reason);
      } else state.entryIssues.delete(path);
      if (entry.unsupportedVersion !== undefined && entry.unsupportedVersion > READER_SCHEMAS.at(-1)!) {
        state.totals.newerUnsupported++; this.totals.newerUnsupported++;
      }
    } else { state.files.delete(path); state.entryIssues.delete(path); }
    this.trackIssues(state);
  }
  private addScanIssue(state: SessionScan, issue: ArchiveIssue): void {
    const old = state.nextIssues.get(issue.file);
    if (old) countIssue(state.nextCounts, old.reason, -1);
    state.nextIssues.set(issue.file, issue); countIssue(state.nextCounts, issue.reason);
    this.trackIssues(state);
  }
  private pending?: Promise<void>;
  private scanIssues: ArchiveIssue[] = [];
  private sessionScans = new Map<string, SessionScan>();
  private rootCursor?: Dir;
  private rootPrune?: MapIterator<[string, SessionScan]>;
  private rootPruneEpoch = 0;
  private rootEpoch = 1;
  private rootComplete = false;
  private rootIdentity?: string;
  private turn?: MapIterator<[string, SessionScan]>;
  private coldPending = 0;
  private openCursors = new Map<Dir, string>();
  private probe?: string;
  private pruneQueue = new Set<SessionScan>();
  indexing = false;
  constructor(private root: string, private read = readPrivateFile) {}

  refresh(): Promise<void> {
    if (!this.pending) this.pending = this.scan().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async removeSession(session: string): Promise<void> {
    const state = this.sessionScans.get(session);
    if (!state) return;
    if (state.cursor) { try { await state.cursor.close(); } catch {} this.openCursors.delete(state.cursor); }
    if (!state.complete) this.coldPending--;
    this.pruneQueue.delete(state);
    addCounts(this.totals, state.totals, -1); this.issueStates.delete(state);
    this.sessionScans.delete(session);
    if (this.probe === session) this.probe = undefined;
  }
  private async unsafeSession(session: string): Promise<void> {
    const seen = this.sessionScans.get(session)?.rootSeen;
    await this.removeSession(session);
    const state = this.newState(session, true);
    state.rootSeen = seen;
    const issue = { session, file: '', reason: 'unsafe-session-directory' };
    state.issues.set('', issue); countIssue(state.scanCounts, issue.reason);
    addCounts(state.totals, state.scanCounts); addCounts(this.totals, state.scanCounts);
    this.trackIssues(state); this.sessionScans.set(session, state);
  }
  private async resetSessions(): Promise<void> {
    for (const cursor of this.openCursors.keys()) { try { await cursor.close(); } catch {} }
    this.openCursors.clear(); this.sessionScans = new Map(); this.pruneQueue.clear();
    this.totals = counts(); this.issueStates.clear();
    this.rootPrune = undefined; this.rootEpoch = 1; this.coldPending = 0;
    this.turn = undefined; this.probe = undefined;
  }
  private async scan(): Promise<void> {
    let budget = 256, byteBudget = 16 * 1024 * 1024;
    const issues: ArchiveIssue[] = [];
    try {
      await directory(this.root);
      const rootInfo = await lstat(this.root);
      const rootIdentity = `${rootInfo.dev}:${rootInfo.ino}`;
      if (this.rootIdentity && this.rootIdentity !== rootIdentity) {
        if (this.rootCursor) { try { await this.rootCursor.close(); } catch {} }
        this.rootCursor = undefined; this.rootComplete = false;
        await this.resetSessions();
      }
      this.rootIdentity = rootIdentity;
      if (!this.rootCursor) this.rootCursor = await opendir(this.root);
      for (let n = 0; n < ROOT_ENTRIES_PER_REFRESH; n++) {
        const dirent = await this.rootCursor.read();
        if (!dirent) {
          await this.rootCursor.close(); this.rootCursor = undefined; this.rootComplete = true;
          if (!this.rootPrune) { this.rootPrune = this.sessionScans.entries(); this.rootPruneEpoch = this.rootEpoch; }
          this.rootEpoch++;
          break;
        }
        const session = dirent.name;
        if (!/^[a-f0-9]{64}$/.test(session)) continue;
        let state = this.sessionScans.get(session);
        if (!state) {
          state = this.newState(session);
          this.sessionScans.set(session, state); this.coldPending++;
        }
        state.rootSeen = this.rootEpoch;
      }
      for (let n = 0; n < ROOT_ENTRIES_PER_REFRESH && this.rootPrune; n++) {
        const next = this.rootPrune.next();
        if (next.done) { this.rootPrune = undefined; break; }
        const [session, state] = next.value;
        if ((state.rootSeen ?? 0) < this.rootPruneEpoch && this.sessionScans.get(session) === state) await this.removeSession(session);
      }
      const checked = new Set<string>(), completed = new Set<string>(), bad = new Set<string>();
      let stoppedForBudget = false, swapped = false;
      for (let n = 0; n < STAGE_ENTRIES_PER_REFRESH && this.sessionScans.size; n++) {
        this.turn ??= this.sessionScans.entries();
        let next = this.turn.next();
        if (next.done) { this.turn = this.sessionScans.entries(); next = this.turn.next(); }
        if (completed.size === this.sessionScans.size) break;
        if (next.done) break;
        const [session, state] = next.value;
        const folder = join(this.root, session);
        if (completed.has(session) || bad.has(session)) continue;
        if (!checked.has(session)) {
          checked.add(session);
          let identity: string;
          try {
            const info = await lstat(folder);
            if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0
              || (process.getuid !== undefined && info.uid !== process.getuid())) throw new Error('unsafe-directory');
            identity = `${info.dev}:${info.ino}`;
          }
          catch {
            await this.unsafeSession(session); bad.add(session);
            continue;
          }
          if (state.identity && state.identity !== identity) {
            await this.removeSession(session);
            const replacement = this.newState(session, false, identity);
            replacement.rootSeen = state.rootSeen;
            this.sessionScans.set(session, replacement);
            this.coldPending++;
            continue;
          }
          state.identity = identity;
        }
        if (!state.cursor) {
          if (this.openCursors.size >= MAX_OPEN_SESSIONS) {
            if (swapped) continue;
            const victimName = this.probe ?? this.openCursors.values().next().value;
            const victim = victimName ? this.sessionScans.get(victimName) : undefined;
            if (!victim?.cursor) continue;
            try { await victim.cursor.close(); } catch {}
            this.openCursors.delete(victim.cursor);
            victim.cursor = undefined; victim.seen.clear(); victim.nextIssues.clear(); victim.nextCounts = counts();
            this.trackIssues(victim);
            swapped = true;
          }
          try {
            state.cursor = await opendir(folder);
            this.openCursors.set(state.cursor, session); this.probe = session;
          }
          catch {
            await this.unsafeSession(session); bad.add(session);
            continue;
          }
        }
        let file = state.deferred;
        state.deferred = undefined;
        if (!file) {
          try { file = (await state.cursor.read())?.name; }
          catch {
            await this.unsafeSession(session); bad.add(session);
            continue;
          }
        }
        if (!file) {
          await state.cursor.close(); this.openCursors.delete(state.cursor); state.cursor = undefined;
          if (this.probe === session) this.probe = undefined;
          if (!state.complete) { state.complete = true; this.coldPending--; }
          completed.add(session);
          if (!state.prune) {
            state.prune = state.files.entries(); state.pruneSeen = state.seen; state.seen = new Set();
            this.pruneQueue.add(state);
          }
          addCounts(this.totals, state.scanCounts, -1); addCounts(state.totals, state.scanCounts, -1);
          state.scanCounts = state.nextCounts; state.nextCounts = counts();
          addCounts(this.totals, state.scanCounts); addCounts(state.totals, state.scanCounts);
          state.issues = state.nextIssues; state.nextIssues = new Map(); this.trackIssues(state);
          continue;
        }
        if (file.endsWith('.tmp')) { this.addScanIssue(state, { session, file, reason: 'temporary-record' }); continue; }
        if (!file.endsWith('.json')) continue;
        const path = join(folder, file);
        state.seen.add(path);
        try {
          const stat = await lstat(path);
          const fingerprint = [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode, stat.uid, stat.nlink].join(':');
          const cached = state.files.get(path);
          if (cached?.fingerprint === fingerprint) continue;
          this.replaceEntry(state, path);
          const cost = Math.min(stat.size, MAX_RECORD_BYTES);
          if (budget <= 0 || cost > byteBudget) {
            state.deferred = file; stoppedForBudget = true; break;
          }
          budget--; byteBudget -= cost;
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
            entry.metadata = { ...metadata, finding: findingStage(record), ...bbFacts(record),
              decision: record.stage === 'decision' ? String(data.decision) : undefined,
              health: captureHealth([record])[0] };
            if ((record.stage === 'permission' || record.stage === 'execution') && typeof record.data.outcome === 'string') entry.metadata.outcome = record.data.outcome;
          } catch { entry.issue = { session, file, reason }; }
          this.replaceEntry(state, path, entry);
        } catch {
          this.replaceEntry(state, path);
          this.addScanIssue(state, { session, file, reason: 'record-unavailable' });
        }
      }
      for (let n = 0; n < STAGE_ENTRIES_PER_REFRESH && this.pruneQueue.size; n++) {
        const state = this.pruneQueue.values().next().value!;
        this.pruneQueue.delete(state);
        const next = state.prune?.next();
        if (!next || next.done) { state.prune = undefined; state.pruneSeen = undefined; continue; }
        const [path] = next.value;
        if (!state.pruneSeen?.has(path) && !state.seen.has(path)) this.replaceEntry(state, path);
        this.pruneQueue.add(state);
      }
      this.indexing = !this.rootComplete || stoppedForBudget || this.coldPending > 0;
    } catch (error) {
      if (this.rootCursor) { try { await this.rootCursor.close(); } catch {} }
      this.rootCursor = undefined; this.rootComplete = false; this.rootIdentity = undefined;
      await this.resetSessions(); this.indexing = false;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') issues.push({ session: null, file: '', reason: 'archive-unavailable' });
    }
    this.scanIssues = issues;
  }
  issues(session?: string): ArchiveIssue[] {
    const issues = [...this.scanIssues];
    const candidates = session ? [this.sessionScans.get(session)] : this.issueStates;
    for (const state of candidates) {
      if (!state) continue;
      for (const issue of state.nextIssues.values()) { issues.push(issue); if (issues.length > 100) break; }
      if (issues.length > 100) break;
      for (const [file, issue] of state.issues) {
        if (!state.nextIssues.has(file)) issues.push(issue);
        if (issues.length > 100) break;
      }
      if (issues.length > 100) break;
      for (const issue of state.entryIssues.values()) { issues.push(issue); if (issues.length > 100) break; }
      if (issues.length > 100) break;
    }
    if (this.indexing) issues.push({ session: null, file: '', reason: 'indexing-in-progress' });
    return issues.length > 100 ? [...issues.slice(0, 99), { session: null, file: '', reason: 'additional-archive-issues' }] : issues;
  }
  status() {
    return { supportedSchemas: [...READER_SCHEMAS], ...this.totals,
      otherIssues: this.totals.otherIssues + this.scanIssues.length, indexing: this.indexing };
  }
  captureHealth(session?: string): CaptureHealth {
    const latest = new Map<string, Metadata>();
    for (const [, entry] of this.allEntries()) {
      const record = entry.metadata;
      if (!record?.health || (session && recordSessionKey(record) !== session)) continue;
      if (record.sequence > (latest.get(record.writerId)?.sequence ?? 0)) latest.set(record.writerId, record);
    }
    return [...latest.values()].map(record => record.health!);
  }
  private groups(session?: string) {
    const groups = new Map<string, Metadata[]>();
    for (const [, entry] of this.allEntries()) {
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
  /** Exact BB thread hint on the selected machine. Never infer historical links from session/cwd. */
  private linkedGroups(bbThreadId: string) {
    if (!/^thr_[a-z0-9]{8,64}$/.test(bbThreadId)) throw new Error('invalid-thread-status-request');
    const groups = new Map<string, Metadata[]>(), latestHealth = new Map<string, Metadata>();
    for (const [, entry] of this.allEntries()) {
      const record = entry.metadata;
      if (!record) continue;
      if (record.health && record.sequence > (latestHealth.get(record.writerId)?.sequence ?? 0)) latestHealth.set(record.writerId, record);
      if (record.schemaVersion !== 3 || record.host !== 'pi' || record.bbThreadId !== bbThreadId) continue;
      const key = sessionKey(JSON.stringify([bbThreadId, recordSessionKey(record), recordInvocationKey(record)]));
      const group = groups.get(key) ?? []; group.push(record); groups.set(key, group);
    }
    return { groups, writerLoss: [...latestHealth.values()].some(r => {
      const h = r.health!; return h.failed || h.dropped || h.drainTimeouts;
    }) };
  }
  private selectedFailure(records: Metadata[]): boolean {
    records.sort((a, b) => a.writerId === b.writerId ? a.sequence - b.sequence : a.timestamp - b.timestamp || a.eventId.localeCompare(b.eventId));
    if (!records.some(r => r.stage === 'validation' && r.valid === true)
      || foldFindingStages(records.map(r => r.finding)).failure !== null) return false;
    const begin = records.findLast(r => r.stage === 'begin');
    const request = records.findLast(r => r.stage === 'request');
    const assessment = records.findLast(r => r.stage === 'assessment');
    const policyIds = new Set(request?.policyRuleIds ?? begin?.policyRuleIds ?? []);
    const integrityId = request?.integrityRuleId === undefined ? begin?.integrityRuleId : request.integrityRuleId;
    if (integrityId) policyIds.add(integrityId);
    return assessment?.selectedFailIds?.some(id => policyIds.has(id)) === true;
  }
  private threadSnapshot(bbThreadId: string) {
    const { groups, writerLoss } = this.linkedGroups(bbThreadId);
    const issues = new Set(this.issues().map(issue => issue.reason));
    if (writerLoss) issues.add('writer-loss');
    const notices = { approvals: 0, uncertain: 0, incomplete: 0 };
    const candidates: { id: string; timestamp: number; session: string; invocation: string; expectedEvents: Set<string> }[] = [];
    for (const [id, records] of groups) {
      if (!['begin', 'request', 'response', 'validation', 'assessment', 'decision', 'permission', 'execution']
        .every(stage => records.some(r => r.stage === stage))) issues.add('missing-stages');
      if (this.selectedFailure(records)) candidates.push({ id, timestamp: records[0]!.timestamp,
        session: recordSessionKey(records[0]!), invocation: recordInvocationKey(records[0]!),
        expectedEvents: new Set(records.map(r => r.eventId)) });
      const facts = foldFindingStages(records.map(r => r.finding));
      if (facts.categories.includes('approval')) notices.approvals++;
      if (facts.categories.includes('uncertainty') || records.some(r => r.stage === 'assessment' && r.finding.rules?.some(rule => rule.outcome === 'UNKNOWN'))) notices.uncertain++;
      if (facts.failure || facts.categories.includes('pending')) notices.incomplete++;
    }
    const status: ThreadStatus = { coverage: groups.size ? 'partial' : 'unknown', linkedCalls: groups.size,
      failures: candidates.length, notices, issues: [...issues].slice(0, 20) };
    return { status, candidates };
  }
  threadStatus(bbThreadId: string): ThreadStatus { return this.threadSnapshot(bbThreadId).status; }
  /** At most five candidate calls per page, each re-read by detail's 64-stage / 16-MiB cap. */
  async threadFindings(bbThreadId: string, cursor?: string): Promise<{ coverage: ThreadStatus['coverage']; linkedCalls: number;
    notices: ThreadStatus['notices']; issues: string[]; items: ThreadFinding[]; next: string | null }> {
    const { status, candidates } = this.threadSnapshot(bbThreadId);
    const selection = page(candidates, { limit: 5, cursor }, `thread-findings:${bbThreadId}`);
    const issues = new Set(status.issues);
    const items: ThreadFinding[] = [];
    for (const candidate of selection.items) {
      const detail = await this.detail(candidate.session, candidate.invocation, bbThreadId);
      const observed = new Set(detail.records.map(r => r.eventId));
      if (detail.readIssues.length || [...candidate.expectedEvents].some(id => !observed.has(id))) {
        issues.add('detail-unavailable');
        continue;
      }
      const projected = projectThreadFinding(detail.records, candidate.id, bbThreadId);
      for (const gap of projected.gaps) issues.add(gap);
      if (projected.item) items.push(projected.item);
    }
    return { coverage: status.coverage, linkedCalls: status.linkedCalls, notices: status.notices, issues: [...issues].slice(0, 20),
      items, next: selection.next };
  }
  async detail(session: string, invocation: string, bbThreadId?: string) {
    const records: ArchiveRecord[] = [], issues = this.issues(session), readIssues: ArchiveIssue[] = [];
    const readIssue = (reason: string) => {
      const issue = { session, file: '', reason };
      readIssues.push(issue); issues.push(issue);
    };
    let bytes = 0, count = 0;
    for (const [path, entry] of this.sessionScans.get(session)?.files ?? []) {
      const metadata = entry.metadata;
      if (!metadata || recordSessionKey(metadata) !== session || recordInvocationKey(metadata) !== invocation
        || (bbThreadId !== undefined && metadata.bbThreadId !== bbThreadId)) continue;
      if (++count > 64 || (bytes += entry.bytes) > 16 * 1024 * 1024) {
        readIssue('invocation-detail-limit'); break;
      }
      try {
        const text = await this.read(this.root, path);
        bytes += Buffer.byteLength(text) - entry.bytes;
        if (bytes > 16 * 1024 * 1024) { readIssue('invocation-detail-limit'); break; }
        const record: unknown = JSON.parse(text);
        if (!validRecord(record) || record.eventId !== metadata.eventId || recordSessionKey(record) !== session
          || recordInvocationKey(record) !== invocation || (bbThreadId !== undefined && record.bbThreadId !== bbThreadId)) throw new Error('invalid-record');
        records.push(record);
      } catch { readIssue('record-unavailable'); }
    }
    records.sort((a, b) => a.writerId === b.writerId ? a.sequence - b.sequence : a.timestamp - b.timestamp || a.eventId.localeCompare(b.eventId));
    return { records, issues: issues.slice(0, 100), readIssues };
  }
}
