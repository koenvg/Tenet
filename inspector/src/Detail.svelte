<script lang="ts">
  import type { InvocationView } from '../../src/inspector/view';
  export let view: InvocationView;
  let selected = '';
  $: rule = view.rules.find(r => r.id === selected) ?? view.rules[0];
  const pretty = (value: unknown) => value == null ? 'Unavailable: not recorded.' : JSON.stringify(value, null, 2);
</script>

<section aria-label="Invocation detail">
  <h2>{view.identity?.toolName} <small>{view.identity?.callId}</small></h2>
  <p class="notice">{view.coverage}</p>
  <dl class="outcomes">
    <div><dt>Mode</dt><dd>{view.identity?.mode}</dd></div>
    <div><dt>Counterfactual decision</dt><dd>{view.decision}</dd></div>
    <div><dt>Actual permission</dt><dd>{view.permission}</dd></div>
    <div><dt>Observed execution</dt><dd>{view.execution}</dd></div>
    <div><dt>Native approval</dt><dd>{view.approval}</dd></div>
  </dl>
  <p>{view.reason}</p>
  <p>Capture: {view.requestStatus}. Missing stages: {view.missing.join(', ') || 'none observed'}.</p>
  <h3>Rules</h3>
  {#if !view.rules.length}<p>No rule snapshot recorded.</p>{/if}
  <div class="rules">
    {#each view.rules as item}
      <button class:chosen={item.id === rule?.id} aria-pressed={item.id === rule?.id} on:click={() => selected = item.id}>
        <strong>{item.result?.outcome?.choice ?? 'Unavailable'}</strong>
        {item.builtin ? 'Built-in integrity' : `Line ${item.line} · ${item.enforcement}`}
        <span>{item.text}</span>
      </button>
    {/each}
  </div>
  {#if rule}
    <h3>{rule.builtin ? 'Built-in integrity' : `Rule at line ${rule.line}`}</h3>
    <p>{rule.text}</p>
    <h4>Decision and model probabilities</h4>
    <p>Probabilities are not calibrated safety guarantees. A confidence gate is not a reported FAIL. No hidden model reasoning is recorded.</p>
    <pre>{pretty(rule.result)}</pre>
    <h4>Recorded gates</h4>
    <pre>{rule.gates ? pretty(rule.gates) : rule.result ? 'No blocking gates recorded for this rule.' : 'Assessment unavailable.'}</pre>
    <h4>Effective thresholds</h4><pre>{pretty(view.config)}</pre>
    <details open><summary>Submitted questions and choices</summary><pre>{pretty(rule.questions)}</pre></details>
  {/if}
  <details><summary>Submitted evidence shared by all rules</summary><p>Field redactions and omitted history remain as submitted. Strings may still contain secrets.</p><pre>{pretty(view.evidence)}</pre></details>
  <details><summary>Application response and validation</summary><p>Untrusted response content. Truncated snapshots show a preview and original byte count.</p><pre>{pretty(view.response)}</pre><pre>{pretty(view.validation)}</pre></details>
  <details><summary>Recorded policy snapshot</summary><pre>{pretty(view.policy)}</pre></details>
</section>
