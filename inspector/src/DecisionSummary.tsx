import type { InvocationView } from '../../src/inspector/view.js';
import DecisionIcon from './DecisionIcon.js';
import StatusChip from './StatusChip.js';
import FindingChips from './FindingChips.js';
import { actionPreview, decisionLabel, decisionReason, primaryStatus, modeLabel, toolLabel } from './presentation.js';

export default function DecisionSummary({ view }: { view: InvocationView }) {
  const preview = actionPreview(view), status = primaryStatus(view), reason = decisionReason(view);
  return <section className="decision-summary" aria-label="Decision summary">
    <section className="primary-status" aria-label="Actual execution">
      <div className="story-title">
        <DecisionIcon kind={view.identity?.toolName === 'bash' ? 'action' : ['read', 'write', 'edit'].includes(view.identity?.toolName ?? '') ? 'document' : 'tool'} />
        <h2>{toolLabel(view.identity?.toolName ?? 'Unknown tool')}</h2>
      </div>
      {preview ? <pre className="story-action" aria-label="Recorded action"><code>{preview}</code></pre>
        : <p className="action-unavailable">Command or file path not recorded. See Evidence for submitted arguments.</p>}
      <div className="primary-badges"><StatusChip value={status.label} tone={status.tone} icon={status.icon} showIcon /><StatusChip value={modeLabel(view.identity?.mode)} tone="neutral" /></div>
      <p className="execution-summary">{status.summary}</p>
      {status.notice && <p className="recording-inconsistency" role="status">{status.notice}</p>}
      {!!view.categories.length && <div className="finding-tags"><FindingChips categories={view.categories} /></div>}
      {!(view.identity?.mode === 'enforce' && status.label === 'TENET blocked' && view.decision === 'BLOCK') && <p className="story-assessment">{decisionLabel(view.decision, view.identity?.mode)}</p>}
      <p className={`summary-reason ${!['validated', 'completed'].includes(view.assessmentStatus) ? 'assessment-status' : ''}`}>{reason}</p>
      {view.identity?.mode === 'observe' && view.decision === 'ASK' && <p className="summary-note">Approval was not requested in observe mode.</p>}
      {!['unknown', 'not required', 'not requested (observe mode)'].includes(view.approval) && <p className="summary-note">Recorded approval: {view.approval}. This does not prove execution.</p>}
      {!!view.missing.length && <p className="capture-warning">Recording incomplete: {view.missing.join(', ')}.</p>}
    </section>
  </section>;
}
