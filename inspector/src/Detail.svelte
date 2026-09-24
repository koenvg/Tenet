<script lang="ts">
  import { tick } from 'svelte';
  import type { InvocationView } from '../../src/inspector/view';
  import RuleDetail from './RuleDetail.svelte';
  import EvidenceDock from './EvidenceDock.svelte';
  import DecisionSummary from './DecisionSummary.svelte';
  import { explainDecision, orderedRules, hasFinding, ruleName, gateLabels, type DockTab, type MobileView } from './presentation';
  import StatusChip from './StatusChip.svelte';
  export let view: InvocationView;
  export let mobileView: MobileView = 'assessment';
  let selected = '', evidenceOpen = false;
  let ruleOpen = false, inspectedCheck = 'Selected rule';
  let rulePanel: HTMLElement;
  let allRules: HTMLDetailsElement, recordingDetails: HTMLDetailsElement;
  function reveal(details: HTMLDetailsElement) {
    details.open = true; details.querySelector('summary')?.focus();
  }
  async function inspectCheck(label: string) {
    inspectedCheck = label; ruleOpen = true;
    await tick(); rulePanel?.focus();
  }
  let activeTab: DockTab = view.assessmentStatus === 'failed' ? 'Response' : 'Evidence';
  let dock: EvidenceDock;
  $: rules = orderedRules(view.rules);
  $: rule = rules.find(r => r.id === selected) ?? rules[0];
  $: findingCount = rules.filter(hasFinding).length;
  async function openDock(tab: DockTab) {
    activeTab = tab; mobileView = 'assessment'; evidenceOpen = true;
    await tick(); dock.focusHeading();
  }
</script>

<section class="invocation" aria-label="Invocation detail">
  <div class="summary-content">
    <header class="decision-header">
      <div class="decision-title visually-hidden"><h2>Call summary <span hidden>{view.identity?.callId}</span></h2></div>
      <DecisionSummary {view} {rule} inspect={inspectCheck} />
      <div class="map-tools">
        <button on:click={() => openDock('Questions')}>View submitted questions</button>
        <button on:click={() => openDock('Evidence')}>View shared evidence</button>
        <button on:click={() => reveal(allRules)}>All rules ({rules.length})</button>
        <button on:click={() => reveal(recordingDetails)}>Recording details</button>
      </div>
    </header>
    <section id="assessment-pane" class="assessment-pane" aria-label="Assessment pane">
      <details class="rule-inspection disclosure" bind:open={ruleOpen}>
        <summary>Selected check details</summary>
        <div id="selected-check-details" bind:this={rulePanel} tabindex="-1">
          <div class="reason-heading"><h2>{inspectedCheck}</h2><span class="muted">{findingCount} {findingCount === 1 ? 'finding' : 'findings'}{rules.some(r => !r.result || r.gateIds === null) ? ' · Some checks unavailable' : ''}</span></div>
          {#if rule}
            {#key rule.id}<RuleDetail {rule} />{/key}
          {:else}<p class="empty-inline">No rule snapshot recorded. Inspect the response and recording details for available information.</p>{/if}
        </div>
      </details>
      <details class="other-rules disclosure" bind:this={allRules}>
        <summary>Browse all rules <span class="disclosure-count">{rules.length}</span></summary>
        <nav class="rule-list" aria-label="Rules">
          {#each rules as item}
            <button class="rule-row" aria-pressed={item.id === rule?.id} on:click={() => { selected = item.id; ruleOpen = true; inspectedCheck = 'Selected rule'; }}>
              <span class="rule-row-top"><strong>{ruleName(item)}</strong><StatusChip value={item.result?.outcome?.choice ?? 'Unavailable'} /></span>
              <span class="rule-text">{item.text}</span>
              {#if item.gateIds?.length || item.contribution.includes('approval') || item.gateIds === null}<span class="rule-finding">{item.gateIds?.length ? item.gateIds.map((g: string) => gateLabels[g] ?? g).join(' · ') : item.contribution.includes('approval') ? 'Approval requirement' : 'Gates not recorded'}</span>{/if}
            </button>
          {/each}
        </nav>
      </details>
    </section>
    <details class="evidence-disclosure disclosure" bind:open={evidenceOpen}>
      <summary>Inspect evidence and questions</summary>
      <EvidenceDock bind:this={dock} {view} {rule} bind:activeTab />
    </details>
    <details class="capture-details disclosure" bind:this={recordingDetails}>
      <summary>Recording details</summary>
      <p class="decision-explanation" aria-label="Decision explanation">{explainDecision(view)}</p>
      <dl class="lifecycle">
        <div><dt>Host</dt><dd>{view.identity?.host ?? 'unknown'} / {view.identity?.contextId ?? 'unknown'}</dd></div>
        <div><dt>Adapter version</dt><dd>{view.adapterCoverage?.version ?? 'unverified'}</dd></div>
        <div><dt>Assessment</dt><dd>{view.assessmentStatus}</dd></div>
        <div><dt>Would decide</dt><dd>{view.decision}</dd></div>
        <div><dt>Mode</dt><dd>{view.identity?.mode ?? 'unknown'}</dd></div>
        <div><dt>Permission</dt><dd>{view.permission}</dd></div>
        <div><dt>Approval</dt><dd>{view.approval}</dd></div>
        <div><dt>Execution</dt><dd>{view.execution}</dd></div>
      </dl>
      <p>Host coverage limitations: {Array.isArray(view.adapterCoverage?.limitations) && view.adapterCoverage.limitations.length ? view.adapterCoverage.limitations.join(', ') : 'not recorded'}. A policy pass does not certify host coverage.</p>
      <p>{view.requestStatus}. {view.coverage}</p>
      {#if view.assessmentStatus === 'validated'}<p>Assessment validated.</p>{/if}
      <p>Missing stages: {view.missing.join(', ') || 'none observed'}. Recorded reason: {view.reason}.</p>
      <p>Call {view.identity?.callId}<br />Session {view.identity?.sessionId}<br />Invocation {view.identity?.invocationId}</p>
    </details>
  </div>
</section>
