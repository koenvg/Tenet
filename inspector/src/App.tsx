import { useRef, useState } from 'react';
import { useArchive } from './archive-state.js';
import SessionPicker from './SessionPicker.js';
import RulePanel from './RulePanel.js';
import { inventoryNote, RuleIcon, RuleStatusLabel } from './SessionRules.js';
import './standalone.css';

export default function App() {
  const archive = useArchive(), initiator = useRef<HTMLElement | null>(null);
  const [projectInput, setProjectInput] = useState('');
  const { reader, issues, health, rules } = archive;
  const captureIssues = !!(issues.length || health.length);
  const archiveState = !reader ? archive.busy ? 'Reading archive…' : 'Coverage unknown'
    : reader.unsupported || reader.corrupt || reader.otherIssues ? 'Partial archive'
    : reader.indexing ? 'Indexing archive' : captureIssues ? 'Capture issues' : 'Supported records';
  const openAction = (id: string, element: HTMLElement) => { initiator.current = element; void archive.selectInvocation(id); };
  return <div className="rule-app">
    <header className="rule-app-header"><div className="rule-brand"><RuleIcon kind="brand" />TENET</div><span>Read-only</span></header>
    <main className="rule-main">
      <SessionPicker archive={archive} />
      <h1>Did this session follow the rules?</h1>
      <p className="rule-session-context">{rules?.inventory.state === 'known' ? `${rules.inventory.rules} rules. ` : ''}Based on this session's recorded checks.</p>
      {rules && <div className="rule-session-outcome" role="status"><RuleStatusLabel status={rules.status} /><span>{inventoryNote(rules.inventory)}.</span></div>}
      {archive.error && archive.panel.kind === 'closed' && <p className="rule-alert" role="alert">{archive.error}</p>}
      <section className="rule-list-section" aria-labelledby="rules-heading">
        <div className="rule-list-heading"><h2 id="rules-heading">Rules in this session</h2><span>Select a rule to see its checks</span></div>
        {rules?.items.map(rule => <div className="session-rule" key={rule.id}><button className="rule-trigger" aria-haspopup="dialog" aria-controls="rule-panel-heading" onClick={event => { initiator.current = event.currentTarget; void archive.selectRule(rule.id); }}>
          <span className="rule-name">{rule.preview ?? 'Recorded rule wording unavailable'}</span><RuleStatusLabel status={rule.status} /><RuleIcon kind="chevron" className="rule-chevron" />
        </button></div>)}
        {archive.rulesBusy && !rules && <p role="status" className="rule-empty">Reading recorded rules…</p>}
        {!archive.rulesBusy && !rules?.items.length && <p className="rule-empty">{archive.session ? 'Waiting for recorded rules in this session.' : archive.busy ? 'Reading archive…' : 'Choose a recorded session to inspect its rules.'}</p>}
        {rules?.next && <button disabled={archive.rulesBusy} onClick={() => archive.loadRules(rules.next!)}>More rules</button>}
      </section>
      {rules && <>
        {!!rules.ruleCoverage.reasons.length && <p className="rule-coverage">Recorded coverage limitations: {rules.ruleCoverage.reasons.join(', ')}.</p>}
        {!!rules.ruleCoverage.omittedRules && <p>{rules.ruleCoverage.omittedRules} rules omitted by reader limits.</p>}
        {!!rules.ruleCoverage.omittedChecks && <p>{rules.ruleCoverage.omittedChecks} checks omitted by reader limits.</p>}
        {!!rules.ruleCoverage.omittedDiagnostics && <p>{rules.ruleCoverage.omittedDiagnostics} diagnostics omitted by reader limits.</p>}
        {!!rules.ruleCoverage.diagnostics.length && <details className="rule-diagnostics"><summary>Recorded integrity diagnostics</summary>{rules.ruleCoverage.diagnostics.map(diagnostic => <p key={diagnostic.id}>Missing recorded integrity. <button onClick={event => openAction(diagnostic.invocation, event.currentTarget)}>View recorded action</button></p>)}</details>}
      </>}
      <p className="rule-guidance">A violation describes an attempted action. It does not mean that action ran.</p>
      <p className="rule-coverage">This view only knows about recorded checks. No violations found does not prove every action followed a rule. Capture is best-effort.</p>
      <footer className="rule-main-footer">
        <p role="status">{archiveState}{captureIssues && archiveState !== 'Capture issues' ? ' · capture issues' : ''}</p>
        <details className="recording-issues"><summary>Recording issues and archive controls</summary><div className="issues-body" tabIndex={0} role="region" aria-label="Recording issues">
          {reader ? <><p className="reader-coverage">Reader coverage, archive-wide: {reader.unsupported} unsupported schema records ({reader.newerUnsupported ?? 0} newer), {reader.corrupt} corrupt records, {reader.otherIssues} other issues{reader.indexing ? '; indexing is still in progress' : ''}. Older supported calls remain available.</p><p>Reader {reader.build} · supported recording schemas {reader.supportedSchemas.join(', ')}. This view covers the supported subset, not proof of complete capture.</p></> : <p>Reader compatibility is unknown. Do not treat these calls as a complete archive.</p>}
          <p>For newer records, update the reader, run <code>bun run inspector:build</code>, then restart the inspector process. A rebuild alone does not update a running reader.</p>
          {captureIssues && <><p>Capture may be incomplete. {issues.length} recording file issues. {health.length} writers reporting recording issues.</p><p>Valid records remain browsable. Temporary files may be in progress or left by an interruption. Their contents are not read.</p><ul>{issues.map((issue, i) => <li key={i}>{issue.reason}: {issue.file || 'Archive directory'}</li>)}</ul><h2>Writer-wide capture health</h2><ul>{health.map(item => <li key={item.writerId}>{item.failed} failed writes or snapshots, {item.dropped} dropped stages, {item.drainTimeouts} drain timeouts. Writer {item.writerId}</li>)}</ul></>}
          <p>Cumulative counters per writer, not per call. They may include other sessions. Zero counters do not prove complete capture.</p>
          <p>Read-only, best-effort archive. This reader does not run actions or change enforcement.</p>
          <form onSubmit={event => { event.preventDefault(); archive.filterProjects(projectInput); }}><label htmlFor="project">Project directory</label><input id="project" value={projectInput} onChange={event => setProjectInput(event.target.value)} placeholder="All projects" /><button disabled={archive.busy}>Filter projects</button></form>
          {archive.project && <button onClick={() => { setProjectInput(''); archive.filterProjects(''); }}>All projects</button>}
          <button disabled={archive.busy || archive.rulesBusy || archive.panelBusy || archive.manualRefreshing} onClick={archive.refreshArchive}>Refresh archive</button>
        </div></details>
        <p>No settings or rules can be changed here.</p>
      </footer>
    </main>
    <RulePanel archive={archive} initiator={initiator} />
  </div>;
}
