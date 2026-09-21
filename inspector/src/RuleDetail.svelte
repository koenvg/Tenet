<script lang="ts">
  import { gateLabels, gateExplanation, contributions, type RuleView } from './presentation';
  import StatusChip from './StatusChip.svelte';
  export let rule: RuleView;
  export let showQuestions: () => void;
  export let showEvidence: () => void;
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable assessment region needs keyboard access.) -->
<section aria-label="Selected rule" class="rule-detail" tabindex="0">
  <div class="rule-detail-title"><h3>{rule.builtin ? 'Built-in integrity' : `Rule at line ${rule.line}`}</h3><span class="setting">{rule.enforcement}</span></div>
  <p class="snapshot-text">{rule.text}</p>
  <p class="contribution">{contributions[rule.contribution] ?? 'Contribution unavailable: not recorded.'}</p>
  <div class="rule-actions"><button on:click={showQuestions}>View submitted questions</button><button on:click={showEvidence}>View shared evidence</button></div>
  <h4>Recorded gates</h4>
  {#if rule.gateIds === null}<p class="missing-data">Gate coverage unavailable: not recorded.</p>
  {:else if !rule.gateIds.length}<p class="muted">No gates triggered.</p>
  {:else}<ul class="gate-list">{#each rule.gateIds as gate}<li><strong>{gateLabels[gate] ?? 'Unrecognized recorded gate'}</strong><p>{gateExplanation(gate, rule)}</p></li>{/each}</ul>
    <details class="gate-details"><summary>Gate identifiers</summary><ul>{#each rule.gateIds as gate}<li><code>{gate}</code></li>{/each}</ul></details>
  {/if}
  {#if rule.result?.outcome?.choice === 'PASS' && rule.gateIds?.includes('outcome-confidence-below-threshold')}
    <p class="confidence-note">PASS was selected. This is a confidence gate, not a reported violation.</p>
  {/if}
  <div class="distributions">
    {#each ['outcome', 'evidence'] as kind}
      <table>
        <caption>{kind === 'outcome' ? 'Outcome' : 'Evidence sufficiency'}</caption>
        <thead><tr><th scope="col">Label</th><th scope="col">Probability</th></tr></thead>
        <tbody>
          {#each Object.entries(rule.result?.[kind]?.probabilities ?? {}) as [label, probability]}
            <tr class:selected-label={label === rule.result?.[kind]?.choice}><th scope="row">{#if label === rule.result?.[kind]?.choice}<StatusChip value={label} /><small>selected</small>{:else}{label}{/if}</th><td>{String(probability)}</td></tr>
          {:else}<tr><td colspan="2">Assessment unavailable.</td></tr>{/each}
        </tbody>
        <tfoot><tr><th scope="row">{kind === 'outcome' ? 'Selected outcome threshold' : 'SUFFICIENT threshold'}</th><td>{kind === 'outcome' ? rule.thresholds.effectThreshold ?? 'Not recorded' : rule.thresholds.evidenceThreshold ?? 'Not recorded'}</td></tr></tfoot>
      </table>
    {/each}
  </div>
  <p class="muted probability-note">Model probabilities, not calibrated safety guarantees. No hidden model reasoning is recorded.</p>
</section>
