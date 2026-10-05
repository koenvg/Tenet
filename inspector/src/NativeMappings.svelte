<script lang="ts">
  import type { InvocationView } from '../../src/inspector/view';
  export let native: NonNullable<InvocationView['native']>;
</script>

<details class="record-note native-mappings">
  <summary>Native scoring mappings</summary>
  <p>Recorded requests only. Missing exchanges are unknown, not successful scores.</p>
  <p>{native.requests.length} scoring requests; {native.responses.length} captured responses; {native.omissions.length} unavailable or truncated snapshots.</p>
  {#if native.failureCategory}<p>Native failure category: {String(native.failureCategory)}</p>{/if}
  {#each native.deterministic as answer}
    <p>{answer.question}: deterministic NONE. One allowed candidate; no model scoring request. Not model confidence or authenticated coverage.</p>
  {/each}
  {#each native.requests as request}
    <div class="native-question">
      <h4>{request.question}</h4>
      <p>Prompt tokens: {request.nativeRequest?.prompt?.length ?? 'not recorded'}; context capacity: {request.contextCapacity ?? 'not recorded'}; shared prefix tokens: {request.sharedPrefixTokens ?? 'not recorded'}.</p>
      <ul>{#each Object.entries(request.mapping ?? {}) as [label, id]}
        <li>{label} → {String(id)}; token ID {request.labelIds?.[label] ?? 'not recorded'}</li>
      {/each}</ul>
    </div>
  {/each}
  <p>Cache and timing counters do not prove coverage, label matching or calibration. A backend alias does not prove physical weights.</p>
</details>

<style>
  .native-mappings { max-height: 24rem; overflow: auto; overflow-wrap: anywhere; }
  .native-question { margin-top: 1rem; }
  h4 { font-size: .9rem; }
</style>
