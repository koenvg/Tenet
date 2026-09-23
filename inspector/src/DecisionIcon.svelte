<script lang="ts">
  export let kind: 'action' | 'block' | 'allow' | 'ask' | 'unknown' | 'executed' | 'failed' | 'check' | 'cross' | 'policy' | 'brand' | 'document' | 'tool';
</script>

<svg class="decision-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if kind === 'brand'}<path d="m12 4-8 15h16L12 4" /><circle cx="12" cy="4" r="3" fill="currentColor" /><circle cx="4" cy="19" r="3" fill="currentColor" /><circle cx="20" cy="19" r="3" fill="currentColor" />
  {:else if kind === 'policy'}<path d="m12 7-6 10m6-10 6 10" /><circle cx="12" cy="5" r="3" /><circle cx="5" cy="19" r="3" /><circle cx="19" cy="19" r="3" />
  {:else if kind === 'document'}<path d="M13 3H5v18h14V9l-6-6Zm0 0v6h6M8 13h8m-8 4h8" />
  {:else if kind === 'tool'}<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 10v8M3 8l9 5 9-5" />
  {:else if kind === 'check'}<path d="m6 12 4 4 8-9" />
  {:else if kind === 'cross'}<path d="m7 7 10 10m0-10L7 17" />
  {:else}
  {#if kind === 'action'}<path d="m5 7 5 5-5 5m9 0h5" />
  {:else if kind === 'block'}<path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5Z" /><path d="M8 12h8" />
  {:else if kind === 'allow' || kind === 'executed'}<circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" />
  {:else if kind === 'failed'}<circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" />
  {:else if kind === 'ask'}<path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01" /><circle cx="12" cy="12" r="9" />
  {:else}<circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" />{/if}
  {/if}
</svg>
