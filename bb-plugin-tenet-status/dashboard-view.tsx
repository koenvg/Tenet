import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContributorPage, ContributorRequest, DashboardPage, DashboardRequest } from './dashboard-contract';
import { overviewPath } from './main-route';
import { liveRead } from './live-read';
import './dashboard.css';

export interface DashboardClient {
  read: (input: DashboardRequest, signal?: AbortSignal) => Promise<DashboardPage>;
  contributors: (input: ContributorRequest, signal?: AbortSignal) => Promise<ContributorPage>;
  stop: (token: string) => Promise<{ stopped: true }>;
}
type BrowserLoad = { controller: AbortController; closed: boolean; run?: string; cleanup?: Promise<void>; blockedBy?: BrowserLoad };
type SelectedRule = { row: DashboardPage['rows'][number]; revision: number };
type FailurePosition = { cursors: (string | undefined)[]; index: number; focus?: string };
export type DashboardReturn = { projectId: string; run: string; revision: number; resultsCursor?: string; selected: SelectedRule; position: FailurePosition };
type Display = { kind: 'running' | 'ready' | 'cancelled'; page: DashboardPage | null }
  | { kind: 'error'; page: null; message: string };
const button = 'rounded-md border border-border px-3 py-2 text-sm hover:bg-accent focus-visible:outline focus-visible:outline-2 disabled:opacity-50';
const rate = (value: number | null) => value === null ? 'Not checked' : `${Number(value.toFixed(1))}%`;
const ruleName = (row: DashboardPage['rows'][number]) => row.preview || 'Recorded wording unavailable';
const changed = 'History access or snapshot changed. Results cleared. Refresh to try again.';

export function DashboardPanel({ client, navigate, projectId, retained, remember }: {
  client: DashboardClient; navigate: (path: string) => void; projectId: string;
  retained?: DashboardReturn | null; remember?: (value: DashboardReturn | null) => void;
}) {
  const [display, setDisplay] = useState<Display>({ kind: 'running', page: null });
  const [selected, setSelected] = useState<SelectedRule | null>(null);
  const [resultsCursor, setResultsCursor] = useState<string | undefined>();
  const [restored, setRestored] = useState<FailurePosition | undefined>();
  const initial = useRef(retained);
  const rules = useRef<HTMLTableElement>(null);
  const focusRule = useRef<string | null>(null);
  useEffect(() => {
    if (!selected && focusRule.current) rules.current?.querySelector<HTMLButtonElement>(`button[data-rule="${focusRule.current}"]`)?.focus();
  }, [selected]);
  const active = useRef<AbortController | null>(null);
  const latest = useRef<DashboardPage | null>(null);
  const acquisition = useRef<BrowserLoad | null>(null);
  const release = useCallback((load: BrowserLoad): Promise<void> => {
    const token = load.run;
    if (!token) return Promise.resolve();
    if (load.cleanup) return load.cleanup;
    const attempt = Promise.resolve().then(() => client.stop(token)).then(() => {});
    load.cleanup = attempt;
    void attempt.catch(() => { if (load.cleanup === attempt) load.cleanup = undefined; });
    return attempt;
  }, [client]);
  const close = useCallback((load: BrowserLoad): Promise<void> => {
    load.closed = true; load.controller.abort();
    return release(load);
  }, [release]);
  const invalidate = useCallback(() => {
    if (acquisition.current) void close(acquisition.current).catch(() => {});
    active.current?.abort(); active.current = null; latest.current = null; setSelected(null); remember?.(null);
    setDisplay({ kind: 'error', page: null, message: changed });
  }, [remember, close]);
  const start = useCallback(async () => {
    const previous = acquisition.current;
    if (previous) void close(previous).catch(() => {});
    active.current?.abort();
    const load: BrowserLoad = { controller: new AbortController(), closed: false,
      blockedBy: previous?.run ? previous : previous?.blockedBy };
    acquisition.current = load;
    const controller = load.controller; active.current = controller; latest.current = null;
    setSelected(null); setResultsCursor(undefined); setRestored(undefined); focusRule.current = null; remember?.(null);
    setDisplay({ kind: 'running', page: null });
    try {
      if (load.blockedBy) await release(load.blockedBy);
      if (load.closed || acquisition.current !== load) return;
      load.blockedBy = undefined;
      const source = client.read({ kind: 'start', scope: { kind: 'project', projectId } });
      void source.then(page => {
        load.run = page.run;
        if (load.closed) void release(load).catch(() => {});
      }, () => {});
      let page = await liveRead(source, controller.signal);
      while (!load.closed && acquisition.current === load) {
        latest.current = page; setDisplay({ kind: page.next ? 'running' : 'ready', page });
        if (!page.next) break;
        page = await liveRead(client.read({ kind: 'advance', token: page.next }, controller.signal), controller.signal);
      }
    } catch {
      if (!load.closed && acquisition.current === load) {
        void close(load).catch(() => {}); latest.current = null;
        setDisplay({ kind: 'error', page: null, message: 'History unavailable. Results cleared. Refresh to try again.' });
      }
    }
  }, [client, projectId, remember, close, release]);
  useEffect(() => {
    const saved = initial.current; initial.current = null;
    if (!saved || saved.projectId !== projectId) void start();
    else {
      const controller = new AbortController(); active.current = controller;
      acquisition.current = { controller, closed: false, run: saved.run };
      void liveRead(client.read({ kind: 'results', token: saved.run, ...(saved.resultsCursor ? { cursor: saved.resultsCursor } : {}) }, controller.signal), controller.signal).then(page => {
        if (controller.signal.aborted || active.current !== controller) return;
        if (page.state === 'restart-required' || page.revision !== saved.revision || page.scope.projectId !== projectId) { invalidate(); return; }
        latest.current = page; setResultsCursor(saved.resultsCursor); setRestored(saved.position);
        focusRule.current = saved.selected.row.key; setSelected(saved.selected); setDisplay({ kind: 'ready', page });
      }, () => { if (!controller.signal.aborted && active.current === controller) invalidate(); });
    }
    return () => {
      if (acquisition.current) void close(acquisition.current).catch(() => {});
      active.current?.abort(); active.current = null;
    };
  }, [start, client, projectId, invalidate, close]);
  const page = display.page;
  const results = async (cursor?: string) => {
    if (!page) return;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    try {
      const result = await liveRead(client.read({ kind: 'results', token: page.run, ...(cursor ? { cursor } : {}) }, controller.signal), controller.signal);
      if (!controller.signal.aborted && active.current === controller) {
        if (result.state === 'restart-required' || result.revision !== page.revision) { invalidate(); return; }
        setResultsCursor(cursor); latest.current = result; setDisplay({ kind: 'ready', page: result });
      }
    } catch { if (!controller.signal.aborted && active.current === controller) invalidate(); }
  };
  const partial = page && (page.state === 'limited' || page.coverage.unknown > 0 || page.coverage.unavailable > 0 || page.coverage.unprocessed > 0 || page.coverage.partial > 0 || page.coverage.omittedInvocations > 0 || page.coverage.reasons.length > 0);
  return <section aria-label="Project rule overview" className="tenet-dashboard p-4 space-y-4">
    <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
      <h2 className="text-lg font-semibold" style={{ margin: 0 }}>{page?.projectLabel || 'Project rules'}</h2>
      <div className="dashboard-actions">
        <button className={button} onClick={() => navigate('')}>Change project</button>
        <button className={button} onClick={() => void start()} disabled={display.kind === 'running'}>Refresh</button>
      </div>
    </header>
    {display.kind === 'running' && <p role="status">Loading rules… <button className={button} onClick={() => {
      if (acquisition.current) void close(acquisition.current).catch(() => {});
      active.current?.abort(); active.current = null; setDisplay({ kind: 'cancelled', page: latest.current });
    }}>Cancel</button></p>}
    {display.kind === 'cancelled' && <p role="status">Loading cancelled. History is partial. Refresh to try again.</p>}
    {display.kind === 'error' && <p role="alert">{display.message}</p>}
    {page?.state === 'restart-required' ? <p role="alert">{changed}</p> : page && <>
      {partial && <p aria-label="Partial history" style={{ color: 'var(--muted-foreground)' }}>Some history is missing. Rates cover recorded checks only.</p>}
      <div style={{ minHeight: 160 }}>
        {selected ? <Failures key={`${page.run}:${selected.revision}:${selected.row.key}`} client={client} run={page.run} expectedRevision={selected.revision} row={selected.row} navigate={navigate}
          initial={restored} remember={position => remember?.({ projectId, run: page.run, revision: page.revision, resultsCursor, selected, position })}
          back={() => { setRestored(undefined); setSelected(null); remember?.(null); }} invalidate={invalidate} /> : <>
          {!page.rows.length && display.kind !== 'running' && <p>{page.coverage.unprocessed || page.coverage.partial || page.coverage.unavailable || page.state === 'limited' ? 'Rule history is incomplete or unavailable. Refresh to try again.' : 'No recorded rules in this history.'}</p>}
          {!!page.rows.length && <table ref={rules} aria-label="Project rules" className="dashboard-table dashboard-rules">
            <colgroup><col style={{ width: '60%' }} /><col style={{ width: '20%' }} /><col style={{ width: '20%' }} /></colgroup>
            <thead><tr>{['Rule', 'Passing', 'Failing'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{page.rows.map(row => <tr key={row.key}>
              <th scope="row"><button data-rule={row.key} disabled={display.kind === 'running'} className="dashboard-target"
                onClick={() => { focusRule.current = row.key; setSelected({ row, revision: page.revision }); }}>{ruleName(row)}</button>{row.builtin && <small style={{ display: 'block', color: 'var(--muted-foreground)' }}>Integrity</small>}</th>
              <td aria-label={`${rate(row.passing)} recorded passing; ${row.passed} PASS of ${row.passed + row.failed} scored checks`}>{rate(row.passing)}</td>
              <td aria-label={`${rate(row.failing)} recorded failing; ${row.failed} FAIL of ${row.passed + row.failed} scored checks`}>{rate(row.failing)}</td>
            </tr>)}</tbody>
          </table>}
          {display.kind !== 'running' && <div className="dashboard-actions">
            {page.rowsNext && <button className={button} onClick={() => void results(page.rowsNext!)}>Next rules</button>}
            {resultsCursor && <button className={button} onClick={() => void results()}>First rules</button>}
          </div>}
        </>}
      </div>
    </>}
  </section>;
}
function Failures({ client, run, expectedRevision, row, navigate, back, invalidate, initial, remember }: {
  client: DashboardClient; run: string; expectedRevision: number; row: DashboardPage['rows'][number];
  navigate: (path: string) => void; back: () => void; invalidate: () => void; initial?: FailurePosition; remember: (position: FailurePosition) => void;
}) {
  const [page, setPage] = useState<ContributorPage | null>(null);
  const [position, setPosition] = useState<FailurePosition>(initial ?? { cursors: [undefined], index: 0 });
  const [loading, setLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const links = useRef<HTMLTableElement>(null);
  const read = useCallback(async (target: FailurePosition) => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request; setPage(null); setLoading(true);
    try {
      const cursor = target.cursors[target.index];
      const result = await liveRead(client.contributors({ token: run, rule: row.key, expectedRevision, ...(cursor ? { cursor } : {}) }, request.signal), request.signal);
      if (request.signal.aborted || controller.current !== request) return;
      if (result.state === 'restart-required') { invalidate(); return; }
      setPosition(target); setPage(result); setLoading(false);
    } catch { if (!request.signal.aborted && controller.current === request) invalidate(); }
  }, [client, run, expectedRevision, row.key, invalidate]);
  useEffect(() => { void read(initial ?? { cursors: [undefined], index: 0 }); return () => { controller.current?.abort(); controller.current = null; }; }, [read, initial]);
  useEffect(() => {
    if (!loading) {
      const link = position.focus ? Array.from(links.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []).find(link => link.dataset.path === position.focus) : null;
      if (link) link.focus(); else heading.current?.focus();
    }
  }, [loading, position]);
  return <section>
    <button className={button} onClick={back}>Back to rules</button>
    <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold" style={{ margin: '24px 0 8px' }}>Failures</h3>
    <p style={{ margin: '0 0 24px' }}>{ruleName(row)} <span style={{ color: 'var(--muted-foreground)' }}> · {rate(row.failing)} failing · {row.failed} {row.failed === 1 ? 'failure' : 'failures'}</span></p>
    {loading && <p role="status">Loading failures…</p>}
    {page && !page.items.length && !loading && <p>No recorded failures for this rule.</p>}
    {!!page?.items.length && <>
      <p role="status">Showing {position.index * 50 + 1}–{position.index * 50 + page.items.length} of {row.failed} failures</p>
      <table ref={links} aria-label="Failures" className="dashboard-table dashboard-failures">
        <colgroup><col style={{ width: '36%' }} /><col style={{ width: '14%' }} /><col style={{ width: '30%' }} /><col style={{ width: '20%' }} /></colgroup>
        <thead><tr>{['Thread', 'Tool', 'When', 'Open'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{page.items.map(item => {
          const path = overviewPath(item.threadId, { sessionId: item.sessionId, callId: item.callId }, item.projectId);
          const time = new Date(item.timestamp);
          return <tr key={path}>
            <th scope="row" data-label="Thread">{item.label}</th><td data-label="Tool">{item.toolName || 'Recorded call'}</td>
            <td data-label="When">{Number.isFinite(time.getTime()) ? <time dateTime={time.toISOString()}>{time.toLocaleDateString()}<br />{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time> : 'Time unavailable'}</td>
            <td data-label="Open"><a className="dashboard-target" data-path={path} href={`#${path}`}
              onClick={event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); remember({ ...position, focus: path }); navigate(path); }}>Open call</a></td>
          </tr>;
        })}</tbody>
      </table>
    </>}
    <div className="dashboard-actions">
      {position.index > 0 && <><button className={button} disabled={loading} onClick={() => void read({ cursors: position.cursors, index: position.index - 1 })}>Previous failures</button>
        <button className={button} disabled={loading} onClick={() => void read({ cursors: [undefined], index: 0 })}>First failures</button></>}
      {page?.next && position.index + 1 < 128 && <button className={button} disabled={loading} onClick={() => void read({ cursors: [...position.cursors.slice(0, position.index + 1), page.next!], index: position.index + 1 })}>Next failures</button>}
      {page?.next && position.index + 1 >= 128 && <p>Paging limit reached. Return to the first failures or refresh.</p>}
    </div>
  </section>;
}
