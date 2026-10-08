import { categoryLabels, type FindingCategory } from '../../src/decision/finding-triage.js';
import { Button } from '../../web/components/ui/button.js';
import { Input } from '../../web/components/ui/input.js';
import Detail from './Detail.js';
import DecisionIcon from './DecisionIcon.js';
import SummaryWorkspace from './shared/SummaryWorkspace.js';
import PrivateCallExplorer from './PrivateCallExplorer.js';
import { standaloneCall, standaloneSummary } from './shared/standalone-adapter.js';
import { useArchive } from './archive-state.js';
const date = (value: number) => new Date(value).toLocaleString();
const projectName = (paths: string[]) => paths.map(p => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p).join(', ') || 'Unknown project';

export default function App() {
  const archive = useArchive();
  const { sessions, invocations, session, invocation, error, project, projectInput, busy, timelineBusy, detailBusy, manualRefreshing,
    view, issues, health, nextSession, nextInvocation, reader, category, projects, mobileView, pickerOpen } = archive;
  const currentSession = sessions.find(s => s.id === session);
  const compatibilityIssues = !!reader && !!(reader.unsupported || reader.corrupt || reader.otherIssues || reader.indexing);
  const captureIssues = !!(issues.length || health.length);
  const recordingIssues = compatibilityIssues || captureIssues || (!reader && !busy);
  const archiveState = error.startsWith('Live updates paused;') ? 'Live updates paused · reconnecting' : error ? 'Archive unavailable'
    : !reader ? busy ? 'Reading archive…' : 'Coverage unknown'
    : (reader.unsupported || reader.corrupt || reader.otherIssues) ? 'Partial archive'
    : reader.indexing ? 'Indexing archive' : captureIssues ? 'Capture issues' : 'Supported records';
  return <>
    <header className="app-bar">
      <h1><DecisionIcon kind="brand" /> TENET</h1>
      <details className="session-picker" open={pickerOpen} onToggle={event => archive.setPickerOpen(event.currentTarget.open)}>
        <summary><span>Session / archive</span><small title={currentSession?.sessionId}>{currentSession ? `${projectName(currentSession.projects)} · ${currentSession.host} / ${currentSession.contextId}` : session ? 'Selected session' : 'Choose a session'}</small></summary>
        <div className="session-menu">
          <p>Read-only, best-effort archive. This reader does not run actions or change enforcement.</p>
          {reader && <p>Reader {reader.build} · supported recording schemas {reader.supportedSchemas.join(', ')}. This view covers the supported subset, not proof of complete capture.</p>}
          <h2>Sessions <span className="muted">{sessions.length} loaded</span></h2>
          <form className="project-filter" onSubmit={event => { event.preventDefault(); archive.filterProjects(); }}>
            <label htmlFor="project">Project directory</label>
            <Input id="project" aria-label="Project directory" list="projects" value={projectInput} onChange={event => archive.setProjectInput(event.target.value)} placeholder="All projects" />
            <datalist id="projects">{projects.map(path => <option key={path} value={path} />)}</datalist>
            <Button variant="outline" type="submit" disabled={busy}>Filter projects</Button>
          </form>
          {project && <><p>Showing {project}</p><Button variant="outline" onClick={() => archive.filterProjects('')}>All projects</Button></>}
          <nav aria-label="Sessions">{sessions.map(item =>
            <Button variant="ghost" key={item.id} className="session-row" aria-pressed={session === item.id} onClick={() => archive.selectSession(item.id)}>
              <strong hidden>{item.sessionId}</strong><b>{projectName(item.projects)}</b><span>{item.host} / {item.contextId} · {item.invocations} calls</span>
              <small>{date(item.started)}</small>
              {!!(item.concerns || item.unavailable) && <small>{item.concerns} flagged · {item.unavailable} unavailable</small>}
              {item.categoryCounts && <small>{Object.entries(item.categoryCounts).filter(([, n]) => n).map(([c, n]) => `${n} ${categoryLabels[c as FindingCategory]?.toLowerCase() ?? c}`).join(' · ')} (distinct calls; categories overlap)</small>}
            </Button>)}</nav>
          {nextSession !== null && <Button variant="ghost" className="text-button" disabled={busy} onClick={() => archive.loadSessions(nextSession)}>More sessions</Button>}
          {busy ? <p role="status">Reading archive…</p> : !sessions.length && <p>No recorded sessions{project ? ' for this project' : ''}.</p>}
      <Button variant="outline" size="sm" className="header-button" disabled={busy || timelineBusy || detailBusy || manualRefreshing} onClick={archive.refreshArchive}>Refresh archive</Button>
        </div>
      </details>
    </header>

    <SummaryWorkspace standalone model={{ calls: invocations.map(standaloneCall), selected: view ? standaloneSummary(view) : null, selectedId: invocation,
      category, coverage: '', loading: timelineBusy, error, moreCalls: nextInvocation !== null }}
      actions={{ selectCall: archive.selectInvocation, filterCategory: archive.filterCategory, refresh: archive.refreshArchive, loadMoreCalls: () => archive.loadTimeline(nextInvocation ?? undefined) }}
      explorer={<PrivateCallExplorer calls={invocations} selectedId={invocation} session={currentSession} category={category} loading={timelineBusy} more={nextInvocation !== null}
        selectCall={archive.selectInvocation} filterCategory={archive.filterCategory} loadMore={() => archive.loadTimeline(nextInvocation ?? undefined)} />}
      mobileView={mobileView} onMobileViewChange={archive.setMobileView} navigation={
        <nav className="mobile-nav" aria-label="Workspace views">
          <Button variant="ghost" aria-pressed={mobileView === 'calls'} onClick={() => archive.setMobileView('calls')}>Calls</Button>
          <Button variant="ghost" aria-pressed={mobileView === 'assessment'} disabled={!view} onClick={archive.showSummary}>Selected call</Button>
        </nav>
      } coverage={
        <div className="archive-messages">
          {error && <p className="archive-alert" role="alert">{error}</p>}
          <div className="archive-state" data-attention={recordingIssues}>
            <p role="status">{archiveState}{captureIssues && archiveState !== 'Capture issues' ? ' · capture issues' : ''}</p>
            {recordingIssues && <section aria-label="Recording issues"><details className="recording-issues"><summary>Recording issues</summary>
              <div className="issues-body">
                {reader ? <>
                  <p className="reader-coverage">Reader coverage: {reader.unsupported} unsupported schema records ({reader.newerUnsupported ?? 0} newer), {reader.corrupt} corrupt records, {reader.otherIssues} other issues{reader.indexing ? '; indexing is still in progress' : ''}. Older supported calls remain available.</p>
                  <p>Reader {reader.build} · supported recording schemas {reader.supportedSchemas.join(', ')}. This view covers the supported subset, not proof of complete capture.</p>
                </> : <p>Reader compatibility is unknown. Do not treat these calls as a complete archive.</p>}
                <p className="upgrade-guidance">For newer records, update the reader, run <code>bun run inspector:build</code>, then restart the inspector process. A rebuild alone does not update a running reader.</p>
                {captureIssues && <>
                  <p>Capture may be incomplete. {issues.length} recording file issues. {health.length} writers reporting recording issues.</p>
                  <p>Valid records remain browsable. Temporary files may be in progress or left by an interruption. Their contents are not read.</p>
                  <ul>{issues.map((issue, i) => <li key={i}><strong>{issue.reason}</strong>: {issue.file || 'Archive directory'}</li>)}</ul>
                  {!!health.length && <><h2>Writer-wide capture health</h2><ul>{health.map(item => <li key={item.writerId}>{item.failed} failed writes or snapshots, {item.dropped} dropped stages, {item.drainTimeouts} drain timeouts. Writer {item.writerId}</li>)}</ul></>}
                </>}
                <p>Cumulative counters per writer, not per call. They may include other sessions. Zero counters do not prove complete capture.</p>
              </div>
            </details></section>}
          </div>
        </div>
      } inspection={view ? <div className="decision-pane"><Detail key={view.identity?.invocationId} view={view} onMobileViewChange={archive.setMobileView} /></div>
        : <section className="empty-state" aria-live="polite"><span className="empty-symbol" aria-hidden="true">[ ]</span>
          <h2>{detailBusy ? 'Reading invocation…' : session && category && !invocations.length ? 'No matching calls' : session && !invocations.length ? 'Waiting for recorded calls' : session ? 'Choose a call to investigate' : 'Start with a recorded session'}</h2>
          <p>{detailBusy ? 'Loading the recorded call.' : session && category && !invocations.length ? 'Clear the filter to browse all calls.' : session && !invocations.length ? 'New calls appear here as TENET records them.' : 'Choose a session to inspect its calls.'}</p>
        </section>} />
  </>;
}
