<script context="module" lang="ts">
  let nextId = 0;
</script>
<script lang="ts">
  import { tick } from 'svelte';
  import type { SummaryDecision } from './model';
  import DecisionSummary from '../DecisionSummary.svelte';
  import AssessmentMap from '../AssessmentMap.svelte';
  import RuleDetail from '../RuleDetail.svelte';
  import RuleRow from './RuleRow.svelte';
  import { orderedRules, hasFinding } from '../presentation';
  import './presentation.css';
  export let view: SummaryDecision;
  export let selected = '';
  export let moreRules = false;
  export let loading = false;
  export let loadMoreRules: (() => void) | undefined = undefined;
  export let restartRules: (() => void) | undefined = undefined;
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
    <section class="common-summary" aria-label="Common call summary">
      <header class="decision-header">
        <div class="recorded-context">
          <p class="call-label">Call {view.identity?.callId ?? 'Identity unavailable'}</p>
          <p class="assessment-state">Recorded assessment: {view.evaluatorState?.status ?? view.assessmentStatus}{(view.evaluatorState?.reason ?? view.failure) ? ` · ${view.evaluatorState?.reason ?? view.failure}` : ''}.</p>
          {#if view.metadata}<p class="assessment-state">Contract {view.metadata.schemas.join(', ')} · Questions {view.metadata.questionVersion} · Profile {view.metadata.profile}{view.metadata.policyDigest ? ` · Policy SHA-256 ${view.metadata.policyDigest}` : ''}</p>{/if}
        </div>
        <DecisionSummary {view} />
      </header>
      <details class="why-disclosure disclosure">
        <summary>Why this assessment</summary>
        <AssessmentMap {view} {rule} {detailsId} inspect={inspectCheck} />
        <section class="assessment-pane" aria-label="Assessment pane">
          <details class="rule-inspection disclosure" bind:open={ruleOpen}>
            <summary>Selected check details</summary>
            <div id={detailsId} bind:this={rulePanel} tabindex="-1">
              <div class="reason-heading"><h2>{inspectedCheck}</h2><span class="muted">{findingCount} {findingCount === 1 ? 'finding' : 'findings'} on this rule page{rules.some(r => !r.result || r.gateIds === null) ? ' · Some checks unavailable' : ''}</span></div>
              {#if rule}
                {#key rule.id}<RuleDetail {rule} mode={view.identity?.mode} />{/key}
              {:else}<p class="empty-inline">No rule snapshot recorded. Missing data is not a pass.</p>{/if}
            </div>
          </details>
          <details class="other-rules disclosure">
            <summary>Browse all rules <span class="disclosure-count">{rules.length}</span></summary>
            {#if view.rulePage}<p role="status">Recorded rules {view.rulePage.total ? view.rulePage.offset + 1 : 0}–{view.rulePage.offset + rules.length} of {view.rulePage.total}. At most 16 rules per page.</p>{/if}
            <nav class="rule-list" aria-label="Rules">
              {#each rules as item}
                <RuleRow rule={item} selected={item.id === rule?.id} select={() => { selected = item.id; ruleOpen = true; inspectedCheck = 'Selected rule'; }} />
              {/each}
            </nav>
            {#if moreRules && loadMoreRules}<button class="text-button" disabled={loading} on:click={loadMoreRules}>More rules</button>{/if}
            {#if view.rulePage?.offset && restartRules}<button class="text-button" disabled={loading} on:click={restartRules}>First rule page</button>{/if}
          </details>
        </section>
      </details>
      {#if view.omittedRules}<p role="status">{view.omittedRules} recorded rules are not shown on this page.{moreRules ? ' Use More rules to continue.' : view.rulePage?.offset ? ' Use First rule page to return.' : ''}</p>{/if}
      {#if view.missingRuleSnapshots}<p class="missing-data">{view.missingRuleSnapshots} assessed rules have no recorded snapshot. Their text and identity cannot be inspected here.</p>{/if}
      <p class="summary-privacy-note">Raw evidence, action previews, exact questions and provider responses are separate from this summary. They remain in the standalone inspector on the selected machine.</p>
    </section>
  </div>
</section>
