import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, rename, rm, opendir } from 'node:fs/promises';
import { join } from 'node:path';
import { directory, ensureArchive, contained } from '../recording/files.js';
import { qualifiedSessionKey, recordInvocationKey, type RecordingConfig } from '../recording/archive.js';
import type { DiagnosticSafety } from './diagnostic-safety.js';

export const OPERATIONS_DIRECTORY = '.operations-v1';
export const OPERATIONS_MAX_BYTES = 1024 * 1024;
export const OPERATIONS_FRESH_MS = 10000;
export type AssessmentOutcome = 'completed' | 'unavailable' | 'dropped' | 'cancelled' | 'interrupted';
export type Assessment = { kind: 'preparing' } | { kind: 'queued'; since: number } | { kind: 'analyzing'; since: number }
  | { kind: 'settled'; outcome: AssessmentOutcome; at: number; durationMs?: number };
export type PermissionTrack = { kind: 'pending' } | { kind: 'awaiting-approval'; attempt: string; since: number }
  | { kind: 'finalizing' } | { kind: 'committed'; outcome: 'released' | 'blocked' | 'interrupted'; at: number };
export type ArchiveAddress = { session: string; invocation: string };
export interface OperationRequest {
  id: string; project: string; tool: string; host: string; mode: 'observe' | 'enforce'; startedAt: number;
  assessment: Assessment; permission: PermissionTrack; queueWaitMs?: number; reservedAt?: number;
  archive?: ArchiveAddress; metadata: 'safe' | 'withheld'; execution: 'unknown' | 'executed' | 'failed';
}
export interface OperationsSnapshot {
  version: 1; runtimeId: string; sequence: number; publishedAt: number; coverageSince: number;
  state: 'running' | 'closed' | 'suspended'; timing: 'measured' | 'unknown';
  projects: { key: string; label: string }[]; requests: OperationRequest[];
  loss: { activeOmitted: boolean; evicted: number; withheld: number; publicationFailures: number; cleanupPartial: boolean };
  capture: { failed: number; dropped: number; drainTimeouts: number };
}
export interface OperationIdentity {
  host: string; sessionId: string; contextId: string; invocationId: string; callId: string; toolName: string; cwd: string; mode: 'observe' | 'enforce';
}
export interface RequestActivity {
  queued(): void; reserved(waitMs: number): void; analyzing(): void;
  settle(outcome: AssessmentOutcome, durationMs?: number): void;
  approval(attempt: string, waiting: boolean): void;
  permission(outcome: 'released' | 'blocked'): void; interrupt(): void;
  execution(outcome: 'unknown' | 'executed' | 'failed'): void;
}
const noop: RequestActivity = { queued() {}, reserved() {}, analyzing() {}, settle() {}, approval() {}, permission() {}, interrupt() {}, execution() {} };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const terminal = (r: OperationRequest) => r.assessment.kind === 'settled' && r.permission.kind === 'committed';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const count = (v: unknown): v is number => finite(v) && Number.isSafeInteger(v);
const hex = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && Buffer.byteLength(v) <= 256 && !/[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(v);
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const outcomes: AssessmentOutcome[] = ['completed', 'unavailable', 'dropped', 'cancelled', 'interrupted'];

export function parseOperationsSnapshot(value: unknown): OperationsSnapshot {
  if (object(value) && value.version !== undefined && value.version !== 1) throw new Error('unsupported');
  if (!object(value) || value.version !== 1 || !uuid(value.runtimeId) || !count(value.sequence) || !finite(value.publishedAt)
    || !finite(value.coverageSince) || value.coverageSince > value.publishedAt || !['running', 'closed', 'suspended'].includes(value.state)
    || !['measured', 'unknown'].includes(value.timing) || !Array.isArray(value.projects) || value.projects.length > 64
    || !Array.isArray(value.requests) || value.requests.length > 1280 || !object(value.loss) || !object(value.capture)
    || typeof value.loss.activeOmitted !== 'boolean' || typeof value.loss.cleanupPartial !== 'boolean'
    || !['evicted', 'withheld', 'publicationFailures'].every(k => count(value.loss[k]))
    || !['failed', 'dropped', 'drainTimeouts'].every(k => count(value.capture[k]))) throw new Error('invalid');
  const projects = new Set<string>(), ids = new Set<string>(); let active = 0;
  for (const p of value.projects) {
    if (!object(p) || !hex(p.key) || !text(p.label) || projects.has(p.key)) throw new Error('invalid');
    projects.add(p.key);
  }
  for (const r of value.requests) {
    if (!object(r) || !uuid(r.id) || ids.has(r.id) || !hex(r.project) || !projects.has(r.project) || !text(r.tool) || !text(r.host)
      || !['safe', 'withheld'].includes(r.metadata) || !['observe', 'enforce'].includes(r.mode) || !finite(r.startedAt) || r.startedAt > value.publishedAt
      || !['unknown', 'executed', 'failed'].includes(r.execution) || !object(r.assessment) || !object(r.permission)
      || Buffer.byteLength(JSON.stringify(r)) > 2048) throw new Error('invalid');
    ids.add(r.id);
    const a = r.assessment, p = r.permission;
    if (a.kind === 'settled') {
      if (!outcomes.includes(a.outcome) || !finite(a.at) || a.at < r.startedAt || a.at > value.publishedAt
        || a.durationMs !== undefined && !finite(a.durationMs)) throw new Error('invalid');
    } else if (a.kind === 'queued' || a.kind === 'analyzing') {
      if (!finite(a.since) || a.since < r.startedAt || a.since > value.publishedAt) throw new Error('invalid');
    } else if (a.kind !== 'preparing') throw new Error('invalid');
    if (p.kind === 'committed') {
      if (!['released', 'blocked', 'interrupted'].includes(p.outcome) || !finite(p.at) || p.at < r.startedAt || p.at > value.publishedAt) throw new Error('invalid');
    } else if (p.kind === 'awaiting-approval') {
      if (!text(p.attempt) || !finite(p.since) || p.since < r.startedAt || p.since > value.publishedAt) throw new Error('invalid');
    } else if (p.kind !== 'pending' && p.kind !== 'finalizing') throw new Error('invalid');
    if ((r.queueWaitMs !== undefined && (!finite(r.queueWaitMs) || r.mode !== 'observe' || !finite(r.reservedAt)))
      || (r.reservedAt !== undefined && (!finite(r.reservedAt) || r.reservedAt < r.startedAt || r.reservedAt > value.publishedAt))
      || (r.archive !== undefined && (!object(r.archive) || !hex(r.archive.session) || !hex(r.archive.invocation)))) throw new Error('invalid');
    if (!terminal(r as OperationRequest)) active++;
  }
  if (active > 256 || value.requests.length - active > 1024 || value.state === 'suspended' && (value.requests.length || value.projects.length)
    || Buffer.byteLength(JSON.stringify(value)) > OPERATIONS_MAX_BYTES) throw new Error('invalid');
  // Return only the private allowlist, never unvalidated extra fields from disk.
  return { version: 1, runtimeId: value.runtimeId, sequence: value.sequence, publishedAt: value.publishedAt, coverageSince: value.coverageSince,
    state: value.state, timing: value.timing, projects: value.projects.map((p: any) => ({ key: p.key, label: p.label })),
    requests: value.requests.map((r: any) => ({ id: r.id, project: r.project, tool: r.tool, host: r.host, mode: r.mode, startedAt: r.startedAt,
      assessment: r.assessment.kind === 'settled' ? { kind: 'settled', outcome: r.assessment.outcome, at: r.assessment.at,
        ...(r.assessment.durationMs !== undefined ? { durationMs: r.assessment.durationMs } : {}) }
        : r.assessment.kind === 'preparing' ? { kind: 'preparing' } : { kind: r.assessment.kind, since: r.assessment.since },
      permission: r.permission.kind === 'committed' ? { kind: 'committed', outcome: r.permission.outcome, at: r.permission.at }
        : r.permission.kind === 'awaiting-approval' ? { kind: 'awaiting-approval', attempt: r.permission.attempt, since: r.permission.since } : { kind: r.permission.kind },
      metadata: r.metadata, execution: r.execution, ...(r.queueWaitMs !== undefined ? { queueWaitMs: r.queueWaitMs, reservedAt: r.reservedAt } : {}),
      ...(r.archive ? { archive: { session: r.archive.session, invocation: r.archive.invocation } } : {}) })),
    loss: { activeOmitted: value.loss.activeOmitted, evicted: value.loss.evicted, withheld: value.loss.withheld,
      publicationFailures: value.loss.publicationFailures, cleanupPartial: value.loss.cleanupPartial },
    capture: { failed: value.capture.failed, dropped: value.capture.dropped, drainTimeouts: value.capture.drainTimeouts } };
}

export async function readOperationsFile(root: string, path: string): Promise<OperationsSnapshot> {
  if (!contained(join(root, OPERATIONS_DIRECTORY), path)) throw new Error('invalid');
  await directory(root); await directory(join(root, OPERATIONS_DIRECTORY));
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || process.getuid && stat.uid !== process.getuid()
      || stat.size > OPERATIONS_MAX_BYTES) throw new Error('invalid');
    const buffer = Buffer.alloc(OPERATIONS_MAX_BYTES + 1); let used = 0;
    while (used < buffer.length) { const { bytesRead } = await handle.read(buffer, used, buffer.length - used, null); if (!bytesRead) break; used += bytesRead; }
    if (used > OPERATIONS_MAX_BYTES) throw new Error('invalid');
    return parseOperationsSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used))));
  } finally { await handle.close(); }
}
export class OperationsRuntime {
  private runtimeId = randomUUID();
  private sequence = 0;
  private coverageSince: number;
  private lastWall: number;
  private lastMono = performance.now();
  private timing: OperationsSnapshot['timing'] = 'measured';
  private state: OperationsSnapshot['state'] = 'running';
  private rows = new Map<string, { row: OperationRequest; identity?: OperationIdentity; endedAttempts: Set<string> }>();
  private projects = new Map<string, { label: string; path?: string }>();
  private loss: OperationsSnapshot['loss'] = { activeOmitted: false, evicted: 0, withheld: 0, publicationFailures: 0, cleanupPartial: false };
  private heartbeat?: ReturnType<typeof setInterval>;
  private timer?: ReturnType<typeof setTimeout>;
  private dirty = false;
  private running?: Promise<void>;
  private lastWrite = -Infinity;
  private activated = false;
  private closed = false;
  private cleanupAt = 0;
  private cleanupCursor?: Awaited<ReturnType<typeof opendir>>;
  constructor(private config: RecordingConfig, private safety: () => DiagnosticSafety,
    private capture?: () => OperationsSnapshot['capture'], private now = Date.now) {
    this.coverageSince = this.lastWall = this.now();
  }
  private safe(id: OperationIdentity) {
    const s = this.safety();
    return s.recordingIdentity(id) && [id.cwd, id.host, id.sessionId, id.contextId, id.callId, id.toolName].every(v => s.text(v) === v)
      && text(id.toolName) && text(id.host);
  }
  private clock() {
    const wall = this.now(), mono = performance.now();
    if (wall < this.lastWall || Math.abs(wall - this.lastWall - (mono - this.lastMono)) > 5000) this.timing = 'unknown';
    this.lastWall = Math.max(wall, this.lastWall); this.lastMono = mono;
    return this.lastWall;
  }
  private project(cwd: string, safe: boolean) {
    const key = hash(cwd);
    if (!this.projects.has(key)) {
      if (this.projects.size >= 64) { this.loss.activeOmitted = true; return; }
      const label = cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Project';
      const visible = safe && text(label);
      this.projects.set(key, visible ? { label, path: cwd } : { label: 'Project withheld' });
      if (!visible) this.loss.withheld++;
    }
    return key;
  }
  registerProject(cwd: string) {
    if (this.closed) return;
    const s = this.safety();
    this.project(cwd, s.text(cwd) === cwd);
    this.activate();
  }
  private activate() {
    if (this.closed) return;
    if (this.state !== 'running') { this.state = 'running'; this.coverageSince = this.clock(); this.loss.activeOmitted = false; }
    this.activated = true;
    if (this.config.enabled && !this.heartbeat) { this.heartbeat = setInterval(() => this.changed(), 2000); this.heartbeat.unref(); }
    this.changed();
  }
  begin(identity: OperationIdentity): RequestActivity {
    if (this.closed) return noop;
    const existing = this.rows.get(identity.invocationId); if (existing) return noop;
    this.prune();
    const safe = this.safe(identity), project = this.project(identity.cwd, safe);
    if (!project || [...this.rows.values()].filter(v => !terminal(v.row)).length >= 256) {
      this.loss.activeOmitted = true; this.changed(); return noop;
    }
    if (!safe) this.loss.withheld++;
    const row: OperationRequest = { id: identity.invocationId, project, mode: identity.mode, host: safe ? identity.host : 'Host withheld',
      tool: safe ? identity.toolName : 'Tool request', metadata: safe ? 'safe' : 'withheld', startedAt: this.clock(),
      assessment: { kind: 'preparing' }, permission: { kind: 'pending' }, execution: 'unknown',
      ...(safe ? { archive: { session: qualifiedSessionKey(identity.host, identity.sessionId, identity.contextId),
        invocation: recordInvocationKey({ ...identity, schemaVersion: 5 }) } } : {}) };
    const entry = { row, identity: safe ? { ...identity } : undefined, endedAttempts: new Set<string>() };
    this.rows.set(row.id, entry); this.activate();
    const mutate = (fn: () => void) => { if (this.rows.get(row.id) !== entry || this.closed) return; fn(); this.prune(); this.changed(); };
    const settle = (outcome: AssessmentOutcome, durationMs?: number) => {
      if (row.assessment.kind === 'settled') return;
      row.assessment = { kind: 'settled', outcome, at: this.clock(), ...(durationMs !== undefined && finite(durationMs) ? { durationMs } : {}) };
      if (row.permission.kind === 'pending') row.permission = { kind: 'finalizing' };
    };
    return {
      queued: () => mutate(() => { if (row.assessment.kind === 'preparing') row.assessment = { kind: 'queued', since: this.clock() }; }),
      reserved: waitMs => mutate(() => { if (row.assessment.kind !== 'queued') return;
        row.assessment = { kind: 'preparing' }; if (finite(waitMs)) { row.queueWaitMs = waitMs; row.reservedAt = this.clock(); } }),
      analyzing: () => mutate(() => { if (row.assessment.kind === 'preparing') row.assessment = { kind: 'analyzing', since: this.clock() }; }),
      settle: (outcome, durationMs) => mutate(() => settle(outcome, durationMs)),
      approval: (attempt, waiting) => mutate(() => {
        if (row.permission.kind === 'committed' || entry.endedAttempts.has(attempt)) return;
        if (waiting) { if (row.permission.kind !== 'awaiting-approval') row.permission = { kind: 'awaiting-approval', attempt, since: this.clock() }; }
        else if (row.permission.kind === 'awaiting-approval' && row.permission.attempt === attempt) {
          if (entry.endedAttempts.size < 16) entry.endedAttempts.add(attempt);
          row.permission = { kind: 'finalizing' };
        }
      }),
      permission: outcome => mutate(() => { if (row.permission.kind !== 'committed') row.permission = { kind: 'committed', outcome, at: this.clock() }; }),
      interrupt: () => mutate(() => { settle('interrupted'); if (row.permission.kind !== 'committed') row.permission = { kind: 'committed', outcome: 'interrupted', at: this.clock() }; }),
      execution: outcome => mutate(() => { if (row.execution === 'unknown') row.execution = outcome; }),
    };
  }
  result(id: string, outcome: 'unknown' | 'executed' | 'failed') {
    const entry = this.rows.get(id);
    if (entry && entry.row.execution === 'unknown') { entry.row.execution = outcome; this.changed(); }
  }
  private prune() {
    const now = this.clock(); let settled = [...this.rows].filter(([, e]) => terminal(e.row));
    for (const [id, e] of settled) if (e.row.assessment.kind === 'settled' && now - Math.max(e.row.assessment.at, e.row.permission.kind === 'committed' ? e.row.permission.at : 0) > 3600000) {
      this.rows.delete(id); this.loss.evicted++;
    }
    settled = settled.filter(([id]) => this.rows.has(id));
    for (const [id] of settled.slice(0, Math.max(0, settled.length - 1024))) { this.rows.delete(id); this.loss.evicted++; }
  }
  snapshot(): OperationsSnapshot {
    this.prune();
    for (const e of this.rows.values()) if (e.identity && !this.safe(e.identity)) {
      e.identity = undefined; e.row.tool = 'Tool request'; e.row.host = 'Host withheld'; e.row.metadata = 'withheld'; delete e.row.archive; this.loss.withheld++;
    }
    const safe = this.safety();
    for (const p of this.projects.values()) if (p.path && safe.text(p.path) !== p.path) { delete p.path; p.label = 'Project withheld'; this.loss.withheld++; }
    const capture = this.capture?.();
    const snapshot: OperationsSnapshot = { version: 1, runtimeId: this.runtimeId, sequence: this.sequence, publishedAt: this.clock(), coverageSince: this.coverageSince,
      state: this.state, timing: this.timing, projects: this.state === 'suspended' ? [] : [...this.projects].map(([key, p]) => ({ key, label: p.label })),
      requests: this.state === 'suspended' ? [] : [...this.rows.values()].map(e => structuredClone(e.row)), loss: { ...this.loss },
      capture: { failed: capture?.failed ?? 0, dropped: capture?.dropped ?? 0, drainTimeouts: capture?.drainTimeouts ?? 0 } };
    while (Buffer.byteLength(JSON.stringify(snapshot)) > OPERATIONS_MAX_BYTES && snapshot.requests.length) {
      const index = snapshot.requests.findIndex(terminal); const [removed] = snapshot.requests.splice(index < 0 ? snapshot.requests.length - 1 : index, 1);
      if (removed) this.rows.delete(removed.id);
      if (index < 0) snapshot.loss.activeOmitted = this.loss.activeOmitted = true;
      else snapshot.loss.evicted = ++this.loss.evicted;
    }
    return snapshot;
  }
  private changed() {
    if (!this.config.enabled || !this.activated) return;
    this.dirty = true;
    if (this.timer || this.running) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, Math.max(0, 1000 - (performance.now() - this.lastWrite)));
    this.timer.unref();
  }
  async flush(): Promise<void> {
    if (!this.config.enabled || !this.activated) return;
    if (this.running) { await this.running; return; }
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    this.dirty = false; this.sequence++; this.lastWrite = performance.now();
    this.running = (async () => {
      try {
        const snapshot = this.snapshot(), bytes = Buffer.from(JSON.stringify(snapshot));
        if (bytes.length > OPERATIONS_MAX_BYTES) throw new Error('snapshot-budget');
        await ensureArchive(this.config.directory);
        const folder = join(this.config.directory, OPERATIONS_DIRECTORY); await directory(folder, true);
        const destination = join(folder, `${this.runtimeId}.json`);
        const existing = await lstat(destination).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return undefined; });
        if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1 || (existing.mode & 0o077) !== 0
          || process.getuid && existing.uid !== process.getuid())) throw new Error('unsafe-snapshot');
        const temporary = join(folder, `${this.runtimeId}-${randomUUID()}.tmp`);
        let created = false;
        try {
          const handle = await open(temporary, 'wx', 0o600); created = true;
          try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
          await rename(temporary, join(folder, `${this.runtimeId}.json`));
        } finally { if (created) await rm(temporary, { force: true }).catch(() => {}); }
        if (this.now() - this.cleanupAt > 60000) { this.cleanupAt = this.now(); await this.cleanup(folder); }
      } catch { this.loss.publicationFailures++; }
    })().finally(() => { this.running = undefined; if (this.dirty) this.changed(); });
    await this.running;
  }
  private async cleanup(folder: string) {
    this.cleanupCursor ??= await opendir(folder);
    for (let i = 0; i < 64; i++) {
      const entry = await this.cleanupCursor.read();
      if (!entry) { await this.cleanupCursor.close(); this.cleanupCursor = undefined; this.loss.cleanupPartial = false; return; }
      if (!entry.isFile() || !/^[a-f0-9-]{36}\.json$/.test(entry.name) || entry.name === `${this.runtimeId}.json`) continue;
      const path = join(folder, entry.name);
      try { const doc = await readOperationsFile(this.config.directory, path); if (entry.name === `${doc.runtimeId}.json` && this.now() - doc.publishedAt > 86400000) await rm(path); } catch {}
    }
    this.loss.cleanupPartial = true;
  }
  suspend() {
    if (!this.activated || this.closed) return;
    this.state = 'suspended'; this.rows.clear(); this.projects.clear();
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = undefined; }
    this.changed();
  }
  async close(timeoutMs: number): Promise<boolean> {
    if (this.closed) return !this.running;
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const e of this.rows.values()) {
      if (e.row.assessment.kind !== 'settled') e.row.assessment = { kind: 'settled', outcome: 'interrupted', at: this.clock() };
      if (e.row.permission.kind !== 'committed') e.row.permission = { kind: 'committed', outcome: 'interrupted', at: this.clock() };
    }
    this.state = 'closed'; this.closed = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = (async () => { if (this.running) await this.running; await this.flush(); if (this.cleanupCursor) { await this.cleanupCursor.close(); this.cleanupCursor = undefined; } return true; })();
    try { return await Promise.race([work, new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
}
