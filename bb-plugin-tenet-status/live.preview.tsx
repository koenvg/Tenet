import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MainPageView, type PickerClient } from './main-page';
import { OverviewView } from './overview-panel';
import { overviewPath } from './main-route';
import { createLiveFixture, liveProject, liveThread, otherLiveThread } from './live.preview-fixture';

const fixture = createLiveFixture();
const thread = async (id: string) => ({ id, providerId: 'pi', projectId: liveProject, deletedAt: null });
const picker: PickerClient = {
  projects: async () => ({ items: [{ id: liveProject, label: 'Authored live project' }], next: null }),
  threads: async () => ({ items: [liveThread, otherLiveThread].map(id => ({ id, label: id, status: 'idle', archived: false })), next: null }),
  selection: async id => ({ state: 'ready', project: { id: liveProject, label: 'Authored live project' }, thread: { id, label: id, status: 'idle', archived: false } }),
};
function Preview() {
  const main = new URLSearchParams(location.search).get('entry') === 'main';
  const [path, setPath] = useState(location.hash.slice(1) || overviewPath(liveThread, {}, liveProject));
  const [open, setOpen] = useState(true), [narrow, setNarrow] = useState(true), [selectedThread, setThread] = useState(liveThread);
  const navigate = useCallback((next: string) => { history.pushState(null, '', `${location.pathname}${location.search}#${next}`); setPath(next); }, []);
  useEffect(() => {
    const restore = () => setPath(location.hash.slice(1)); window.addEventListener('popstate', restore);
    Object.assign(window, { tenetLivePreview: { reads: fixture.reads } });
    return () => { window.removeEventListener('popstate', restore); delete (window as any).tenetLivePreview; };
  }, []);
  return <><header className="preview-controls"><h1>TENET integrated live preview, {main ? 'main page' : 'thread panel'}</h1>
    <p>Authored offline history. No real archive, BB install or evaluator call. Native tabs and deployed hosts are not reproduced.</p>
    <button onClick={fixture.append}>Append recorded stage</button>
    <button onClick={() => fixture.fail('disconnect')}>Disconnect archive</button>
    <button onClick={() => fixture.fail('timeout')}>Hang archive read</button>
    <button onClick={() => fixture.fail('cursor')}>Reject cursors</button>
    <button onClick={() => fixture.fail('none')}>Make archive readable</button>
    <button onClick={() => setNarrow(v => !v)}>Toggle 390px container</button>
    <button onClick={() => setOpen(v => !v)}>{open ? 'Close workspace' : 'Open workspace'}</button>
    <button onClick={() => { const id = selectedThread === liveThread ? otherLiveThread : liveThread; setThread(id); navigate(overviewPath(id, {}, liveProject)); }}>Switch thread scope</button>
  </header><p className="host-sentinel">Host theme stays outside the summary workspace.</p>
  {!main && <article className="preview-conversation">Synthetic Pi conversation remains open.</article>}
  <div className="preview-container" style={{ width: narrow ? 390 : 1180 }}>
    {open && (main ? <MainPageView subPath={path} client={picker} navigate={navigate}
      overview={props => <OverviewView {...props} readThread={thread} readOverview={fixture.read} />}
      findings={() => <p>Separate focused findings route.</p>} />
      : <OverviewView key={selectedThread} threadId={selectedThread} params={null} readThread={thread} readOverview={fixture.read} />)}
  </div></>;
}
createRoot(document.getElementById('preview')!).render(<Preview />);
