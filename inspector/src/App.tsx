import { useLayoutEffect, useRef } from 'react';
import { categoryLabels, type FindingCategory } from '../../src/decision/finding-triage.js';
import { Button } from '../../web/components/ui/button.js';
import { Input } from '../../web/components/ui/input.js';
import Detail from './Detail.js';
import DecisionIcon from './DecisionIcon.js';
import SummaryWorkspace from './shared/SummaryWorkspace.js';
import { standaloneCall, standaloneSummary } from './shared/standalone-adapter.js';
import { gateLabels } from './presentation.js';
import { useArchive } from './archive-state.js';

const date = (value: number) => new Date(value).toLocaleString();
const projectName = (paths: string[]) => paths.map(p => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p).join(', ') || 'Unknown project';
const policyLabel = (identity: string) => {
  try { const [source, digest, target] = JSON.parse(identity); return `${source ?? 'source not recorded'} · digest ${digest} · target ${target ?? 'not recorded'}`; }
  catch { return identity; }
};
const policyKey = (identity: string) => {
  try { const [, digest, target] = JSON.parse(identity); return `${typeof digest === 'string' ? digest.slice(0, 12) + (digest.length > 12 ? '…' : '') : 'unknown'} · target ${target ?? 'not recorded'}`; }
  catch { return 'unknown'; }
};

export default function App() {
  const archive = useArchive();
  const { sessions, invocations, session, invocation, error, project, projectInput, busy, timelineBusy, detailBusy, manualRefreshing,
    view, issues, health, nextSession, nextInvocation, reader, groups, groupsLoaded, groupsBusy, groupsError,
    category, projects, mobileView, pickerOpen, showPatterns } = archive;
  const decisionButton = useRef<HTMLButtonElement>(null), summaryButton = useRef<HTMLButtonElement>(null);
  const currentSession = sessions.find(s => s.id === session);
  const groupFocus = useRef('');
  useLayoutEffect(() => {
    if (!view || invocation !== groupFocus.current || showPatterns) return;
    groupFocus.current = '';
    (window.matchMedia('(max-width: 900px)').matches ? summaryButton : decisionButton).current?.focus();
  }, [view, invocation, showPatterns, mobileView]);
  async function inspectGroupCall(id: string) {
    groupFocus.current = id;
    await archive.selectInvocation(id);
  }
  return <>
    <header className="app-bar">
      <h1><DecisionIcon kind="brand" /> TENET</h1>
      <details className="session-picker" open={pickerOpen} onToggle={event => archive.setPickerOpen(event.currentTarget.open)}>
        <summary title={currentSession?.sessionId}>{currentSession ? `${projectName(currentSession.projects)} · ${currentSession.host} / ${currentSession.contextId}` : session ? 'Selected session' : 'Choose a session'}</summary>
        <div className="session-menu">
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
        </div>
      </details>
      <span className="local-label">Read-only</span>
      <Button variant="outline" size="sm" className="header-button" disabled={busy || timelineBusy || detailBusy || manualRefreshing} onClick={archive.refreshArchive}>Refresh archive</Button>
    </header>
    <SummaryWorkspace standalone model={{ calls: invocations.map(standaloneCall), selected: view ? standaloneSummary(view) : null, selectedId: invocation,
      category, coverage: '', loading: timelineBusy, error, moreCalls: nextInvocation !== null }}
      actions={{ selectCall: archive.selectInvocation, filterCategory: archive.filterCategory, refresh: archive.refreshArchive, loadMoreCalls: () => archive.loadTimeline(nextInvocation ?? undefined) }}
      mobileView={mobileView} onMobileViewChange={archive.setMobileView} navigation={<>
      <nav className="mobile-nav" aria-label="Workspace views">
        <Button variant="ghost" aria-pressed={mobileView === 'calls'} onClick={() => archive.setMobileView('calls')}>Calls</Button>
        <Button variant="ghost" ref={summaryButton} aria-pressed={mobileView === 'assessment' && !showPatterns} disabled={!view} onClick={archive.showSummary}>Summary</Button>
        <Button variant="ghost" aria-pressed={mobileView === 'assessment' && showPatterns} disabled={!session} onClick={archive.openPatterns}>Patterns</Button>
      </nav></>} coverage={<>
      <div className="archive-messages">
        {error && <p className="archive-alert" role="alert">{error}</p>}
        {reader && <details className="reader-status"><summary>Archive details</summary><p>Reader {reader.build} · supported recording schemas {reader.supportedSchemas.join(', ')} · read-only, best-effort archive</p></details>}
        {reader && (reader.unsupported || reader.indexing || reader.corrupt || reader.otherIssues) ?
          <p className="archive-alert compatibility-warning" role="status">Partial archive coverage: {reader.unsupported} unsupported schema records ({reader.newerUnsupported ?? 0} newer), {reader.corrupt} corrupt records, {reader.otherIssues} other issues{reader.indexing ? '; indexing is still in progress' : ''}. Older supported calls remain available. <span className="upgrade-guidance">For newer records, update the reader, run <code>bun run inspector:build</code>, then restart the inspector process. A rebuild alone does not update a running reader.</span><span className="mobile-upgrade">For newer records, rebuild and restart the reader.</span></p>
          : !reader && !busy && <p className="archive-alert" role="status">Reader compatibility is unknown. Do not treat these calls as a complete archive.</p>}
        {!!(issues.length || health.length) && <section className="archive-alert" aria-label="Recording issues">
          <details><summary>Recording issues: {issues.length} files, {health.length} writers reporting recording issues</summary>
            <p>Valid records remain browsable; capture may be incomplete. Temporary files may be in progress or left by an interruption. Their contents are not read.</p>
            <ul>{issues.map((issue, index) => <li key={index}><strong>{issue.reason}</strong>: {issue.file || 'Archive directory'}</li>)}</ul>
            {!!health.length && <><h2>Writer-wide capture health</h2><p>Cumulative counters per writer, not per call. They may include other sessions. Zero counters do not prove complete capture.</p>
              <ul>{health.map(item => <li key={item.writerId}>{item.failed} failed writes or snapshots, {item.dropped} dropped stages, {item.drainTimeouts} drain timeouts. Writer {item.writerId}</li>)}</ul>
            </>}
          </details>
        </section>}
      </div>
      </>} inspection={<>
        {session && <nav className="inspection-switch" aria-label="Inspection views">
          <Button variant="ghost" ref={decisionButton} aria-pressed={!showPatterns} disabled={!view} onClick={archive.showSummary}>Summary</Button>
          <Button variant="ghost" aria-pressed={showPatterns} onClick={archive.openPatterns}>Uncertainty groups{groupsLoaded ? ` (${groups.items.length}${groups.omittedGroups ? '+' : ''})` : ''}</Button>
        </nav>}
        {view ? <div className="decision-pane" hidden={showPatterns}><Detail key={view.identity?.invocationId} view={view} onMobileViewChange={archive.setMobileView} /></div>
          : !showPatterns && <section className="empty-state" aria-live="polite">
            <span className="empty-symbol" aria-hidden="true">[ ]</span>
            <h2>{detailBusy ? 'Reading invocation…' : session && category && !invocations.length ? 'No matching calls' : session && !invocations.length ? 'Waiting for recorded calls' : session ? 'Choose a call to investigate' : 'Start with a recorded session'}</h2>
            <p>{detailBusy ? 'Loading the recorded call.' : session && category && !invocations.length ? 'Clear the filter to browse all calls, or open uncertainty groups.' : session && !invocations.length ? 'New calls appear here as TENET records them.' : 'Choose a session to inspect its calls.'}</p>
          </section>}
        {session && <section className="pattern-view" aria-label="Uncertainty groups" hidden={!showPatterns}>
          <header><h2>Uncertain calls by rule and gate</h2><p>Grouped by recorded policy, profile, rule and gate. Calls stay separate. The call filter does not change these groups.</p></header>
          {groupsError && <p className="missing-data" role="alert">Could not load groups: {groupsError} <Button variant="outline" onClick={archive.loadGroups}>Try again</Button></p>}
          {groupsBusy && !groupsLoaded ? <p role="status">Loading uncertainty groups…</p>
            : groupsLoaded && !groups.items.length ? <p>No uncertainty groups recorded in this session.</p>
            : groupsLoaded && <div className="pattern-list">{groups.items.map(group =>
              <details className="uncertainty-group" key={`${group.policyIdentity}:${group.profile}:${group.ruleId}:${group.gate}`}>
                <summary><span className="pattern-heading"><strong>{gateLabels[group.gate] ?? group.gate}</strong><span>{group.count} {group.count === 1 ? 'call' : 'calls'}</span></span><small>Rule {group.ruleId} · {group.profile} · Policy {policyKey(group.policyIdentity)}</small></summary>
                <div className="pattern-context"><p>Policy {policyLabel(group.policyIdentity)}</p><p>First {date(group.first)} · Last {date(group.last)}</p></div>
                <ul>{group.invocations.map(ref => <li key={ref.id}><Button variant="outline" onClick={() => inspectGroupCall(ref.id)}>{ref.callId} · {date(ref.timestamp)}</Button></li>)}</ul>
                {!!group.omitted && <p className="pattern-overflow">{group.omitted} more links omitted here. Browse the paginated call list for individual records.</p>}
              </details>)}
              {!!groups.omittedGroups && <p className="pattern-overflow">{groups.omittedGroups} more groups omitted from this bounded view. Individual calls remain in the call list.</p>}
            </div>}
        </section>}
      </>} />
  </>;
}
