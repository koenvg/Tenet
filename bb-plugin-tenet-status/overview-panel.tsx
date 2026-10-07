import { useEffect, useState } from 'react';
import { useRpc, useSdk, type PluginThreadPanelProps } from '@get-bb/plugin-sdk/app';
import { z } from 'zod';
import type { rpcContract } from './contract';
import { overviewSelection } from './overview-contract';
import { OverviewAdapter } from './overview-adapter';
import { SummaryWorkspaceMount } from './summary-workspace';
import { liveRead } from './live-read';

export function OverviewPanel({ threadId, params }: PluginThreadPanelProps) {
  return <ThreadOverview key={threadId} threadId={threadId} params={params} />;
}
function ThreadOverview({ threadId, params }: PluginThreadPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const sdk = useSdk();
  const [adapter, setAdapter] = useState<OverviewAdapter | null>(null);
  const [, update] = useState(0);
  const [message, setMessage] = useState('Checking thread provider…');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true, owner: OverviewAdapter | undefined;
    const controller = new AbortController();
    setAdapter(null); setMessage('Checking thread provider…');
    liveRead(sdk.threads.get({ threadId }), controller.signal).then(thread => {
      if (!current) return;
      if (thread?.providerId !== 'pi') { setMessage('This overview supports Pi threads only. No archive requested.'); return; }
      const initial = z.object(overviewSelection).strict().safeParse(params ?? {});
      if (!initial.success) { setMessage('Panel selection rejected. Close this tab and open the overview again.'); return; }
      owner = new OverviewAdapter(selection => rpc.call('overview', { threadId, ...selection }), () => { if (current) update(v => v + 1); }, initial.data);
      setAdapter(owner);
    }, () => { if (current) setMessage('Thread unavailable. No archive requested.'); });
    return () => { current = false; controller.abort(); owner?.dispose(); };
  }, [sdk, rpc, threadId, params, retry]);
  return <section aria-label="TENET thread overview" className="min-w-0 h-full overflow-y-auto text-foreground" style={{ width: '100%' }}>
    {adapter ? <SummaryWorkspaceMount {...adapter.workspace()} /> : <div className="p-4"><p role="status">{message}</p>
      <button type="button" onClick={() => setRetry(v => v + 1)}>Retry thread read</button></div>}
  </section>;
}
