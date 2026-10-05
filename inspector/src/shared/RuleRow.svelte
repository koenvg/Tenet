<script lang="ts">
  import type { SummaryRule } from './model';
  import { ruleName, gateLabels } from '../presentation';
  import StatusChip from '../StatusChip.svelte';
  export let rule: SummaryRule;
  export let selected = false;
  export let select: () => void;
</script>
<button class="rule-row" aria-pressed={selected} on:click={select}>
  <span class="rule-row-top"><strong>{ruleName(rule)}</strong><StatusChip value={rule.result?.outcome?.choice ?? 'Unavailable'} /></span>
  <span class="rule-text">{rule.text}</span>
  {#if rule.gateIds?.length || rule.contribution.includes('approval') || rule.gateIds === null}<span class="rule-finding">{rule.gateIds?.length ? rule.gateIds.map(g => gateLabels[g] ?? g).join(' · ') : rule.contribution.includes('approval') ? 'Approval requirement' : 'Gates not recorded'}</span>{/if}
</button>
