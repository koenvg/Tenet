import { useState, type CSSProperties, type ReactNode } from 'react';
import type { SummaryWorkspaceInput, CallsWorkspaceInput } from './model.js';
import type { MobileView } from '../presentation.js';
import { Button } from '../../../web/components/ui/button.js';
import CallExplorer from './CallExplorer.js';
import SummaryDetail from './SummaryDetail.js';
import PaneResizer from '../PaneResizer.js';
import ThreadRuleWorkspace from './ThreadRuleWorkspace.js';
import './workspace.css';

type WorkspaceSlots = {
  standalone?: boolean; inspection?: ReactNode; coverage?: ReactNode; navigation?: ReactNode; explorer?: ReactNode;
  mobileView?: MobileView; onMobileViewChange?: (view: MobileView) => void;
};
export default function SummaryWorkspace(props: SummaryWorkspaceInput & WorkspaceSlots) {
  return props.variant === 'thread-rules' ? <ThreadRuleWorkspace {...props} /> : <CallsWorkspace {...props} />;
}
// Standalone extensions never enter the public mount input.
function CallsWorkspace({ model, actions, standalone = false, inspection, coverage, navigation, explorer, mobileView: controlledMobileView, onMobileViewChange }: CallsWorkspaceInput & WorkspaceSlots) {
  const [localMobileView, setLocalMobileView] = useState<MobileView>('calls'), [explorerWidth, setExplorerWidth] = useState(300);
  const mobileView = controlledMobileView ?? localMobileView;
  function setMobileView(value: MobileView) { setLocalMobileView(value); onMobileViewChange?.(value); }
  const session = model.sessions?.find(s => s.id === model.sessionId);
  const emptyWorkspace = !standalone && !model.calls.length && !model.selected && !model.category && !model.moreCalls && !model.moreSessions;
  const workspaceNavigation = navigation ?? <nav className="mobile-nav" aria-label="Workspace views">
    <Button variant="ghost" aria-pressed={mobileView === 'calls'} onClick={() => setMobileView('calls')}>Calls</Button>
    <Button variant="ghost" aria-pressed={mobileView === 'assessment'} onClick={() => setMobileView('assessment')}>Summary</Button>
  </nav>;
  return <main className={`workspace tenet-summary-workspace ${standalone ? 'standalone-inspector' : 'tenet-presentation embedded'}`} data-mobile-view={mobileView} data-empty={emptyWorkspace} style={{ '--explorer-width': `${explorerWidth}px` } as CSSProperties}>
    {actions.backToRules && <div className="archive-messages"><Button variant="outline" onClick={actions.backToRules}>Back to recorded rules</Button></div>}
    {standalone && workspaceNavigation}
    {coverage ?? <div className="archive-messages">
      <div className="archive-toolbar">
        <p role="status">{model.coverage}</p>
        <Button variant="outline" disabled={model.loading} onClick={actions.refresh}>Refresh archive</Button>
      </div>
      {model.error && <p role="alert">{model.error}</p>}
      {(!!model.sessions?.length || model.moreSessions) && <div className="session-tools">
        {!!model.sessions?.length && <label>Linked session
          <select aria-label="Linked session" value={model.sessionId} disabled={model.loading} onChange={event => actions.selectSession?.(event.currentTarget.value)}>
            {model.sessionId && !model.sessions.some(s => s.id === model.sessionId) && <option value={model.sessionId}>Selected older session · Load more sessions for counts</option>}
            {model.sessions.map(s => <option key={s.id} value={s.id}>{new Date(s.started).toLocaleString()} · {s.calls} calls</option>)}
          </select>
        </label>}
        {model.moreSessions && <Button variant="outline" disabled={model.loading} onClick={actions.loadMoreSessions}>More sessions</Button>}
      </div>}
      {model.sessionId && <details className="session-recording"><summary>Session recording details</summary>
        {session && <p className="session-counts">{session.calls} calls · {session.categoryCounts.violation} selected FAIL · {session.categoryCounts.unavailable} evaluator failures · {session.categoryCounts.uncertainty} uncertain · {session.categoryCounts.approval} approval conditions · {session.categoryCounts.pending} pending, dropped, cancelled or incomplete</p>}
        <p>{model.sessionId}</p>
      </details>}
      {!!model.archiveWarnings?.length && <details className="archive-warnings"><summary>Archive warnings</summary><p>These warnings can include records from other threads. They are not assessment failures.</p><ul>{model.archiveWarnings.map(code => <li key={code}>{code}</li>)}</ul></details>}
    </div>}
    {!emptyWorkspace && <>
      {!standalone && workspaceNavigation}
      {explorer ?? <CallExplorer filterId={standalone ? 'finding-category' : undefined} explorerId={standalone ? 'call-explorer' : undefined} calls={model.calls} selectedId={model.selectedId ?? ''} category={model.category} loading={model.loading} unavailable={model.unavailable ?? false} more={model.moreCalls ?? false}
        selectCall={id => { setMobileView('assessment'); actions.selectCall(id); }} filterCategory={actions.filterCategory} loadMore={actions.loadMoreCalls} />}
      {standalone && <PaneResizer value={explorerWidth} onValueChange={setExplorerWidth} min={220} max={460} label="Resize call explorer" controls="call-explorer" />}
      <div className="inspection">
        {inspection ?? (model.selected ? <SummaryDetail key={model.selectedId ?? model.selected.identity?.callId} view={model.selected} moreRules={model.moreRules} loading={model.loading} loadMoreRules={actions.loadMoreRules} restartRules={actions.restartRules} />
          : <section className="empty-state" aria-live="polite"><h2>{model.loading ? 'Reading invocation…' : model.unavailable ? 'Summary unavailable' : 'Choose a call to investigate'}</h2></section>)}
      </div>
    </>}
  </main>;
}
