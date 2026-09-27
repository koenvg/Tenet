import { useEffect, useState } from 'react';
import { definePluginApp, useBbNavigate, useRpc, useSdk } from '@get-bb/plugin-sdk/app';
import { DetailsPage } from './details-page';
import type { Status, rpcContract } from './contract';

function ThreadRules({ threadId, isCompactViewport }: { threadId: string; isCompactViewport: boolean }) {
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const rpc = useRpc<typeof rpcContract>();
  const [isPi, setIsPi] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setIsPi(false); setOpen(false); setStatus(null);
    sdk.threads.get({ threadId }).then(thread => { if (current) setIsPi(thread.providerId === 'pi'); }, () => {});
    return () => { current = false; };
  }, [sdk, threadId]);
  useEffect(() => {
    if (!open || !isPi) return;
    let current = true, requestNumber = 0;
    const refresh = () => {
      const number = ++requestNumber;
      rpc.call('status', { threadId }).then(value => {
        if (current && requestNumber === number) { setStatus(value); setLoading(false); }
      }, () => {
        if (current && requestNumber === number) { setStatus(null); setLoading(false); }
      });
    };
    setStatus(null); setLoading(true); refresh();
    const interval = setInterval(refresh, 10_000);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', escape);
    return () => { current = false; clearInterval(interval); document.removeEventListener('keydown', escape); };
  }, [open, isPi, rpc, threadId]);
  if (!isPi) return null;

  const updating = status?.issues.includes('indexing-in-progress');
  const gaps = status?.issues.some(issue => issue !== 'indexing-in-progress');
  const callLabel = (count: number) => `${count} recorded ${count === 1 ? 'call' : 'calls'}`;
  return <div className="relative">
    <button type="button" aria-label="TENET rule status" aria-expanded={open} aria-controls={`tenet-status-${threadId}`}
      className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent" onClick={() => setOpen(value => !value)}>
      {isCompactViewport ? 'T' : 'TENET rules'}
    </button>
    {open && <section id={`tenet-status-${threadId}`} role="region" aria-label="TENET rule status"
      className="fixed inset-x-2 top-14 z-50 mt-2 max-h-[calc(100dvh-4.5rem)] w-auto space-y-3 overflow-y-auto rounded-lg border border-border bg-background p-4 text-sm text-foreground shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:max-h-[65vh] sm:w-[min(22rem,calc(100vw-1rem))]">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">TENET status</h2>
        <button type="button" aria-label="Close TENET status" className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => setOpen(false)}>Close</button></div>
      {loading && !status && <p role="status">Checking recordings...</p>}
      {!loading && !status && <p role="status">Status unavailable right now.</p>}
      {status?.coverage === 'unavailable' && <p role="status">Status unavailable right now.</p>}
      {status?.coverage === 'unknown' && <div role="status" className="space-y-1">
        <p className="font-medium">No recordings for this thread yet.</p>
        <p className="text-muted-foreground">Coverage is unknown, not a pass.</p>
      </div>}
      {status?.coverage === 'partial' && <div role="status" className="space-y-1">
        <p className="text-base font-semibold">{status.failures
          ? `${status.failures} flagged ${status.failures === 1 ? 'call' : 'calls'}`
          : `No flagged calls in ${callLabel(status.linkedCalls)}.`}</p>
        {status.failures > 0 && <p className="text-muted-foreground">Among {callLabel(status.linkedCalls)} in this thread.</p>}
        <p className="text-xs text-muted-foreground">Only recorded calls are shown. This is not an all-clear.</p>
      </div>}
      {status && status.coverage !== 'unavailable' && (updating || gaps) && <p className="text-xs text-muted-foreground" role="status">
        {updating && gaps ? 'Still checking. Some records may be missing.'
          : updating ? 'Still checking recordings.' : 'Some records may be missing.'}
      </p>}
      <button type="button" className="rounded-md border border-border px-3 py-2 text-xs hover:bg-accent focus-visible:outline focus-visible:outline-2"
        aria-label="Open TENET details" onClick={() => { setOpen(false); navigate.toPluginPanel('findings', { subPath: threadId }); }}>Details</button>
    </section>}
  </div>;
}

export default definePluginApp(app => {
  // The action is absent on non-Pi threads, rather than opening an empty panel there.
  app.slots.experimental_threadHeaderAction({ id: 'tenet-rules', title: 'TENET rules', component: ThreadRules });
  app.slots.navPanel({ id: 'tenet-findings', title: 'TENET findings', icon: 'ShieldAlert', path: 'findings', component: DetailsPage });
});
