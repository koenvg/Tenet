<script lang="ts">
  import SummaryWorkspace from './SummaryWorkspace.svelte';
  import Detail from '../Detail.svelte';
  import { makeView } from '../../tests/components/fixtures';
  import { standaloneSummary } from './standalone-adapter';
  import type { SummaryWorkspaceModel, SummaryWorkspaceActions } from './model';
  const views = [
    makeView({ execution: 'executed', decision: 'ALLOW', gate: null, callId: 'synthetic-pass' }),
    makeView({ execution: 'unknown', callId: 'synthetic-uncertain' }),
  ];
  let view = views[1]!;
  let model: SummaryWorkspaceModel = {
    calls: views.map((item, index) => ({ id: item.identity!.callId, callId: item.identity!.callId, toolName: 'bash', timestamp: index * 1000,
      mode: 'observe', decision: item.decision, permission: item.permission, execution: item.execution, categories: item.categories,
      missing: item.missing, assessmentStatus: item.assessmentStatus, failure: item.failure })),
    selected: standaloneSummary(view), selectedId: view.identity!.callId, category: '',
    coverage: 'Synthetic preview. Best-effort capture, not complete coverage.', loading: false, error: '',
  };
  export let publish: (model: SummaryWorkspaceModel) => void;
  const allCalls = model.calls;
  const actions: SummaryWorkspaceActions = {
    selectCall(id) {
      view = views.find(item => item.identity!.callId === id) ?? view;
      model = { ...model, selectedId: id, selected: standaloneSummary(view) }; publish(model);
    },
    filterCategory(category) {
      model = { ...model, category, calls: category ? allCalls.filter(call => call.categories.includes(category)) : allCalls }; publish(model);
    },
    refresh() { publish(model); },
  };
  publish(model);
</script>
{#snippet inspection()}
  {#key model.selectedId}<Detail {view} />{/key}
{/snippet}
<SummaryWorkspace {model} {actions} {inspection} mobileView="assessment" />
