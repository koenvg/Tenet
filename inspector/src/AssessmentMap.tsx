import { Fragment, useState, type CSSProperties } from 'react';
import type { SummaryDecision } from './shared/model.js';
import { Button } from '../../web/components/ui/button.js';
import DecisionIcon from './DecisionIcon.js';
import ConfidenceMeter from './ConfidenceMeter.js';
import { decisionLabel, gateTone, contributionExplanation, toolLabel, type RuleView } from './presentation.js';
import { mapChecks, checkIcon, checkPosition, incomingPath, outgoingPath, type MapCheck } from './decision-map.js';

export default function AssessmentMap({ view, rule, inspect, detailsId = 'selected-check-details' }: { view: SummaryDecision; rule: RuleView | undefined; inspect: (check: string) => void; detailsId?: string }) {
  const [active, setActive] = useState(''), [motion, setMotion] = useState(0);
  const checks = mapChecks(rule);
  const outgoingTone = (check: MapCheck) => check.gate && rule ? gateTone(rule, check.gate) : '';
  const choose = (check: MapCheck) => { setActive(check.id); setMotion(value => value + 1); inspect(check.label); };
  return <div className="map-stage" style={{ '--check-count': checks.length } as CSSProperties}>
    <div className={`decision-map ${motion % 2 === 1 ? 'trace-a' : motion > 0 ? 'trace-b' : ''}`} role="group" aria-label="Decision map">
      <svg className="map-connections" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        {checks.map((check, index) => <Fragment key={check.id}>
          <path className={check.unknown ? 'unrecorded' : ''} pathLength="1" d={incomingPath(checkPosition(index, checks.length))} />
          <path className={`map-edge ${outgoingTone(check)} ${check.unknown ? 'unrecorded' : ''} ${active === check.id ? 'is-selected' : ''}`} pathLength="1" d={outgoingPath(checkPosition(index, checks.length))} />
        </Fragment>)}
      </svg>
      <div className="map-action map-endpoint">
        <span className="map-symbol filled"><DecisionIcon kind={view.identity?.toolName === 'bash' ? 'action' : ['read', 'write', 'edit'].includes(view.identity?.toolName ?? '') ? 'document' : 'tool'} /></span>
        <h3>{toolLabel(view.identity?.toolName ?? 'Unknown tool')}</h3>
      </div>
      <div className="map-checks">{checks.map((check, index) =>
        <div key={check.id} className={`map-check ${outgoingTone(check)}`} style={{ '--node-y': `${checkPosition(index, checks.length)}%` } as CSSProperties}>
          <Button variant="outline" className="map-symbol" aria-label={`Inspect ${check.label.toLowerCase()}`} aria-controls={detailsId} aria-pressed={active === check.id} onClick={() => choose(check)}><DecisionIcon kind={checkIcon(check)} /></Button>
          <div className="map-caption">
            <h3>{check.label} <span>/ {check.value}</span></h3>
            {check.id === 'outcome' && rule && <>
              <p className="map-rule-text" title={rule.text}>{rule.text}</p>
              <p className="map-rule-location">{rule.builtin ? 'Built-in integrity' : `Rule at line ${rule.line ?? 'unavailable'}`} · Severity {rule.enforcement}</p>
              {rule.evidenceGate === 'not-applicable' && <p className="map-check-note">Evidence-confidence gate does not apply. No evidence score.</p>}
            </>}
            {check.reading && <ConfidenceMeter {...check.reading} />}
            {check.gate && rule && <p className="map-check-note">{contributionExplanation(rule, view.identity?.mode)}</p>}
            {check.unknown && <p className="map-check-note">Unknown does not mean passed.</p>}
          </div>
        </div>)}</div>
      <div className="map-policy map-endpoint">
        <span className="map-symbol filled"><DecisionIcon kind="policy" /></span>
        <h3>Recorded assessment</h3><p className="map-verdict">{decisionLabel(view.decision, view.identity?.mode)}</p>
      </div>
    </div>
  </div>;
}
