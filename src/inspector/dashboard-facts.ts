import { recordInvocationKey, recordSessionKey } from '../recording/archive.js';
import { READER_SCHEMAS, validRecord } from '../recording/contract.js';
import { readPrivateFile } from '../recording/files.js';
import { sessionRuleStage, type SessionRuleStage } from './session-rules.js';
import { captureHealth } from './view.js';

export type DashboardRecordFacts = {
  health: { writer: string; sequence: number; loss: boolean } | null;
  thread: string | null; session: string; invocation: string; tool: string;
  stage: SessionRuleStage | null; bytes: number;
};
export type DashboardFactSource = (path: string, fingerprint: string, threads: Set<string>, load: () => Promise<DashboardRecordFacts>) => Promise<DashboardRecordFacts>;
export class DashboardRecordIssue extends Error {
  constructor(reason: string, readonly bytes: number) { super(reason); }
}

export async function dashboardRecordFacts(root: string, path: string, session: string, threads: Set<string>, read = readPrivateFile): Promise<DashboardRecordFacts> {
  const text = await read(root, path);
  let record: unknown;
  try { record = JSON.parse(text); } catch { throw new DashboardRecordIssue('corrupt-record', Buffer.byteLength(text)); }
  if (record && typeof record === 'object' && 'schemaVersion' in record && !READER_SCHEMAS.includes(record.schemaVersion as typeof READER_SCHEMAS[number])) throw new DashboardRecordIssue('unsupported-schema', Buffer.byteLength(text));
  if (!validRecord(record) || recordSessionKey(record) !== session) throw new DashboardRecordIssue('corrupt-record', Buffer.byteLength(text));
  const health = captureHealth([record])[0];
  const thread = [3, 4, 5].includes(record.schemaVersion) && record.host === 'pi' && record.bbThreadId ? record.bbThreadId : null;
  return { health: health ? { writer: record.writerId, sequence: record.sequence, loss: !!(health.failed || health.dropped || health.drainTimeouts) } : null,
    thread, session, invocation: recordInvocationKey(record), tool: record.toolName.slice(0, 256),
    stage: thread && threads.has(thread) ? sessionRuleStage(record) : null, bytes: Buffer.byteLength(text) };
}
