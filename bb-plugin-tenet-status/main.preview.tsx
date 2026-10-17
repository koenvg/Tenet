import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MainPageView } from './main-page';
import { OverviewView } from './overview-panel';
import { overviewPath } from './main-route';
import { syntheticPicker, crowdedPicker, cardPicker, syntheticThread, mainSyntheticRead, fixtureReads } from './main.preview-fixture';
import { syntheticDashboard, dashboardCases, type DashboardCase } from './dashboard.preview-fixture';

const dashboardReads: string[] = [];
const pickerReads: (string | null)[] = [];
document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') || 'light';
if (new URLSearchParams(location.search).get('host') === 'constrained') document.documentElement.dataset.host = 'constrained';
function Preview() {
  const [path, setPath] = useState(location.hash.slice(1));
  const [scenario, setScenario] = useState<DashboardCase>(() => new URLSearchParams(location.search).get('case') as DashboardCase || 'recorded');
  const dashboard = useMemo(() => { const source = syntheticDashboard(scenario); return { ...source, read: ((input, signal) => { dashboardReads.push(input.kind); return source.read(input, signal); }) as typeof source.read }; }, [scenario]);
  const query = new URLSearchParams(location.search);
  const basePicker = query.has('crowded') ? crowdedPicker : query.has('cards') ? cardPicker : syntheticPicker;
  const picker = useMemo(() => ({ ...basePicker, projects: ((cursor, signal) => {
    pickerReads.push(cursor ?? null); return basePicker.projects(cursor, signal);
  }) as typeof basePicker.projects }), [basePicker]);
  const navigate = useCallback((path: string) => { history.pushState(null, '', `${location.pathname}${location.search}#${path}`); setPath(path); }, []);
  useEffect(() => { const restore = () => setPath(location.hash.slice(1)); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore); }, []);
  useEffect(() => { Object.assign(window, { tenetPreview: { reads: fixtureReads, dashboardReads, pickerReads, navigate } }); }, [navigate]);
  return <><div className="preview-controls">Synthetic preview
    {query.has('fixtures') && <label> · Fixture <select aria-label="Dashboard fixture" value={scenario} onChange={event => { setScenario(event.target.value as DashboardCase); navigate(''); }}>{dashboardCases.map(name => <option key={name}>{name}</option>)}</select></label>}
    </div>
    {query.has('icons') && <section aria-label="T icon sizes" style={{ display: 'flex', alignItems: 'center', gap: 24, padding: 24 }}>{[16, 20, 24, 32].map(size => <figure key={size}><span role="img" aria-label={`TENET ${size}px`} style={{ display: 'block', width: size, height: size, background: 'currentColor', mask: 'url(./icons/tenet.svg) center / contain no-repeat' }} /><figcaption>{size}px</figcaption></figure>)}</section>}
    <div className="main-container" style={{ width: query.has('narrow') ? 390 : 1180 }}>
      <MainPageView subPath={path} client={picker} dashboard={dashboard} navigate={navigate}
        overview={props => <OverviewView {...props} readThread={syntheticThread} readOverview={mainSyntheticRead} />}
        findings={threadId => <section style={{ padding: 16 }}><h2>Focused flagged rules</h2><p>Retained findings route for {threadId}</p><button onClick={() => navigate(overviewPath(threadId))}>Return to overview</button></section>} />
    </div></>;
}
createRoot(document.getElementById('preview')!).render(<Preview />);
