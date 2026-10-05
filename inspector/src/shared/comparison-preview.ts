import { mount } from 'svelte';
import StandalonePreview from './StandalonePreview.svelte';
import { mountSummaryWorkspace } from './library.svelte';
import type { SummaryWorkspaceModel } from './model';
const standalone = document.getElementById('standalone-preview')!;
const embedded = document.getElementById('embedded-preview')!;
const narrow = new URLSearchParams(location.search).get('container') === '390';
if (narrow) for (const target of [standalone, embedded]) target.style.width = '390px';
let current: SummaryWorkspaceModel;
const actions = {
  selectCall(id: string) { standalone.querySelector<HTMLButtonElement>(`[data-call-id="${id}"]`)?.click(); },
  filterCategory(category: string) {
    const select = standalone.querySelector<HTMLSelectElement>('select')!;
    select.value = category; select.dispatchEvent(new Event('change', { bubbles: true }));
  },
  refresh() {},
};
let workspace: ReturnType<typeof mountSummaryWorkspace> | undefined;
mount(StandalonePreview, { target: standalone, props: {
  publish(model: SummaryWorkspaceModel) { current = model; workspace?.update({ model, actions }); },
} });
workspace = mountSummaryWorkspace(embedded, { model: current!, actions });
