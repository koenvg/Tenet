import { Button } from './components/ui/button';
import { useEffect, useState } from 'react';
import { definePluginApp, useBbNavigate, useRpc, useSdk } from '@get-bb/plugin-sdk/app';
import { DetailsPage } from './details-page';
import type { Status, rpcContract } from './contract';
import { liveRead } from './live-read';
import { CoverageDetails } from './coverage-details';
import { StatusIcon } from './status-icon';

function ThreadRules(props: { threadId: string; isCompactViewport: boolean }) {
  return <ThreadStatus key={props.threadId} {...props} />;
}
function ThreadStatus({ threadId, isCompactViewport }: { threadId: string; isCompactViewport: boolean }) {
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
    if (!isPi) return;
    let current = true, requestNumber = 0;
    const controller = new AbortController();
    const refresh = () => {
      const number = ++requestNumber;
      liveRead(rpc.call('status', { threadId }), controller.signal).then(value => {
        if (current && requestNumber === number) { setStatus(value); setLoading(false); }
      }, () => {
        if (current && requestNumber === number) { setStatus(null); setLoading(false); }
      });
    };
    setStatus(null); setLoading(true); refresh();
    const interval = setInterval(refresh, 10_000);
    return () => { current = false; clearInterval(interval); controller.abort(); };
  }, [isPi, rpc, threadId]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, []);
  if (!isPi) return null;

  const callLabel = (count: number) => `${count} recorded ${count === 1 ? 'call' : 'calls'}`;
  return <div className="relative">
    <Button variant="outline" size="sm" type="button" aria-label="TENET rule status" aria-expanded={open} aria-controls={`tenet-status-${threadId}`}
      className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent" onClick={() => setOpen(value => !value)}>
      {isCompactViewport ? 'T' : 'TENET rules'}
      {status?.coverage === 'partial' && status.failures > 0 && <span className="ml-1 rounded bg-accent px-1 font-semibold"
        aria-label={`${status.failures} recorded FAIL ${status.failures === 1 ? 'call' : 'calls'}`}>{status.failures}</span>}
    </Button>
    {open && <section id={`tenet-status-${threadId}`} role="region" aria-label="TENET rule status"
      className="fixed inset-x-2 top-14 z-50 mt-2 max-h-[calc(100dvh-4.5rem)] w-auto space-y-3 overflow-y-auto rounded-lg border border-border bg-background p-4 text-sm text-foreground shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:max-h-[65vh] sm:w-[min(22rem,calc(100vw-1rem))]">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">TENET status</h2>
        <Button variant="outline" size="sm" type="button" aria-label="Close TENET status" className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => setOpen(false)}>Close</Button></div>
      {loading && !status && <p role="status">Checking recordings...</p>}
      {!loading && !status && <p role="status">Status unavailable right now.</p>}
      {status?.coverage === 'unavailable' && <p role="status">Status unavailable right now.</p>}
      {status?.coverage === 'unknown' && <div role="status" className="space-y-1">
        <p className="font-medium">No recordings linked to this thread yet.</p>
        <p>Rule status is unknown.</p>
      </div>}
      {status?.coverage === 'partial' && <div role="status" className="space-y-1">
        <p className="text-base font-semibold">{status.failures
          ? `${status.failures} flagged ${status.failures === 1 ? 'call' : 'calls'}`
          : `No flagged calls in ${callLabel(status.linkedCalls)}.`}</p>
      </div>}
      {status && <CoverageDetails {...status} />}
      <Button variant="outline" size="sm" type="button" className="flex w-full items-center justify-between gap-3 rounded-md bg-foreground px-3 py-2.5 text-xs font-medium text-background hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={() => { setOpen(false); navigate.toPluginPanel('findings', { subPath: threadId }); }}>View flagged rules<StatusIcon name="arrow" /></Button>
    </section>}
  </div>;
}

export default definePluginApp(app => {
  // The action is absent on non-Pi threads, rather than opening an empty panel there.
  app.slots.experimental_threadHeaderAction({ id: 'tenet-rules', title: 'TENET rules', component: ThreadRules });
  app.slots.navPanel({ id: 'tenet-findings', title: 'TENET findings', icon: 'ShieldAlert', path: 'findings', component: DetailsPage });
});
