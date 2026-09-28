import type { Findings } from './contract';
import { StatusIcon } from './status-icon';

/** Group only loaded calls, never merge distinct recorded policy snapshots. */
export function RuleGroups({ items }: { items: Findings['items'] }) {
  const groups = new Map<string, { rule: Findings['items'][number]['rules'][number]; snapshot: string; calls: Findings['items'] }>();
  for (const item of items) for (const rule of item.rules) {
    const key = JSON.stringify([item.snapshot ?? item.id, rule.ruleId]);
    const group = groups.get(key) ?? { rule, snapshot: item.snapshot, calls: [] };
    if (!group.calls.some(call => call.id === item.id)) group.calls.push(item);
    groups.set(key, group);
  }
  return <ol className="min-w-0 divide-y divide-border border-y border-border">{[...groups].map(([key, group]) => {
    const uncertain = group.calls.some(call => call.rules.find(rule => rule.ruleId === group.rule.ruleId)?.uncertain !== false);
    return <li key={key} className="min-w-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-sm py-5 hover:bg-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
          <StatusIcon name={group.rule.kind === 'integrity' ? 'integrity' : 'flag'} className="mt-1 text-muted-foreground" />
          <span className="min-w-0 flex-1 space-y-2">
            <span role="heading" aria-level={2} className="block whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed">{group.rule.policyText ?? `Rule ${group.rule.ruleId} (text unavailable)`}</span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="tabular-nums">{group.calls.length} {group.calls.length === 1 ? 'call' : 'calls'} shown</span>
              <span>{group.rule.kind === 'integrity' ? 'Rule protection' : group.rule.severity === 'WARN' ? 'Warning' : 'Blocking rule'}</span>
              {uncertain && <span className="rounded border border-border px-1.5 py-0.5 text-foreground">Uncertain</span>}
            </span>
          </span>
          <StatusIcon name="chevron" className="mt-1 text-muted-foreground group-open:rotate-90" />
        </summary>
        <div className="space-y-3 pb-5 pl-7">
          <p className="text-xs">{uncertain ? 'TENET flagged these calls, but the result is uncertain.' : 'TENET flagged these calls.'}</p>
          <ul aria-label="Recorded calls" className="divide-y divide-border text-xs">{group.calls.map(call => {
            const rule = call.rules.find(rule => rule.ruleId === group.rule.ruleId)!;
            return <li key={call.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="min-w-0 space-y-1"><span className="block font-medium">{call.toolName}</span><span className="block break-all">{call.callId}</span></span>
              <span>{rule.confidence === null ? 'Confidence unavailable' : `${Math.round(rule.confidence * 100)}% confidence`}{rule.uncertain !== false ? ' · Uncertain' : ''}</span>
            </li>;
          })}</ul>
          <p className="break-all text-xs">Rule version: {group.snapshot ?? 'unknown'}</p>
        </div>
      </details>
    </li>;
  })}</ol>;
}
