import { useEffect, useRef } from 'react';
import { mountSummaryWorkspace, type SummaryWorkspaceHandle } from './.summary-workspace/summary.js';
import type { SummaryWorkspaceInput } from '../inspector/src/shared/model';
import './.summary-workspace/summary.css';

/** The adapter owns all reads, cancellation, polling and scope changes. */
export function SummaryWorkspaceMount({ model, actions }: SummaryWorkspaceInput) {
  const target = useRef<HTMLDivElement>(null);
  const handle = useRef<SummaryWorkspaceHandle | null>(null);
  useEffect(() => {
    const mounted = mountSummaryWorkspace(target.current!, { model, actions });
    handle.current = mounted;
    return () => { handle.current = null; void mounted.destroy(); };
  }, []);
  useEffect(() => { handle.current?.update({ model, actions }); }, [model, actions]);
  return <div ref={target} className="min-w-0 w-full" />;
}
