import { createHash, randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { createConnection, createServer, type Socket } from 'node:net';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse } from 'node:path';
import type { Judge } from '../decision/contracts.js';
import { GuardRuntime, type Capabilities, type RuntimeIdentity } from '../runtime/guard.js';
import { ActivationStore } from '../runtime/activation.js';
import { ArchiveWriter, recordingConfig } from '../recording/archive.js';
import { deliverOwnerRecord } from '../runtime/owner-record.js';
import type { OwnerRecord } from '../sdk/types.js';
export const MAX_FRAME = 128 * 1024;
const MAX_SESSIONS = 128;
const MAX_CONNECTIONS = 32;
const SERVER_DEADLINE = 2600;
export const defaultDirectory = () => join(homedir(), '.tenet', 'claude');
const owner = (stat: Stats) => process.getuid === undefined || stat.uid === process.getuid();
const privateFile = (stat: Stats) => owner(stat) && (stat.mode & 0o077) === 0 && stat.nlink === 1 && stat.isFile();
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value);
const identity = (r: BridgeRequest): RuntimeIdentity => ({ host: 'claude-code', sessionId: r.sessionId, contextId: r.contextId });
const DENY: BridgeResponse = { version: 1, decision: 'deny' };
export type BridgeRequest = { version: 1; event: 'start' | 'resume' | 'call' | 'result' | 'invalidate' | 'end' | 'status'; sessionId: string; contextId: string; cwd: string;
  callId?: string; toolName?: string; input?: unknown; content?: unknown; isError?: boolean };
export type BridgeResponse = { version: 1; decision: 'pass' | 'deny'; mode?: 'observe' | 'enforce'; reason?: 'approval-unavailable'; generation?: string;
  status?: { sessions: number; coverage: 'unverified'; capture: { enabled: boolean; failed: number; dropped: number; pending: number };
    readiness?: { eligible: boolean; policy: 'ready' | 'unavailable'; reason?: string } } };
export type LocalState = { cwd: string; eligible: boolean; deferred?: boolean; generation?: string };
async function secureDirectory(directory: string, create = false): Promise<void> {
  if (!isAbsolute(directory) || Buffer.byteLength(join(directory, 'bridge.sock')) > 100) throw new Error('unsafe-directory');
  const parts: string[] = [];
  for (let current = directory; current !== parse(current).root; current = dirname(current)) parts.unshift(current);
  for (const path of parts) {
    let stat: Stats;
    try { stat = await lstat(path); }
    catch (error) {
      if (!create || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(path, { mode: 0o700 });
      stat = await lstat(path);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink() || (path === directory && (!owner(stat) || (stat.mode & 0o077) !== 0))) throw new Error('unsafe-directory');
  }
}
export async function socketPath(directory: string, create = false): Promise<string> {
  await secureDirectory(directory, create);
  const path = join(directory, 'bridge.sock');
  try {
    const stat = await lstat(path);
    if (!stat.isSocket() || !owner(stat) || (stat.mode & 0o077) !== 0) throw new Error('unsafe-socket');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return path;
}
function statePath(directory: string, sessionId: string): string {
  if (!validId(sessionId)) throw new Error('invalid-session');
  return join(directory, `session-${createHash('sha256').update(sessionId).digest('hex')}.json`);
}
const validGeneration = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);
export async function readLocalState(directory: string, sessionId: string): Promise<LocalState | undefined> {
  await secureDirectory(directory);
  const path = statePath(directory, sessionId);
  let fd;
  try {
    fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await fd.stat();
    if (!privateFile(stat) || stat.size > 1024) throw new Error('unsafe-state');
    const bytes = await fd.readFile();
    if (bytes.length > 1024) throw new Error('unsafe-state');
    const same = await lstat(path);
    if (stat.dev !== same.dev || stat.ino !== same.ino) throw new Error('unsafe-state');
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-state');
    const row = value as Record<string, unknown>;
    const keys = Object.keys(row).sort().join(',');
    if (!((row.version === 1 && keys === 'cwd,eligible,sessionId,version')
      || (row.version === 2 && keys === 'cwd,deferred,eligible,sessionId,version')
      || (row.version === 3 && keys === 'cwd,deferred,eligible,generation,sessionId,version')) || row.sessionId !== sessionId
      || typeof row.cwd !== 'string' || !isAbsolute(row.cwd) || typeof row.eligible !== 'boolean'
      || (row.version !== 1 && typeof row.deferred !== 'boolean')
      || (row.version === 3 && row.generation !== null && !validGeneration(row.generation))) throw new Error('invalid-state');
    return { cwd: row.cwd, eligible: row.eligible, deferred: row.version !== 1 && row.deferred === true,
      ...(row.version === 3 && validGeneration(row.generation) ? { generation: row.generation } : {}) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  } finally { await fd?.close(); }
}
export async function writeLocalState(directory: string, sessionId: string, state: LocalState): Promise<void> {
  await secureDirectory(directory, true);
  if (!isAbsolute(state.cwd) || typeof state.eligible !== 'boolean' || (state.deferred !== undefined && typeof state.deferred !== 'boolean')
    || (state.generation !== undefined && !validGeneration(state.generation))) throw new Error('invalid-state');
  const path = statePath(directory, sessionId);
  try { const stat = await lstat(path); if (!privateFile(stat)) throw new Error('unsafe-state'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    const fd = await open(tmp, 'wx', 0o600);
    try { await fd.writeFile(JSON.stringify({ version: 3, sessionId, cwd: state.cwd, eligible: state.eligible, deferred: state.deferred === true, generation: state.generation ?? null })); await fd.sync(); }
    finally { await fd.close(); }
    await rename(tmp, path);
    const dir = await open(directory, 'r');
    try { await dir.sync(); } finally { await dir.close(); }
  } finally { await rm(tmp, { force: true }).catch(() => {}); }
}
export async function deleteLocalState(directory: string, sessionId: string): Promise<void> {
  await secureDirectory(directory);
  const path = statePath(directory, sessionId);
  try {
    const stat = await lstat(path);
    if (!privateFile(stat)) throw new Error('unsafe-state');
    await rm(path);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

function validRequest(value: unknown): value is BridgeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (r.version !== 1 || !['start', 'resume', 'call', 'result', 'invalidate', 'end', 'status'].includes(String(r.event))
    || (r.event === 'status' ? r.sessionId !== '' && !validId(r.sessionId) : !validId(r.sessionId))
    || !validId(r.contextId) || typeof r.cwd !== 'string' || !isAbsolute(r.cwd) || r.cwd.length > 4096) return false;
  const allowed = r.event === 'call' ? ['version', 'event', 'sessionId', 'contextId', 'cwd', 'callId', 'toolName', 'input']
    : r.event === 'result' ? ['version', 'event', 'sessionId', 'contextId', 'cwd', 'callId', 'toolName', 'content', 'isError']
      : ['version', 'event', 'sessionId', 'contextId', 'cwd'];
  if (Object.keys(r).some(k => !allowed.includes(k))) return false;
  if (r.event === 'call' || r.event === 'result') {
    if (!validId(r.callId) || !validId(r.toolName)) return false;
    if (r.event === 'call' && !Object.hasOwn(r, 'input')) return false;
    if (r.event === 'result' && typeof r.isError !== 'boolean') return false;
  }
  return true;
}
function validResponse(value: unknown): value is BridgeResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (r.status !== undefined) {
    if (!r.status || typeof r.status !== 'object' || Array.isArray(r.status)) return false;
    const status = r.status as Record<string, unknown>;
    if (!Number.isSafeInteger(status.sessions) || (status.sessions as number) < 0 || (status.sessions as number) > MAX_SESSIONS || status.coverage !== 'unverified'
      || Object.keys(status).some(k => !['sessions', 'coverage', 'capture', 'readiness'].includes(k))) return false;
    if (!status.capture || typeof status.capture !== 'object' || Array.isArray(status.capture)) return false;
    const capture = status.capture as Record<string, unknown>;
    if (typeof capture.enabled !== 'boolean' || Object.keys(capture).sort().join(',') !== 'dropped,enabled,failed,pending'
      || !['dropped', 'failed', 'pending'].every(k => Number.isSafeInteger(capture[k]) && (capture[k] as number) >= 0)) return false;
    if (status.readiness !== undefined) {
      if (!status.readiness || typeof status.readiness !== 'object' || Array.isArray(status.readiness)) return false;
      const ready = status.readiness as Record<string, unknown>;
      if (typeof ready.eligible !== 'boolean' || !['ready', 'unavailable'].includes(String(ready.policy))
        || (ready.reason !== undefined && (typeof ready.reason !== 'string' || ready.reason.length > 128))
        || Object.keys(ready).some(k => !['eligible', 'policy', 'reason'].includes(k))) return false;
    }
  }
  return r.version === 1 && (r.decision === 'pass' || r.decision === 'deny')
    && (r.reason === undefined || (r.decision === 'deny' && r.reason === 'approval-unavailable'))
    && (r.mode === undefined || r.mode === 'observe' || r.mode === 'enforce')
    && (r.generation === undefined || validGeneration(r.generation))
    && Object.keys(r).every(k => ['version', 'decision', 'mode', 'reason', 'generation', 'status'].includes(k));
}
/** Read exactly one bounded UTF-8 JSON line, or fail before the caller's deadline. */
function frame(socket: Socket, limit: number, deadline: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const chunks: Buffer[] = [];
    let length = 0;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off('data', data); socket.off('end', end); socket.off('error', failure);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('deadline')), deadline);
    const failure = () => finish(new Error('disconnect'));
    const end = () => finish(new Error('disconnect'));
    const data = (chunk: Buffer) => {
      length += chunk.length;
      if (length > limit) return finish(new Error('oversize'));
      chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const index = bytes.indexOf(10);
      if (index < 0) return;
      if (index !== bytes.length - 1) return finish(new Error('trailing-data'));
      try { finish(undefined, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, index)))); }
      catch { finish(new Error('invalid-json')); }
    };
    socket.on('data', data).once('end', end).once('error', failure);
  });
}
export async function exchange(directory: string, request: BridgeRequest, deadlineMs = 3300): Promise<BridgeResponse> {
  if (!validRequest(request) || !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 4000) return DENY;
  const bytes = Buffer.from(JSON.stringify(request) + '\n');
  if (bytes.length > MAX_FRAME) return DENY;
  let socket: Socket | undefined;
  try {
    const path = await socketPath(directory);
    socket = createConnection(path);
    const connection = socket;
    const response = frame(connection, 2048, deadlineMs);
    connection.write(bytes);
    const value = await response;
    return validResponse(value) ? value : DENY;
  } catch { return DENY; }
  finally { socket?.destroy(); }
}
const capabilities: Capabilities = { host: 'claude-code', version: null, profile: null, interception: false, resultCorrelation: false,
  lifecycleInvalidation: false, argumentStability: false, trustedApproval: false,
  limitations: ['actual-host-unverified', 'approval-unavailable', 'hook-not-an-os-boundary'] };
/** The bridge owns runtime state; reconnecting a hook never starts an old session implicitly. */
export async function startBridge(options: { directory: string; env: Record<string, string | undefined>; judge: Judge; hasJudge?: boolean;
  /** Owner-configured embedding callback only. Must be bounded; never forward to agent history. */
  onOwnerRecord?: (record: OwnerRecord) => void;
}): Promise<{ close(): Promise<void> }> {
  const path = await socketPath(options.directory, true);
  try { await lstat(path); throw new Error('socket-already-exists'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const activation = new ActivationStore(options.env.TENET_CONTROL_PATH);
  const archive = new ArchiveWriter(recordingConfig(options.env));
  const generation = randomUUID();
  const runtime = new GuardRuntime({ env: options.env, judge: options.judge, activation,
    emit: (stage, data) => deliverOwnerRecord(options.onOwnerRecord, stage, data, runtime.mode),
    bindRecording: id => archive.bind({ host: id.host, sessionId: id.sessionId, contextId: id.contextId,
      invocationId: id.invocationId, callId: id.callId, toolName: id.toolName, cwd: id.cwd, mode: id.mode }),
  }, capabilities);
  const sessions = new Map<string, string>();
  const resuming = new Map<string, Promise<BridgeResponse>>();
  let connections = 0;
  const sockets = new Set<Socket>();
  const processRequest = async (r: unknown, signal: AbortSignal): Promise<BridgeResponse> => {
    if (!validRequest(r)) return DENY;
    const id = identity(r);
    const previous = sessions.get(r.sessionId);
    if (r.event === 'status') {
      const readiness = previous ? runtime.coverageStatus(id).readiness : undefined;
      const health = archive.health();
      return { version: 1, decision: 'pass', generation, status: { sessions: sessions.size, coverage: 'unverified',
        capture: { enabled: health.enabled, failed: health.failed, dropped: health.dropped, pending: health.pending },
        ...(readiness ? { readiness: { eligible: readiness.eligible, policy: readiness.policy.available ? 'ready' : 'unavailable',
          ...(readiness.unavailable ? { reason: readiness.unavailable } : {}) } } : {}) } };
    }
    if (r.event === 'start') {
      const marker = await readLocalState(options.directory, r.sessionId).catch(() => undefined);
      if (!marker?.eligible || marker.cwd !== r.cwd || marker.generation !== generation) return DENY;
      if (!previous && sessions.size >= MAX_SESSIONS) return DENY;
      if (previous) runtime.shutdown(id);
      const ready = await runtime.start(id, r.cwd, options.hasJudge ?? true);
      if (!ready?.eligible) return DENY;
      sessions.set(r.sessionId, r.cwd);
      return { version: 1, decision: 'pass' };
    }
    if (r.event === 'resume') {
      const marker = await readLocalState(options.directory, r.sessionId).catch(() => undefined);
      if (!marker?.eligible || marker.cwd !== r.cwd || marker.generation !== generation || activation.refresh() !== 'on'
        || (previous && previous !== r.cwd)) return DENY;
      if (previous) return { version: 1, decision: 'pass' }; // Concurrent hooks share the fresh generation.
      if (!marker.deferred) return DENY; // A restart cannot reopen a previously live session.
      if (sessions.size >= MAX_SESSIONS) return DENY;
      const inFlight = resuming.get(r.sessionId);
      if (inFlight) return inFlight;
      const attempt: Promise<BridgeResponse> = runtime.start(id, r.cwd, options.hasJudge ?? true).then(ready => {
        if (!ready?.eligible || activation.refresh() !== 'on') { runtime.shutdown(id); return DENY; }
        sessions.set(r.sessionId, r.cwd);
        return { version: 1 as const, decision: 'pass' as const };
      }).finally(() => { resuming.delete(r.sessionId); });
      resuming.set(r.sessionId, attempt);
      return attempt;
    }
    if (r.event === 'end') {
      if (!previous) return DENY;
      runtime.closeSession(id); sessions.delete(r.sessionId);
      return { version: 1, decision: 'pass' };
    }
    if (!previous || previous !== r.cwd) return DENY;
    if (r.event === 'invalidate') { runtime.invalidate('claude-lifecycle', id); return { version: 1, decision: 'pass' }; }
    if (!runtime.coverageStatus(id).readiness.eligible) return DENY;
    if (r.event === 'result') {
      runtime.result({ ...id, callId: r.callId!, toolName: r.toolName!, content: r.content, isError: r.isError });
      return { version: 1, decision: 'pass' };
    }
    let reason: string | undefined;
    const call = { ...id, cwd: r.cwd, callId: r.callId!, toolName: r.toolName!, input: r.input };
    const veto = await runtime.call({ ...call, signal, current: () => call, onPermission: (_identity, permission) => { reason = permission.reason; } });
    return veto ? { version: 1, decision: 'deny', ...(reason === 'approval-unavailable' ? { reason: 'approval-unavailable' as const } : {}) }
      : { version: 1, decision: 'pass' };
  };
  const server = createServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    if (++connections > MAX_CONNECTIONS) { connections--; socket.destroy(); return; }
    const complete = () => { connections--; };
    socket.once('close', complete);
    const controller = new AbortController();
    socket.once('close', () => controller.abort());
    void frame(socket, MAX_FRAME, SERVER_DEADLINE).then(request => processRequest(request, controller.signal)).catch(() => DENY).then(reply => {
      if (!socket.destroyed) socket.end(JSON.stringify({ ...reply, mode: runtime.mode }) + '\n');
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(path, () => { server.off('error', reject); resolve(); });
    });
    await chmod(path, 0o600);
    const stat = await lstat(path);
    if (!stat.isSocket() || !owner(stat) || (stat.mode & 0o077) !== 0) throw new Error('unsafe-socket');
  } catch (error) { server.close(); throw error; }
  activation.watch(value => runtime.activationChanged(value));
  return { close: async () => {
    activation.close(); runtime.shutdown();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    const stat = await lstat(path).catch(() => undefined);
    if (stat?.isSocket() && owner(stat)) await rm(path);
    await archive.close();
  } };
}
