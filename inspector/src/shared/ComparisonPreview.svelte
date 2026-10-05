<script lang="ts">
  import { onMount, tick } from 'svelte';
  import StandalonePreview from './StandalonePreview.svelte';
  import { mountSummaryWorkspace } from './library.svelte';
  import { standaloneSummary } from './standalone-adapter';
  import { makeView } from '../../tests/components/fixtures';
  import type { SummaryWorkspaceModel, SummaryWorkspaceActions } from './model';
  import type { MobileView } from '../presentation';
  export let panelWidth: number | undefined = undefined;
  export let showRaw = false;
  // This source-only comparison uses authored records. Raw values stay on the left.
  const views = [
    makeView({ execution: 'executed', decision: 'ALLOW', gate: null, callId: 'synthetic-pass' }),
    makeView({ execution: 'unknown', callId: 'synthetic-uncertain' }),
    makeView({ execution: 'executed', failure: 'provider-error', callId: 'synthetic-failure' }),
  ];
  for (const view of views) {
    view.evidence.action.arguments.command = 'RAW_ACTION_SENTINEL';
    view.evidence.privateSource = 'RAW_EVIDENCE_SENTINEL';
    view.response = { value: 'RAW_PROVIDER_SENTINEL' };
  }
  const calls = views.map((view, index) => ({
    id: view.identity!.callId, callId: view.identity!.callId, toolName: 'bash', timestamp: index * 1000,
    mode: 'observe', decision: view.decision, permission: view.permission, execution: view.execution,
    categories: view.categories, missing: view.missing, assessmentStatus: view.assessmentStatus, failure: view.failure,
  }));
  let view = views[1]!;
  let model: SummaryWorkspaceModel = {
    calls, selected: standaloneSummary(view), selectedId: view.identity!.callId, category: '',
    coverage: 'Synthetic preview. Best-effort capture, not complete coverage.', loading: false, error: '',
  };
  let mobileView: MobileView = 'calls';
  let left: HTMLElement, right: HTMLElement, comparison: HTMLElement;
  let workspace: ReturnType<typeof mountSummaryWorkspace> | undefined;
  let ready = false, mirroring = false;
  const actions: SummaryWorkspaceActions = {
    selectCall(id) {
      view = views.find(item => item.identity!.callId === id) ?? view;
      model = { ...model, selectedId: view.identity!.callId, selected: standaloneSummary(view) };
      mobileView = 'assessment';
      // The mounted adapter owns its navigation state. Use its public Summary control.
      void tick().then(() => right.querySelector<HTMLButtonElement>('.mobile-nav button:last-child')?.click());
    },
    filterCategory(category) {
      model = { ...model, category, calls: category ? calls.filter(call => call.categories.includes(category)) : calls };
    },
    refresh() {},
  };
  $: workspace?.update({ model, actions });
  function counterpart(element: HTMLElement, selector: string) {
    const source = left.contains(element) ? left : right;
    const other = source === left ? right : left;
    const group = element.closest<HTMLElement>(selector);
    if (!group) return;
    return { group, other: other.querySelector<HTMLElement>(group.matches('.common-summary') ? '.common-summary' : '.mobile-nav') };
  }
  function synchronizeClick(event: Event) {
    if (mirroring || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button) return;
    const pair = counterpart(button, '.common-summary, .mobile-nav');
    if (!pair?.other) return;
    const index = [...pair.group.querySelectorAll('button')].indexOf(button);
    const buttons = pair.other.querySelectorAll<HTMLButtonElement>('button');
    mirroring = true;
    try { buttons[index]?.click(); } finally { mirroring = false; }
  }
  function synchronizeDisclosure(event: Event) {
    if (!(event.target instanceof HTMLDetailsElement)) return;
    const pair = counterpart(event.target, '.common-summary');
    if (!pair?.other) return;
    const index = [...pair.group.querySelectorAll('details')].indexOf(event.target);
    const other = pair.other.querySelectorAll('details')[index];
    if (other && other.open !== event.target.open) other.open = event.target.open;
  }
  onMount(() => {
    workspace = mountSummaryWorkspace(right, { model, actions });
    comparison.addEventListener('click', synchronizeClick);
    comparison.addEventListener('toggle', synchronizeDisclosure, true);
    ready = true;
    return () => {
      comparison.removeEventListener('click', synchronizeClick);
      comparison.removeEventListener('toggle', synchronizeDisclosure, true);
      void workspace?.destroy();
    };
  });
</script>

<h1>Common summary comparison</h1>
<p>Both adapters receive the same safe fields, selection and filter. Summary disclosures and navigation stay synchronized.</p>
<label class="preview-control"><input type="checkbox" bind:checked={showRaw} /> Show standalone-only inspection</label>
<p class="preview-limit">Common summary only is the default. Standalone-only additions can make the left workspace taller when enabled. Shared summary rows do not change; BB never receives raw values.</p>
<p role="status" class="preview-state">{ready ? 'Comparison ready' : 'Preparing comparison'} · Call {model.selectedId} · Filter {model.category || 'all'}</p>
<div class="comparison" bind:this={comparison}>
  <section aria-label="Standalone adapter">
    <h2 class="preview-label">Standalone adapter · shared safe fields</h2>
    <div class="preview" id="standalone-preview" bind:this={left} style:width={panelWidth ? `${panelWidth}px` : '100%'}>
      <StandalonePreview {view} {model} {actions} {showRaw} bind:mobileView />
    </div>
  </section>
  <section aria-label="BB adapter">
    <h2 class="preview-label">BB adapter · shared safe fields</h2>
    <div class="preview" id="embedded-preview" bind:this={right} style:width={panelWidth ? `${panelWidth}px` : '100%'}></div>
  </section>
</div>

<style>
  h1 { font: 600 20px/1.4 system-ui, sans-serif; margin: 0 0 8px; }
  p, .preview-control { font: 14px/1.5 system-ui, sans-serif; }
  .preview-control { display: block; margin: 16px 0; }
  .preview-limit, .preview-state { color: #5b605e; }
  .comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
  .preview { min-width: 0; max-width: 100%; }
  h2.preview-label { font: 600 16px/1.5 system-ui, sans-serif; margin: 0 0 12px; }
  @media (max-width: 820px) { .comparison { grid-template-columns: 1fr; } }
</style>
