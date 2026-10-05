<script context="module" lang="ts">
  let nextId = 0;
</script>
<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import type { SummaryDecision } from './model';
  import DecisionSummary from '../DecisionSummary.svelte';
  import AssessmentMap from '../AssessmentMap.svelte';
  import RuleDetail from '../RuleDetail.svelte';
  import RuleRow from './RuleRow.svelte';
  import { orderedRules, hasFinding } from '../presentation';
  import './presentation.css';
  export let view: SummaryDecision;
  export let selected = '';
  export let action: Snippet<['story' | 'map']> | undefined = undefined;
  export let extensions: Snippet | undefined = undefined;
  export let moreRules = false;
  export let loading = false;
  export let loadMoreRules: (() => void) | undefined = undefined;
  export let detailsId = `tenet-check-${++nextId}`;
  let ruleOpen = false, inspectedCheck = 'Selected rule';
  let rulePanel: HTMLElement;
  $: rules = orderedRules(view.rules);
  $: rule = rules.find(r => r.id === selected) ?? rules[0];
  $: findingCount = rules.filter(hasFinding).length;
  async function inspectCheck(label: string) {
    inspectedCheck = label; ruleOpen = true;
    await tick(); rulePanel?.focus();
  }
</script>

<section class="invocation tenet-presentation" aria-label="Invocation detail">
  <div class="summary-content">
    <header class="decision-header">
      <div class="decision-title visually-hidden"><h2>Call summary <span hidden>{view.identity?.callId}</span></h2></div>
      <DecisionSummary {view} {action} />
    </header>
    <details class="why-disclosure disclosure">
      <summary>Why this assessment</summary>
      <AssessmentMap {view} {rule} {action} {detailsId} inspect={inspectCheck} />
      <section class="assessment-pane" aria-label="Assessment pane">
        <details class="rule-inspection disclosure" bind:open={ruleOpen}>
          <summary>Selected check details</summary>
          <div id={detailsId} bind:this={rulePanel} tabindex="-1">
            <div class="reason-heading"><h2>{inspectedCheck}</h2><span class="muted">{findingCount} {findingCount === 1 ? 'finding' : 'findings'}{rules.some(r => !r.result || r.gateIds === null) ? ' · Some checks unavailable' : ''}</span></div>
            {#if rule}
              {#key rule.id}<RuleDetail {rule} mode={view.identity?.mode} />{/key}
            {:else}<p class="empty-inline">No rule snapshot recorded. Missing data is not a pass.</p>{/if}
          </div>
        </details>
        <details class="other-rules disclosure">
          <summary>Browse all rules <span class="disclosure-count">{rules.length}</span></summary>
          <nav class="rule-list" aria-label="Rules">
            {#each rules as item}
              <RuleRow rule={item} selected={item.id === rule?.id} select={() => { selected = item.id; ruleOpen = true; inspectedCheck = 'Selected rule'; }} />
            {/each}
          </nav>
          {#if moreRules && loadMoreRules}<button class="text-button" disabled={loading} on:click={loadMoreRules}>More rules</button>{/if}
        </details>
      </section>
    </details>
    {#if extensions}{@render extensions()}{/if}
  </div>
</section>
