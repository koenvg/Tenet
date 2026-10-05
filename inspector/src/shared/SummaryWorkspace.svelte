<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SummaryWorkspaceModel, SummaryWorkspaceActions } from './model';
  import type { MobileView } from '../presentation';
  import { orderedRules } from '../presentation';
  import CallExplorer from './CallExplorer.svelte';
  import RuleRow from './RuleRow.svelte';
  import RuleDetail from '../RuleDetail.svelte';
  import DecisionSummary from '../DecisionSummary.svelte';
  import PaneResizer from '../PaneResizer.svelte';
  import './workspace.css';
  export let model: SummaryWorkspaceModel;
  export let actions: SummaryWorkspaceActions;
  // Private standalone extensions. The library mount API exposes neither snippets nor raw data.
  export let standalone = false;
  export let inspection: Snippet | undefined = undefined;
  export let coverage: Snippet | undefined = undefined;
  export let navigation: Snippet | undefined = undefined;
  export let mobileView: MobileView = 'calls';
  let explorerWidth = 300, selectedRule = '';
  $: rules = orderedRules(model.selected?.rules ?? []);
  $: rule = rules.find(r => r.id === selectedRule) ?? rules[0];
  function selectCall(id: string) { mobileView = 'assessment'; selectedRule = ''; actions.selectCall(id); }
</script>

<main class="workspace tenet-summary-workspace" class:embedded={!standalone} data-mobile-view={mobileView} style:--explorer-width={`${explorerWidth}px`}>
  {#if navigation}{@render navigation()}
  {:else}
    <nav class="mobile-nav" aria-label="Workspace views">
      <button aria-pressed={mobileView === 'calls'} on:click={() => mobileView = 'calls'}>Calls</button>
      <button aria-pressed={mobileView === 'assessment'} on:click={() => mobileView = 'assessment'}>Summary</button>
    </nav>
  {/if}
  {#if coverage}{@render coverage()}
  {:else}
    <div class="archive-messages">
      <p role="status">{model.coverage}</p>
      <button disabled={model.loading} on:click={actions.refresh}>Refresh archive</button>
      {#if model.error}<p role="alert">{model.error}</p>{/if}
    </div>
  {/if}
  <CallExplorer filterId={standalone ? 'finding-category' : undefined} showCallLabels={!standalone} explorerId={standalone ? 'call-explorer' : undefined} calls={model.calls} selectedId={model.selectedId ?? ''} category={model.category} loading={model.loading} more={model.moreCalls ?? false} selectCall={selectCall} filterCategory={actions.filterCategory} loadMore={actions.loadMoreCalls} />
  {#if standalone}<PaneResizer bind:value={explorerWidth} min={220} max={460} label="Resize call explorer" controls="call-explorer" />{/if}
  <div class="inspection">
    {#if inspection}{@render inspection()}
    {:else if model.selected}
      <p class="call-label">Call {model.selected.identity?.callId ?? 'Identity unavailable'}</p>
      <p class="assessment-state">Recorded assessment: {model.selected.evaluatorState?.status ?? model.selected.assessmentStatus}{(model.selected.evaluatorState?.reason ?? model.selected.failure) ? ` · ${model.selected.evaluatorState?.reason ?? model.selected.failure}` : ''}.</p>
      <DecisionSummary view={model.selected} />
      <p class="raw-evidence-note">Raw evidence, action previews, exact questions and provider responses remain in the standalone inspector on the selected machine.</p>
      <nav class="rule-list" aria-label="Rules">
        {#each rules as item}
          <RuleRow rule={item} selected={item.id === rule?.id} select={() => selectedRule = item.id} />
        {/each}
      </nav>
      {#if model.moreRules && actions.loadMoreRules}<button disabled={model.loading} on:click={actions.loadMoreRules}>More rules</button>{/if}
      {#if rule}<RuleDetail {rule} mode={model.selected.identity?.mode} />{:else}<p>No rule snapshot recorded. Missing data is not a pass.</p>{/if}
    {:else}<section class="empty-state" aria-live="polite"><h2>{model.loading ? 'Reading invocation…' : 'Choose a call to investigate'}</h2></section>{/if}
  </div>
</main>
