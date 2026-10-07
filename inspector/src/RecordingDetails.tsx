import type { InvocationView } from '../../src/inspector/view.js';
import { validationMessages } from '../../src/decision/response-validation.js';
import { Textarea } from '../../web/components/ui/textarea.js';
import { explainDecision, primaryStatus } from './presentation.js';
import EvidenceCoverage from './EvidenceCoverage.js';
import NativeMappings from './NativeMappings.js';

export default function RecordingDetails({ view }: { view: InvocationView }) {
  return <>
    <section className="record-group" aria-label="Recorded outcomes">
      <h3>Recorded outcomes</h3>
      <dl className="record-fields lifecycle">
        <div><dt>Mode</dt><dd>{view.identity?.mode ?? 'unknown'}</dd></div>
        <div><dt>Assessment</dt><dd>{view.assessmentStatus}</dd></div>
        <div><dt>Would decide</dt><dd>{view.decision}</dd></div>
        <div><dt>Permission</dt><dd>{view.permission}</dd></div>
        <div><dt>Approval</dt><dd>{view.approval}</dd></div>
        <div><dt>Execution</dt><dd>{view.execution}</dd></div>
        <div><dt>Recorded reason</dt><dd>{view.reason}</dd></div>
        {view.failure && <div><dt>Assessment failure</dt><dd>{view.failure}</dd></div>}
      </dl>
      <p className="decision-explanation" aria-label="Decision explanation">{explainDecision(view)}</p>
      {view.validationIssue && <div className="assessment-diagnostic" aria-label="Assessment validation diagnostic">{view.validationIssue}: {validationMessages[view.validationIssue]} This is evaluator unavailability, not a semantic violation.</div>}
    </section>
    <section className="record-group" aria-label="Recording metadata">
      <h3>Recording</h3>
      <dl className="record-fields">
        <div><dt>Host</dt><dd>{view.identity?.host ?? 'unknown'} / {view.identity?.contextId ?? 'unknown'}</dd></div>
        <div><dt>Adapter version</dt><dd>{view.adapterCoverage?.version ?? 'unverified'}</dd></div>
        <div><dt>Recording schemas</dt><dd>{view.identity?.schemas.join(', ') ?? 'unknown'}</dd></div>
        <div><dt>Assessment profile</dt><dd>{view.assessmentProfile}</dd></div>
        <div><dt>Provider</dt><dd>{view.judge.provider ?? 'Provider not recorded'}{view.judge.experimental === true ? ' experimental' : ''}</dd></div>
        <div><dt>Requested model</dt><dd>{view.judge.requestedModel ?? 'not recorded'}</dd></div>
        <div className="record-wide"><dt>Returned model</dt><dd>{view.judge.returnedModel ?? 'not recorded; no complete returned assessment'}</dd></div>
        <div className="record-wide"><dt>Judge questions</dt><dd>{view.questionVersion ?? 'not recorded'}</dd></div>
        {view.native && <>
          <div><dt>Native recording</dt><dd>{view.native.contract.version}</dd></div>
          <div><dt>Native rendering</dt><dd>{view.native.contract.renderingVersion}</dd></div>
          <div className="record-wide"><dt>Native protocol</dt><dd>{view.native.contract.protocolVersion}</dd></div>
          <div className="record-wide"><dt>Renderer revision</dt><dd>{view.native.contract.rendererRevision}</dd></div>
        </>}
        <div><dt>Queue wait</dt><dd>{view.queueWaitMs === null ? 'unknown' : `${view.queueWaitMs} ms`}</dd></div>
        <div><dt>Provider duration</dt><dd>{view.providerDurationMs === null ? 'unknown' : `${view.providerDurationMs} ms`}</dd></div>
        <div className="record-wide"><dt>Request</dt><dd>{view.requestStatus}</dd></div>
        <div className="record-wide"><dt>Archive coverage</dt><dd>{view.coverage}</dd></div>
        <div className="record-wide"><dt>Missing stages</dt><dd>{view.missing.join(', ') || 'none observed'}</dd></div>
      </dl>
      {view.native && <NativeMappings native={view.native} />}
      <details className="record-identifiers record-note"><summary>Record identifiers</summary>
        <dl className="record-fields">
          <div className="record-wide"><dt>Invocation</dt><dd><Textarea className="record-id record-long" rows={1} readOnly aria-label="Recorded invocation ID" value={view.identity?.invocationId ?? 'unknown'} /></dd></div>
          <div className="record-wide"><dt>Call</dt><dd><Textarea className="record-id record-long" rows={1} readOnly aria-label="Recorded call ID" value={view.identity?.callId ?? 'unknown'} /></dd></div>
          <div className="record-wide"><dt>Session</dt><dd><Textarea className="record-id record-long" rows={1} readOnly aria-label="Recorded session ID" value={view.identity?.sessionId ?? 'unknown'} /></dd></div>
        </dl>
      </details>
    </section>
    <section className="record-group" aria-label="Coverage and limits">
      <h3>Coverage and limits</h3>
      <dl className="record-fields"><div className="record-wide"><dt>Host limitations</dt><dd>{Array.isArray(view.adapterCoverage?.limitations) && view.adapterCoverage.limitations.length ? view.adapterCoverage.limitations.join(', ') : 'not recorded'}</dd></div></dl>
      <EvidenceCoverage context={view.evidenceContext} />
      <details className="record-note interpretation-limits"><summary>Interpretation limits</summary>
        <p>{primaryStatus(view).explanation}</p>
        <p>Finding categories may overlap. Missing assessments are not a pass.</p>
        <p>A policy pass does not certify host coverage.</p>
      </details>
    </section>
  </>;
}
