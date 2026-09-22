<script lang="ts">
  import type { InvocationView } from '../../src/inspector/view';
  import DecisionIcon from './DecisionIcon.svelte';
  import { actionPreview, decisionLabel, decisionReason, executionExplanation, toolLabel, tone } from './presentation';
  export let view: InvocationView;
  let decisionKind: 'block' | 'allow' | 'ask' | 'unknown';
  let executionKind: 'executed' | 'failed' | 'unknown';
  $: preview = actionPreview(view);
  $: decisionKind = view.decision === 'BLOCK' ? 'block' : view.decision === 'ALLOW' ? 'allow' : view.decision === 'ASK' ? 'ask' : 'unknown';
  $: executionKind = view.execution === 'executed' ? 'executed' : view.execution === 'failed' ? 'failed' : 'unknown';
</script>

<section class="decision-summary" aria-label="Decision summary">
  <ol class="decision-flow">
    <li>
      <span class="flow-icon"><DecisionIcon kind="action" /></span>
      <div><h3>Action</h3><p>{toolLabel(view.identity?.toolName ?? 'Unknown tool')}</p></div>
    </li>
    <li class={`flow-${tone(view.decision)}`}>
      <span class="flow-icon"><DecisionIcon kind={decisionKind} /></span>
      <div><h3>TENET decision</h3><p>{decisionLabel(view.decision, view.identity?.mode)}</p></div>
    </li>
    <li>
      <span class="flow-icon"><DecisionIcon kind={executionKind} /></span>
      <div><h3>Actual execution</h3><p>{view.execution === 'executed' ? 'Ran' : view.execution === 'failed' ? 'Failed' : 'Not recorded'}</p></div>
    </li>
  </ol>
  {#if preview}<pre class="action-preview" aria-label="Recorded action"><code>{preview}</code></pre>
  {:else}<p class="action-unavailable">Command or file path not recorded. Other submitted arguments are available in evidence.</p>{/if}
  <p class="summary-reason">{decisionReason(view)}</p>
  <p class="execution-summary">{executionExplanation(view)}</p>
  {#if view.identity?.mode === 'observe' && view.decision === 'ASK'}<p class="summary-note">Approval was not requested in observe mode.</p>{/if}
  {#if view.assessmentStatus !== 'validated'}
    <p class="assessment-status">{#if view.assessmentStatus === 'failed'}Assessment failed: {view.failure}.
    {:else}Assessment incomplete. No validated result was recorded; the call may still be in progress or recording may have stopped.{/if}</p>
  {/if}
  {#if view.missing.length}<p class="capture-warning">Recording incomplete. Some stages are missing; unknown does not mean passed.</p>{/if}
</section>
