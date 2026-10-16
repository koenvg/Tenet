import { randomUUID } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { DashboardArchiveReader } from '../src/inspector/dashboard-reader.js';
import { directory } from '../src/recording/files.js';
import { recordingConfig } from '../src/recording/archive.js';
import type { HostDashboardRequest, HostDashboardChunk } from './dashboard-contract.js';

const empty = (state: HostDashboardChunk['state'], reason: string): HostDashboardChunk =>
  ({ state, next: null, contributions: [], linkedThreads: [], invocations: 0, reasons: [reason], association: 'partial', omittedThreads: [], omittedInvocations: 0 });
type HostRun = { reader: DashboardArchiveReader; expires: number; next: string; steps: Map<string, HostDashboardChunk>; bytes: number;
  pending: Promise<unknown>; timer?: ReturnType<typeof setTimeout>; closed: boolean };

export function dashboardHost(now = Date.now) {
  const active = new Set<HostRun>(), terminal = new Set<HostRun>();
  let admitting = 0, disposed = false;
  const drop = async (run: HostRun) => {
    run.closed = true; terminal.delete(run); clearTimeout(run.timer);
    await run.pending; await run.reader.close(); active.delete(run); run.steps.clear();
  };
  return {
    async readDashboard(request: HostDashboardRequest): Promise<HostDashboardChunk> {
      if (disposed) return empty('restart-required', 'host-disposed');
      for (const run of [...active, ...terminal]) if (now() >= run.expires) await drop(run);
      let run: HostRun | undefined;
      if (request.kind === 'start') {
        if (active.size + admitting >= 4) return empty('limited', 'host-run-limit');
        admitting++;
        try {
          const root = request.recordingDirectory ?? recordingConfig({}).directory;
          if (!isAbsolute(root) || resolve(root) !== root) return empty('unavailable', 'archive-unavailable');
          try { await directory(root); } catch { return empty('unavailable', 'archive-unavailable'); }
          if (disposed) return empty('restart-required', 'host-disposed');
          run = { reader: new DashboardArchiveReader(root, new Set(request.threads), request.qualification),
            expires: now() + 600000, steps: new Map(), bytes: 0, next: randomUUID(), pending: Promise.resolve(), closed: false };
          const retained = run;
          run.timer = setTimeout(() => { void drop(retained); }, 600000); run.timer.unref(); active.add(run);
        } finally { admitting--; }
      } else run = [...active, ...terminal].find(r => r.next === request.token || r.steps.has(request.token));
      if (!run) return empty('restart-required', 'host-run-not-retained');
      const selected = run;
      const operation = selected.pending.then(async () => {
        if (selected.closed || disposed) return empty('restart-required', 'host-run-not-retained');
        if (request.kind === 'advance' && selected.steps.has(request.token)) return structuredClone(selected.steps.get(request.token)!);
        if (request.kind === 'advance' && request.token !== selected.next) return empty('restart-required', 'stale-host-step');
        let chunk: HostDashboardChunk;
        try {
          if (selected.bytes + 1024 * 1024 > 16 * 1024 * 1024) chunk = empty('limited', 'host-retained-limit');
          else {
            const result = await selected.reader.advance();
            chunk = { state: result.finished ? result.reasons.some(r => /limit|oversized/.test(r)) ? 'limited' : 'finished' : 'reading',
              next: null, contributions: result.contributions, linkedThreads: result.linkedThreads,
              invocations: result.invocations, reasons: result.reasons, association: result.association,
              omittedThreads: result.omittedThreads, omittedInvocations: result.omittedInvocations };
          }
        } catch { chunk = empty('restart-required', 'host-snapshot-unavailable'); }
        const step = selected.next; selected.next = randomUUID();
        if (chunk.state === 'reading') chunk.next = selected.next;
        else {
          await selected.reader.close(); clearTimeout(selected.timer); selected.timer = undefined;
          active.delete(selected);
          if (!selected.closed && !disposed) {
            while (terminal.size >= 4) await drop(terminal.values().next().value!);
            terminal.add(selected);
          }
        }
        if (selected.closed || disposed) return empty('restart-required', 'host-run-not-retained');
        selected.bytes += Buffer.byteLength(JSON.stringify(chunk)) + 128;
        selected.steps.set(step, structuredClone(chunk));
        return chunk;
      });
      selected.pending = operation.catch(() => {});
      return operation;
    },
    async dispose() { disposed = true; await Promise.all([...active, ...terminal].map(drop)); },
  };
}
