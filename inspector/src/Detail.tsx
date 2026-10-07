import { useRef, useState } from 'react';
import type { InvocationView } from '../../src/inspector/view.js';
import { Button } from '../../web/components/ui/button.js';
import RuleDetail from './RuleDetail.js';
import EvidenceDock from './EvidenceDock.js';
import RecordingDetails from './RecordingDetails.js';
import DecisionSummary from './DecisionSummary.js';
import AssessmentMap from './AssessmentMap.js';
import { orderedRules, hasFinding, ruleName, gateLabels, type DockTab, type MobileView } from './presentation.js';
import StatusChip from './StatusChip.js';

export default function Detail({ view, onMobileViewChange }: { view: InvocationView; onMobileViewChange?: (view: MobileView) => void }) {
  const [selected, setSelected] = useState(''), [inspectedCheck, setInspectedCheck] = useState('Selected rule');
  const [activeTab, setActiveTab] = useState<DockTab>(view.assessmentStatus === 'failed' ? 'Response' : 'Evidence');
  const ruleDisclosure = useRef<HTMLDetailsElement>(null), rulePanel = useRef<HTMLDivElement>(null), dockHeading = useRef<HTMLHeadingElement>(null);
  const rules = orderedRules(view.rules), rule = rules.find(r => r.id === selected) ?? rules[0], findingCount = rules.filter(hasFinding).length;
  function inspectCheck(label: string) {
    setInspectedCheck(label);
    if (ruleDisclosure.current) ruleDisclosure.current.open = true;
    rulePanel.current?.focus();
  }
  return <section className="invocation" aria-label="Invocation detail">
    <div className="summary-content">
      <header className="decision-header">
        <div className="decision-title visually-hidden"><h2>Call summary <span hidden>{view.identity?.callId}</span></h2></div>
        <DecisionSummary view={view} />
      </header>
      <details className="why-disclosure disclosure"><summary>Why this assessment</summary>
        <AssessmentMap view={view} rule={rule} inspect={inspectCheck} />
        <section id="assessment-pane" className="assessment-pane" aria-label="Assessment pane">
          <details className="rule-inspection disclosure" ref={ruleDisclosure}><summary>Selected check details</summary>
            <div id="selected-check-details" ref={rulePanel} tabIndex={-1}>
              <div className="reason-heading"><h2>{inspectedCheck}</h2><span className="muted">{findingCount} {findingCount === 1 ? 'finding' : 'findings'}{rules.some(r => !r.result || r.gateIds === null) ? ' · Some checks unavailable' : ''}</span></div>
              {rule ? <RuleDetail key={rule.id} rule={rule} mode={view.identity?.mode} /> : <p className="empty-inline">No rule snapshot recorded. Inspect Evidence and Details for available information.</p>}
            </div>
          </details>
          <details className="other-rules disclosure"><summary>Browse all rules <span className="disclosure-count">{rules.length}</span></summary>
            <nav className="rule-list" aria-label="Rules">{rules.map(item =>
              <Button variant="ghost" key={item.id} className="rule-row" aria-pressed={item.id === rule?.id} onClick={() => { setSelected(item.id); setInspectedCheck('Selected rule'); if (ruleDisclosure.current) ruleDisclosure.current.open = true; }}>
                <span className="rule-row-top"><strong>{ruleName(item)}</strong><StatusChip value={item.result?.outcome?.choice ?? 'Unavailable'} /></span>
                <span className="rule-text">{item.text}</span>
                {(!!item.gateIds?.length || item.contribution.includes('approval') || item.gateIds === null) && <span className="rule-finding">{item.gateIds?.length ? item.gateIds.map(g => gateLabels[g] ?? g).join(' · ') : item.contribution.includes('approval') ? 'Approval requirement' : 'Gates not recorded'}</span>}
              </Button>)}</nav>
          </details>
        </section>
      </details>
      <details className="evidence-disclosure disclosure" onToggle={event => { if (event.currentTarget.open) { onMobileViewChange?.('assessment'); dockHeading.current?.focus(); } }}>
        <summary>Evidence</summary>
        <EvidenceDock view={view} rule={rule} activeTab={activeTab} onTabChange={setActiveTab} headingRef={dockHeading} />
      </details>
      <details className="capture-details disclosure"><summary>Details</summary><RecordingDetails view={view} /></details>
    </div>
  </section>;
}
