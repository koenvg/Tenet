import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { Archive } from './archive-state.js';
import { RuleIcon, RuleStatusLabel, recordedTime } from './SessionRules.js';
import Detail from './Detail.js';

function ExactAction({ archive, invocation }: { archive: Archive; invocation: string }) {
  const record = archive.openRecords[invocation];
  return record?.state === 'available' ? <>{record.sourceRevision === null && <p role="status">Source consistency unknown. Rule inventory is unavailable for this direct recording.</p>}<Detail view={record.view} /></>
    : record ? <p role="status">{record.state === 'loading' ? 'Reading recorded action…' : <>{record.reason} <button onClick={() => archive.selectInvocation(invocation)}>Retry recorded action</button></>}</p> : null;
}
function ActionDisclosure({ archive, invocation }: { archive: Archive; invocation: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const active = !!archive.openRecords[invocation];
  useLayoutEffect(() => { if (ref.current) ref.current.open = active; }, [active]);
  return <details ref={ref} className="rule-action-disclosure" onToggle={event => { if (event.currentTarget.open && !active) void archive.selectInvocation(invocation); else if (!event.currentTarget.open && active) archive.closeInvocation(invocation); }}>
    <summary>View recorded action <RuleIcon kind="chevron" /></summary><ExactAction archive={archive} invocation={invocation} />
  </details>;
}
export default function RulePanel({ archive, initiator, active = true }: { archive: Archive; initiator: RefObject<HTMLElement | null>; active?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), close = useRef<HTMLButtonElement>(null);
  const open = archive.panel.kind !== 'closed';
  const rule = archive.panel.kind === 'closed' ? null : archive.panel.rule;
  useLayoutEffect(() => {
    const element = dialog.current!;
    if (!active) { element.close(); return; }
    if (open && !element.open) { element.showModal(); close.current?.focus(); }
    else if (!open && element.open) {
      element.close();
      const target = initiator.current?.isConnected ? initiator.current : document.querySelector<HTMLButtonElement>('.rule-session-toggle');
      target?.focus({ preventScroll: true });
    }
  }, [open, initiator, active]);
  return <dialog ref={dialog} className="rule-panel" aria-labelledby="rule-panel-heading" aria-describedby="rule-panel-note" onCancel={event => { event.preventDefault(); archive.closePanel(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary, [tabindex="0"]')].filter(element => element.getClientRects().length && !element.hasAttribute('disabled'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) archive.closePanel(); } }}>
    <header className="rule-panel-header"><h2 id="rule-panel-heading">{rule ? 'Rule details' : 'Recorded action'}</h2><button ref={close} className="rule-panel-close" onClick={archive.closePanel}><RuleIcon kind="close" />Close</button></header>
    <div className="rule-panel-body" key={`${archive.session}:${rule ?? 'action'}`}>
      {archive.error && <p role="alert">{archive.error}</p>}
      {archive.panelError && <p role="status">{archive.panelError}</p>}
      {rule ? archive.selected ? <>
        {archive.selected.wording.state === 'available' ? <h3 className="rule-full-text">{archive.selected.wording.text}</h3> : <><h3>Exact recorded wording unavailable</h3><p>{archive.selected.wording.reason}</p></>}
        <RuleStatusLabel status={archive.selected.rule.status} />
        <p className="rule-explanation">{({ clear: 'No violations were found in the recorded checks of this rule. Actions outside those checks are not covered.', violation: 'A recorded check found a violation. This finding does not establish permission, approval or execution.', unclear: 'Recorded observations are uncertain or unavailable. Unclear is not a violation or a pass.', unchecked: 'There is no recorded assessment of this rule in this session. Not checked does not mean followed, violated or not applicable.' })[archive.selected.rule.status]}</p>
        <details className="rule-context"><summary>Recorded version and origin</summary><dl><dt>Declaration</dt><dd>{archive.selected.rule.declarationId}</dd><dt>Policy identity</dt><dd>{archive.selected.rule.policyIdentity ?? 'Unknown recorded policy identity'}</dd><dt>Origin</dt><dd>{archive.selected.rule.builtin ? 'Recorded built-in rule' : archive.selected.rule.origin ? `${archive.selected.rule.origin.role ?? 'Legacy unknown role'} · ${archive.selected.rule.origin.source} · line ${archive.selected.rule.origin.line}` : 'Recorded origin unavailable'}</dd><dt>Declaration revision</dt><dd>{archive.selected.rule.declarationRevision}</dd></dl></details>
        {!!archive.selected.rule.unassessedObservations && <p>{archive.selected.rule.unassessedObservations} unassessed observations recorded.</p>}
        <h4 className="rule-checks-heading">Recorded checks</h4>
        {archive.checks?.items.length === 0 && <p className="rule-empty-checks">No recorded checks of this rule.</p>}
        <div className="rule-check-list">{archive.checks?.items.map(check => <article className="rule-check" key={check.id}>
          <div className="rule-check-top"><h5>Recorded check</h5><time dateTime={new Date(check.timestamp).toISOString()}>{recordedTime(check.timestamp)}</time></div>
          <RuleStatusLabel status={check.status} /><p>{check.reason}</p>
          <details className="rule-check-context"><summary>Recorded check context</summary><dl><dt>Profile</dt><dd>{check.profile}</dd><dt>Question version</dt><dd>{check.questionVersion ?? 'Not recorded'}</dd><dt>Input version</dt><dd>{check.inputVersion ?? 'Not recorded'}</dd><dt>Outcome</dt><dd>{check.outcome ?? 'Not recorded'}</dd><dt>Gates</dt><dd>{check.gates === null ? 'Not recorded' : check.gates.length ? check.gates.join(', ') : 'No recorded gates'}</dd><dt>Call ID</dt><dd>{check.callId ?? (check.callIdOmitted ? 'Omitted from this projection' : 'Not recorded')}</dd></dl></details>
          <ActionDisclosure archive={archive} invocation={check.invocation} />
        </article>)}</div>
        {archive.checks?.next && <button disabled={archive.panelBusy} onClick={archive.loadChecks}>More recorded checks</button>}
        {!!archive.checks?.ruleCoverage.omittedChecks && <p>{archive.checks.ruleCoverage.omittedChecks} checks omitted by reader limits.</p>}
        {archive.panel.kind === 'action' && !archive.checks?.items.some(check => archive.panel.kind === 'action' && check.invocation === archive.panel.invocation) && <ExactAction archive={archive} invocation={archive.panel.invocation} />}
      </> : <><p role="status">{archive.panelBusy ? 'Reading recorded rule…' : 'Recorded rule unavailable. Try refreshing.'}</p>{archive.panel.kind === 'action' && <ExactAction archive={archive} invocation={archive.panel.invocation} />}</>
        : archive.panel.kind === 'action' && <ExactAction archive={archive} invocation={archive.panel.invocation} />}
    </div>
    <div className="rule-panel-footer"><p id="rule-panel-note">Read-only. A recorded attempt does not mean the action ran.</p></div>
  </dialog>;
}
