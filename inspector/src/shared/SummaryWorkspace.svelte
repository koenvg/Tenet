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
      {#if model.sessions?.length}
        <label>Linked session
          <select aria-label="Linked session" value={model.sessionId} disabled={model.loading} on:change={event => actions.selectSession?.(event.currentTarget.value)}>
            {#each model.sessions as session}<option value={session.id}>{new Date(session.started).toLocaleString()} · {session.calls} calls · {session.id.slice(0, 8)}</option>{/each}
          </select>
        </label>
        {#if model.moreSessions}<button disabled={model.loading} on:click={actions.loadMoreSessions}>More sessions</button>{/if}
        {@const session = model.sessions.find(s => s.id === model.sessionId)}
        {#if session}<p class="session-counts">{session.calls} calls · {session.categoryCounts.violation} selected FAIL · {session.categoryCounts.unavailable} evaluator failures · {session.categoryCounts.uncertainty} uncertain · {session.categoryCounts.approval} approval conditions · {session.categoryCounts.pending} pending, dropped, cancelled or incomplete</p>{/if}
      {/if}
      {#if model.archiveWarnings?.length}<details><summary>Archive warnings</summary><p>These warnings can include records from other threads. They are not assessment failures.</p><ul>{#each model.archiveWarnings as code}<li>{code}</li>{/each}</ul></details>{/if}
    </div>
  {/if}
  <CallExplorer filterId={standalone ? 'finding-category' : undefined} showCallLabels={!standalone} explorerId={standalone ? 'call-explorer' : undefined} calls={model.calls} selectedId={model.selectedId ?? ''} category={model.category} loading={model.loading} unavailable={model.unavailable ?? false} more={model.moreCalls ?? false} selectCall={selectCall} filterCategory={actions.filterCategory} loadMore={actions.loadMoreCalls} />
  {#if standalone}<PaneResizer bind:value={explorerWidth} min={220} max={460} label="Resize call explorer" controls="call-explorer" />{/if}
  <div class="inspection">
    {#if inspection}{@render inspection()}
    {:else if model.selected}
      {#key model.selectedId ?? model.selected.identity?.callId}
        <SummaryDetail view={model.selected} moreRules={model.moreRules ?? false} loading={model.loading} loadMoreRules={actions.loadMoreRules} restartRules={actions.restartRules} />
      {/key}
    {:else}<section class="empty-state" aria-live="polite"><h2>{model.loading ? 'Reading invocation…' : model.unavailable ? 'Summary unavailable' : 'Choose a call to investigate'}</h2></section>{/if}
  </div>
</main>
