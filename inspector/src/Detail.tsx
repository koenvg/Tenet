import { useRef, useState } from 'react';
import type { InvocationView } from '../../src/inspector/view.js';
import EvidenceDock from './EvidenceDock.js';
import RecordingDetails from './RecordingDetails.js';
import SummaryDetail from './shared/SummaryDetail.js';
import { standaloneSummary } from './shared/standalone-adapter.js';
import { actionPreview, orderedRules, type DockTab, type MobileView } from './presentation.js';
import './standalone-inspection.css';

export default function Detail({ view, onMobileViewChange, showRaw = true }: { view: InvocationView; onMobileViewChange?: (view: MobileView) => void; showRaw?: boolean }) {
  const [selected, setSelected] = useState(''), [activeTab, setActiveTab] = useState<DockTab>(view.assessmentStatus === 'failed' ? 'Response' : 'Evidence');
  const dockHeading = useRef<HTMLHeadingElement>(null);
  const rules = orderedRules(view.rules), rule = view.rules.find(r => r.id === selected) ?? view.rules.find(r => r.id === rules[0]?.id);
  const preview = actionPreview(view);
  return <div className="tenet-presentation standalone-detail">
    <SummaryDetail view={standaloneSummary(view)} onRuleSelect={setSelected} />
    {showRaw && <section className="standalone-inspection" aria-label="Standalone-only inspection">
      <h2>Standalone-only inspection</h2>
      <p className="muted">Recorded action and source details are separate from the common summary. They can contain secrets.</p>
      <details className="action-disclosure disclosure"><summary>Recorded action</summary>
        {preview ? <pre className="action-preview" aria-label="Recorded action"><code>{preview}</code></pre> : <p className="action-unavailable">Command or file path not recorded. See Evidence for submitted arguments.</p>}
      </details>
      <details className="evidence-disclosure disclosure" onToggle={event => { if (event.currentTarget.open) { onMobileViewChange?.('assessment'); dockHeading.current?.focus(); } }}>
        <summary>Evidence</summary><EvidenceDock view={view} rule={rule} activeTab={activeTab} onTabChange={setActiveTab} headingRef={dockHeading} />
      </details>
      <details className="capture-details disclosure"><summary>Details</summary><RecordingDetails view={view} /></details>
    </section>}
  </div>;
}
