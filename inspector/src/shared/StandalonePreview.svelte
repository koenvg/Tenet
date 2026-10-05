<script lang="ts">
  import SummaryWorkspace from './SummaryWorkspace.svelte';
  import Detail from '../Detail.svelte';
  import type { InvocationView } from '../../../src/inspector/view';
  import type { SummaryWorkspaceModel, SummaryWorkspaceActions } from './model';
  import type { MobileView } from '../presentation';
  export let view: InvocationView;
  export let model: SummaryWorkspaceModel;
  export let actions: SummaryWorkspaceActions;
  export let showRaw = false;
  export let mobileView: MobileView = 'calls';
</script>
{#snippet inspection()}
  {#key model.selectedId}<Detail {view} {showRaw} />{/key}
{/snippet}
<SummaryWorkspace {model} {actions} {inspection} bind:mobileView />
