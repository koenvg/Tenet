<script lang="ts">
  import type { InvocationView } from '../../src/inspector/view';
  export let context: InvocationView['evidenceContext'];
</script>

<section aria-label="Runtime evidence coverage" class="coverage-records">
  <h4>Runtime evidence coverage</h4>
  {#if context}
    <dl class="record-fields">
      <div><dt>Action resolution</dt><dd>{context.resolution.status}</dd></div>
      <div><dt>Preparation</dt><dd>{context.preparation}</dd></div>
      {#if context.history}
        <div class="record-wide"><dt>History</dt><dd>{context.history.retainedEvents} retained events, {context.history.omittedEvents} known omissions</dd></div>
        {#if context.selectionVersion === 'bounded-history-v2'}
          <div class="record-wide"><dt>History losses</dt><dd>{context.history.shortenedEvents} shortened, {context.history.droppedEvents} dropped, {context.history.priorOmittedEvents} prior omissions</dd></div>
          <div><dt>Exact compaction</dt><dd>{context.history.exactCompactedBytes} bytes saved</dd></div>
        {/if}
      {:else}<div class="record-wide"><dt>History</dt><dd>Final history counters unavailable.</dd></div>{/if}
      <div><dt>Current redacted fields</dt><dd>{context.current?.redactedFields ?? 'unavailable'}</dd></div>
    </dl>
    <details class="record-note coverage-notes">
      <summary>What the coverage data means</summary>
      <p>A shortened result still has a recorded observation; a missing result remains unknown. Matching IDs do not prove execution or success.</p>
      <p>Capture omissions can count source slots, not missing calls or effects.</p>
      <p>Known limitations and byte counts are in the evidence dock. Coverage gaps do not explain the evaluator's UNKNOWN or INSUFFICIENT choices.</p>
    </details>
  {:else}<p>Not recorded. Missing historical diagnostics do not mean complete coverage.</p>{/if}
</section>
