import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useBbNavigate, type PluginNavPanelProps } from '@get-bb/plugin-sdk/app';
import { useSummaryRpc } from './summary-rpc';
import type { PickerSelection, ProjectPage, ThreadPage } from './picker-contract';
import { parseMainRoute, overviewPath, type MainRoute } from './main-route';
import { OverviewPanel } from './overview-panel';
import { DetailsPage } from './details-page';
import { liveRead } from './live-read';
import type { OverviewSelection } from '../src/inspector/bb-summary';

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
  const go = useCallback((path: string) => navigate.toPluginPanel('findings', { subPath: path }), [navigate]);
  return <MainPageView subPath={subPath} client={client} navigate={go}
    overview={props => <OverviewPanel {...props} />} findings={threadId => <DetailsPage subPath={threadId} />} />;
}
export function MainPageView({ subPath, client, navigate, overview, findings }: {
  subPath: string; client: PickerClient; navigate: (path: string) => void;
  overview: (props: OverviewProps) => ReactNode; findings: (threadId: string) => ReactNode;
}) {
  const route = useMemo(() => parseMainRoute(subPath), [subPath]);
  return <section aria-label="TENET main page" className="tenet-main min-w-0 w-full text-foreground" style={{ minWidth: 0, width: '100%' }}>
    <header className="flex flex-wrap items-center gap-3 p-4" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 16 }}>
      <h1 className="text-xl font-semibold">TENET overview</h1>
      {route.kind !== 'projects' && <button className={button} onClick={() => navigate('')}>Choose project</button>}
    </header>
    {route.kind === 'projects' && <Picker key="projects" client={client} navigate={navigate} />}
    {route.kind === 'threads' && <Picker key={route.projectId} projectId={route.projectId} client={client} navigate={navigate} />}
    {route.kind === 'overview' && <SelectedThread key={`${route.projectId ?? ''}:${route.threadId}`} route={route} client={client} navigate={navigate} overview={overview} />}
    {route.kind === 'findings' && findings(route.threadId)}
    {route.kind === 'invalid' && <p role="alert" className="p-4">Invalid Tenet selection. Choose a project to start again. No archive requested.</p>}
  </section>;
}
function Picker({ client, projectId, navigate }: { client: PickerClient; projectId?: string; navigate: (path: string) => void }) {
  const [cursor, setCursor] = useState<string | undefined>();
  const [page, setPage] = useState<ProjectPage | ThreadPage | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setPage(null); setError('');
    liveRead(projectId ? client.threads(projectId, cursor, controller.signal) : client.projects(cursor, controller.signal), controller.signal)
      .then(value => { if (current) setPage(value); }, () => { controller.abort(); if (current) setError('Selection list unavailable. Retry from the first page.'); });
    return () => { current = false; controller.abort(); };
  }, [client, projectId, cursor, retry]);
  return <section aria-label={projectId ? 'Pi threads' : 'Projects'} className="space-y-3 p-4" style={{ padding: 16, overflowWrap: 'anywhere' }}>
    <h2>{projectId ? 'Choose a Pi thread' : 'Choose a project'}</h2>
    <p>Only the selected thread reads its archive. Stopped threads can show retained history if their machine and archive are reachable.</p>
    {!page && !error && <p role="status">Reading BB metadata…</p>}
    {error && <p role="alert">{error}</p>}
    {page && !page.items.length && <p role="status">{projectId ? 'No Pi threads on this metadata page. Check the next page if available.' : 'No projects on this page.'}</p>}
    {page && <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
      {page.items.map(item => <li key={item.id}><button className={button} style={{ maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left', overflowWrap: 'anywhere' }}
        onClick={() => navigate(projectId ? overviewPath(item.id, {}, projectId) : `project/${item.id}`)}>
        {item.label || item.id}{'status' in item && <span> · {item.status}{item.archived ? ' · archived' : ''}</span>}
      </button></li>)}
    </ul>}
    {page?.next && <button className={button} onClick={() => setCursor(page.next!)}>Next {projectId ? 'threads' : 'projects'}</button>}
    {(cursor || error) && <button className={button} onClick={() => { setCursor(undefined); setRetry(v => v + 1); }}>First page / Retry</button>}
    <p>Empty or unlinked recording history is unknown, not pass. Raw evidence stays in the standalone inspector on the selected machine.</p>
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
    {projectId && <button className={button} style={{ margin: 16 }} onClick={() => navigate(`project/${projectId}`)}>Choose Pi thread</button>}
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
