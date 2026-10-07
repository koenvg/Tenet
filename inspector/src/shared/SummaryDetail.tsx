import { useId, useRef, useState } from 'react';
import type { SummaryDecision } from './model.js';
import DecisionSummary from '../DecisionSummary.js';
import AssessmentMap from '../AssessmentMap.js';
import RuleDetail from '../RuleDetail.js';
import RuleRow from './RuleRow.js';
import { Button } from '../../../web/components/ui/button.js';
import { orderedRules, hasFinding } from '../presentation.js';
import './presentation.css';

export default function SummaryDetail({ view, moreRules = false, loading = false, loadMoreRules, restartRules, onRuleSelect }: {
  view: SummaryDecision; moreRules?: boolean; loading?: boolean; loadMoreRules?: () => void; restartRules?: () => void;
  onRuleSelect?: (id: string) => void;
}) {
  const [selected, setSelected] = useState(''), [inspectedCheck, setInspectedCheck] = useState('Selected rule');
  const detailsId = useId(), ruleDisclosure = useRef<HTMLDetailsElement>(null), rulePanel = useRef<HTMLDivElement>(null);
  const rules = orderedRules(view.rules), rule = rules.find(r => r.id === selected) ?? rules[0], findingCount = rules.filter(hasFinding).length;
  function inspectCheck(label: string) {
    setInspectedCheck(label);
    if (ruleDisclosure.current) ruleDisclosure.current.open = true;
    rulePanel.current?.focus();
  }
  return <section className="invocation tenet-presentation" aria-label="Invocation detail">
    <div className="summary-content"><section className="common-summary" aria-label="Common call summary">
      <header className="decision-header">
        <div className="recorded-context">
          <p className="call-label">Call {view.identity?.callId ?? 'Identity unavailable'}</p>
          <p className="assessment-state">Recorded assessment: {view.evaluatorState?.status ?? view.assessmentStatus}{(view.evaluatorState?.reason ?? view.failure) ? ` · ${view.evaluatorState?.reason ?? view.failure}` : ''}.</p>
          {view.metadata && <p className="assessment-state">Contract {view.metadata.schemas.join(', ')} · Questions {view.metadata.questionVersion} · Profile {view.metadata.profile}{view.metadata.policyDigest ? ` · Policy SHA-256 ${view.metadata.policyDigest}` : ''}</p>}
        </div>
        <DecisionSummary view={view} />
      </header>
      <details className="why-disclosure disclosure"><summary>Why this assessment</summary>
        <AssessmentMap view={view} rule={rule} detailsId={detailsId} inspect={inspectCheck} />
        <section className="assessment-pane" aria-label="Assessment pane">
          <details className="rule-inspection disclosure" ref={ruleDisclosure}><summary>Selected check details</summary>
            <div id={detailsId} ref={rulePanel} tabIndex={-1}>
              <div className="reason-heading"><h2>{inspectedCheck}</h2><span className="muted">{findingCount} {findingCount === 1 ? 'finding' : 'findings'} on this rule page{rules.some(r => !r.result || r.gateIds === null) ? ' · Some checks unavailable' : ''}</span></div>
              {rule ? <RuleDetail key={rule.id} rule={rule} mode={view.identity?.mode} /> : <p className="empty-inline">No rule snapshot recorded. Missing data is not a pass.</p>}
            </div>
          </details>
          <details className="other-rules disclosure"><summary>Browse all rules <span className="disclosure-count">{rules.length}</span></summary>
            {view.rulePage && <p role="status">Recorded rules {view.rulePage.total ? view.rulePage.offset + 1 : 0}–{view.rulePage.offset + rules.length} of {view.rulePage.total}. At most 16 rules per page.</p>}
            <nav className="rule-list" aria-label="Rules">{rules.map(item => <RuleRow key={item.id} rule={item} selected={item.id === rule?.id} select={() => {
              setSelected(item.id); onRuleSelect?.(item.id); inspectCheck('Selected rule');
            }} />)}</nav>
            {moreRules && loadMoreRules && <Button variant="ghost" className="text-button" disabled={loading} onClick={loadMoreRules}>More rules</Button>}
            {!!view.rulePage?.offset && restartRules && <Button variant="ghost" className="text-button" disabled={loading} onClick={restartRules}>First rule page</Button>}
          </details>
        </section>
      </details>
      {!!view.omittedRules && <p role="status">{view.omittedRules} recorded rules are not shown on this page.{moreRules ? ' Use More rules to continue.' : view.rulePage?.offset ? ' Use First rule page to return.' : ''}</p>}
      {!!view.missingRuleSnapshots && <p className="missing-data">{view.missingRuleSnapshots} assessed rules have no recorded snapshot. Their text and identity cannot be inspected here.</p>}
      <p className="summary-privacy-note">Raw evidence, action previews, exact questions and provider responses are separate from this summary. They remain in the standalone inspector on the selected machine.</p>
    </section></div>
  </section>;
}
