<script lang="ts">
  import { tick } from 'svelte';
  import type { InvocationView } from '../../src/inspector/view';
  import RuleDetail from './RuleDetail.svelte';
  import EvidenceDock from './EvidenceDock.svelte';
  import { explainDecision, orderedRules, hasFinding, ruleName, gateLabels, type DockTab, type MobileView } from './presentation';
  import PaneResizer from './PaneResizer.svelte';
  import StatusChip from './StatusChip.svelte';
  export let view: InvocationView;
  export let mobileView: MobileView = 'assessment';
  export let assessmentShare = 53;
  let selected = '', activeTab: DockTab = view.assessmentStatus === 'failed' ? 'Response' : 'Evidence';
  let dock: EvidenceDock;
  $: rules = orderedRules(view.rules);
  $: rule = rules.find(r => r.id === selected) ?? rules[0];
  $: findingCount = rules.filter(hasFinding).length;
  async function openDock(tab: DockTab) {
    activeTab = tab; mobileView = 'evidence';
    await tick(); dock.focusHeading();
  }
</script>

<section class="invocation" aria-label="Invocation detail">
  <header class="decision-header">
    <div class="decision-title"><h2>{view.identity?.toolName ?? 'Invocation'} <span>{view.identity?.callId}</span></h2><StatusChip value={view.decision} label={view.decision === 'unavailable' ? 'Decision unavailable' : `Would ${view.decision}`} /></div>
    <p class="decision-explanation" aria-label="Decision explanation">{explainDecision(view)}</p>
    <p class="assessment-status">{#if view.assessmentStatus === 'failed'}Assessment failed: {view.failure}.
      {:else if view.assessmentStatus === 'incomplete'}Assessment incomplete. No validated result was recorded; the call may still be in progress or recording may have stopped.
      {:else}Assessment validated.{/if}</p>
    <dl class="lifecycle">
      <div><dt>Mode</dt><dd>{view.identity?.mode ?? 'unknown'}</dd></div>
      <div><dt>Permission</dt><dd>{view.permission}</dd></div>
      <div><dt>Execution</dt><dd>{view.execution}</dd></div>
      <div><dt>Approval</dt><dd>{view.approval}</dd></div>
    </dl>
    <details class="capture-details"><summary>{view.missing.length ? `${view.missing.length} missing stages` : 'Capture details'} · {view.requestStatus}</summary><p>{view.coverage}</p><p>Missing stages: {view.missing.join(', ') || 'none observed'}. Recorded reason: {view.reason}.</p></details>
    <details class="capture-details"><summary>Recording identity</summary><p>Session {view.identity?.sessionId}<br />Invocation {view.identity?.invocationId}</p></details>
  </header>
  <div class="debugger-panes" style:--assessment-share={`${assessmentShare}%`}>
    <section id="assessment-pane" class="assessment-pane" aria-label="Assessment pane">
      <div class="pane-heading"><h3>Rules <span class="count">{rules.length}</span></h3><span class="muted">Findings: {findingCount} · shown first</span></div>
      <nav class="rule-list" aria-label="Rules">
        {#each rules as item}
          <button class="rule-row" aria-pressed={item.id === rule?.id} on:click={() => selected = item.id}>
            <span class="rule-row-top"><strong>{ruleName(item)}</strong><span>{item.enforcement}</span><StatusChip value={item.result?.outcome?.choice ?? 'Unavailable'} /></span>
            <span class="rule-text">{item.text}</span>
            <span class="rule-finding">{item.gateIds?.length ? item.gateIds.map((g: string) => gateLabels[g] ?? g).join(' · ') : item.contribution.includes('approval') ? 'Approval requirement' : item.gateIds === null ? 'Gates not recorded' : 'No triggered gates'}</span>
          </button>
        {/each}
        {#if !rules.length}<p class="empty-inline">No rule snapshot recorded. Inspect the response and capture details for available information.</p>{/if}
      </nav>
      {#if rule}<RuleDetail {rule} showQuestions={() => openDock('Questions')} showEvidence={() => openDock('Evidence')} />{/if}
    </section>
    <PaneResizer bind:value={assessmentShare} min={35} max={70} unit="percent" label="Resize assessment pane" controls="assessment-pane" />
    <EvidenceDock bind:this={dock} {view} {rule} bind:activeTab />
  </div>
</section>
