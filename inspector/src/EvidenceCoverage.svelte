<script lang="ts">
  import type { InvocationView } from '../../src/inspector/view';
  export let context: InvocationView['evidenceContext'];
</script>

<section aria-label="Runtime evidence coverage" class="capture-warning">
  <h3>Runtime evidence coverage</h3>
  {#if context}
    <p>Action resolution: {context.resolution.status}. Preparation: {context.preparation}.</p>
    {#if context.history}<p>History: {context.history.retainedEvents} retained events, {context.history.omittedEvents} omitted events. {#if context.selectionVersion === 'bounded-history-v2'}{context.history.shortenedEvents} shortened, {context.history.droppedEvents} dropped, {context.history.priorOmittedEvents} prior omissions. Exact compaction: {context.history.exactCompactedBytes} bytes saved.{/if} Current redacted fields: {context.current?.redactedFields ?? 'unavailable'}.</p>
    {:else}<p>Final history counters unavailable. Current redacted fields: {context.current?.redactedFields ?? 'unavailable'}.</p>{/if}
    <p>Known limitations and byte counts are in the evidence dock. Coverage gaps do not explain the evaluator's UNKNOWN or INSUFFICIENT choices.</p>
  {:else}<p>Not recorded. Missing historical diagnostics do not mean complete coverage.</p>{/if}
</section>
