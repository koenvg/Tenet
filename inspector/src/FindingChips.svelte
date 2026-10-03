<script lang="ts">
  import type { FindingCategory } from '../../src/decision/finding-triage';
  import { findingPresentation } from './presentation';
  import StatusChip from './StatusChip.svelte';
  export let categories: FindingCategory[];
</script>

<span class="finding-chips" aria-label="Recorded findings">
  {#each categories as category}
    {@const finding = findingPresentation(category)}
    <StatusChip value={category} label={finding.label} tone={finding.tone} icon={finding.icon} showIcon />
  {/each}
</span>
