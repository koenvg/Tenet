import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBbNavigate, type PluginNavPanelProps } from '@get-bb/plugin-sdk/app';
import { useSummaryRpc } from './summary-rpc';
import type { PickerSelection, ProjectPage, ThreadPage } from './picker-contract';
import { parseMainRoute, overviewPath, type MainRoute } from './main-route';
import { OverviewPanel } from './overview-panel';
import { DetailsPage } from './details-page';
import { liveRead } from './live-read';
import type { OverviewSelection } from '../src/inspector/bb-summary';
import { DashboardPanel, type DashboardClient, type DashboardReturn } from './dashboard-view';
import './main-page.css';

export interface PickerClient {
  projects: (cursor?: string, signal?: AbortSignal) => Promise<ProjectPage>;
  threads: (projectId: string, cursor?: string, signal?: AbortSignal) => Promise<ThreadPage>;
  selection: (threadId: string, projectId?: string, signal?: AbortSignal) => Promise<PickerSelection>;
}
type OverviewProps = { threadId: string; projectId: string; params: OverviewSelection; onSelection: (selection: OverviewSelection) => void };
const button = 'rounded-md border border-border px-3 py-2 text-sm hover:bg-accent focus-visible:outline focus-visible:outline-2';
export function MainPage({ subPath }: PluginNavPanelProps) {
  const call = useSummaryRpc();
  const navigate = useBbNavigate();
  const client = useMemo<PickerClient>(() => ({
    projects: (cursor, signal) => call('pickerProjects', cursor ? { cursor } : {}, signal),
    threads: (projectId, cursor, signal) => call('pickerThreads', { projectId, ...(cursor ? { cursor } : {}) }, signal),
    selection: (threadId, projectId, signal) => call('pickerSelection', { threadId, ...(projectId ? { projectId } : {}) }, signal),
  }), [call]);
  const dashboard = useMemo<DashboardClient>(() => ({
    read: (input, signal) => call('dashboard', input, signal),
    contributors: (input, signal) => call('dashboardContributors', input, signal),
    stop: token => call('dashboardStop', { token }),
  }), [call]);
  const go = useCallback((path: string) => navigate.toPluginPanel('findings', { subPath: path }), [navigate]);
  return <MainPageView subPath={subPath} client={client} dashboard={dashboard} navigate={go}
    overview={props => <OverviewPanel {...props} />} findings={threadId => <DetailsPage subPath={threadId} />} />;
}
export function MainPageView({ subPath, client, navigate, overview, findings, dashboard }: {
  subPath: string; client: PickerClient; dashboard?: DashboardClient; navigate: (path: string) => void;
  overview: (props: OverviewProps) => ReactNode; findings: (threadId: string) => ReactNode;
}) {
  const route = useMemo(() => parseMainRoute(subPath), [subPath]);
  const root = useRef<HTMLElement>(null);
  const projectId = 'projectId' in route ? route.projectId : undefined;
  const threadId = 'threadId' in route ? route.threadId : undefined;
  useLayoutEffect(() => {
    if (root.current) root.current.scrollTop = 0;
  }, [route.kind, projectId, threadId]);
  const retained = useRef<DashboardReturn | null>(null);
  const remember = useCallback((value: DashboardReturn | null) => { retained.current = value; }, []);
  if (!('projectId' in route) || route.projectId !== retained.current?.projectId) retained.current = null;
  return <section ref={root} aria-label="TENET main page" tabIndex={0} className="tenet-main text-foreground">
    <header className="tenet-main-header">
      <h1 className="text-xl font-semibold">TENET</h1>
      {['overview', 'findings', 'invalid'].includes(route.kind) && <button className={button} onClick={() => navigate('')}>Choose project</button>}
    </header>
    {route.kind === 'dashboard' && dashboard && <DashboardPanel key={route.projectId} projectId={route.projectId} retained={retained.current} remember={remember} client={dashboard} navigate={navigate} />}
    {route.kind === 'projects' && <Picker client={client} navigate={navigate} />}
    {route.kind === 'overview' && <SelectedThread key={`${route.projectId ?? ''}:${route.threadId}`} route={route} client={client} navigate={navigate} overview={overview} />}
    {route.kind === 'findings' && findings(route.threadId)}
    {route.kind === 'invalid' && <p role="alert" className="p-4">Invalid Tenet selection. Choose a project to start again. No archive requested.</p>}
  </section>;
}
function Picker({ client, navigate }: { client: PickerClient; navigate: (path: string) => void }) {
  const labelId = useId();
  const [cursor, setCursor] = useState<string | undefined>();
  const [page, setPage] = useState<ProjectPage | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setPage(null); setError('');
    liveRead(client.projects(cursor, controller.signal), controller.signal)
      .then(value => { if (current) setPage(value); }, () => { controller.abort(); if (current) setError('Selection list unavailable. Retry from the first page.'); });
    return () => { current = false; controller.abort(); };
  }, [client, cursor, retry]);
  return <section aria-label="Projects" className="tenet-project-picker">
    <h2>Choose a project</h2>
    <p className="tenet-project-explanation">Recorded history loads when you open a project. This picker does not scan histories.</p>
    {!page && !error && <p role="status">Reading BB metadata…</p>}
    {error && <p role="alert">{error}</p>}
    {page && !page.items.length && <p role="status">No projects on this page.</p>}
    {page && <ul className="tenet-project-list">
      {page.items.map(item => <li key={item.id}><button className="tenet-project-card"
        aria-labelledby={`${labelId}-${item.id}`} onClick={() => navigate(`project/${item.id}`)}>
        <span className="tenet-project-title" id={`${labelId}-${item.id}`}>{item.label || item.id}</span>
        <span className="tenet-project-detail">{item.updatedAt === null ? 'BB project update unavailable' : <>
          BB project updated <time dateTime={new Date(item.updatedAt).toISOString()}>{new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(item.updatedAt)}</time>
        </>}</span>
        <span className="tenet-project-history">View rule history</span>
        <span className="tenet-project-detail">Recorded rule checks and their results.</span>
      </button></li>)}
    </ul>}
    <div className="tenet-project-actions">
    {page?.next && <button className={button} onClick={() => setCursor(page.next!)}>Next projects</button>}
    {(cursor || error) && <button className={button} onClick={() => { setCursor(undefined); setRetry(v => v + 1); }}>First page / Retry</button>}
    </div>
  </section>;
}
function SelectedThread({ route, client, navigate, overview }: {
  route: Extract<MainRoute, { kind: 'overview' }>; client: PickerClient; navigate: (path: string) => void; overview: (props: OverviewProps) => ReactNode;
}) {
  const [selected, setSelected] = useState<PickerSelection | null>(null);
  const [retry, setRetry] = useState(0);
  const onSelection = useCallback((selection: OverviewSelection) => navigate(overviewPath(route.threadId, selection, route.projectId)), [navigate, route.threadId, route.projectId]);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setSelected(null);
    liveRead(client.selection(route.threadId, route.projectId, controller.signal), controller.signal).then(value => { if (current) setSelected(value); },
      () => { controller.abort(); if (current) setSelected({ state: 'unavailable', thread: null, project: null }); });
    return () => { current = false; controller.abort(); };
  }, [client, route.threadId, route.projectId, retry]);
  const projectId = route.projectId ?? selected?.project?.id;
  return <section aria-label="Selected Pi thread" style={{ minWidth: 0 }}>
    {projectId && <button className={button} style={{ margin: 16 }} onClick={() => navigate(`project/${projectId}`)}>Back to project rules</button>}
    {!selected && <p role="status" className="p-4">Checking selected thread…</p>}
    {selected?.state === 'ready' && selected.thread && selected.project
      ? <><p className="px-4" style={{ padding: '0 16px', overflowWrap: 'anywhere' }}>{selected.project.label} / {selected.thread.label} · {selected.thread.status}{selected.thread.archived ? ' · archived' : ''}</p>
        <button className={button} style={{ margin: 16 }} onClick={() => navigate(route.threadId)}>View flagged rules</button>
        {overview({ threadId: route.threadId, projectId: selected.project.id, params: route.selection, onSelection })}</>
      : selected && <div className="p-4"><p role="status">{selected.state === 'unsupported' ? 'This overview supports Pi threads only.'
        : selected.state === 'scope-changed' ? 'Thread project changed. Choose the thread again.' : 'Selected thread unavailable or deleted.'} No archive requested.</p>
        <button className={button} onClick={() => setRetry(v => v + 1)}>Retry selection</button></div>}
  </section>;
}
