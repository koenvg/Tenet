import { randomUUID } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { DashboardArchiveReader } from '../src/inspector/dashboard-reader.js';
import { DashboardHistoryIndex } from '../src/inspector/dashboard-history-index.js';
import { directory } from '../src/recording/files.js';
import { recordingConfig } from '../src/recording/archive.js';
import type { HostDashboardRequest, HostDashboardChunk, DashboardStopRequest, DashboardStopAck } from './dashboard-contract.js';

const empty = (state: HostDashboardChunk['state'], reason: string): HostDashboardChunk =>
  ({ state, next: null, contributions: [], linkedThreads: [], invocations: 0, invocationSizes: [], reasons: [reason], association: 'partial', omittedThreads: [], omittedInvocations: 0 });
type HostRun = { reader: DashboardArchiveReader; qualification: string; expires: number; next: string; steps: Map<string, HostDashboardChunk>; bytes: number;
  pending: Promise<unknown>; timer?: ReturnType<typeof setTimeout>; acquisition: 'open' | 'closed'; discarded: boolean;
  cleanup?: Promise<void>; readerClosed: boolean };

export function dashboardHost(now = Date.now) {
  const active = new Set<HostRun>(), terminal = new Set<HostRun>();
  const index = new DashboardHistoryIndex();
  let admitting = 0, disposed = false;
  const acquiring = (run: HostRun) => run.acquisition === 'open';
  async function retain(run: HostRun) {
    while (!run.discarded && !disposed && terminal.size >= 4 && !terminal.has(run)) await drop(terminal.values().next().value!);
    if (!run.discarded && !disposed) { active.delete(run); terminal.add(run); }
  }
  async function closeReader(run: HostRun) {
    if (!run.readerClosed) { await run.reader.close(); run.readerClosed = true; }
  }
  function stop(run: HostRun): Promise<void> {
    run.acquisition = 'closed';
    if (run.cleanup) return run.cleanup;
    const attempt = (async () => {
      await run.pending;
      await closeReader(run);
      if (run.discarded || disposed) {
        active.delete(run); terminal.delete(run); clearTimeout(run.timer);
      } else await retain(run);
    })();
    run.cleanup = attempt;
    void attempt.catch(() => { if (run.cleanup === attempt) run.cleanup = undefined; });
    return attempt;
  }
  function drop(run: HostRun) {
    run.discarded = true;
    return stop(run).then(() => { active.delete(run); terminal.delete(run); clearTimeout(run.timer); run.steps.clear(); });
  }
  return {
    async readDashboard(request: HostDashboardRequest): Promise<HostDashboardChunk> {
      if (disposed) return empty('restart-required', 'host-disposed');
      for (const run of [...active, ...terminal]) if (now() >= run.expires) await drop(run);
      if (request.kind === 'check') {
        const run = [...active, ...terminal].find(run => run.qualification === request.qualification);
        if (!run) return empty('restart-required', 'host-evidence-not-retained');
        const operation = run.pending.then(async () => {
          const current = await run.reader.current(() => !run.discarded && !disposed && now() < run.expires);
          return current ? { ...empty('finished', ''), reasons: [], association: 'complete' as const } : empty('restart-required', 'host-evidence-changed');
        });
        run.pending = operation.catch(() => {}); return operation;
      }
      let run: HostRun | undefined;
      if (request.kind === 'start') {
        if (active.size + admitting >= 4) return empty('limited', 'host-run-limit');
        admitting++;
        try {
          const root = request.recordingDirectory ?? recordingConfig({}).directory;
          if (!isAbsolute(root) || resolve(root) !== root) return empty('unavailable', 'archive-unavailable');
          try { await directory(root); } catch { return empty('unavailable', 'archive-unavailable'); }
          if (disposed) return empty('restart-required', 'host-disposed');
          run = { reader: new DashboardArchiveReader(root, new Set(request.threads), request.qualification, undefined, index.source(root)), qualification: request.qualification,
            expires: now() + 600000, steps: new Map(), bytes: 0, next: randomUUID(), pending: Promise.resolve(),
            acquisition: 'open', discarded: false, readerClosed: false };
          const retained = run;
          run.timer = setTimeout(() => { void drop(retained).catch(() => {}); }, 600000); run.timer.unref(); active.add(run);
        } finally { admitting--; }
      } else run = [...active, ...terminal].find(r => r.next === request.token || r.steps.has(request.token));
      if (!run) return empty('restart-required', 'host-run-not-retained');
      const selected = run;
      const operation = selected.pending.then(async () => {
        if (selected.discarded || disposed || now() >= selected.expires) return empty('restart-required', 'host-run-not-retained');
        if (request.kind === 'advance' && selected.steps.has(request.token) && !await selected.reader.current(() => !selected.discarded && !disposed && now() < selected.expires)) return empty('restart-required', 'host-evidence-changed');
        if (request.kind === 'advance' && selected.steps.has(request.token)) return structuredClone(selected.steps.get(request.token)!);
        if (selected.acquisition === 'closed') return empty('restart-required', 'host-acquisition-stopped');
        if (request.kind === 'advance' && request.token !== selected.next) return empty('restart-required', 'stale-host-step');
        let chunk: HostDashboardChunk;
        try {
          if (selected.bytes + 1024 * 1024 > 16 * 1024 * 1024) chunk = empty('limited', 'host-retained-limit');
          else {
            const result = await selected.reader.advance();
            chunk = { state: result.finished ? result.reasons.some(r => /limit|oversized/.test(r)) ? 'limited' : 'finished' : 'reading',
              next: null, contributions: result.contributions, linkedThreads: result.linkedThreads,
              invocations: result.invocations, invocationSizes: result.invocationSizes, reasons: result.reasons, association: result.association,
              omittedThreads: result.omittedThreads, omittedInvocations: result.omittedInvocations };
          }
        } catch { chunk = empty('restart-required', 'host-snapshot-unavailable'); }
        if (selected.discarded || disposed || !acquiring(selected) || now() >= selected.expires)
          return empty('restart-required', 'host-run-not-retained');
        if (chunk.state !== 'reading') {
          selected.acquisition = 'closed';
          await closeReader(selected);
          await retain(selected);
        }
        if (selected.discarded || disposed || now() >= selected.expires) return empty('restart-required', 'host-run-not-retained');
        const step = selected.next;
        selected.next = randomUUID();
        if (chunk.state === 'reading') chunk.next = selected.next;
        selected.bytes += Buffer.byteLength(JSON.stringify(chunk)) + 128;
        selected.steps.set(step, structuredClone(chunk));
        return chunk;
      });
      selected.pending = operation.catch(() => {});
      return operation;
    },
    async stopDashboard({ token }: DashboardStopRequest): Promise<DashboardStopAck> {
      const run = [...active, ...terminal].find(r => r.next === token || r.steps.has(token));
      if (run) await (now() >= run.expires ? drop(run) : stop(run));
      return { stopped: true };
    },
    async dispose() { disposed = true; await Promise.all([...active, ...terminal].map(drop)); index.close(); },
  };
}
