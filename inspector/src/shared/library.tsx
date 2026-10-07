import { createRoot } from 'react-dom/client';
import Workspace from './SummaryWorkspace.js';
import type { SummaryWorkspaceInput } from './model.js';
export type * from './model.js';
// The library entry accepts safe input only. Standalone extensions stay private.
export function SummaryWorkspace(input: SummaryWorkspaceInput) {
  return <Workspace {...input} />;
}

export interface SummaryWorkspaceHandle {
  update(input: SummaryWorkspaceInput): void;
  destroy(): Promise<void>;
}
/** No transport, polling, global navigation or standalone-detail extensions. */
export function mountSummaryWorkspace(target: HTMLElement, input: SummaryWorkspaceInput): SummaryWorkspaceHandle {
  const root = createRoot(target);
  let disposed = false;
  root.render(<SummaryWorkspace {...input} />);
  return {
    update(next) { if (!disposed) root.render(<SummaryWorkspace {...next} />); },
    async destroy() { if (!disposed) { disposed = true; root.unmount(); } },
  };
}
