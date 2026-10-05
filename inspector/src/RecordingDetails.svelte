<script lang="ts">
  import type { InvocationView } from '../../src/inspector/view';
  import { validationMessages } from '../../src/decision/response-validation';
  import { explainDecision, primaryStatus } from './presentation';
  import EvidenceCoverage from './EvidenceCoverage.svelte';
  import NativeMappings from './NativeMappings.svelte';
  export let view: InvocationView;
</script>

<section class="record-group" aria-label="Recorded outcomes">
  <h3>Recorded outcomes</h3>
  <dl class="record-fields lifecycle">
    <div><dt>Mode</dt><dd>{view.identity?.mode ?? 'unknown'}</dd></div>
    <div><dt>Assessment</dt><dd>{view.assessmentStatus}</dd></div>
    <div><dt>Would decide</dt><dd>{view.decision}</dd></div>
    <div><dt>Permission</dt><dd>{view.permission}</dd></div>
    <div><dt>Approval</dt><dd>{view.approval}</dd></div>
    <div><dt>Execution</dt><dd>{view.execution}</dd></div>
    <div><dt>Recorded reason</dt><dd>{view.reason}</dd></div>
    {#if view.failure}<div><dt>Assessment failure</dt><dd>{view.failure}</dd></div>{/if}
  </dl>
  <p class="decision-explanation" aria-label="Decision explanation">{explainDecision(view)}</p>
  {#if view.validationIssue}
    <div class="assessment-diagnostic" aria-label="Assessment validation diagnostic">{view.validationIssue}: {validationMessages[view.validationIssue]} This is evaluator unavailability, not a semantic violation.</div>
  {/if}
</section>

<section class="record-group" aria-label="Recording metadata">
  <h3>Recording</h3>
  <dl class="record-fields">
    <div><dt>Host</dt><dd>{view.identity?.host ?? 'unknown'} / {view.identity?.contextId ?? 'unknown'}</dd></div>
    <div><dt>Adapter version</dt><dd>{view.adapterCoverage?.version ?? 'unverified'}</dd></div>
    <div><dt>Recording schemas</dt><dd>{view.identity?.schemas.join(', ') ?? 'unknown'}</dd></div>
    <div><dt>Assessment profile</dt><dd>{view.assessmentProfile}</dd></div>
    <div><dt>Provider</dt><dd>{view.judge.provider ?? 'Provider not recorded'}{view.judge.experimental === true ? ' experimental' : ''}</dd></div>
    <div><dt>Requested model</dt><dd>{view.judge.requestedModel ?? 'not recorded'}</dd></div>
    <div class="record-wide"><dt>Returned model</dt><dd>{view.judge.returnedModel ?? 'not recorded; no complete returned assessment'}</dd></div>
    <div class="record-wide"><dt>Judge questions</dt><dd>{view.questionVersion ?? 'not recorded'}</dd></div>
    {#if view.native}
      <div><dt>Native recording</dt><dd>{view.native.contract.version}</dd></div>
      <div><dt>Native rendering</dt><dd>{view.native.contract.renderingVersion}</dd></div>
      <div class="record-wide"><dt>Native protocol</dt><dd>{view.native.contract.protocolVersion}</dd></div>
      <div class="record-wide"><dt>Renderer revision</dt><dd>{view.native.contract.rendererRevision}</dd></div>
    {/if}
    <div><dt>Queue wait</dt><dd>{view.queueWaitMs === null ? 'unknown' : `${view.queueWaitMs} ms`}</dd></div>
    <div><dt>Provider duration</dt><dd>{view.providerDurationMs === null ? 'unknown' : `${view.providerDurationMs} ms`}</dd></div>
    <div class="record-wide"><dt>Request</dt><dd>{view.requestStatus}</dd></div>
    <div class="record-wide"><dt>Archive coverage</dt><dd>{view.coverage}</dd></div>
    <div class="record-wide"><dt>Missing stages</dt><dd>{view.missing.join(', ') || 'none observed'}</dd></div>
  </dl>
  {#if view.native}<NativeMappings native={view.native} />{/if}
  <details class="record-identifiers record-note">
    <summary>Record identifiers</summary>
    <dl class="record-fields">
      <div class="record-wide"><dt>Invocation</dt><dd><textarea class="record-id record-long" rows="1" readonly aria-label="Recorded invocation ID" value={view.identity?.invocationId ?? 'unknown'}></textarea></dd></div>
      <div class="record-wide"><dt>Call</dt><dd><textarea class="record-id record-long" rows="1" readonly aria-label="Recorded call ID" value={view.identity?.callId ?? 'unknown'}></textarea></dd></div>
      <div class="record-wide"><dt>Session</dt><dd><textarea class="record-id record-long" rows="1" readonly aria-label="Recorded session ID" value={view.identity?.sessionId ?? 'unknown'}></textarea></dd></div>
    </dl>
  </details>
</section>

<section class="record-group" aria-label="Coverage and limits">
  <h3>Coverage and limits</h3>
  <dl class="record-fields">
    <div class="record-wide"><dt>Host limitations</dt><dd>{Array.isArray(view.adapterCoverage?.limitations) && view.adapterCoverage.limitations.length ? view.adapterCoverage.limitations.join(', ') : 'not recorded'}</dd></div>
  </dl>
  <EvidenceCoverage context={view.evidenceContext} />
  <details class="record-note interpretation-limits">
    <summary>Interpretation limits</summary>
    <p>{primaryStatus(view).explanation}</p>
    <p>Finding categories may overlap. Missing assessments are not a pass.</p>
    <p>A policy pass does not certify host coverage.</p>
  </details>
</section>
