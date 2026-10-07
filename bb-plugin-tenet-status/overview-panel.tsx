import { useCallback, useEffect, useState } from 'react';
import { useRpc, useSdk } from '@get-bb/plugin-sdk/app';
import { z } from 'zod';
import type { rpcContract } from './contract';
import { overviewSelection } from './overview-contract';
import { OverviewAdapter } from './overview-adapter';
import { SummaryWorkspaceMount } from './summary-workspace';
import { liveRead } from './live-read';
import { emptyOverview, type OverviewSelection, type ThreadOverview } from '../src/inspector/bb-summary';

type PanelSelection = { threadId: string; params: unknown };
type Navigation = { projectId?: string; onSelection?: (selection: OverviewSelection) => void };
type ThreadMetadata = { id?: string; providerId: string; projectId?: string; deletedAt?: number | null };
export function OverviewPanel(props: PanelSelection & Navigation) {
  const rpc = useRpc<typeof rpcContract>();
  const sdk = useSdk();
  const readThread = useCallback((threadId: string) => sdk.threads.get({ threadId }), [sdk]);
  const readOverview = useCallback((threadId: string, selection: OverviewSelection) => rpc.call('overview', { threadId, ...selection }), [rpc]);
  return <OverviewView key={props.threadId} {...props} readThread={readThread} readOverview={readOverview} />;
}
/** The same mount for native thread panels, main navigation, and offline previews. */
export function OverviewView({ threadId, params, projectId, onSelection, readThread, readOverview }: PanelSelection & Navigation & {
  readThread: (threadId: string) => Promise<ThreadMetadata>;
  readOverview: (threadId: string, selection: OverviewSelection) => Promise<ThreadOverview>;
}) {
  const [adapter, setAdapter] = useState<OverviewAdapter | null>(null);
  const [, update] = useState(0);
  const [message, setMessage] = useState('Checking thread provider…');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true, owner: OverviewAdapter | undefined;
    const controller = new AbortController();
    setAdapter(null); setMessage('Checking thread provider…');
    liveRead(readThread(threadId), controller.signal).then(thread => {
      if (!current) return;
      if (thread?.providerId !== 'pi') { setMessage('This overview supports Pi threads only. No archive requested.'); return; }
      if (thread.deletedAt || projectId && (thread.id !== threadId || thread.projectId !== projectId)) {
        setMessage('Thread scope changed or was deleted. No archive requested.'); return;
      }
      const initial = z.object(overviewSelection).strict().safeParse(params ?? {});
      if (!initial.success) { setMessage('Panel selection rejected. Close this tab and open the overview again.'); return; }
      owner = new OverviewAdapter(async (selection, signal) => {
        // Main routes keep their selected project scope. A moved/deleted/non-Pi
        // thread cannot trigger another archive read during the next refresh.
        if (projectId) {
          const latest = await readThread(threadId);
          if (latest.providerId !== 'pi') return emptyOverview('unsupported');
          if (latest.id !== threadId || latest.deletedAt || latest.projectId !== projectId) return emptyOverview();
        }
        if (!current || signal.aborted) return emptyOverview();
        return readOverview(threadId, selection);
      }, () => { if (current) update(v => v + 1); }, initial.data, onSelection);
      setAdapter(owner);
    }, () => { if (current) setMessage('Thread unavailable. No archive requested.'); });
    return () => { current = false; controller.abort(); owner?.dispose(); };
  }, [readThread, readOverview, threadId, projectId, onSelection, retry]);
  useEffect(() => {
    if (!adapter) return;
    const selection = z.object(overviewSelection).strict().safeParse(params ?? {});
    if (!selection.success) {
      adapter.dispose(); setAdapter(null);
      setMessage('Panel selection rejected. Close this tab and open the overview again.');
      return;
    }
    adapter.restoreSelection(selection.data);
  }, [adapter, params]);
  return <section aria-label="TENET thread overview" className="min-w-0 h-full overflow-y-auto text-foreground" style={{ width: '100%' }}>
    {adapter ? <SummaryWorkspaceMount {...adapter.workspace()} /> : <div className="p-4"><p role="status">{message}</p>
      <button type="button" onClick={() => setRetry(v => v + 1)}>Retry thread read</button></div>}
  </section>;
}
