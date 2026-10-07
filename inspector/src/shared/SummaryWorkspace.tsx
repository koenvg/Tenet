import { useState, type CSSProperties, type ReactNode } from 'react';
import type { SummaryWorkspaceInput } from './model.js';
import type { MobileView } from '../presentation.js';
import { Button } from '../../../web/components/ui/button.js';
import CallExplorer from './CallExplorer.js';
import SummaryDetail from './SummaryDetail.js';
import PaneResizer from '../PaneResizer.js';
import './workspace.css';

// Standalone extensions never enter the public mount input.
export default function SummaryWorkspace({ model, actions, standalone = false, inspection, coverage, navigation, mobileView: controlledMobileView, onMobileViewChange }: SummaryWorkspaceInput & {
  standalone?: boolean; inspection?: ReactNode; coverage?: ReactNode; navigation?: ReactNode;
  mobileView?: MobileView; onMobileViewChange?: (view: MobileView) => void;
}) {
  const [localMobileView, setLocalMobileView] = useState<MobileView>('calls'), [explorerWidth, setExplorerWidth] = useState(300);
  const mobileView = controlledMobileView ?? localMobileView;
  function setMobileView(value: MobileView) { setLocalMobileView(value); onMobileViewChange?.(value); }
  const session = model.sessions?.find(s => s.id === model.sessionId);
  return <main className={`workspace tenet-summary-workspace tenet-presentation ${standalone ? '' : 'embedded'}`} data-mobile-view={mobileView} style={{ '--explorer-width': `${explorerWidth}px` } as CSSProperties}>
    {navigation ?? <nav className="mobile-nav" aria-label="Workspace views">
      <Button variant="ghost" aria-pressed={mobileView === 'calls'} onClick={() => setMobileView('calls')}>Calls</Button>
      <Button variant="ghost" aria-pressed={mobileView === 'assessment'} onClick={() => setMobileView('assessment')}>Summary</Button>
    </nav>}
    {coverage ?? <div className="archive-messages">
      <p role="status">{model.coverage}</p>
      <Button variant="outline" disabled={model.loading} onClick={actions.refresh}>Refresh archive</Button>
      {model.error && <p role="alert">{model.error}</p>}
      {!!model.sessions?.length && <>
        <label>Linked session
          <select aria-label="Linked session" value={model.sessionId} disabled={model.loading} onChange={event => actions.selectSession?.(event.currentTarget.value)}>
            {model.sessionId && !model.sessions.some(s => s.id === model.sessionId) && <option value={model.sessionId}>Selected older session · {model.sessionId.slice(0, 8)} · Load more sessions for counts</option>}
            {model.sessions.map(s => <option key={s.id} value={s.id}>{new Date(s.started).toLocaleString()} · {s.calls} calls · {s.id.slice(0, 8)}</option>)}
          </select>
        </label>
        {model.moreSessions && <Button variant="outline" disabled={model.loading} onClick={actions.loadMoreSessions}>More sessions</Button>}
        {session && <p className="session-counts">{session.calls} calls · {session.categoryCounts.violation} selected FAIL · {session.categoryCounts.unavailable} evaluator failures · {session.categoryCounts.uncertainty} uncertain · {session.categoryCounts.approval} approval conditions · {session.categoryCounts.pending} pending, dropped, cancelled or incomplete</p>}
      </>}
      {!!model.archiveWarnings?.length && <details><summary>Archive warnings</summary><p>These warnings can include records from other threads. They are not assessment failures.</p><ul>{model.archiveWarnings.map(code => <li key={code}>{code}</li>)}</ul></details>}
    </div>}
    <CallExplorer filterId={standalone ? 'finding-category' : undefined} showCallLabels={!standalone} explorerId={standalone ? 'call-explorer' : undefined} calls={model.calls} selectedId={model.selectedId ?? ''} category={model.category} loading={model.loading} unavailable={model.unavailable ?? false} more={model.moreCalls ?? false}
      selectCall={id => { setMobileView('assessment'); actions.selectCall(id); }} filterCategory={actions.filterCategory} loadMore={actions.loadMoreCalls} />
    {standalone && <PaneResizer value={explorerWidth} onValueChange={setExplorerWidth} min={220} max={460} label="Resize call explorer" controls="call-explorer" />}
    <div className="inspection">
      {inspection ?? (model.selected ? <SummaryDetail key={model.selectedId ?? model.selected.identity?.callId} view={model.selected} moreRules={model.moreRules} loading={model.loading} loadMoreRules={actions.loadMoreRules} restartRules={actions.restartRules} />
        : <section className="empty-state" aria-live="polite"><h2>{model.loading ? 'Reading invocation…' : model.unavailable ? 'Summary unavailable' : 'Choose a call to investigate'}</h2></section>)}
    </div>
  </main>;
}
