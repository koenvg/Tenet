import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Action, Policy } from '../decision/contracts.js';
import { display } from '../decision/evidence.js';

export type Approval = 'approved' | 'denied-or-dismissed' | 'unavailable' | 'cancelled' | 'timeout' | 'invalidated' | 'ui-error';

/** One native dialog at a time, including UI that has not acknowledged cancellation. */
export class ApprovalQueue {
  private tail: Promise<unknown> = Promise.resolve();

  async confirm(ctx: ExtensionContext, policy: Extract<Policy, { available: true }>, action: Action,
    ruleIds: readonly string[], timeoutMs: number, cancellation: AbortSignal, valid: () => Promise<boolean>): Promise<Approval> {
    if (cancellation?.aborted) return 'cancelled';
    if (!ctx.hasUI) return 'unavailable';
    const rules = ruleIds.map(id => policy.rules.find(rule => rule.id === id));
    if (!rules.length || rules.some(rule => !rule)) return 'unavailable';
    const body = ['Rules requiring approval:', ...rules.map(rule => `Line ${rule!.line} (${rule!.id}): ${display(rule!.text)}`),
      ...policy.sources.map(s => `${s.role} source: ${display(s.source)}; target: ${display(s.target)}; SHA-256: ${s.digest}`),
      `Combined policy SHA-256: ${policy.combinedDigest}`,
      `Session: ${display(action.sessionId)}`,
      `Tool: ${display(action.toolName)}; call: ${display(action.callId)}`,
      `Original arguments SHA-256: ${action.argumentDigest}`,
      'Proposed arguments, untrusted and field-redacted:', display(action.arguments),
      `Removed fields: ${action.redactedFields}. Embedded secrets may remain.`,
      'Approve only this pending invocation?'].join('\n\n');
    const deadline = performance.now() + timeoutMs;
    const expired = new AbortController();
    const timer = setTimeout(() => expired.abort(), timeoutMs);
    const signal = cancellation ? AbortSignal.any([cancellation, expired.signal]) : expired.signal;
    const interrupted = (): Approval => cancellation?.aborted ? 'cancelled' : 'timeout';
    let cancel = () => {};
    try {
      const cancelled = new Promise<Approval>(resolve => {
        cancel = () => resolve(interrupted());
        signal?.addEventListener('abort', cancel, { once: true });
      });
      const dialog = this.tail.then(async (): Promise<Approval> => {
        if (signal.aborted || performance.now() >= deadline) return interrupted();
        try {
          if (!await valid()) return 'invalidated';
          if (signal.aborted || performance.now() >= deadline) return interrupted();
          const answer = await ctx.ui.confirm('TENET: approve pending action?', body, { signal });
          if (signal.aborted || performance.now() >= deadline) return interrupted();
          return answer === true ? 'approved' : 'denied-or-dismissed';
        } catch {
          return signal.aborted ? interrupted() : 'ui-error';
        }
      });
      // Cancellation releases the invocation, not the dialog slot. Never let a late
      // answer from an uncooperative UI overlap another invocation's prompt.
      this.tail = dialog;
      return await Promise.race([cancelled, dialog]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
}
