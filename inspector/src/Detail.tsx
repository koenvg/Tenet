import type { InvocationView } from '../../src/inspector/view.js';
import type { MobileView } from './presentation.js';
import CallSummary from './CallSummary.js';
import RecordedRule from './RecordedRule.js';
import RecordedData from './RecordedData.js';
import { orderedRules } from './standalone-presentation.js';

export default function Detail({ view, onMobileViewChange }: { view: InvocationView; onMobileViewChange?: (view: MobileView) => void }) {
  return <section className="invocation standalone-inspector" aria-label="Invocation detail">
    <div className="summary-content">
      <header className="decision-header"><div className="decision-title visually-hidden"><h2>Call summary <span hidden>{view.identity?.callId}</span></h2></div><CallSummary view={view} /></header>
      <details className="why-disclosure disclosure"><summary>Why this assessment</summary>
        <section className="assessment-pane" aria-label="Recorded rule explanations">
          {orderedRules(view.rules).map(rule => <RecordedRule key={rule.id} rule={rule} mode={view.identity?.mode} />)}
          {!view.rules.length && <p className="empty-inline">No rule snapshot recorded. Inspect Recorded data for available information.</p>}
        </section>
      </details>
      <details className="recorded-disclosure disclosure" onToggle={event => { if (event.currentTarget.open) onMobileViewChange?.('assessment'); }}>
        <summary>Recorded data</summary><RecordedData view={view} />
      </details>
    </div>
  </section>;
}
