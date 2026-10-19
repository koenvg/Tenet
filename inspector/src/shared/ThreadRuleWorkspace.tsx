import { useEffect, useRef } from 'react';
import type { ThreadRuleWorkspaceInput } from './model.js';
import type { SafeThreadRule } from '../../../src/inspector/thread-rules-model.js';
import { RuleIcon, RuleStatusLabel } from './RuleStatus.js';
import SummaryDetail from './SummaryDetail.js';
import './thread-rules.css';

function RuleWording({ rule }: { rule: SafeThreadRule }) {
  return <span className="thread-rule-wording"><strong>{rule.excerpt ?? (rule.conflict ? 'Conflicting recorded wording' : 'Recorded wording unavailable')}</strong></span>;
}
export default function ThreadRuleWorkspace({ model, actions }: ThreadRuleWorkspaceInput) {
  const rules = model.rules, kind = rules?.kind ?? 'inventory';
  const selectedRule = rules && rules.kind !== 'inventory' ? rules.rule : null;
  const coverageGaps = rules ? [
    rules.summary.omittedRules ? `${rules.summary.omittedRules} rule observations omitted` : '',
    rules.summary.omittedChecks ? `${rules.summary.omittedChecks} checks omitted` : '',
    rules.summary.missingIntegrity ? `${rules.summary.missingIntegrity} missing recorded integrity declarations` : '',
  ].filter(Boolean).join(' · ') : '';
  const heading = useRef<HTMLHeadingElement>(null), lastRule = useRef<string | null>(null), lastCall = useRef<string | null>(null);
  const root = useRef<HTMLElement>(null), previous = useRef('inventory');
  const destination = `${kind}:${selectedRule?.id ?? ''}:${model.selectedId ?? ''}`;
  useEffect(() => {
    if (!rules || previous.current === destination) return;
    const returning = kind === 'inventory' && lastRule.current ? root.current?.querySelector<HTMLButtonElement>(`[data-rule-id="${lastRule.current}"]`)
      : kind === 'checks' && previous.current.startsWith('call:') && lastCall.current ? root.current?.querySelector<HTMLButtonElement>(`[data-check-call="${lastCall.current}"]`) : null;
    if (previous.current !== 'inventory' || kind !== 'inventory') (returning ?? heading.current)?.focus();
    previous.current = destination;
  }, [destination, rules]);
  return <main ref={root} className="workspace tenet-summary-workspace tenet-presentation embedded tenet-thread-rules">
    {kind !== 'inventory' && <nav className="thread-breadcrumb" aria-label="Recorded rule navigation"><button type="button" onClick={actions.back}>
      {kind === 'call' ? 'Back to recorded checks' : 'Back to recorded rules'}</button><span>{selectedRule?.label}</span>{kind === 'call' && <span>Recorded call</span>}</nav>}
    <section className="thread-rule-content" aria-busy={model.loading}>
      <h1 ref={heading} tabIndex={-1}>{kind === 'inventory' ? 'Recorded rules for this thread' : kind === 'checks' ? 'Recorded checks' : 'Recorded call summary'}</h1>
      {rules && rules.items.length > 0 && rules.summary.incomplete && <p role="status">{coverageGaps || 'Rule inventory may be incomplete.'}</p>}
      {kind === 'inventory' ? <>
        <p className="thread-rule-intro">Every retained recorded rule applied to this exact thread, across linked sessions. Select a rule to see its checks.</p>
        {rules?.summary && <p className="thread-rule-totals">{rules.summary.retainedRules} retained rules · {rules.summary.unchecked} not checked. Findings are not permission or proof of execution.</p>}
        <ul className="thread-rule-list" aria-label="Recorded rules">
          {rules?.kind === 'inventory' && rules.items.map(rule => <li key={rule.id}><button type="button" data-rule-id={rule.id} onClick={() => { lastRule.current = rule.id; actions.selectRule(rule.id); }}>
            <RuleWording rule={rule} /><RuleStatusLabel status={rule.status} /><RuleIcon kind="chevron" />
          </button></li>)}
        </ul>
        {!rules?.items.length && <p role="status">{model.loading ? 'Reading recorded rules…' : model.unavailable || rules?.summary.reasons.includes('no-linked-recordings') ? model.coverage : 'No retained linked rule declarations. Rule inventory unknown, not clear.'}</p>}
        {rules?.kind === 'inventory' && <p className="thread-page-note">{rules.items.length} of {rules.summary.retainedRules} retained rules displayed. Reader limit 1,024 rules. Capture is best-effort, not complete.</p>}
      </> : selectedRule && <>
        <div className="thread-selected-rule"><RuleWording rule={selectedRule} /><RuleStatusLabel status={selectedRule.status} />
          <p>{selectedRule.checks} recorded checks · {selectedRule.unassessedObservations} observations without a check attempt.</p>
          {selectedRule.conflict && <p>Recorded declaration conflict. No exact wording is substituted.</p>}</div>
        {rules?.kind === 'checks' && <>
          <ul className="thread-check-list" aria-label="Recorded checks">{rules.items.map(check => {
            const date = new Date(check.timestamp);
            return <li key={check.id}>
              <div className="thread-check-heading"><RuleStatusLabel status={check.status} />
                {Number.isFinite(date.getTime()) ? <time dateTime={date.toISOString()}>{date.toLocaleString()}</time>
                  : <span className="thread-check-time">Recorded time unavailable</span>}</div>
              <p>{!check.trusted ? 'Recorded assessment unavailable or invalid.' : check.outcome ? `Validated recorded ${check.outcome}.` : 'Recorded outcome unavailable.'}</p>
              <p>{check.gates === null ? 'Uncertainty gates unavailable.' : check.gates.length ? `Recorded gates: ${check.gates.join(', ')}.` : 'Recorded uncertainty gates are empty.'}</p>
              <button type="button" data-check-call={check.callId} onClick={() => { lastCall.current = check.callId; actions.selectCheck(check.sessionId, check.callId); }}>View recorded call</button>
            </li>;
          })}</ul>
          {!rules.items.length && <p>No recorded checks retained for this rule. Unchecked observations do not imply a pass.</p>}
          <p className="thread-page-note">{rules.items.length} of {Math.min(4096, selectedRule.checks)} retained checks displayed. {rules.omittedChecks} checks omitted by reader limits.</p>
        </>}
        {kind === 'call' && <div className="thread-call-detail">{model.selected ? <SummaryDetail key={model.selectedId} view={model.selected} moreRules={model.moreRules}
          loading={model.loading} loadMoreRules={actions.loadMoreRules} restartRules={actions.restartRules} /> : <p>{model.loading ? 'Reading recorded call…' : 'Recorded call unavailable. No current summary.'}</p>}</div>}
      </>}
      {rules?.next && kind !== 'call' && <button type="button" disabled={model.loading} onClick={actions.loadMore}>{kind === 'inventory' ? 'More recorded rules' : 'More recorded checks'}</button>}
    </section>
    <footer className="thread-rule-footer">
      {model.error && <p role="alert">{model.error}</p>}
      <div className="thread-footer-actions"><button type="button" disabled={model.loading} onClick={actions.refresh}>{model.error ? 'Refresh from page one' : 'Refresh archive'}</button>
        <button type="button" onClick={actions.browseCalls}>Browse calls</button></div>
    </footer>
  </main>;
}
