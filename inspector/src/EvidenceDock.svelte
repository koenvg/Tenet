<script lang="ts">
  import type { InvocationView } from '../../src/inspector/view';
  import QuestionView from './QuestionView.svelte';
  import { pretty, ruleName, type RuleView, type DockTab } from './presentation';
  export let view: InvocationView;
  export let rule: RuleView | undefined;
  export let activeTab: DockTab = 'Evidence';
  let questionFormat: 'rich' | 'json' = 'rich';
  const tabs: DockTab[] = ['Evidence', 'Questions', 'Response', 'Policy'];
  const evidenceOrder = ['action', 'context', 'trajectory', 'policy', 'integrity'];
  const evidenceNames: Record<string, string> = { action: 'Action and arguments', context: 'Host context', trajectory: 'Chronological history', policy: 'Submitted policy', integrity: 'Submitted integrity constraint' };
  $: evidenceEntries = view.evidence && typeof view.evidence === 'object'
    ? Object.entries(view.evidence).sort(([a], [b]) => {
      const rank = (key: string) => evidenceOrder.includes(key) ? evidenceOrder.indexOf(key) : evidenceOrder.length;
      return rank(a) - rank(b);
    }) : [];
  let heading: HTMLHeadingElement;
  export function focusHeading() { heading?.focus(); }
  function navigate(event: KeyboardEvent, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); activeTab = tabs[next]!;
    const target = event.currentTarget as HTMLButtonElement;
    (target.parentElement?.querySelectorAll('button')[next] as HTMLButtonElement)?.focus();
  }
</script>

<section class="evidence-dock" aria-label="Evidence dock">
  <div class="pane-heading"><h3 id="dock-heading" tabindex="-1" bind:this={heading}>Evidence dock</h3><span class="muted">Recorded snapshot</span></div>
  <div class="dock-tabs" role="tablist" aria-label="Recorded data">
    {#each tabs as tab, index}<button id={`tab-${tab}`} role="tab" aria-selected={activeTab === tab} aria-controls={`panel-${tab}`} tabindex={activeTab === tab ? 0 : -1} on:click={() => activeTab = tab} on:keydown={event => navigate(event, index)}>{tab}</button>{/each}
  </div>
  <div id="panel-Evidence" role="tabpanel" aria-labelledby="tab-Evidence" aria-label="Submitted evidence" class="dock-panel" tabindex="0" hidden={activeTab !== 'Evidence'}>
    <h4>Shared submitted evidence</h4>
    <p class="muted">The same evidence was submitted for all rules. Field redactions and omitted history remain as recorded. Strings may contain secrets.</p>
    {#if view.evidence === null}<p class="missing-data">Submitted evidence unavailable. No historical payload is reconstructed.</p>
    {:else}
      {#each evidenceEntries as [key, value]}
        <section class="evidence-section"><h5>{evidenceNames[key] ?? key}</h5><p class="question-key">state.{key}</p><pre>{pretty(value)}</pre></section>
      {/each}
    {/if}
  </div>
  <div id="panel-Questions" role="tabpanel" aria-labelledby="tab-Questions" aria-label="Questions" class="dock-panel" tabindex="0" hidden={activeTab !== 'Questions'}>
    <h4>Questions for {rule ? ruleName(rule) : 'unavailable rule'}</h4>
    <p class="muted">These are the exact submitted questions and choices, not current templates.</p>
    <div class="format-toggle" role="group" aria-label="Question display format">
      <button aria-pressed={questionFormat === 'rich'} on:click={() => questionFormat = 'rich'}>Rich</button>
      <button aria-pressed={questionFormat === 'json'} on:click={() => questionFormat = 'json'}>JSON</button>
    </div>
    <p class="muted format-help">Rich text formats recorded Markdown. HTML, links and images remain inert.</p>
    <dl class="metadata"><div><dt>Version</dt><dd>{String(view.questionVersion ?? 'not recorded')}</dd></div><div><dt>Rule reference</dt><dd>{rule?.mapping?.reference ?? 'not recorded'}</dd></div></dl>
    {#each ['outcome', 'evidence'] as kind}
      <h5>{kind === 'outcome' ? 'Outcome question' : 'Evidence question'}</h5>
      <p class="question-key">{rule?.mapping?.[kind + 'Key'] ?? 'Mapping not recorded'}</p>
      <QuestionView question={rule?.questions?.[kind as 'outcome' | 'evidence']} format={questionFormat} />
    {/each}
  </div>
  <div id="panel-Response" role="tabpanel" aria-labelledby="tab-Response" aria-label="Response" class="dock-panel" tabindex="0" hidden={activeTab !== 'Response'}>
    <h4>Application response</h4><p class="muted">Untrusted recorded content. Truncated snapshots include a preview and original byte count.</p>
    <p class="muted">Credential and header fields are omitted; strings may still contain secrets.</p>
    {#if view.response?.unavailable}<p>Response snapshot unavailable. The response could not be safely serialized within capture limits.</p>
    {:else if view.response?.truncated}<p>Response truncated. Preview limited to 1 MiB; serialized size after field omissions: {view.response.bytes} bytes.</p>
    {:else if !view.response}<p>No application response recorded. This does not prove the provider returned nothing.</p>{/if}
    <pre>{pretty(view.response)}</pre><h4>Validation</h4><pre>{pretty(view.validation)}</pre>
  </div>
  <div id="panel-Policy" role="tabpanel" aria-labelledby="tab-Policy" aria-label="Policy" class="dock-panel" tabindex="0" hidden={activeTab !== 'Policy'}>
    <h4>Policy at invocation time</h4><p class="muted">Snapshot text, source, target and digest. Changes to current policy do not alter this record.</p><pre>{pretty(view.policy)}</pre>
  </div>
</section>
