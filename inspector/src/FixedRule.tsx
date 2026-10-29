import { useLayoutEffect, useRef } from 'react';
import { ruleStatusPresentation, type RuleStatus } from '../../src/inspector/session-rules-model.js';
import type { Archive } from './archive-state.js';
import { RuleIcon, recordedTime } from './SessionRules.js';
import './fixed-rule.css';

const findings = {
  clear: { text: 'No violations found in recorded checks', path: 'M12 10v6m0-9v.1', tone: 'neutral' },
  violation: { text: 'Violation found in recorded check', path: 'm8 8 8 8m0-8-8 8', tone: 'violation' },
  unclear: { text: 'Unclear', path: 'M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 4v.1', tone: 'unclear' },
  unchecked: { text: 'Not checked', path: 'M12 10v6m0-9v.1', tone: 'unclear' },
};
export function FixedFinding({ status, compact = false }: { status: RuleStatus; compact?: boolean }) {
  const finding = findings[status];
  return <span className={`fixed-finding tone-${finding.tone}`}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d={finding.path} /></svg><span>{compact ? ruleStatusPresentation[status].label : finding.text}</span></span>;
}
function RecordedFields({ archive, invocation }: { archive: Archive; invocation: string }) {
  const ref = useRef<HTMLDetailsElement>(null), record = archive.openRecords[invocation];
  const active = !!record;
  useLayoutEffect(() => { if (ref.current) ref.current.open = active; }, [active]);
  const identity = record?.state === 'available' ? record.view.identity : null;
  return <details ref={ref} className="fixed-fields" onToggle={event => {
    if (event.currentTarget.open && !active) void archive.selectInvocation(invocation);
    else if (!event.currentTarget.open && active) archive.closeInvocation(invocation);
  }}>
    <summary>Recorded tool fields <RuleIcon kind="chevron" /></summary>
    {record?.state === 'unavailable' ? <p role="status">{record.reason} <button onClick={() => archive.selectInvocation(invocation)}>Retry recorded action</button></p> : <>
      <p role="status">{!record ? 'Tool fields not loaded.' : record.state === 'loading' ? 'Reading recorded tool fields…' : 'Available recorded fields'}</p>
      <dl><dt>Tool name</dt><dd>{record?.state !== 'available' ? 'Not loaded' : <code>{identity?.toolName ?? 'Not recorded'}</code>}</dd>
        {record?.state === 'available' && <><dt>Session</dt><dd><code>{identity?.sessionId ?? 'Not recorded'}</code></dd><dt>Call ID</dt><dd><code>{identity?.callId ?? 'Not recorded'}</code></dd>
          <dt>Mode</dt><dd>{identity?.mode ?? 'Not recorded'}</dd><dt>Permission</dt><dd>{record.view.missing.includes('permission') ? 'Not recorded' : record.view.permission ?? 'Not recorded'}</dd><dt>Execution</dt><dd>{record.view.missing.includes('execution') ? 'Not recorded' : record.view.execution ?? 'Not recorded'}</dd></>}
      </dl>
      {record?.state === 'available' && !!record.view.missing.length && <p>Missing recorded stages: {record.view.missing.join(', ')}.</p>}
    </>}
  </details>;
}
export default function FixedRule({ archive }: { archive: Archive }) {
  const state = archive.fixedRule, selected = archive.selected;
  const session = archive.sessions.find(item => item.id === archive.session);
  return <section className="fixed-rule-view" aria-labelledby="fixed-heading" key={archive.session}>
    <h1 id="fixed-heading">Rules</h1>
    {archive.session && <p className="fixed-session-context">Recorded host <code>{session?.host ?? 'Not recorded'}</code> · session <code>{session?.sessionId ?? 'Not recorded'}</code> · context <code>{session?.contextId ?? 'Not recorded'}</code></p>}
    {state.kind === 'choose-session' && <p role="status">Choose a Pi session to review this rule.</p>}
    {state.kind === 'reading' && <p role="status">Reading recorded rule…</p>}
    {state.kind === 'unavailable' && <p role="status">{state.reason}</p>}
    {state.kind === 'ready' && selected && selected.wording.state === 'available' && <>
      <details className="fixed-rule-row" key={state.rule}>
        <summary><span className="fixed-rule-text">{selected.wording.text}</span><FixedFinding status={selected.rule.status} /><span className="fixed-evidence-trigger">Evidence<RuleIcon kind="chevron" /></span></summary>
        <div className="fixed-rule-evidence">
          <h2>Recorded checks</h2>
          {!!selected.rule.unassessedObservations && <p>{selected.rule.unassessedObservations} unassessed observations recorded.</p>}
          {archive.checks?.items.length === 0 && <p>No recorded checks of this rule.</p>}
          {archive.checks?.items.map(check => <article className="fixed-check" key={check.id}>
            <h3>Recorded check · <time dateTime={new Date(check.timestamp).toISOString()}>{recordedTime(check.timestamp)}</time></h3>
            <FixedFinding compact status={check.status} /><p>{check.reason}</p>
            <dl><dt>Call ID</dt><dd><code>{check.callId ?? (check.callIdOmitted ? 'Omitted from this projection' : 'Not recorded')}</code></dd><dt>Outcome</dt><dd>{check.outcome ?? 'Not recorded'}</dd>
              <dt>Gates</dt><dd>{check.gates === null ? 'Not recorded' : check.gates.length ? check.gates.join(', ') : 'No recorded gates'}</dd>
              <dt>Profile</dt><dd>{check.profile}</dd><dt>Question version</dt><dd>{check.questionVersion ?? 'Not recorded'}</dd><dt>Input version</dt><dd>{check.inputVersion ?? 'Not recorded'}</dd></dl>
            <RecordedFields archive={archive} invocation={check.invocation} />
          </article>)}
          {archive.checks?.next && <button disabled={archive.panelBusy} onClick={archive.loadChecks}>More recorded checks</button>}
          {!!archive.checks?.ruleCoverage.omittedChecks && <p>{archive.checks.ruleCoverage.omittedChecks} checks omitted by reader limits.</p>}
          <button onClick={() => void archive.selectRule(state.rule)}>Open full rule details</button>
        </div>
      </details>
    </>}
    <p className="fixed-scope-note">Only recorded attempts to tools named <code>write</code> and <code>edit</code> are in scope. Shell commands, other side effects and external changes are excluded. Findings describe all recorded checks of this declaration, not a tool-filtered result.</p>
    <p className="fixed-scope-note">No violations found does not establish whole-run compliance or complete observation. A recorded attempt does not establish tool execution or child completion.</p>
  </section>;
}
