<script lang="ts">
  export let kind: 'action' | 'block' | 'allow' | 'ask' | 'unknown' | 'executed' | 'failed';
</script>

<svg class="decision-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if kind === 'action'}<path d="m5 7 5 5-5 5m9 0h5" />
  {:else if kind === 'block'}<path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5Z" /><path d="M8 12h8" />
  {:else if kind === 'allow' || kind === 'executed'}<circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" />
  {:else if kind === 'failed'}<circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" />
  {:else if kind === 'ask'}<path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01" /><circle cx="12" cy="12" r="9" />
  {:else}<circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" />{/if}
</svg>
