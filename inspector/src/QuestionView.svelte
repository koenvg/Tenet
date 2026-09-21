<script lang="ts">
  import SafeMarkdown from './SafeMarkdown.svelte';
  import StatusChip from './StatusChip.svelte';
  import { pretty } from './presentation';
  export let question: unknown;
  export let format: 'rich' | 'json' = 'rich';
  const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  $: data = object(question);
  $: choices = Object.entries(object(data.criteria));
  $: other = Object.fromEntries(Object.entries(data).filter(([key]) => !['instructions', 'criteria'].includes(key)));
</script>

{#if format === 'json'}<pre class="question-json">{pretty(question)}</pre>
{:else if typeof data.instructions === 'string'}
  <div class="question-rich">
    <div class="rich-markdown"><SafeMarkdown source={data.instructions} /></div>
    {#if choices.length}
      <h6>Answer choices</h6>
      <dl class="answer-choices">{#each choices as [label, description]}<div><dt><StatusChip value={label} /></dt><dd>{#if typeof description === 'string'}<div class="rich-markdown"><SafeMarkdown source={description} /></div>{:else}<pre>{pretty(description)}</pre>{/if}</dd></div>{/each}</dl>
    {:else}<p class="muted">No answer choices recorded.</p>{/if}
    {#if Object.keys(other).length}<details class="question-metadata"><summary>Other recorded fields</summary><pre>{pretty(other)}</pre></details>{/if}
    {#if data.criteria !== undefined && (!choices.length || typeof data.criteria !== 'object')}<pre>{pretty(data.criteria)}</pre>{/if}
  </div>
{:else}<pre class="question-json">{pretty(question)}</pre>{/if}
