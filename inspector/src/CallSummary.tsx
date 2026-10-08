import type { InvocationView } from '../../src/inspector/view.js';
import DecisionIcon from './DecisionIcon.js';
import { actionPreview, assessmentFact, decisionReason, primaryStatus, modeLabel, toolLabel, permissionFact, resultFact, summaryFindings, findingPresentation } from './standalone-presentation.js';

export default function CallSummary({ view }: { view: InvocationView }) {
  const preview = actionPreview(view), status = primaryStatus(view), permission = permissionFact(view.permission);
  const result = resultFact(view.execution), findings = summaryFindings(view);
  return <section className="decision-summary" aria-label="Decision summary">
    <section className="primary-status" aria-label="Recorded call facts">
      <div className="story-title">
        <DecisionIcon kind={view.identity?.toolName === 'bash' ? 'action' : ['read', 'write', 'edit'].includes(view.identity?.toolName ?? '') ? 'document' : 'tool'} />
        <h2 tabIndex={-1} aria-label={`Selected call: ${toolLabel(view.identity?.toolName ?? 'Unknown tool')}`}>{toolLabel(view.identity?.toolName ?? 'Unknown tool')}</h2>
      </div>
      {preview ? <pre className="story-action" aria-label="Recorded action"><code>{preview}</code></pre> : <p className="action-unavailable">Command or file path not recorded. See Recorded data for submitted arguments.</p>}
      <p className="recorded-mode">Recorded mode: {modeLabel(view.identity?.mode)}{view.identity?.mode === 'observe' ? ' · Assessment only' : view.identity?.mode === 'enforce' ? ' · Enforcement enabled' : ' · Enforcement consequence unknown'}</p>
      <dl className="call-facts">
        <div><dt>Tenet permission</dt><dd data-fact="permission" className={permission.tone}>{permission.label}</dd></div>
        <div><dt>Tool result</dt><dd data-fact="result" className={result.tone}>{result.label}</dd></div>
        <div><dt>Assessment</dt><dd data-fact="assessment" className={view.evaluatorState.status !== 'completed' || view.assessmentInvalid || !!view.failure || !!view.validationIssue ? "assessment-status" : undefined}>{assessmentFact(view)}</dd></div>
        {!!findings.length && <div><dt>Findings</dt><dd data-fact="findings">{findings.map((category, i) => <span key={category} className={findingPresentation(category).tone}>{i ? ' · ' : ''}{findingPresentation(category).label}</span>)}</dd></div>}
        {!['unknown', 'not required', 'not requested (observe mode)'].includes(view.approval) && <div><dt>Recorded approval</dt><dd data-fact="approval">{view.approval}</dd></div>}
      </dl>
      <p className="summary-reason">{decisionReason(view)}</p>
      {view.identity?.mode === 'observe' && view.decision === 'ASK' && <p className="summary-note">Approval was not requested in observe mode.</p>}
      {view.identity?.mode === 'observe' && view.permission === 'blocked' && <p className="capture-warning">Blocked permission was recorded despite observe mode. The host consequence is not explained by this assessment.</p>}
      {status.notice && <p className="recording-inconsistency" role="status">{status.notice}</p>}
      {view.execution === 'failed' && <p className="summary-note">A failed result does not prove there were no external effects.</p>}
      {!!view.missing.length && <p className="capture-warning">Recording incomplete: {view.missing.join(', ')}.</p>}
    </section>
  </section>;
}
