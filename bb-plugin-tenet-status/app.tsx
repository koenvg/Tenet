import { useEffect, useMemo, useRef, useState } from 'react';
import { definePluginApp, experimental_usePluginId, useSdk, type ExperimentalOpenTabOptions, type PluginThreadActionDataInput } from '@get-bb/plugin-sdk/app';
import { MainPage } from './main-page';
import { statusSchema, type Status } from './contract';
import { liveRead } from './live-read';
import { OverviewPanel } from './overview-panel';
import { supportsTenetProvider } from './supported-provider';

type HeaderAttention = {
  kind: 'checking' | 'unavailable' | 'unknown' | 'no-flags' | 'review';
  failCalls: number | null;
  summary: string;
};

function deriveHeaderAttention(status: Status | null, loading: boolean): HeaderAttention {
  if (!status && loading) return { kind: 'checking', failCalls: null, summary: 'Checking recordings.' };
  if (!status || status.coverage === 'unavailable') return { kind: 'unavailable', failCalls: null, summary: 'Status unavailable right now.' };

  const { assessments, notices, linkedCalls, coverage } = status;
  const failCalls = coverage === 'partial' ? status.failures : null;
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
  if (failCalls !== null) description.push(failCalls > 0
    ? `${failCalls} recorded FAIL ${failCalls === 1 ? 'call' : 'calls'}.`
    : 'No recorded FAIL calls.');
  description.push(...reasons);
  if (!assessments) description.push('Assessment status unknown.');
  else if (assessments.completed !== linkedCalls) description.push('Completed assessment count does not match linked calls.');
  if (!notices) description.push('Notice status unknown.');
  if (coverage === 'partial') description.push('Some calls may be missing.');
  const summary = description.join(' ');

  if ((failCalls ?? 0) > 0 || reasons.length > 0) return { kind: 'review', failCalls, summary };
  const unknown = coverage === 'unknown' || linkedCalls === 0 || !assessments || !notices || assessments.completed !== linkedCalls;
  return { kind: unknown ? 'unknown' : 'no-flags', failCalls, summary };
}

function useHeaderAttention({ threadIds }: PluginThreadActionDataInput) {
  const sdk = useSdk();
  const pluginId = experimental_usePluginId();
  const readers = useRef(new Map<string, AbortController>());
  const [attention, setAttention] = useState<ReadonlyMap<string, HeaderAttention>>(() => new Map());

  useEffect(() => {
    const active = readers.current;
    setAttention(new Map());
    return () => {
      for (const reader of active.values()) reader.abort();
      active.clear();
    };
  }, [sdk, pluginId]);

  useEffect(() => {
    const active = readers.current;
    const visible = new Set(threadIds);
    const removed = [...active.keys()].filter(threadId => !visible.has(threadId));
    for (const threadId of removed) {
      active.get(threadId)?.abort();
      active.delete(threadId);
    }
    if (removed.length) setAttention(previous => {
      const next = new Map(previous);
      for (const threadId of removed) next.delete(threadId);
      return next;
    });

    for (const threadId of threadIds) {
      if (active.has(threadId)) continue;
      const reader = new AbortController();
      const { signal } = reader;
      active.set(threadId, reader);
      const publish = (status: Status | null, loading = false) => {
        if (!signal.aborted) setAttention(previous => new Map(previous).set(threadId, deriveHeaderAttention(status, loading)));
      };
      sdk.threads.get({ threadId, signal }).then(thread => {
        if (signal.aborted || !supportsTenetProvider(thread.providerId)) return;
        const refresh = () => {
          liveRead(sdk.plugins.callRpc<Status>({ pluginId, method: 'status', input: { threadId }, outputSchema: statusSchema, signal }), signal)
            .then(status => publish(status), () => publish(null));
        };
        publish(null, true);
        refresh();
        const interval = setInterval(refresh, 10_000);
        signal.addEventListener('abort', () => clearInterval(interval), { once: true });
      }, () => {});
    }
  }, [sdk, pluginId, threadIds]);

  return useMemo(() => ({ threadIds, attention }), [threadIds, attention]);
}

const statusLabels = {
  checking: 'Checking', unavailable: 'Unavailable', unknown: 'Unknown', 'no-flags': 'No flags', review: 'Review',
} satisfies Record<HeaderAttention['kind'], string>;

const icon = 'tenet-status/tenet';
const overview = {
  tab: { id: 'tenet-overview', context: { kind: 'thread' }, availability: 'action' },
  title: 'TENET overview',
  params: null,
} satisfies ExperimentalOpenTabOptions;

export default definePluginApp(app => {
  app.slots.experimental_threadAction({
    id: 'tenet-rules', title: 'TENET', icon, group: 'tenet', placement: 'header',
    useData: useHeaderAttention,
    item: ({ thread, data, experimental_panel }) => {
      const attention = data.attention.get(thread.id);
      if (!data.threadIds.includes(thread.id) || !attention) return null;
      const { kind, failCalls, summary } = attention;
      return {
        label: `TENET: ${statusLabels[kind]}${failCalls === null ? '' : ` · ${failCalls} recorded FAIL`}`,
        detail: summary,
        icon,
        run: () => { experimental_panel.openTab(overview); },
      };
    },
  });
  app.slots.experimental_tab({ ...overview.tab, title: overview.title, params: overview.params, icon, layout: 'flush', component: OverviewPanel });
  app.slots.navPanel({ id: 'tenet-findings', title: 'TENET', icon, path: 'findings', component: MainPage });
});
