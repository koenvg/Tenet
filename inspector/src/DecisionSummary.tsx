import type { SummaryDecision } from './shared/model.js';
import DecisionIcon from './DecisionIcon.js';
import StatusChip from './StatusChip.js';
import FindingChips from './FindingChips.js';
import { decisionLabel, decisionReason, primaryStatus, modeLabel } from './presentation.js';

export function DecisionFacts({ view }: { view: SummaryDecision }) {
  const status = primaryStatus(view), reason = decisionReason(view);
  return <section className="recorded-decision-facts" aria-label="Recorded decision facts">
    <section className="primary-status" aria-label="Actual execution">
      <div className="primary-badges"><StatusChip value={status.label} tone={status.tone} icon={status.icon} showIcon /><StatusChip value={modeLabel(view.identity?.mode)} tone="neutral" /></div>
      <p className="execution-summary">{status.summary}</p>
      {status.notice && <p className="recording-inconsistency" role="status">{status.notice}</p>}
      {!!view.categories.length && <div className="finding-tags"><FindingChips categories={view.categories} /></div>}
      {!(view.identity?.mode === 'enforce' && status.label === 'TENET blocked' && view.decision === 'BLOCK') && <p className="story-assessment">{decisionLabel(view.decision, view.identity?.mode)}</p>}
      <p className={`summary-reason ${!['validated', 'completed'].includes(view.assessmentStatus) ? 'assessment-status' : ''}`}>{reason}</p>
      {view.identity?.mode === 'observe' && view.decision === 'ASK' && <p className="summary-note">Approval was not requested in observe mode.</p>}
      {!['unknown', 'not required', 'not requested (observe mode)'].includes(view.approval) && <p className="summary-note">Recorded approval: {view.approval}. This does not prove execution.</p>}
    </section>
  </section>;
}

export default function DecisionSummary({ view }: { view: SummaryDecision }) {
  const action = view.recordedAction, violations = view.reportedViolations;
  return <section className="decision-summary" aria-label="Decision summary">
    <section className="recorded-call" aria-label="Recorded call">
      <div className="story-title">
        <DecisionIcon kind={view.identity?.toolName === 'bash' ? 'action' : ['read', 'write', 'edit'].includes(view.identity?.toolName ?? '') ? 'document' : 'tool'} />
        <h2>{view.identity?.toolName || 'Unknown tool'}</h2>
      </div>
      {action ? <div className="recorded-action">
        <p className="muted">Recorded {action.field === 'command' ? 'command' : 'path'}</p>
        <pre><code>{action.text}</code></pre>
        {action.truncated && <p className="muted">Recorded value shortened to fit 4096 UTF-8 bytes.</p>}
      </div> : <p className="compact-absence">Recorded command or path unavailable.</p>}
      <section className="reported-violations" aria-label="Reported violations">
        {violations?.assessment === 'validated' ? <>
          {!!violations.total && <h3>Reported violations</h3>}
          <ul>{violations.items.map(item => <li key={item.id}>
            <p className="reported-rule-text">{item.textStatus === 'missing' ? 'Rule text unavailable.' : item.text}</p>
            {(item.enforcement === 'WARN' || item.uncertain) && <p className="muted">{[item.enforcement === 'WARN' ? 'Advisory' : '', item.uncertain ? 'Assessment uncertain' : ''].filter(Boolean).join(' · ')}</p>}
            {item.textStatus === 'truncated' && <p className="muted">Rule text shortened. {item.omittedTextChars ?? 'Some'} characters omitted.</p>}
          </li>)}</ul>
          {violations.total > violations.items.length && <p className="compact-absence">{violations.total} reported violations. Showing {violations.items.length}. Browse all rules for the remaining recorded rules.</p>}
          {!!violations.missingRuleSnapshots && <p className="compact-absence">{violations.missingRuleSnapshots} reported {violations.missingRuleSnapshots === 1 ? 'violation has' : 'violations have'} no recorded rule snapshot. Rule text unavailable.</p>}
          {!violations.total && <p className="compact-absence">{view.noRulesClassifiedViolated && !violations.uncertain ? 'No rule was reported as violated.' : 'No reported violations. Assessment coverage is uncertain.'}</p>}
        </> : <p className="compact-absence">Reported violations unavailable. No validated complete assessment.</p>}
      </section>
    </section>
  </section>;
}
