import { useEffect, useRef, useState } from 'react';
import { useRpc } from '@get-bb/plugin-sdk/app';
import type { Findings, rpcContract } from './contract';

const button = 'rounded-md border border-border px-3 py-2 text-sm hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

const gapLabel: Record<string, string> = {
  'indexing-in-progress': 'Archive scanning is still in progress. More linked calls may appear after Refresh.',
  'writer-loss': 'The recording writer reported dropped or failed writes. Some calls may be absent.',
  'missing-stages': 'One or more linked calls have missing recording stages.',
  'temporary-record': 'A recording is still being written.',
  'corrupt-record': 'A recording could not be parsed.',
  'unsupported-schema': 'A recording uses an unsupported format.',
  'detail-unavailable': 'A flagged call changed or could not be read in full. Its details are omitted.',
  'detail-rule-limit': 'This call has more selected FAIL rules than the detail limit; additional rules are omitted.',
  'policy-text-unavailable': 'Policy text was missing or too long to show.',
};
function LinkedFindings({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const [page, setPage] = useState<Findings | null>(null);
  const [items, setItems] = useState<Findings['items']>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);
  useEffect(() => {
    let active = true;
    const token = ++epoch.current;
    setPage(null); setItems([]); setIssues([]); setNext(null); setError(null); setBusy(true);
    rpc.call('findings', { threadId }).then(result => {
      if (active && token === epoch.current) { setPage(result); setItems(result.items); setIssues(result.issues); setNext(result.next); setBusy(false); }
    }, () => {
      if (active && token === epoch.current) { setError('Could not load findings. Refresh to try again.'); setBusy(false); }
    });
    return () => { active = false; ++epoch.current; };
  }, [rpc, threadId]);
  const load = (cursor?: string) => {
    const token = ++epoch.current;
    setBusy(true); setError(null);
    if (!cursor) { setPage(null); setItems([]); setIssues([]); setNext(null); }
    rpc.call('findings', { threadId, ...(cursor ? { cursor } : {}) }).then(result => {
      if (token !== epoch.current) return;
      if (cursor && result.coverage === 'unavailable') {
        setNext(null); setError('Could not load the next page. Refresh to restart at page one.'); setBusy(false); return;
      }
      setPage(result); setItems(previous => cursor ? [...previous, ...result.items] : result.items);
      setIssues(previous => cursor ? [...new Set([...previous, ...result.issues])] : result.issues);
      setNext(result.next); setBusy(false);
    }, () => {
      if (token !== epoch.current) return;
      setNext(null); // Never offer a cursor that just failed, including stale/invalid cursors.
      setError(cursor ? 'Could not load the next page. Refresh to restart at page one.' : 'Could not load findings. Refresh to try again.');
      setBusy(false);
    });
  };
  return <main className="mx-auto flex min-w-0 max-w-3xl flex-col gap-4 p-4 text-foreground sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">Flagged tool calls</h1>
      <button type="button" className={button} onClick={() => { if (!busy) load(); }} aria-disabled={busy}>Refresh findings</button>
    </div>
    {busy && <p role="status" className="text-sm">Checking recordings...</p>}
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm">{error}</p>}
    {page?.coverage === 'unavailable' && <p role="status" className="text-sm">Recordings unavailable. Coverage unknown.</p>}
    {page?.coverage === 'unknown' && <p role="status" className="text-sm">No linked recordings yet. Coverage unknown.</p>}
    {page?.coverage === 'partial' && <p role="status" className="text-sm text-muted-foreground">Linked recordings only. Coverage incomplete; flagged does not mean blocked.</p>}
    {issues.length > 0 && <details className="text-sm text-muted-foreground">
      <summary className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Recording gaps ({issues.length}). Some calls may be missing.</summary>
      <ul className="mt-2 list-inside list-disc space-y-1 break-words">{issues.map(issue => <li key={issue}>{gapLabel[issue] ?? `Recording gap: ${issue.replaceAll('-', ' ')}`}</li>)}</ul>
    </details>}
    {page?.coverage === 'partial' && !items.length && <p className="text-sm">No flagged call details to show yet.</p>}
    {items.length > 0 && <ol className="min-w-0 divide-y divide-border border-t border-border">{items.map(item => <li key={item.id} className="min-w-0 py-4">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="break-words font-semibold">{item.toolName}</h2>
        <span className="break-all text-xs text-muted-foreground">{item.callId}</span>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{item.rules.map(rule => <li key={rule.ruleId} className="whitespace-pre-wrap break-words">
        {rule.policyText ?? `Rule ${rule.ruleId} (text unavailable)`}
      </li>)}</ul>
    </li>)}</ol>}
    {next && !error && <button type="button" className={`${button} self-start`} aria-disabled={busy} onClick={() => { if (!busy) load(next); }}>Load more findings</button>}
  </main>;
}

export function DetailsPage({ subPath }: { subPath: string }) {
  if (!subPath) return <main className="mx-auto max-w-4xl space-y-3 p-4 text-foreground sm:p-8">
    <h1 className="text-xl font-semibold">TENET findings</h1>
    <p>Open a Pi thread, select TENET rules in its header, then choose Details to view that thread's linked findings.</p>
    <p className="text-muted-foreground">Historical recordings without a thread link remain in the standalone TENET inspector.</p>
  </main>;
  if (!/^thr_[a-z0-9]{8,64}$/.test(subPath)) return <main className="p-4"><h1>Invalid thread link.</h1></main>;
  return <LinkedFindings key={subPath} threadId={subPath} />;
}
