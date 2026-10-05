import { mount, unmount } from 'svelte';
import SummaryWorkspace from './SummaryWorkspace.svelte';
import type { SummaryWorkspaceInput } from './model.js';
export type * from './model.js';

export interface SummaryWorkspaceHandle {
  update(input: SummaryWorkspaceInput): void;
  destroy(): Promise<void>;
}

/** No transport, polling, global navigation or standalone-detail extensions. */
export function mountSummaryWorkspace(target: HTMLElement, input: SummaryWorkspaceInput): SummaryWorkspaceHandle {
  const props = $state({ model: input.model, actions: input.actions });
  const instance = mount(SummaryWorkspace, { target, props });
  let disposed = false;
  return {
    update(next) { if (!disposed) { props.model = next.model; props.actions = next.actions; } },
    async destroy() { if (!disposed) { disposed = true; await unmount(instance); } },
  };
}
