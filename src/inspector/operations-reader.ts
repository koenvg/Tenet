import { type Dir } from 'node:fs';
import { opendir } from 'node:fs/promises';
import { join } from 'node:path';
import { directory } from '../recording/files.js';
import { OPERATIONS_DIRECTORY, OPERATIONS_FRESH_MS, readOperationsFile,
  type OperationRequest, type OperationsSnapshot, type AssessmentOutcome } from '../runtime/operations.js';
import type { ActionPreview } from './action-preview.js';

export type RuntimeFreshness = 'fresh' | 'stale' | 'closed' | 'suspended' | 'unsupported' | 'invalid' | 'unavailable';
export type OperationState = 'preparing' | 'queued' | 'analyzing' | 'approval' | 'finalizing' | AssessmentOutcome;
export interface OperationsQuery { window: 15 | 60; project?: string; state?: OperationState; search?: string; offset?: number; limit?: number }
export interface OperationRow extends OperationRequest {
  key: string; runtimeId: string; freshness: RuntimeFreshness; projectLabel: string; state: OperationState;
  description?: ActionPreview; recording: 'available' | 'indexing' | 'missing' | 'withheld' | 'budget-limited';
}
export interface SampleMetric { count: number; mean: number | null; p95: number | null }
export interface OperationsView {
  asOf: number; freshForMs: number; current: { queued: number; analyzing: number; approval: number; other: number } | null;
  coverage: 'unknown' | 'partial' | 'observed'; projects: { key: string; label: string }[];
  runtimes: { id: string; freshness: RuntimeFreshness; publishedAt: number; coverageSince: number; timing: 'measured' | 'unknown' }[];
  analysis: SampleMetric; queue: SampleMetric; outcomes: Record<AssessmentOutcome, number>;
  buckets: { at: number; analysis: number | null; queue: number | null; analysisCount: number; queueCount: number }[];
  requests: OperationRow[]; total: number; next: number | null;
  loss: OperationsSnapshot['loss']; capture: OperationsSnapshot['capture']; issues: string[];
}
export function operationState(r: OperationRequest): OperationState {
  if (r.permission.kind === 'awaiting-approval') return 'approval';
  if (r.assessment.kind !== 'settled') return r.assessment.kind;
  if (r.permission.kind !== 'committed') return 'finalizing';
  return r.assessment.outcome;
}
const states: OperationState[] = ['preparing', 'queued', 'analyzing', 'approval', 'finalizing', 'completed', 'unavailable', 'dropped', 'cancelled', 'interrupted'];
export function operationsQuery(params: URLSearchParams): OperationsQuery {
  if ([...params.keys()].some(k => !['window', 'project', 'state', 'search', 'offset', 'limit'].includes(k))
    || [...params.keys()].some(k => params.getAll(k).length !== 1)) throw new Error('invalid-query');
  const window = params.get('window') ?? '15', project = params.get('project') ?? undefined,
    state = params.get('state') ?? undefined, search = params.get('search') ?? undefined;
  const offset = params.get('offset') ?? '0', limit = params.get('limit') ?? '100';
  if (!['15', '60'].includes(window) || project !== undefined && !/^[a-f0-9]{64}$/.test(project)
    || state !== undefined && !states.includes(state as OperationState) || (search?.length ?? 0) > 128
    || !/^\d{1,6}$/.test(offset) || Number(offset) > 20480 || !/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) throw new Error('invalid-query');
  return { window: Number(window) as 15 | 60, project, state: state as OperationState | undefined, search, offset: Number(offset), limit: Number(limit) };
}
const metric = (values: number[]): SampleMetric => {
  values.sort((a, b) => a - b);
  return { count: values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    p95: values.length ? values[Math.ceil(values.length * .95) - 1]! : null };
};
export function aggregateOperations(documents: { snapshot: OperationsSnapshot; freshness: RuntimeFreshness }[], query: OperationsQuery,
  now: number, issues: string[] = []): OperationsView {
  const selected = documents.filter(d => !query.project || d.snapshot.projects.some(p => p.key === query.project));
  const fresh = selected.filter(d => d.freshness === 'fresh');
  const loss: OperationsSnapshot['loss'] = { activeOmitted: false, evicted: 0, withheld: 0, publicationFailures: 0, cleanupPartial: false };
  const capture = { failed: 0, dropped: 0, drainTimeouts: 0 };
  const projects = new Map<string, string>();
  for (const { snapshot } of documents) for (const p of snapshot.projects) if (projects.size < 1024) projects.set(p.key, p.label);
  const samples: number[] = [], waits: number[] = [], rows: OperationRow[] = [];
  const outcomes = { completed: 0, unavailable: 0, dropped: 0, cancelled: 0, interrupted: 0 };
  const current = fresh.length ? { queued: 0, analyzing: 0, approval: 0, other: 0 } : null;
  const start = now - query.window * 60000, bucketMs = query.window * 60000 / 15;
  const buckets = Array.from({ length: 15 }, (_, i) => ({ at: start + i * bucketMs, analysis: [] as number[], queue: [] as number[] }));
  for (const { snapshot: s, freshness } of selected) {
    loss.activeOmitted ||= s.loss.activeOmitted; loss.cleanupPartial ||= s.loss.cleanupPartial;
    loss.evicted += s.loss.evicted; loss.withheld += s.loss.withheld; loss.publicationFailures += s.loss.publicationFailures;
    capture.failed += s.capture.failed; capture.dropped += s.capture.dropped; capture.drainTimeouts += s.capture.drainTimeouts;
    for (const p of s.projects) if (projects.size < 1024) projects.set(p.key, p.label);
    for (const r of s.requests) {
      if (query.project && r.project !== query.project) continue;
      const state = operationState(r), active = r.assessment.kind !== 'settled' || r.permission.kind !== 'committed';
      if (current && freshness === 'fresh') {
        if (r.assessment.kind === 'queued') current.queued++;
        if (r.assessment.kind === 'analyzing') current.analyzing++;
        if (r.permission.kind === 'awaiting-approval') current.approval++;
        if (active && !['queued', 'analyzing', 'approval'].includes(state)) current.other++;
      }
      const a = r.assessment;
      if (a.kind === 'settled' && a.at >= start && a.at <= now) {
        outcomes[a.outcome]++;
        if (s.timing === 'measured' && a.durationMs !== undefined && ['completed', 'unavailable'].includes(a.outcome)) {
          samples.push(a.durationMs); buckets[Math.min(14, Math.floor((a.at - start) / bucketMs))]!.analysis.push(a.durationMs);
        }
      }
      if (s.timing === 'measured' && r.reservedAt !== undefined && r.reservedAt >= start && r.reservedAt <= now && r.queueWaitMs !== undefined) {
        waits.push(r.queueWaitMs); buckets[Math.min(14, Math.floor((r.reservedAt - start) / bucketMs))]!.queue.push(r.queueWaitMs);
      }
      if (!active && (a.kind !== 'settled' || a.at < start || a.at > now)) continue;
      const row: OperationRow = { ...r, key: `${s.runtimeId}/${r.id}`, runtimeId: s.runtimeId, freshness,
        projectLabel: projects.get(r.project) ?? 'Unknown project', state, recording: r.metadata === 'withheld' ? 'withheld' : 'missing' };
      const matchesState = !query.state || (Object.hasOwn(outcomes, query.state)
        ? a.kind === 'settled' && a.outcome === query.state && a.at >= start && a.at <= now
        : state === query.state);
      if (!matchesState || query.search && !`${r.tool} ${row.projectLabel} ${r.host} ${r.id}`.toLowerCase().includes(query.search.toLowerCase())) continue;
      rows.push(row);
    }
  }
  rows.sort((a, b) => {
    const active = (r: OperationRow) => r.assessment.kind !== 'settled' || r.permission.kind !== 'committed';
    return Number(active(b)) - Number(active(a)) || b.startedAt - a.startedAt || a.key.localeCompare(b.key);
  });
  const offset = query.offset ?? 0, limit = query.limit ?? 100;
  const partial = issues.length > 0 || selected.some(d => d.freshness !== 'fresh' || d.snapshot.loss.activeOmitted || d.snapshot.loss.withheld > 0 || d.snapshot.loss.evicted > 0 || d.snapshot.loss.publicationFailures > 0 || d.snapshot.timing === 'unknown');
  return { asOf: now, freshForMs: fresh.length ? Math.max(0, Math.min(...fresh.map(d => OPERATIONS_FRESH_MS - Math.max(0, now - d.snapshot.publishedAt)))) : 0,
    current, coverage: current ? partial ? 'partial' : 'observed' : 'unknown', projects: [...projects].map(([key, label]) => ({ key, label })),
    runtimes: selected.map(d => ({ id: d.snapshot.runtimeId, freshness: d.freshness, publishedAt: d.snapshot.publishedAt,
      coverageSince: d.snapshot.coverageSince, timing: d.snapshot.timing })),
    analysis: metric(samples), queue: metric(waits), outcomes,
    buckets: buckets.map(b => ({ at: b.at, analysis: metric(b.analysis).mean, queue: metric(b.queue).mean, analysisCount: b.analysis.length, queueCount: b.queue.length })),
    requests: rows.slice(offset, offset + limit), total: rows.length, next: offset + limit < rows.length ? offset + limit : null,
    loss, capture, issues: [...new Set(issues)].slice(0, 32) };
}

type CachedRuntime = { snapshot?: OperationsSnapshot; issue?: RuntimeFreshness; sequence?: number; publishedAt?: number };
export class OperationsReader {
  private cache = new Map<string, CachedRuntime>();
  private candidates = new Set<string>();
  private refreshTurn = 0;
  private historyOmitted = false;
  private cursor?: Dir;
  private pending?: Promise<void>;
  private last = -Infinity;
  private issues: string[] = [];
  private capacity = false;
  private discoveryPartial = true;
  private closed = false;
  constructor(private root: string, private now = Date.now) {}
  refresh(force = false): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.pending) return this.pending;
    if (!force && performance.now() - this.last < 2000) return Promise.resolve();
    this.last = performance.now();
    this.pending = this.scan().finally(() => { this.pending = undefined; }); return this.pending;
  }
  private priority(cached: CachedRuntime) {
    const s = cached.snapshot, now = this.now();
    if (!s || s.state !== 'running' || now < s.publishedAt || now - s.publishedAt > OPERATIONS_FRESH_MS) return 0;
    return s.requests.some(r => r.assessment.kind !== 'settled' || r.permission.kind !== 'committed') ? 2 : 1;
  }
  private admit(file: string, cached: CachedRuntime) {
    if (this.cache.has(file) || this.cache.size < 16) { this.cache.set(file, cached); return; }
    this.capacity = true;
    const victim = [...this.cache].reduce((a, b) => this.priority(a[1]) <= this.priority(b[1]) ? a : b);
    const priority = this.priority(cached), previous = this.priority(victim[1]);
    if (priority < previous || priority === 0 && previous === 0) return;
    this.cache.delete(victim[0]); this.cache.set(file, cached); this.historyOmitted = true;
  }
  private async scan() {
    const folder = join(this.root, OPERATIONS_DIRECTORY); this.issues = [];
    try {
      await directory(this.root); await directory(folder);
      this.cursor ??= await opendir(folder);
      for (let i = 0; i < 64 && this.candidates.size < 64; i++) {
        const entry = await this.cursor.read();
        if (!entry) { await this.cursor.close(); this.cursor = undefined; this.discoveryPartial = false; break; }
        this.discoveryPartial = true;
        if (!/^[a-f0-9-]{36}\.json$/.test(entry.name)) continue;
        if (!this.cache.has(entry.name)) this.candidates.add(entry.name);
      }
      const candidates = [...this.candidates].slice(0, Math.max(4, 16 - this.cache.size));
      for (const file of candidates) this.candidates.delete(file);
      const known = [...this.cache], available = 16 - candidates.length;
      const refreshed = Array.from({ length: Math.min(known.length, available) }, (_, i) => known[(this.refreshTurn + i) % known.length]!);
      this.refreshTurn = known.length ? (this.refreshTurn + refreshed.length) % known.length : 0;
      const entries: [string, CachedRuntime][] = [...refreshed, ...candidates.map<[string, CachedRuntime]>(file => [file, {}])];
      if (known.length > refreshed.length || this.candidates.size) this.issues.push('reader-budget');
      if (known.length + candidates.length + this.candidates.size > 16) this.capacity = true;
      for (let i = 0; i < entries.length; i += 4) {
        const results = await Promise.all(entries.slice(i, i + 4).map(async ([file, cached]) => {
          try {
            const snapshot = await readOperationsFile(this.root, join(folder, file));
            if (file !== `${snapshot.runtimeId}.json` || cached.sequence !== undefined && (snapshot.sequence < cached.sequence
              || snapshot.sequence === cached.sequence && snapshot.publishedAt !== cached.publishedAt)
              || snapshot.publishedAt > this.now() + 1000 || cached.publishedAt !== undefined && snapshot.publishedAt < cached.publishedAt) throw new Error('invalid');
            return { file, value: { snapshot, sequence: snapshot.sequence, publishedAt: snapshot.publishedAt }, missing: false };
          } catch (e) {
            const issue: RuntimeFreshness = e instanceof Error && e.message === 'unsupported' ? 'unsupported' : 'invalid';
            this.issues.push(issue);
            return { file, value: { sequence: cached.sequence, publishedAt: cached.publishedAt, issue },
              missing: e instanceof Error && 'code' in e && e.code === 'ENOENT' };
          }
        }));
        for (const { file, value, missing } of results) {
          if (missing) this.cache.delete(file);
          else this.admit(file, value);
        }
      }
      for (const cached of this.cache.values()) if (cached.issue) this.issues.push(cached.issue);
      if (this.historyOmitted) this.issues.push('history-omitted');
      if (this.capacity) this.issues.push('runtime-capacity');
      if (this.discoveryPartial) this.issues.push('discovery-budget');
    } catch {
      if (this.cursor) { await this.cursor.close().catch(() => {}); this.cursor = undefined; }
      this.cache.clear(); this.candidates.clear(); this.refreshTurn = 0; this.issues = ['unavailable']; this.discoveryPartial = true;
    }
  }
  async read(query: OperationsQuery): Promise<OperationsView> {
    await this.refresh(); const now = this.now();
    const docs = [...this.cache.values()].flatMap(c => c.snapshot ? [{ snapshot: c.snapshot,
      freshness: c.snapshot.state === 'closed' ? 'closed' as const : c.snapshot.state === 'suspended' ? 'suspended' as const
        : now < c.snapshot.publishedAt || now - c.snapshot.publishedAt > OPERATIONS_FRESH_MS ? 'stale' as const : 'fresh' as const }] : []);
    return aggregateOperations(docs, query, now, this.issues);
  }
  async close() { this.closed = true; await this.pending; if (this.cursor) { await this.cursor.close(); this.cursor = undefined; } }
}
