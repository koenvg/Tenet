import { useEffect, useRef, useState } from 'react';
import type { ArchiveAddress } from '../../src/runtime/operations.js';
import type { OperationRow, OperationState, OperationsView } from '../../src/inspector/operations-reader.js';
import { useOperations } from './operations-state.js';
import './operations.css';

const labels: Record<OperationState, string> = { preparing: 'Preparing', queued: 'Queued', analyzing: 'Analyzing', approval: 'Awaiting approval',
  finalizing: 'Finalizing', completed: 'Completed', unavailable: 'Unavailable', dropped: 'Dropped', cancelled: 'Cancelled', interrupted: 'Interrupted' };
const duration = (n: number | null | undefined) => n === null || n === undefined ? 'Not measured' : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`;
const title = (r: OperationRow) => r.description?.value ?? r.tool;
const queueTime = (r: OperationRow) => r.mode === 'enforce' ? 'Not queued' : r.assessment.kind === 'queued' ? 'Waiting for slot' : duration(r.queueWaitMs);
const analysisTime = (r: OperationRow) => r.assessment.kind === 'analyzing' ? 'In progress' : r.assessment.kind === 'settled' ? duration(r.assessment.durationMs) : 'Not started';
const permission = (r: OperationRow) => r.permission.kind === 'committed'
  ? r.permission.outcome === 'released' ? 'Not blocked by Tenet' : r.permission.outcome === 'blocked' ? 'Blocked by Tenet' : 'Interrupted, permission unknown'
  : r.permission.kind === 'awaiting-approval' ? 'Awaiting host approval' : r.permission.kind === 'finalizing' ? 'Finalizing, not committed' : 'Not decided';
const recordingLabel = (r: OperationRow) => r.recording === 'available' ? r.description?.value ? 'Recorded preview' : 'Description not recorded'
  : r.recording === 'withheld' ? 'Recording identity withheld' : r.recording === 'indexing' ? 'Recording not yet indexed'
    : r.recording === 'budget-limited' ? 'Recording lookup budget reached' : 'Recording missing or not captured';

function Trend({ data }: { data: OperationsView | null }) {
  const svg = useRef<SVGSVGElement>(null), [width, setWidth] = useState(610);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.max(1, entry.contentRect.width)); });
    observer.observe(svg.current!);
    return () => observer.disconnect();
  }, []);
  const buckets = data?.buckets ?? [], max = Math.max(1000, ...buckets.flatMap(b => [b.analysis ?? 0, b.queue ?? 0]));
  const x = (i: number) => 52 + i * (width - 64) / 14;
  const points = (field: 'analysis' | 'queue') => buckets.flatMap((b, i) => b[field] === null ? [] : [{ x: x(i), y: 140 - b[field]! / max * 120, i }]);
  const path = (field: 'analysis' | 'queue') => {
    let previous = -2;
    return points(field).map(p => { const command = p.i === previous + 1 ? 'L' : 'M'; previous = p.i; return `${command}${p.x},${p.y}`; }).join(' ');
  };
  return <><svg ref={svg} viewBox={`0 0 ${width} 180`} role="img" aria-label="Retained analysis and queue wait averages. Empty intervals are gaps. Interval values are available in Trend data.">
    {[0, .5, 1].map(f => <g key={f}><line x1="52" y1={140 - f * 120} x2={width - 12} y2={140 - f * 120} /><text x="44" y={144 - f * 120} textAnchor="end">{duration(max * f)}</text></g>)}
    {(['analysis', 'queue'] as const).map(field => <g key={field} className={`op-trend-${field}`}><path d={path(field)} />{points(field).map(p => <circle key={p.i} cx={p.x} cy={p.y} r="2.5" />)}</g>)}
    {!points('analysis').length && !points('queue').length && <text x={width / 2} y="78" textAnchor="middle">No measurements in this window</text>}
    {[0, 7, 14].map(i => buckets[i] && <text key={i} x={x(i)} y="171" textAnchor={i === 0 ? 'start' : i === 14 ? 'end' : 'middle'}>{new Date(buckets[i]!.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>)}
  </svg><p className="op-footnote">Retained interval averages. Empty intervals are gaps, not zero.</p>
    <details className="op-trend-data"><summary>Trend data</summary>
      <div className="op-trend-scroll" role="region" aria-label="Analysis time interval data" tabIndex={0}>
        <table><caption>Analysis time interval averages</caption><thead><tr><th scope="col">Interval start</th><th scope="col">Average analysis</th><th scope="col">Analysis samples</th><th scope="col">Average queue wait</th><th scope="col">Queue samples</th></tr></thead>
          <tbody>{buckets.map(b => <tr key={b.at}><th scope="row"><time dateTime={new Date(b.at).toISOString()}>{new Date(b.at).toLocaleString()}</time></th>
            <td>{b.analysis === null ? 'No samples' : duration(b.analysis)}</td><td>{b.analysisCount}</td><td>{b.queue === null ? 'No samples' : duration(b.queue)}</td><td>{b.queueCount}</td></tr>)}</tbody>
        </table>{!buckets.length && <p>Interval data is not available yet.</p>}
      </div>
    </details></>;
}
function RequestDetails({ row, expired, close, openInspector }: { row: OperationRow; expired: boolean; close(): void; openInspector(address: ArchiveAddress): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current!; node.showModal(); return () => node.close(); }, []);
  return <dialog ref={dialog} className="op-drawer" aria-labelledby="op-detail-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="op-drawer-content"><div className="op-drawer-heading"><h2 id="op-detail-title">Request details</h2><button onClick={close} aria-label="Close request details"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button></div>
      <h3 className="op-command">{title(row)}</h3><p>{row.projectLabel} · {row.host} · {row.mode}</p>
      <p className="op-detail-status"><span className={`op-badge ${row.state}`}>{labels[row.state]}</span> {(expired || row.freshness !== 'fresh') && <small>Last known, not live</small>}</p>
      <dl className="op-detail-facts"><div><dt>Assessment</dt><dd>{row.assessment.kind === 'settled' ? labels[row.assessment.outcome] : labels[row.assessment.kind]}</dd></div>
        <div><dt>Tenet permission</dt><dd>{permission(row)}</dd></div><div><dt>Queue wait</dt><dd>{queueTime(row)}</dd></div><div><dt>Analysis</dt><dd>{analysisTime(row)}</dd></div>
        <div><dt>Tool result</dt><dd>{row.execution === 'unknown' ? 'Unknown' : row.execution === 'executed' ? 'Executed' : 'Failed'}</dd></div>
        <div><dt>Recording</dt><dd>{recordingLabel(row)}{row.description?.shortened ? ' · shortened preview' : ''}</dd></div></dl>
      <section className="op-activity"><h3>Request activity</h3><p>Received <time>{new Date(row.startedAt).toLocaleString()}</time></p>
        {row.reservedAt !== undefined && <p>Observation slot reserved <time>{new Date(row.reservedAt).toLocaleTimeString()}</time></p>}
        <p>Assessment {row.assessment.kind === 'settled' ? labels[row.assessment.outcome].toLowerCase() : labels[row.assessment.kind].toLowerCase()}.</p>
        <p>{permission(row)}. Assessment completion does not prove tool execution.</p></section>
      <details className="op-identities"><summary>Coverage and identity</summary><p>Runtime {row.freshness}. Metadata {row.metadata}. Retained local observation, not complete machine coverage.</p>
        <dl><dt>Runtime</dt><dd><code>{row.runtimeId}</code></dd><dt>Invocation</dt><dd><code>{row.id}</code></dd><dt>Opaque project key</dt><dd><code>{row.project}</code></dd></dl></details>
      <div className="op-drawer-actions">{row.recording === 'available' && row.archive
        ? <button className="op-primary" onClick={() => openInspector(row.archive!)}>Open in Inspector</button> : <p>Inspector detail is unavailable until this exact recording is safely indexed.</p>}</div>
      <p className="op-footnote">Approval remains in the host. This workspace cannot approve, retry, cancel or run tools.</p>
    </div>
  </dialog>;
}

export default function Operations({ active, openInspector }: { active: boolean; openInspector(address: ArchiveAddress): void }) {
  const [project, setProject] = useState(''), [window, setWindow] = useState<15 | 60>(15), [filter, setFilter] = useState<OperationState | ''>('');
  const [search, setSearch] = useState(''), [layout, setLayout] = useState<'overview' | 'board'>('overview'), [offset, setOffset] = useState(0);
  const { data, expired, busy, error } = useOperations({ window, project, state: filter || undefined, search, offset }, active);
  const [selected, setSelected] = useState<OperationRow | null>(null);
  const trigger = useRef<HTMLElement | null>(null), searchInput = useRef<HTMLInputElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const projects = useRef(new Map<string, string>());
  for (const p of data?.projects ?? []) if (projects.current.size < 1024 || projects.current.has(p.key)) projects.current.set(p.key, p.label);
  useEffect(() => { if (!selected) return; const row = data?.requests.find(r => r.key === selected.key);
    if (row && JSON.stringify(row) !== JSON.stringify(selected)) setSelected(row);
    else if (!row && selected.freshness === 'fresh') setSelected({ ...selected, freshness: 'stale' });
  }, [data, selected]);
  useEffect(() => { if (!active) setSelected(null); }, [active]);
  const close = () => { setSelected(null); requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus(); else heading.current?.focus(); }); };
  const select = (row: OperationRow, element: HTMLElement) => { trigger.current = element; setSelected(row); };
  const reset = () => { setProject(''); setFilter(''); setSearch(''); setOffset(0); searchInput.current?.focus(); };
  const chooseFilter = (state: OperationState | '') => { setFilter(state); setOffset(0); };
  const current = !expired && !busy ? data?.current : null;
  const partial = data?.coverage === 'partial';
  const rows = data?.requests ?? [];
  const summaries = [
    { key: 'queued' as const, label: 'Queued', count: current?.queued, note: 'Waiting for an observation slot' },
    { key: 'analyzing' as const, label: 'Analyzing', count: current?.analyzing, note: 'Observe + enforce requests' },
    { key: 'approval' as const, label: 'Awaiting approval', count: current?.approval, note: 'Decision needed in the host' },
    { key: 'completed' as const, label: 'Completed', count: data?.outcomes.completed, note: 'Retained, within the timing window' },
  ];
  const requestButton = (r: OperationRow, board = false) => <button className={board ? 'op-board-request' : 'op-request-link'} onClick={event => select(r, event.currentTarget)}>
    <code>{title(r)}</code>{board && <><span className="op-request-sub">{r.projectLabel} · {r.mode}</span><small>{labels[r.state]} · {analysisTime(r)}{expired || r.freshness !== 'fresh' ? ' · last known' : ''}</small></>}</button>;
  if (!active) return null;
  return <main className="operations-workspace" hidden={!active}>
    <div className="op-page-heading"><div><h1 ref={heading} tabIndex={-1}>Operations</h1><p>What is moving through Tenet, and what is waiting.</p></div>
      <div className="op-scope-controls"><label>Project<select aria-label="Project" value={project} onChange={event => { setProject(event.target.value); setOffset(0); }}><option value="">All projects</option>
        {[...projects.current].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Timing window<select aria-label="Timing window" value={window} onChange={event => { setWindow(Number(event.target.value) as 15 | 60); setOffset(0); }}><option value="15">Last 15 minutes</option><option value="60">Last hour</option></select></label></div></div>
    <div className="op-connection" role={active ? 'status' : undefined}><span><i className={current ? 'op-dot' : 'op-dot unknown'} />{busy && !data ? 'Reading local telemetry…' : !current ? 'Current activity is unknown.' : partial ? 'Partial activity from observed runtimes' : 'Recent publications from observed runtimes'}</span>
      <small>{data ? `${data.runtimes.length} observed runtimes · ${data.projects.length} projects` : 'Local, best-effort telemetry'}</small></div>
    {(error || expired && data || partial) && <div className="op-attention"><strong>{error || (expired ? 'Last-known data, not live activity.' : 'Coverage is partial.')}</strong><p>Retained history is readable. Missing, stale and omitted work is not zero.</p></div>}
    <section className="op-status-strip" aria-label="Request counts">{summaries.map(s => <button key={s.key} className={`op-state-summary ${filter === s.key ? 'selected' : ''}`}
      aria-label={`${s.label} ${s.count ?? 'Unknown'}`} aria-pressed={filter === s.key} onClick={() => chooseFilter(s.key)}><span className="op-state-label"><i className={`op-symbol ${s.key}`} />{s.label}</span>
      <span className="op-state-value">{s.count ?? 'Unknown'}</span><small>{s.note}{partial && s.key !== 'completed' ? ' · partial' : ''}</small></button>)}</section>
    <section className="op-performance" aria-label="Analysis performance"><div className="op-chart"><div className="op-section-heading"><h2>Analysis time</h2><div className="op-legend"><span>Analysis</span><span>Queue wait</span></div></div>
      <Trend data={data} /></div>
      <div className="op-latency"><h2>Timing breakdown</h2><dl>{[
        ['Average analysis', data?.analysis.mean, data?.analysis.count], ['P95 analysis', data?.analysis.p95, data?.analysis.count], ['Average queue wait', data?.queue.mean, data?.queue.count],
      ].map(([label, value, count]) => <div key={label} className="op-latency-row"><dt>{label}<small>{count ?? 0} retained samples</small></dt><dd>{value === null || value === undefined ? 'No samples' : duration(Number(value))}</dd></div>)}</dl>
        <p className="op-footnote">Analysis measures decide(), not isolated provider latency. It excludes queue wait, approval and tool execution. P95 is the nearest-rank retained sample.</p>
        <div className="op-outcomes">{(['unavailable', 'dropped', 'cancelled', 'interrupted'] as const).map(o => <span key={o}><b>{data?.outcomes[o] ?? 'Unknown'}</b> {o}</span>)}</div></div></section>
    <section aria-labelledby="op-requests-title"><div className="op-requests-heading"><div><h2 id="op-requests-title">Requests</h2><p>{expired ? 'Last-known requests. Active states may have changed.' : 'Active work first, then recently finished.'}</p></div>
      <div className="op-request-tools"><label className="op-search"><span className="sr-only">Search requests</span><input ref={searchInput} type="search" maxLength={128} value={search} placeholder="Search tool or project" onChange={event => { setSearch(event.target.value); setOffset(0); }} /></label>
        <div className="op-switcher" role="group" aria-label="Request layout"><button aria-pressed={layout === 'overview'} onClick={() => setLayout('overview')}>Overview</button><button aria-pressed={layout === 'board'} onClick={() => setLayout('board')}>Queue board</button></div></div></div>
      <div className="op-filters" role="group" aria-label="Filter requests by state"><button aria-pressed={!filter} onClick={() => chooseFilter('')}>All</button>
        {Object.entries(labels).map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => chooseFilter(key as OperationState)}>{label}</button>)}</div>
      {!!current?.other && <p className="op-footnote">{current.other} other current requests are preparing or finalizing.</p>}
      {!rows.length ? <div className="op-empty"><h3>{busy ? 'Reading requests…' : search || filter || project ? 'No matching requests' : 'No retained requests'}</h3>
        <p>{search || filter || project ? 'Try another state, project or search.' : 'Activity appears when an eligible local runtime publishes with recording enabled. This does not prove no tools are running.'}</p>
        {(search || filter || project) && <button onClick={reset}>Clear filters</button>}</div>
        : layout === 'board' ? <div className="op-board">{[
          { title: 'Queued', states: ['queued'], note: 'Waiting for an observation slot' }, { title: 'Analyzing', states: ['analyzing'], note: 'Runtime-owned assessment, not provider concurrency' },
          { title: 'Awaiting approval', states: ['approval'], note: 'Approval stays in the host' }, { title: 'Finished', states: ['completed', 'unavailable', 'dropped', 'cancelled', 'interrupted'], note: 'Assessment and permission settled' },
          ...(rows.some(r => ['preparing', 'finalizing'].includes(r.state)) ? [{ title: 'Other activity', states: ['preparing', 'finalizing'], note: 'Preparing or finalizing permission' }] : []),
        ].map(lane => { const matches = rows.filter(r => lane.states.includes(r.state)); return <section key={lane.title} className={`op-lane ${lane.title === 'Other activity' ? 'op-other-lane' : ''}`}><div className="op-lane-heading"><h3>{lane.title}</h3><small>{matches.length} on page</small></div>
          <p>{lane.note}{expired ? ' · last known' : ''}</p>{matches.map(r => <div key={r.key}>{requestButton(r, true)}</div>)}{!matches.length && <p className="op-lane-empty">No requests on this page.</p>}</section>; })}</div>
          : <div className="op-table-scroll"><table className="op-table"><thead><tr><th scope="col">Request</th><th scope="col">State</th><th scope="col" className="op-project-col">Project</th><th scope="col" className="op-mode-col">Mode</th><th scope="col">Queue wait</th><th scope="col" className="op-analysis-col">Analysis</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.key}><td>{requestButton(r)}<span className="op-request-sub">{r.tool} · {r.id.slice(-8)}<span className="op-inline-project"> · {r.projectLabel}</span></span><small className="op-recording-label">{recordingLabel(r)}</small></td>
              <td><span className={`op-badge ${r.state}`}>{labels[r.state]}</span>{(expired || r.freshness !== 'fresh') && <small className="op-last-known">Last known · {expired && r.freshness === 'fresh' ? 'updates unavailable' : r.freshness}</small>}</td><td className="op-project-col">{r.projectLabel}</td><td className="op-mode-col">{r.mode}</td><td>{queueTime(r)}</td><td className="op-analysis-col">{analysisTime(r)}</td></tr>)}</tbody></table></div>}
      <div className="op-table-footer"><span>{data ? `${offset + (rows.length ? 1 : 0)}–${offset + rows.length} of ${data.total} retained matching requests` : 'Retained requests unknown'}</span>
        <div><button disabled={!offset || busy} onClick={() => setOffset(Math.max(0, offset - 100))}>Previous page</button><button disabled={data?.next === null || data?.next === undefined || busy} onClick={() => setOffset(data?.next ?? 0)}>Next page</button></div></div>
    </section>
    <details className="op-coverage"><summary>Coverage and retention</summary><p>Observed local runtimes only. This cannot prove machine-wide completeness or provider connectivity. Current activity ignores the timing window. Outcomes use assessment completion time.</p>
      <p>Up to 256 active details and 1,024 settled requests per owner, retained for at most one hour. Metrics use all eligible retained samples, not just this page. Queue samples measure observe slot reservations; enforce is not queued.</p>
      {data && <><p>{data.loss.evicted} evicted rows · {data.loss.withheld} metadata projections withheld · {data.loss.publicationFailures} publication failures. Active detail loss {data.loss.activeOmitted ? 'present, totals partial' : 'not reported'}. Cleanup backlog {data.loss.cleanupPartial ? 'partial' : 'not reported'}.</p>
        <p>Archive writer totals, not per call. {data.capture.failed} failed · {data.capture.dropped} dropped stages · {data.capture.drainTimeouts} drain timeouts.</p>
        <ul>{data.runtimes.map(r => <li key={r.id}>{r.freshness} · coverage since {new Date(r.coverageSince).toLocaleString()} · timing {r.timing}</li>)}</ul><p>Reader issues {data.issues.join(', ') || 'none reported'}. Missing publications expire after ten seconds.</p></>}
      <p>Telemetry files older than 24 hours can be removed by a running owner in bounded passes. Arbitrary process churn has no hard machine-wide disk bound. No cleanup runs without an owner.</p></details>
    <footer className="op-footer"><span>Local, read-only, best-effort telemetry. Recording controls apply.</span><span>Observe and enforce together · no approval controls</span></footer>
    {selected && active && <RequestDetails row={selected} expired={expired} close={close} openInspector={openInspector} />}
  </main>;
}
