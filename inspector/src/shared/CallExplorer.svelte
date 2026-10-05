<script lang="ts">
  import { categoryLabels, findingCategories, type FindingCategory } from '../../../src/decision/finding-triage';
  import { timestamp, toolLabel, primaryStatus, callConcern, modeLabel } from '../presentation';
  import DecisionIcon from '../DecisionIcon.svelte';
  import StatusChip from '../StatusChip.svelte';
  import type { SummaryCall } from './model';
  export let calls: SummaryCall[] = [];
  export let selectedId = '';
  export let category: FindingCategory | '' = '';
  export let loading = false;
  export let more = false;
  export let selectCall: (id: string) => void;
  export let filterCategory: (category: FindingCategory | '') => void;
  export let loadMore: (() => void) | undefined = undefined;
  export let showCallLabels = true;
  export let explorerId: string | undefined = undefined;
  export let filterId: string | undefined = undefined;
</script>

<aside id={explorerId} class="explorer" aria-label="Call explorer">
  <div class="pane-heading"><h2>Recent calls</h2></div>
  <div class="triage-tools">
    <label>Finding category
      <select id={filterId} aria-label="Finding category" value={category} on:change={event => filterCategory(event.currentTarget.value as FindingCategory | '')}>
        <option value="">All recorded calls</option>
        {#each findingCategories as c}<option value={c}>{categoryLabels[c]}</option>{/each}
      </select>
    </label>
  </div>
  <nav class="call-list" aria-label="Invocations">
    {#each calls as item}
      {@const status = primaryStatus(item)}
      {@const concern = callConcern(item)}
      <button class="call-row" aria-pressed={selectedId === item.id} on:click={() => selectCall(item.id)}>
        <DecisionIcon kind={item.toolName === 'bash' ? 'action' : ['read', 'write', 'edit'].includes(item.toolName) ? 'document' : 'tool'} />
        <span class="call-copy">
          <span class="call-top"><strong>{toolLabel(item.toolName)}</strong><time>{timestamp(item.timestamp)}</time></span>
          <span class="call-id" hidden={!showCallLabels}>{item.callId}</span>
          <span class="call-state" title={status.explanation}><StatusChip value={status.label} tone={status.tone} icon={status.icon} showIcon /><span class="call-mode">{modeLabel(item.mode)}</span></span>
          {#if concern}<small class={`call-concern ${concern.tone}`} class:recording-inconsistency={status.inconsistency} title={concern.description}>{concern.text}</small>{/if}
        </span>
      </button>
    {/each}
    {#if loading}<p role="status">Loading calls…</p>{:else if !calls.length}<p class="empty-inline">{category ? 'No calls match this finding category.' : 'No recorded invocations in this session.'}</p>{/if}
    {#if more && loadMore}<button class="text-button" disabled={loading} on:click={loadMore}>More invocations</button>{/if}
  </nav>
  <div class="explorer-footer"><span>Read-only recorded calls</span></div>
</aside>
