import { useEffect, useRef, useState } from 'react';
import { useRpc } from '@get-bb/plugin-sdk/app';
import type { Findings, rpcContract } from './contract';
import { RuleGroups } from './rule-groups';
import { liveRead } from './live-read';
import { CoverageDetails } from './coverage-details';
import { StatusIcon } from './status-icon';

const button = 'rounded-md border border-border px-3 py-2 text-sm hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

function LinkedFindings({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const [page, setPage] = useState<Findings | null>(null);
  const [items, setItems] = useState<Findings['items']>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browsingOlder, setBrowsingOlder] = useState(false);
  const epoch = useRef(0);
  const busyRef = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const load = (cursor?: string, live = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const token = ++epoch.current;
    setBusy(true); setError(null);
    if (!cursor && !live) { setPage(null); setItems([]); setIssues([]); setNext(null); setBrowsingOlder(false); }
    liveRead(rpc.call('findings', { threadId, ...(cursor ? { cursor } : {}) }), controller.current?.signal).then(result => {
      if (token !== epoch.current) return;
      if (result.coverage === 'unavailable') {
        setPage(result); setItems([]); setIssues([]); setNext(null); setBrowsingOlder(false);
      } else {
        setPage(result);
        // Keep the owner's loaded history stable while continuing availability checks.
        if (!live || !browsingOlder) {
          setItems(previous => cursor ? [...previous, ...result.items] : result.items);
          setNext(result.next);
        }
        if (cursor) setBrowsingOlder(true);
        setIssues(previous => cursor || live && browsingOlder ? [...new Set([...previous, ...result.issues])] : result.issues);
      }
      setBusy(false); busyRef.current = false;
    }, () => {
      if (token !== epoch.current) return;
      setPage(null); setItems([]); setIssues([]); setNext(null); setBrowsingOlder(false);
      setError(cursor ? 'Could not load the next page. Refresh to restart at page one.' : 'Recordings unavailable. Refresh to try again.');
      setBusy(false); busyRef.current = false;
    });
  };
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    controller.current = new AbortController();
    loadRef.current();
    const timer = setInterval(() => loadRef.current(undefined, true), 10_000);
    return () => { clearInterval(timer); ++epoch.current; busyRef.current = false; controller.current?.abort(); };
  }, [rpc, threadId]);
  return <main className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4 p-4 text-foreground sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">Flagged rules</h1>
      <button type="button" className="flex items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-accent focus-visible:outline focus-visible:outline-2" onClick={() => { if (!busy) load(); }} aria-label="Refresh findings" aria-disabled={busy}><StatusIcon name="refresh" />Refresh</button>
    </div>
    {busy && !page && <p role="status" className="text-sm">Checking recordings...</p>}
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm">{error}</p>}
    {page?.coverage === 'unavailable' && <p role="status" className="text-sm">Cannot read saved calls. Try Refresh.</p>}
    {page?.coverage === 'unknown' && <p role="status" className="text-sm">No recordings linked to this thread yet. Rule status is unknown.</p>}
    {page && <CoverageDetails {...page} issues={issues} />}
    {browsingOlder && <p className="text-xs">Browsing older findings. Refresh to show updated calls.</p>}
    {page?.coverage === 'partial' && !items.length && <p className="text-sm">No flagged calls to show.</p>}
    {items.length > 0 && <RuleGroups items={items} />}
    {next && !error && <button type="button" className={`${button} self-start`} aria-disabled={busy} onClick={() => { if (!busy) load(next); }}>Load more findings</button>}
  </main>;
}

export function DetailsPage({ subPath }: { subPath: string }) {
  if (!subPath) return <main className="mx-auto max-w-4xl space-y-3 p-4 text-foreground sm:p-8">
    <h1 className="text-xl font-semibold">TENET findings</h1>
    <p>Open a Pi thread, select TENET rules, then View flagged rules.</p>
    <p>Older records may only be available in the TENET inspector.</p>
  </main>;
  if (!/^thr_[a-z0-9]{8,64}$/.test(subPath)) return <main className="p-4"><h1>Invalid thread link.</h1></main>;
  return <LinkedFindings key={subPath} threadId={subPath} />;
}
