import { Button } from './components/ui/button';
import { useEffect, useState } from 'react';
import { definePluginApp, useBbNavigate, useRpc, useSdk } from '@get-bb/plugin-sdk/app';
import { MainPage } from './main-page';
import type { Status, rpcContract } from './contract';
import { liveRead } from './live-read';
import { StatusIcon } from './status-icon';
import { OverviewPanel } from './overview-panel';
import { supportsTenetProvider } from './supported-provider';
import './thread-logo.css';

type HeaderAttention =
  | { kind: 'checking' | 'unavailable' | 'unknown' | 'no-flags'; failCalls: 0; summary: string }
  | { kind: 'review'; failCalls: number; summary: string };

function deriveHeaderAttention(status: Status | null, loading: boolean): HeaderAttention {
  if (!status) return loading
    ? { kind: 'checking', failCalls: 0, summary: 'Checking recordings.' }
    : { kind: 'unavailable', failCalls: 0, summary: 'Status unavailable right now.' };
  if (status.coverage === 'unavailable') return { kind: 'unavailable', failCalls: 0, summary: 'Status unavailable right now.' };

  const { assessments, notices, linkedCalls, coverage } = status;
  const failCalls = coverage === 'partial' ? status.failures : 0;
  const reasons: string[] = [];
  if (assessments?.unavailable) reasons.push(`${assessments.unavailable} evaluator ${assessments.unavailable === 1 ? 'assessment' : 'assessments'} unavailable.`);
  for (const state of ['pending', 'dropped', 'cancelled', 'incomplete'] as const) {
    const count = assessments?.[state] ?? 0;
    if (count > 0) reasons.push(`${count} ${count === 1 ? 'assessment' : 'assessments'} ${state}.`);
  }
  if (notices?.approvals) reasons.push(`${notices.approvals} ${notices.approvals === 1 ? 'call' : 'calls'} had an approval condition.`);
  if (notices?.uncertain) reasons.push(`${notices.uncertain} ${notices.uncertain === 1 ? 'call' : 'calls'} had an uncertain result.`);
  if (!assessments && notices?.incomplete) reasons.push(`${notices.incomplete} ${notices.incomplete === 1 ? 'call' : 'calls'} had missing or unfinished checks.`);
  if (status.issues.length > 0) reasons.push('Archive warnings may include other threads.');

  const description: string[] = [];
  if (linkedCalls === 0) description.push('No linked recordings. Rule status unknown.');
  else if (coverage === 'unknown') description.push('Recording coverage unknown. Rule status unknown.');
  if (coverage === 'partial') description.push(failCalls > 0
    ? `${failCalls} recorded FAIL ${failCalls === 1 ? 'call' : 'calls'}.`
    : 'No recorded FAIL calls.');
  description.push(...reasons);
  if (!assessments) description.push('Assessment status unknown.');
  else if (assessments.completed !== linkedCalls) description.push('Completed assessment count does not match linked calls.');
  if (!notices) description.push('Notice status unknown.');
  if (coverage === 'partial') description.push('Some calls may be missing.');
  const summary = description.join(' ');

  if (failCalls > 0 || reasons.length > 0) return { kind: 'review', failCalls, summary };
  const unknown = coverage === 'unknown' || linkedCalls === 0 || !assessments || !notices || assessments.completed !== linkedCalls;
  return { kind: unknown ? 'unknown' : 'no-flags', failCalls: 0, summary };
}

function ThreadRules({ threadId }: { threadId: string }) {
  return <ThreadStatus key={threadId} threadId={threadId} />;
}
function ThreadStatus({ threadId }: { threadId: string }) {
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const rpc = useRpc<typeof rpcContract>();
  const [isPi, setIsPi] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setIsPi(false); setStatus(null);
    sdk.threads.get({ threadId }).then(thread => { if (current) setIsPi(supportsTenetProvider(thread.providerId)); }, () => {});
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
  if (!isPi) return null;

  const attention = deriveHeaderAttention(status, loading);
  return <div>
    <Button variant="outline" size="sm" type="button" aria-label="TENET rule status"
      aria-describedby={`tenet-attention-${threadId}`} title={attention.summary}
      className="tenet-thread-status gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent" onClick={() => navigate.openThreadPanel({ actionId: 'tenet-overview', title: 'TENET overview', params: null })}>
      <span className="tenet-gate-logo" aria-hidden="true">
        <span className="tenet-gate-logo__fallback">T</span>
        <span className="tenet-gate-logo__full" />
        <span className="tenet-gate-logo__piece tenet-gate-logo__left" />
        <span className="tenet-gate-logo__piece tenet-gate-logo__right" />
        <span className="tenet-gate-logo__piece tenet-gate-logo__stem" />
      </span>
      <StatusIcon name={attention.kind} />
      {attention.failCalls > 0 && <span className="shrink-0 rounded bg-accent px-1 font-semibold"
        aria-label={`${attention.failCalls} recorded FAIL ${attention.failCalls === 1 ? 'call' : 'calls'}`}>{attention.failCalls}</span>}
    </Button>
    <span id={`tenet-attention-${threadId}`} className="sr-only">{attention.summary}</span>
  </div>;
}

export default definePluginApp(app => {
  // The action is absent on non-Pi threads, rather than opening an empty panel there.
  app.slots.experimental_threadHeaderAction({ id: 'tenet-rules', title: 'T', component: ThreadRules });
  app.slots.threadPanelAction({ id: 'tenet-overview', title: 'TENET overview', icon: 'ShieldAlert', layout: 'flush', component: OverviewPanel });
  app.slots.navPanel({ id: 'tenet-findings', title: 'TENET', icon: 'ShieldAlert', path: 'findings', component: MainPage });
});
