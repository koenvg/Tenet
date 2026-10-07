import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MainPageView } from './main-page';
import { OverviewView } from './overview-panel';
import { overviewPath } from './main-route';
import { syntheticPicker, syntheticThread, mainSyntheticRead, fixtureReads, projectA, projectB, stopped, nonPi, deleted } from './main.preview-fixture';

function Preview() {
  const [path, setPath] = useState(location.hash.slice(1));
  const [narrow, setNarrow] = useState(false);
  // Only this synthetic shell simulates host history. Production uses BB navigation.
  const navigate = useCallback((path: string) => { history.pushState(null, '', `${location.pathname}${location.search}#${path}`); setPath(path); }, []);
  useEffect(() => { const restore = () => setPath(location.hash.slice(1)); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore); }, []);
  useEffect(() => { Object.assign(window, { tenetPreview: { reads: fixtureReads, navigate } }); }, [navigate]);
  return <><header className="preview-controls"><h1>TENET main-page preview</h1>
    <p>Authored offline fixtures. Two simulated machines. No BB install, real archive or evaluator call.</p>
    <button onClick={() => setNarrow(v => !v)}>Toggle 390px container</button>
    <button onClick={() => navigate(overviewPath(stopped, {}, projectA))}>Stopped-thread link</button>
    <button onClick={() => navigate(overviewPath(nonPi, {}, projectA))}>Non-Pi link</button>
    <button onClick={() => navigate(overviewPath(deleted, {}, projectA))}>Deleted link</button>
    <button onClick={() => navigate(overviewPath(stopped, {}, projectB))}>Changed-scope link</button>
    <button onClick={() => navigate(overviewPath(stopped, { sessionId: 'f'.repeat(64), callId: 'e'.repeat(64) }, projectA))}>Forged record link</button>
    <p>History and machine routing here are simulations, not native or deployed host proof.</p></header>
    <div className="main-container" style={{ width: narrow ? 390 : 1180 }}>
      <MainPageView subPath={path} client={syntheticPicker} navigate={navigate}
        overview={props => <OverviewView {...props} readThread={syntheticThread} readOverview={mainSyntheticRead} />}
        findings={threadId => <section style={{ padding: 16 }}><h2>Focused flagged rules</h2><p>Preserved old route: {threadId}</p><button onClick={() => navigate(overviewPath(threadId))}>Return to overview</button></section>} />
    </div></>;
}
createRoot(document.getElementById('preview')!).render(<Preview />);
