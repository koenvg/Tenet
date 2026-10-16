import { createHash, randomUUID } from 'node:crypto';
import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { supportsTenetProvider } from './supported-provider.js';
import { dashboardMethods, dashboardHostMethods, type Coverage, type DashboardPage, type DashboardScope, type DashboardRequest,
  type ContributorRequest, type HostDashboardRequest, type HostDashboardChunk } from './dashboard-contract.js';
import { reduceDashboardContribution, type RetainedRule } from '../src/inspector/bb-dashboard.js';

type Target = { threadId: string; projectId: string; label: string; hostId: string; environmentId: string; directory?: string; fingerprint: string };
type Destination = { targets: Target[]; next?: string; linked: Set<string>; done: boolean };
type Lifecycle = { kind: 'discovering'; archived: boolean; offset: number; windows: number }
  | { kind: 'reading'; resolve: number; destination: number }
  | { kind: 'finished' | 'limited' | 'restart-required' };
export type DashboardRun = {
  id: string; scope: DashboardScope; projectLabel: string; started: number; expires: number; revision: number; lifecycle: Lifecycle;
  threads: Map<string, string>; targets: Map<string, Target>; destinations: Destination[];
  rows: Map<string, RetainedRule>; bytes: number; coverage: Coverage; next: string; steps: Map<string, DashboardPage>; replayBytes: number;
  pending: Promise<unknown>; cursors: Map<string, { revision: number; offset: number; rule?: string }>;
  timer?: ReturnType<typeof setTimeout>;
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reason = (run: DashboardRun, value: string) => { if (!run.coverage.reasons.includes(value) && run.coverage.reasons.length < 20) run.coverage.reasons.push(value); };
const invalidPage = (run?: DashboardRun): DashboardPage => ({ run: run?.id ?? 'expired', scope: run?.scope ?? { kind: 'project', projectId: 'proj_unavailable' },
  projectLabel: run?.projectLabel ?? '', state: 'restart-required', revision: run?.revision ?? 0, started: run?.started ?? Date.now(), observed: Date.now(),
  coverage: { discovered: 0, resolved: 0, processed: 0, unknown: 0, unavailable: 0, unprocessed: 0, partial: 0, omittedInvocations: 0, invocations: 0, capture: 'best-effort', reasons: ['scope-access-or-run-changed'] },
  rows: [], next: null, rowsNext: null });

export function dashboardHandlers(sdk: BbPluginApi['sdk'], directories: () => Promise<string>,
  callHost: (input: HostDashboardRequest, hostId: string) => Promise<HostDashboardChunk>, now = Date.now) {
  const runs = new Map<string, DashboardRun>();
  type AuthorizationPass = {
    project: Promise<Awaited<ReturnType<typeof sdk.projects.get>> | null>; settings: Promise<Record<string, unknown> | null>;
    environments: Map<string, ReturnType<typeof sdk.environments.get>>;
  };
  function authorizationPass(projectId: string): AuthorizationPass {
    return { project: sdk.projects.get({ projectId }).catch(() => null), settings: (async () => {
      const settings: unknown = JSON.parse(await directories());
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw Error('invalid-directories');
      return settings as Record<string, unknown>;
    })().catch(() => null), environments: new Map() };
  }
  async function target(threadId: string, projectId: string, pass: AuthorizationPass): Promise<Target | null> {
    try {
      const thread = await sdk.threads.get({ threadId });
      if (!thread || thread.id !== threadId || thread.deletedAt || thread.projectId !== projectId || !supportsTenetProvider(thread.providerId) || !thread.environmentId) return null;
      const project = await pass.project;
      if (!project || project.id !== projectId) return null;
      let read = pass.environments.get(thread.environmentId);
      if (!read) { read = sdk.environments.get({ environmentId: thread.environmentId }); pass.environments.set(thread.environmentId, read); }
      const environment = await read;
      if (!environment || environment.id !== thread.environmentId || !/^host_[a-z0-9]{8,64}$/.test(environment.hostId)) return null;
      const settings = await pass.settings;
      if (!settings) return null;
      const directory = settings[environment.hostId];
      if (directory !== undefined && (typeof directory !== 'string' || directory.length > 4096)) return null;
      return { threadId, projectId, label: (thread.title ?? thread.titleFallback ?? threadId).slice(0, 256),
        environmentId: environment.id, hostId: environment.hostId, directory: directory as string | undefined,
        fingerprint: hash([threadId, projectId, thread.providerId, environment.id, environment.hostId, directory ?? null]) };
    } catch { return null; }
  }
  async function valid(run: DashboardRun) {
    if (run.expires <= now() || run.lifecycle.kind === 'restart-required') return false;
    const pass = authorizationPass(run.scope.projectId);
    try {
      const project = await pass.project;
      if (project?.id !== run.scope.projectId) throw Error('project-unavailable');
    } catch { run.lifecycle = { kind: 'restart-required' }; run.rows.clear(); run.steps.clear(); return false; }
    // At most 128 retained targets. Aggregates never outlive contributor access.
    const targets = [...run.targets.values()];
    for (let start = 0; start < targets.length; start += 8) {
      const batch = targets.slice(start, start + 8);
      const current = await Promise.all(batch.map(previous => target(previous.threadId, previous.projectId, pass)));
      if (batch.some((previous, index) => !current[index] || current[index]!.fingerprint !== previous.fingerprint)) {
        run.lifecycle = { kind: 'restart-required' }; run.rows.clear(); run.steps.clear(); return false;
      }
    }
    return pass;
  }
  function cursor(run: DashboardRun, offset: number, rule?: string) {
    if (run.cursors.size >= 128) run.cursors.delete(run.cursors.keys().next().value!);
    const token = randomUUID(); run.cursors.set(token, { revision: run.revision, offset, rule }); return token;
  }
  function offset(run: DashboardRun, token?: string, rule?: string) {
    if (!token) return 0;
    const saved = run.cursors.get(token);
    if (!saved || saved.revision !== run.revision || saved.rule !== rule) throw Error('stale-dashboard-page');
    return saved.offset;
  }
  function page(run: DashboardRun, start = 0): DashboardPage {
    const rows = [...run.rows.values()].sort((a, b) => b.failed - a.failed || a.key.localeCompare(b.key));
    return dashboardMethods.dashboard.output.parse({ run: run.id, scope: run.scope, projectLabel: run.projectLabel, state: run.lifecycle.kind, revision: run.revision,
      started: run.started, observed: now(), coverage: { ...run.coverage, reasons: [...run.coverage.reasons] },
      rows: rows.slice(start, start + 50).map(({ contributions, ...row }) => row),
      next: ['discovering', 'reading'].includes(run.lifecycle.kind) ? run.next : null,
      rowsNext: start + 50 < rows.length ? cursor(run, start + 50) : null });
  }
  async function advance(run: DashboardRun, pass: AuthorizationPass) {
    const state = run.lifecycle;
    if (state.kind === 'discovering') {
      const projectId = run.scope.projectId;
      let finished = false;
      try {
        const rows = await sdk.threads.list({ projectId, includeHidden: true, archived: state.archived, offset: state.offset, limit: 50 });
        for (const thread of rows.slice(0, 50)) {
          if (thread.projectId !== projectId || thread.deletedAt || !supportsTenetProvider(thread.providerId) || !/^thr_[a-z0-9]{8,64}$/.test(thread.id)) continue;
          if (run.threads.size >= 128 && !run.threads.has(thread.id)) { reason(run, 'thread-limit'); break; }
          run.threads.set(thread.id, projectId);
        }
        state.windows++;
        if (rows.length >= 50) state.offset += 50;
        else if (!state.archived) { state.archived = true; state.offset = 0; }
        else finished = true;
      } catch { reason(run, 'project-discovery-unavailable'); finished = true; }
      run.coverage.discovered = run.threads.size;
      run.coverage.unprocessed = run.threads.size;
      if (state.windows >= 512) reason(run, 'metadata-window-limit');
      if (run.coverage.reasons.includes('thread-limit') || state.windows >= 512 || finished)
        run.lifecycle = { kind: 'reading', resolve: 0, destination: 0 };
      return;
    }
    if (state.kind !== 'reading') return;
    const threads = [...run.threads];
    if (state.resolve < threads.length) {
      for (const [threadId, projectId] of threads.slice(state.resolve, state.resolve + 8)) {
        const selected = await target(threadId, projectId, pass);
        if (selected) { run.targets.set(threadId, selected); run.coverage.resolved++; }
        else { run.coverage.unavailable++; run.coverage.unprocessed--; }
      }
      state.resolve = Math.min(state.resolve + 8, threads.length);
      if (state.resolve === threads.length) {
        const grouped = new Map<string, Destination>();
        for (const selected of run.targets.values()) {
          const key = hash([selected.hostId, selected.directory ?? null]);
          const destination = grouped.get(key) ?? { targets: [], linked: new Set<string>(), done: false };
          destination.targets.push(selected); grouped.set(key, destination);
        }
        run.destinations = [...grouped.values()];
      }
      return;
    }
    const destination = run.destinations[state.destination];
    if (!destination) { run.lifecycle = { kind: run.coverage.reasons.some(r => /limit|oversized/.test(r)) ? 'limited' : 'finished' }; return; }
    const selected = destination.targets[0]!;
    let chunk: HostDashboardChunk;
    try {
      chunk = dashboardHostMethods.readDashboard.output.parse(await callHost(destination.next ? { kind: 'advance', token: destination.next }
        : { kind: 'start', threads: destination.targets.map(t => t.threadId), qualification: hash([run.id, selected.hostId, selected.directory ?? null]),
          ...(selected.directory !== undefined ? { recordingDirectory: selected.directory } : {}) }, selected.hostId));
    } catch { chunk = { state: 'unavailable', next: null, contributions: [], linkedThreads: [], invocations: 0, association: 'partial', omittedThreads: [], omittedInvocations: 0, reasons: ['destination-unavailable'] }; }
    if (chunk.state === 'restart-required') { run.lifecycle = { kind: 'restart-required' }; run.rows.clear(); return; }
    chunk.reasons.filter(r => r !== 'indexing-in-progress').forEach(r => reason(run, r));
    for (const linked of chunk.linkedThreads) if (destination.targets.some(t => t.threadId === linked) && !destination.linked.has(linked)) {
      destination.linked.add(linked); run.coverage.partial++; run.coverage.unprocessed--;
    }
    run.coverage.omittedInvocations += chunk.omittedInvocations;
    if (run.coverage.invocations + chunk.invocations > 10000) { reason(run, 'invocation-limit'); run.lifecycle = { kind: 'limited' }; return; }
    run.coverage.invocations += chunk.invocations;
    for (const contribution of chunk.contributions) {
      if (!destination.targets.some(t => t.threadId === contribution.threadId)) throw Error('foreign-dashboard-contribution');
      const previous = run.rows.get(contribution.key);
      const cost = Buffer.byteLength(JSON.stringify(contribution)) + 256;
      if (previous?.contributions.some(c => c.threadId === contribution.threadId && c.sessionId === contribution.sessionId && c.callId === contribution.callId)) continue;
      if ((!previous && run.rows.size >= 4096) || run.bytes + cost > 16 * 1024 * 1024) {
        reason(run, 'retained-result-limit'); run.lifecycle = { kind: 'limited' }; return;
      }
      run.rows.set(contribution.key, reduceDashboardContribution(previous, contribution)); run.bytes += cost;
    }
    destination.next = chunk.next ?? undefined;
    if (chunk.state !== 'reading') {
      destination.done = true; state.destination++;
      for (const target of destination.targets) {
        const linked = destination.linked.has(target.threadId);
        if (chunk.state === 'unavailable' && !linked) { run.coverage.unavailable++; run.coverage.unprocessed--; }
        else if (chunk.association === 'complete' && !chunk.omittedThreads.includes(target.threadId)) {
          run.coverage.processed++;
          if (linked) run.coverage.partial--;
          else { run.coverage.unknown++; run.coverage.unprocessed--; }
        }
      }
    }
  }
  return {
    async dashboard(request: DashboardRequest): Promise<DashboardPage> {
      for (const [id, run] of runs) if (run.expires <= now()) { clearTimeout(run.timer); runs.delete(id); }
      let run: DashboardRun | undefined;
      if (request.kind === 'start') {
        if (runs.size >= 4) { const oldest = runs.values().next().value!; clearTimeout(oldest.timer); runs.delete(oldest.id); }
        const started = now();
        run = { id: randomUUID(), scope: request.scope, projectLabel: '', started, expires: started + 600000, revision: 0,
          lifecycle: { kind: 'discovering', archived: false, offset: 0, windows: 0 }, threads: new Map(), targets: new Map(), destinations: [], rows: new Map(), bytes: 0,
          coverage: { discovered: 0, resolved: 0, processed: 0, unknown: 0, unavailable: 0, unprocessed: 0, partial: 0, omittedInvocations: 0, invocations: 0, capture: 'best-effort', reasons: [] },
          next: randomUUID(), steps: new Map(), replayBytes: 0, pending: Promise.resolve(), cursors: new Map() };
        runs.set(run.id, run);
        const retained = run;
        run.timer = setTimeout(() => { runs.delete(retained.id); }, 600000); run.timer.unref();
        try {
          const project = await sdk.projects.get({ projectId: request.scope.projectId });
          if (project?.id === request.scope.projectId) {
            run.projectLabel = (project.name ?? project.id).slice(0, 256);
          } else { reason(run, 'project-unavailable'); run.lifecycle = { kind: 'limited' }; }
        } catch { reason(run, 'project-discovery-unavailable'); run.lifecycle = { kind: 'limited' }; }
        return page(run);
      }
      run = request.kind === 'results' ? runs.get(request.token) : [...runs.values()].find(r => r.next === request.token || r.steps.has(request.token));
      if (!run) return invalidPage();
      const selected = run;
      const operation = selected.pending.then(async () => {
        const pass = await valid(selected);
        if (!pass) return invalidPage(selected);
        if (request.kind === 'results') return page(selected, offset(selected, request.cursor));
        const replay = selected.steps.get(request.token);
        if (replay) return structuredClone(replay);
        if (request.token !== selected.next) return invalidPage(selected);
        if (selected.replayBytes + 1024 * 1024 > 32 * 1024 * 1024) {
          reason(selected, 'owner-replay-limit'); selected.lifecycle = { kind: 'limited' };
        } else await advance(selected, pass);
        if (!await valid(selected)) return invalidPage(selected);
        selected.next = randomUUID(); selected.revision++; selected.cursors.clear();
        const result = page(selected);
        selected.replayBytes += Buffer.byteLength(JSON.stringify(result)) + 256;
        selected.steps.set(request.token, structuredClone(result));
        return result;
      });
      selected.pending = operation.catch(() => {}); return operation;
    },
    async dashboardContributors({ token, rule, expectedRevision, cursor: after }: ContributorRequest) {
      const run = runs.get(token);
      if (!run) return { state: 'restart-required' as const, items: [], next: null };
      const operation = run.pending.then(async () => {
        if (!await valid(run) || expectedRevision !== run.revision) return { state: 'restart-required' as const, items: [], next: null };
        const rows = [...(run.rows.get(rule)?.contributions ?? [])].filter(c => c.state === 'failed').sort((a, b) => a.threadId.localeCompare(b.threadId) || b.timestamp - a.timestamp || a.callId.localeCompare(b.callId));
        const start = offset(run, after, rule);
        return { state: 'ready' as const, items: rows.slice(start, start + 50).map(c => {
          const target = run.targets.get(c.threadId)!;
          return { threadId: c.threadId, projectId: target.projectId, label: target.label,
            sessionId: c.sessionId, callId: c.callId, timestamp: c.timestamp, toolName: c.toolName };
        }), next: start + 50 < rows.length ? cursor(run, start + 50, rule) : null };
      });
      run.pending = operation.catch(() => {}); return operation;
    },
  };
}
