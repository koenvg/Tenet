<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SummaryWorkspaceModel, SummaryWorkspaceActions } from './model';
  import type { MobileView } from '../presentation';
  import CallExplorer from './CallExplorer.svelte';
  import SummaryDetail from './SummaryDetail.svelte';
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
  let explorerWidth = 300;
  function selectCall(id: string) { mobileView = 'assessment'; actions.selectCall(id); }
</script>

<main class="workspace tenet-summary-workspace tenet-presentation" class:embedded={!standalone} data-mobile-view={mobileView} style:--explorer-width={`${explorerWidth}px`}>
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
      {#key model.selectedId ?? model.selected.identity?.callId}
        <SummaryDetail view={model.selected} moreRules={model.moreRules ?? false} loading={model.loading} loadMoreRules={actions.loadMoreRules} />
      {/key}
      <p class="raw-evidence-note">Raw evidence, action previews, exact questions and provider responses remain in the standalone inspector on the selected machine.</p>
    {:else}<section class="empty-state" aria-live="polite"><h2>{model.loading ? 'Reading invocation…' : 'Choose a call to investigate'}</h2></section>{/if}
  </div>
</main>
