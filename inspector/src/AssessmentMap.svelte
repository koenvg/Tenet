<script lang="ts">
  import type { InvocationView } from '../../src/inspector/view';
  import DecisionIcon from './DecisionIcon.svelte';
  import ConfidenceMeter from './ConfidenceMeter.svelte';
  import { actionPreview, decisionLabel, gateTone, contributionExplanation, toolLabel, type RuleView } from './presentation';
  import { mapChecks, checkIcon, checkPosition, incomingPath, outgoingPath, type MapCheck } from './decision-map';
  export let view: InvocationView;
  export let rule: RuleView | undefined;
  export let inspect: (check: string) => void;
  let active = '', motion = 0;
  $: preview = actionPreview(view);
  $: checks = mapChecks(rule);
  const outgoingTone = (check: MapCheck) => check.gate && rule ? gateTone(rule, check.gate) : '';
  function choose(check: MapCheck) { active = check.id; motion++; inspect(check.label); }
</script>
  <div class="map-stage" style:--check-count={checks.length}>
    <div class="decision-map" role="group" aria-label="Decision map" class:trace-a={motion % 2 === 1} class:trace-b={motion > 0 && motion % 2 === 0}>
      <svg class="map-connections" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        {#each checks as check, index (check.id)}
          <path class:unrecorded={check.unknown} pathLength="1" d={incomingPath(checkPosition(index, checks.length))} />
          <path class={`map-edge ${outgoingTone(check)}`} class:unrecorded={check.unknown} class:is-selected={active === check.id} pathLength="1" d={outgoingPath(checkPosition(index, checks.length))} />
        {/each}
      </svg>
      <div class="map-action map-endpoint">
        <span class="map-symbol filled"><DecisionIcon kind={view.identity?.toolName === 'bash' ? 'action' : ['read', 'write', 'edit'].includes(view.identity?.toolName ?? '') ? 'document' : 'tool'} /></span>
        <h3>{toolLabel(view.identity?.toolName ?? 'Unknown tool')}</h3>
        {#if preview}<pre class="action-preview" aria-label="Recorded action"><code>{preview}</code></pre>
        {:else}<p class="action-unavailable">Command or file path not recorded. Submitted arguments remain in evidence.</p>{/if}
      </div>
      <div class="map-checks">
        {#each checks as check, index (check.id)}
          <div class={`map-check ${outgoingTone(check)}`} style:--node-y={`${checkPosition(index, checks.length)}%`}>
            <button class="map-symbol" aria-label={`Inspect ${check.label.toLowerCase()}`} aria-controls="selected-check-details" aria-pressed={active === check.id} on:click={() => choose(check)}>
              <DecisionIcon kind={checkIcon(check)} />
            </button>
            <div class="map-caption">
              <h3>{check.label} <span>/ {check.value}</span></h3>
              {#if check.id === 'outcome' && rule}
                <p class="map-rule-text" title={rule.text}>{rule.text}</p>
                <p class="map-rule-location">{rule.builtin ? 'Built-in integrity' : `Rule at line ${rule.line ?? 'unavailable'}`} · Severity {rule.enforcement}</p>
                {#if rule.evidenceGate === 'not-applicable'}<p class="map-check-note">Evidence-confidence gate does not apply. No evidence score.</p>{/if}
              {/if}
              {#if check.reading}<ConfidenceMeter {...check.reading} />{/if}
              {#if check.gate && rule}<p class="map-check-note">{contributionExplanation(rule, view.identity?.mode)}</p>{/if}
              {#if check.unknown}<p class="map-check-note">Unknown does not mean passed.</p>{/if}
            </div>
          </div>
        {/each}
      </div>
      <div class="map-policy map-endpoint">
        <span class="map-symbol filled"><DecisionIcon kind="policy" /></span>
        <h3>Recorded assessment</h3>
        <p class="map-verdict">{decisionLabel(view.decision, view.identity?.mode)}</p>
      </div>
    </div>
  </div>
