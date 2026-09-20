import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Action, Policy } from '../decision/contracts.js';
import { display } from '../decision/evidence.js';

export type Approval = 'approved' | 'denied-or-dismissed' | 'unavailable' | 'cancelled' | 'ui-error';
export async function confirmRules(ctx: ExtensionContext, policy: Extract<Policy, { available: true }>, action: Action, ruleIds: readonly string[]): Promise<Approval> {
  if (ctx.signal?.aborted) return 'cancelled';
  if (!ctx.hasUI) return 'unavailable';
  const rules = ruleIds.map(id => policy.rules.find(rule => rule.id === id));
  if (!rules.length || rules.some(rule => !rule)) return 'unavailable';
  const body = ['Rules requiring approval:', ...rules.map(rule => `Line ${rule!.line} (${rule!.id}): ${display(rule!.text)}`),
    `Policy source: ${display(policy.source)}`, `SHA-256: ${policy.digest}`,
    `Tool: ${display(action.toolName)}; call: ${display(action.callId)}`,
    'Proposed arguments, untrusted and field-redacted:', display(action.arguments),
    `Removed fields: ${action.redactedFields}. Embedded secrets may remain.`,
    'Approve only this pending invocation?'].join('\n\n');
  const signal = ctx.signal;
  let cancel = () => {};
  try {
    const cancelled = new Promise<false>(resolve => {
      cancel = () => resolve(false);
      signal?.addEventListener('abort', cancel, { once: true });
    });
    const answer = await Promise.race([cancelled,
      ctx.ui.confirm('TENET: approve pending action?', body, { signal })]);
    if (signal?.aborted) return 'cancelled';
    return answer === true ? 'approved' : 'denied-or-dismissed';
  } catch {
    return signal?.aborted ? 'cancelled' : 'ui-error';
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
