import { useEffect, useState } from 'react';
import type { OperationsQuery, OperationsView } from '../../src/inspector/operations-reader.js';

function parseView(value: unknown): OperationsView {
  const v = value as OperationsView;
  const number = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const metric = (m: OperationsView['analysis']) => m && number(m.count) && (m.mean === null || number(m.mean)) && (m.p95 === null || number(m.p95));
  if (!v || !number(v.asOf) || !number(v.freshForMs) || v.freshForMs > 10000 || !['observed', 'partial', 'unknown'].includes(v.coverage)
    || v.current !== null && (!v.current || !['queued', 'analyzing', 'approval', 'other'].every(k => number(v.current![k as keyof typeof v.current])))
    || !metric(v.analysis) || !metric(v.queue) || !v.outcomes || !['completed', 'unavailable', 'dropped', 'cancelled', 'interrupted'].every(k => number(v.outcomes[k as keyof typeof v.outcomes]))
    || !Array.isArray(v.projects) || v.projects.length > 1024 || !v.projects.every(p => typeof p.key === 'string' && /^[a-f0-9]{64}$/.test(p.key) && typeof p.label === 'string')
    || !Array.isArray(v.requests) || v.requests.length > 100 || !v.requests.every(r => typeof r.key === 'string' && typeof r.tool === 'string' && typeof r.projectLabel === 'string'
      && r.assessment && ['preparing', 'queued', 'analyzing', 'settled'].includes(r.assessment.kind) && r.permission && ['pending', 'awaiting-approval', 'finalizing', 'committed'].includes(r.permission.kind)
      && ['fresh', 'stale', 'closed', 'suspended'].includes(r.freshness))
    || !Array.isArray(v.buckets) || v.buckets.length > 60 || !v.buckets.every(b => number(b.at) && (b.analysis === null || number(b.analysis)) && (b.queue === null || number(b.queue)))
    || !Array.isArray(v.issues) || !Array.isArray(v.runtimes) || v.runtimes.length > 16 || !v.loss || !v.capture
    || !number(v.total) || v.next !== null && !number(v.next)) throw new Error('invalid-response');
  return v;
}
export function useOperations(query: OperationsQuery, active: boolean) {
  const [state, setState] = useState<{ data: OperationsView | null; expired: boolean; busy: boolean; error: string }>({ data: null, expired: true, busy: true, error: '' });
  const key = JSON.stringify(query);
  useEffect(() => {
    if (!active) return;
    let stopped = false, controller: AbortController | undefined, deadline = 0, wallDeadline = 0, receivedWall = 0;
    const expire = () => {
      if (performance.now() >= deadline || Date.now() >= wallDeadline || Date.now() < receivedWall)
        setState(old => old.expired ? old : { ...old, expired: true });
    };
    const refresh = async () => {
      if (stopped || controller) return;
      const request = controller = new AbortController();
      const sent = performance.now();
      const timeout = setTimeout(() => request.abort(), 5000);
      const params = new URLSearchParams();
      for (const [name, value] of Object.entries(JSON.parse(key))) if (value !== undefined && value !== '') params.set(name, String(value));
      try {
        const response = await fetch(`/api/operations?${params}`, { signal: request.signal, cache: 'no-store', credentials: 'same-origin', mode: 'same-origin' });
        if (!response.ok) throw new Error('transport');
        const data = parseView(await response.json());
        if (stopped || controller !== request) return;
        const freshForMs = Math.max(0, data.freshForMs - (performance.now() - sent));
        deadline = performance.now() + freshForMs; receivedWall = Date.now(); wallDeadline = receivedWall + freshForMs;
        setState(old => ({ data: JSON.stringify(old.data) === JSON.stringify(data) ? old.data : data,
          expired: freshForMs <= 0, busy: false, error: '' }));
      } catch {
        if (!stopped && controller === request) setState(old => ({ ...old, expired: true, busy: false,
          error: 'Telemetry updates unavailable. Retrying automatically.' }));
      } finally { clearTimeout(timeout); if (controller === request) controller = undefined; }
    };
    const resume = () => { expire(); controller?.abort(); controller = undefined; void refresh(); };
    setState(old => ({ ...old, expired: true, busy: true }));
    void refresh();
    const poll = setInterval(refresh, 2000), clock = setInterval(expire, 250);
    window.addEventListener('focus', resume); document.addEventListener('visibilitychange', resume);
    return () => { stopped = true; controller?.abort(); clearInterval(poll); clearInterval(clock);
      window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [key, active]);
  return state;
}
