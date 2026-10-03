<script lang="ts">
  import type { InvocationView } from '../../src/inspector/view';
  import DecisionIcon from './DecisionIcon.svelte';
  import StatusChip from './StatusChip.svelte';
  import FindingChips from './FindingChips.svelte';
  import { actionPreview, decisionLabel, decisionReason, primaryStatus, modeLabel, toolLabel } from './presentation';
  export let view: InvocationView;
  $: preview = actionPreview(view);
  $: status = primaryStatus(view);
  $: reason = decisionReason(view);
</script>

<section class="decision-summary" aria-label="Decision summary">
  <section class="primary-status" aria-label="Actual execution">
    <div class="story-title">
      <DecisionIcon kind={view.identity?.toolName === 'bash' ? 'action' : ['read', 'write', 'edit'].includes(view.identity?.toolName ?? '') ? 'document' : 'tool'} />
      <h2>{toolLabel(view.identity?.toolName ?? 'Unknown tool')}</h2>
    </div>
    {#if preview}<pre class="story-action" aria-label="Recorded action"><code>{preview}</code></pre>
    {:else}<p class="action-unavailable">Command or file path not recorded. See Evidence for submitted arguments.</p>{/if}
    <div class="primary-badges"><StatusChip value={status.label} tone={status.tone} icon={status.icon} showIcon /><StatusChip value={modeLabel(view.identity?.mode)} tone="neutral" /></div>
    <p class="execution-summary">{status.summary}</p>
    {#if status.notice}<p class="recording-inconsistency" role="status">{status.notice}</p>{/if}
    {#if view.categories.length}<div class="finding-tags"><FindingChips categories={view.categories} /></div>{/if}
    {#if !(view.identity?.mode === 'enforce' && status.label === 'TENET blocked' && view.decision === 'BLOCK')}<p class="story-assessment">{decisionLabel(view.decision, view.identity?.mode)}</p>{/if}
    <p class="summary-reason" class:assessment-status={!['validated', 'completed'].includes(view.assessmentStatus)}>{reason}</p>
    {#if view.identity?.mode === 'observe' && view.decision === 'ASK'}<p class="summary-note">Approval was not requested in observe mode.</p>{/if}
    {#if !['unknown', 'not required', 'not requested (observe mode)'].includes(view.approval)}<p class="summary-note">Recorded approval: {view.approval}. This does not prove execution.</p>{/if}
    {#if view.missing.length}<p class="capture-warning">Recording incomplete: {view.missing.join(', ')}.</p>{/if}
  </section>
</section>
