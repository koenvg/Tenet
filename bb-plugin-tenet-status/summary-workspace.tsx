import { SummaryWorkspace, type SummaryWorkspaceInput } from './.summary-workspace/summary.js';
import './.summary-workspace/summary.css';

// The adapter owns reads and navigation. The shared React view owns presentation only.
export function SummaryWorkspaceMount(input: SummaryWorkspaceInput) {
  return <SummaryWorkspace {...input} />;
}
