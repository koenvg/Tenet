import { lstat, opendir } from 'node:fs/promises';
import type { Dir } from 'node:fs';
import { join } from 'node:path';
import { directory, MAX_RECORD_BYTES, readPrivateFile } from '../recording/files.js';
import { READER_SCHEMAS, validRecord, type ArchiveRecord } from '../recording/contract.js';
import { recordInvocationKey, recordSessionKey, sessionKey } from '../recording/archive.js';
import { captureHealth } from './view.js';
import { sessionRuleStage, type SessionRuleStage } from './session-rules.js';
import { projectDashboardInvocation, type RuleObservation } from './bb-dashboard.js';

export type AssociationCompletion = 'pending' | 'complete' | 'partial';
export type DashboardAcquisition = {
  finished: boolean; contributions: RuleObservation[]; linkedThreads: string[]; invocations: number;
  association: AssociationCompletion; omittedThreads: string[]; omittedInvocations: number; reasons: string[];
};
type Invocation = { thread: string; session: string; tool: string; stages: SessionRuleStage[]; bytes: number; overhead: number; omitted: boolean };
const RETAINED_BYTES = 8 * 1024 * 1024;
const identity = async (path: string) => { await directory(path); const s = await lstat(path); return `${s.dev}:${s.ino}`; };

/** One private-file traversal retains selected rule facts and compact global latest-writer health only. */
export class DashboardArchiveReader {
  private rootCursor?: Dir;
  private session?: { path: string; key: string; identity: string; cursor: Dir; deferred?: string };
  private rootIdentity?: string;
  private phase: 'scanning' | 'folding' | 'finished' = 'scanning';
  private groups = new Map<string, Invocation>();
  private folding?: MapIterator<[string, Invocation]>;
  private writers = new Map<string, { sequence: number; loss: boolean }>();
  private linked = new Set<string>();
  private omitted = new Set<string>();
  private reasons = new Set<string>();
  private complete = true;
  private bytes = 0;
  private admissionClosed = false;
  private turns = 0;
  private omittedCount = 0;
  private reportedOmitted = 0;
  constructor(private root: string, private threads: Set<string>, private qualification: string, private read = readPrivateFile) {}

  private gap(reason: string) { this.complete = false; this.reasons.add(reason); }
  private record(record: ArchiveRecord) {
    const health = captureHealth([record])[0];
    if (health) {
      const writer = sessionKey(record.writerId), previous = this.writers.get(writer);
      if (record.sequence > (previous?.sequence ?? 0)) {
        if (!previous && this.writers.size >= 16384) this.reasons.add('writer-health-limit');
        else this.writers.set(writer, { sequence: record.sequence, loss: !!(health.failed || health.dropped || health.drainTimeouts) });
      }
    }
    if (![3, 4, 5].includes(record.schemaVersion) || record.host !== 'pi' || !record.bbThreadId || !this.threads.has(record.bbThreadId)) return;
    const thread = record.bbThreadId;
    this.linked.add(thread);
    const id = sessionKey(JSON.stringify([thread, recordSessionKey(record), recordInvocationKey(record)]));
    let group = this.groups.get(id);
    if (!group) {
      const session = sessionKey(JSON.stringify([thread, recordSessionKey(record)])), tool = record.toolName.slice(0, 256);
      const overhead = Buffer.byteLength(JSON.stringify({ id, thread, session, tool })) + 256;
      if (this.admissionClosed || this.groups.size >= 10000 || this.bytes + overhead > RETAINED_BYTES) {
        // Without an admitted tombstone, later stages cannot safely resurrect an invocation whose earlier stages were omitted.
        this.admissionClosed = true;
        this.reasons.add('invocation-limit'); this.omitted.add(thread); return;
      }
      group = { thread, session, tool, stages: [], bytes: 0, overhead, omitted: false };
      this.groups.set(id, group); this.bytes += overhead;
    }
    if (group.omitted) return;
    const stage = sessionRuleStage(record), cost = Buffer.byteLength(JSON.stringify(stage)) + 64;
    if (stage.snapshot?.omitted || stage.assessment?.forbiddenOverflow || group.stages.length >= 256 || group.bytes + cost > 256 * 1024 || this.bytes + cost > RETAINED_BYTES) {
      this.reasons.add('oversized-invocation'); this.omitted.add(thread); this.omittedCount++;
      this.bytes -= group.bytes; group.bytes = 0; group.stages = []; group.omitted = true; return;
    }
    group.stages.push(stage); group.bytes += cost; this.bytes += cost;
  }
  private async closeCursors() {
    const cursors = [this.session?.cursor, this.rootCursor].filter((cursor): cursor is Dir => !!cursor);
    this.session = undefined; this.rootCursor = undefined;
    await Promise.allSettled(cursors.map(cursor => cursor.close()));
  }
  async close() {
    await this.closeCursors(); this.groups.clear(); this.writers.clear(); this.folding = undefined; this.phase = 'finished';
  }
  async advance(): Promise<DashboardAcquisition> {
    const current = await identity(this.root);
    if (this.rootIdentity && this.rootIdentity !== current) throw Error('archive-identity-changed');
    this.rootIdentity = current;
    const contributions: RuleObservation[] = [];
    let invocations = 0;
    if (this.phase === 'scanning') {
      this.rootCursor ??= await opendir(this.root);
      if (this.session && await identity(this.session.path) !== this.session.identity) throw Error('session-identity-changed');
      let roots = 0, stages = 0, bytes = 0;
      // Every loop consumes one of 512 filesystem-entry work slots, including directory EOFs.
      for (let work = 0; work < 512; work++) {
        if (!this.session) {
          if (roots >= 128) break;
          roots++;
          const entry = await this.rootCursor.read();
          if (!entry) { this.phase = 'folding'; break; }
          if (!/^[a-f0-9]{64}$/.test(entry.name)) continue;
          const path = join(this.root, entry.name);
          try {
            const id = await identity(path), cursor = await opendir(path);
            this.session = { path, key: entry.name, identity: id, cursor };
            if (await identity(path) !== id) throw Error('session-identity-changed');
          } catch (error) {
            if (this.session) throw error;
            this.gap('unsafe-session-directory');
          }
          continue;
        }
        const session = this.session;
        const file = session.deferred ?? (await session.cursor.read())?.name;
        session.deferred = undefined;
        if (!file) {
          if (await identity(session.path) !== session.identity) throw Error('session-identity-changed');
          await session.cursor.close(); this.session = undefined; continue;
        }
        if (file.endsWith('.tmp')) { this.gap('temporary-record'); continue; }
        if (!file.endsWith('.json')) continue;
        const path = join(session.path, file);
        // Reserve the canonical read ceiling, including its growth-detection byte, before each read.
        let cost = MAX_RECORD_BYTES + 1;
        if (stages >= 256 || bytes + cost > 16 * 1024 * 1024) { session.deferred = file; break; }
        stages++;
        let reason = 'unsafe-or-unreadable-record';
        try {
          const text = await this.read(this.root, path);
          cost = Math.min(MAX_RECORD_BYTES + 1, Buffer.byteLength(text));
          reason = 'corrupt-record';
          const record: unknown = JSON.parse(text);
          if (record && typeof record === 'object' && 'schemaVersion' in record && !READER_SCHEMAS.includes(record.schemaVersion as typeof READER_SCHEMAS[number])) reason = 'unsupported-schema';
          if (!validRecord(record) || recordSessionKey(record) !== session.key) throw Error('invalid-record');
          this.record(record);
        } catch { this.gap(reason); }
        bytes += cost;
        if (await identity(session.path) !== session.identity) throw Error('session-identity-changed');
      }
      if (this.session && await identity(this.session.path) !== this.session.identity) throw Error('session-identity-changed');
      this.turns++;
      if (this.phase === 'scanning' && this.turns >= 128) {
        this.gap('archive-work-limit'); this.phase = 'folding';
        if (this.session) {
          for (const group of this.groups.values()) if (group.session === sessionKey(JSON.stringify([group.thread, this.session.key])) && !group.omitted) {
            this.omitted.add(group.thread); this.omittedCount++; this.bytes -= group.bytes;
            group.stages = []; group.bytes = 0; group.omitted = true;
          }
        }
      }
      if (this.phase === 'folding') {
        await this.closeCursors(); this.folding = this.groups.entries();
        if ([...this.writers.values()].some(w => w.loss)) this.reasons.add('writer-loss');
        this.writers.clear();
      }
    } else if (this.phase === 'folding') {
      const next = this.folding!.next();
      if (next.done) { this.phase = 'finished'; this.groups.clear(); this.folding = undefined; }
      else {
        const [id, group] = next.value;
        if (!group.omitted && group.stages.length) {
          contributions.push(...projectDashboardInvocation(sessionKey(JSON.stringify([this.qualification, id])), group.thread, group.session, id, group.tool, group.stages));
          invocations = 1;
        }
        this.bytes -= group.bytes + group.overhead; group.stages = [];
      }
    }
    if (await identity(this.root) !== this.rootIdentity) throw Error('archive-identity-changed');
    const omittedInvocations = this.omittedCount - this.reportedOmitted; this.reportedOmitted = this.omittedCount;
    return { finished: this.phase === 'finished', contributions, invocations, linkedThreads: [...this.linked],
      association: this.phase === 'scanning' ? 'pending' : this.complete ? 'complete' : 'partial',
      omittedThreads: [...this.omitted], omittedInvocations, reasons: [...this.reasons].slice(0, 20) };
  }
}
