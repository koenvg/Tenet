<script lang="ts">
  import { gateLabels, gateExplanation, contributions, confidenceReadings, type RuleView } from './presentation';
  import ConfidenceMeter from './ConfidenceMeter.svelte';
  import StatusChip from './StatusChip.svelte';
  export let rule: RuleView;
  export let showQuestions: () => void;
  export let showEvidence: () => void;
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable assessment region needs keyboard access.) -->
<section aria-label="Selected rule" class="rule-detail" tabindex="0">
  <div class="rule-detail-title"><h3>{rule.builtin ? 'Built-in integrity' : `Rule at line ${rule.line}`}</h3><span class="setting">{rule.enforcement}</span></div>
  <p class="snapshot-text">{rule.text}</p>
  {#if rule.result?.outcome}<p class="rule-outcome">Rule outcome <StatusChip value={rule.result.outcome.choice ?? 'Unavailable'} /></p>{/if}
  {#if rule.contribution.includes('approval')}<p class="contribution">{contributions[rule.contribution]}</p>{/if}
  {#if rule.gateIds === null}<p class="missing-data">Gate coverage unavailable: not recorded.</p>
  {:else if !rule.gateIds.length}<p class="muted">No gates triggered.</p>
  {:else}<ul class="gate-list">{#each rule.gateIds as gate}{#if !confidenceReadings(rule).some(r => r.gate === gate)}<li><strong>{gateLabels[gate] ?? 'Unrecognized recorded gate'}</strong><p>{gateExplanation(gate, rule)}</p></li>{/if}{/each}</ul>
  {/if}
  {#each confidenceReadings(rule) as reading}<ConfidenceMeter label={reading.label} value={reading.value} threshold={reading.threshold} />{/each}
  {#if rule.result?.outcome?.choice === 'PASS' && rule.gateIds?.some(g => g.includes('confidence') || g === 'evidence-insufficient')}
    <p class="confidence-note">PASS was selected for the rule outcome, but a confidence or evidence check did not pass. This is not a reported violation.</p>
  {/if}
  <div class="rule-actions"><button on:click={showQuestions}>View submitted questions</button><button on:click={showEvidence}>View shared evidence</button></div>
  <details class="rule-technical disclosure"><summary>Probabilities and rule details</summary>
  <p class="contribution">{contributions[rule.contribution] ?? 'Contribution unavailable: not recorded.'}</p>
  <p class="setting">Enforcement: {rule.enforcement}</p>
  {#if rule.gateIds?.length}<details class="gate-details"><summary>Gate identifiers</summary><ul>{#each rule.gateIds as gate}<li><code>{gate}</code></li>{/each}</ul></details>{/if}
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
  </details>
</section>
