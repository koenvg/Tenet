import type { Approval, ApprovalRequest } from './guard.js';

/** Bound an embedding's UI independently of whether it acknowledges abort. */
export async function confirmInvocation(request: ApprovalRequest, approve: (request: ApprovalRequest) => Promise<Approval>): Promise<Approval> {
  const expired = new AbortController();
  const signal = AbortSignal.any([request.signal, expired.signal]);
  const deadline = performance.now() + request.timeoutMs;
  const interrupted = (): Approval => request.signal.aborted ? 'cancelled' : 'timeout';
  let cancel = () => {};
  const timer = setTimeout(() => expired.abort(), request.timeoutMs);
  try {
    if (signal.aborted) return interrupted();
    const cancelled = new Promise<Approval>(resolve => {
      cancel = () => resolve(interrupted());
      signal.addEventListener('abort', cancel, { once: true });
    });
    const dialog = Promise.resolve().then(async (): Promise<Approval> => {
      if (signal.aborted) return interrupted();
      if (!await request.valid()) return 'invalidated';
      if (signal.aborted) return interrupted();
      try {
        const result = await approve({ ...request, signal,
          valid: async () => !signal.aborted && performance.now() < deadline && await request.valid() });
        return signal.aborted || performance.now() >= deadline ? interrupted() : result;
      } catch { return signal.aborted ? interrupted() : 'ui-error'; }
    });
    return await Promise.race([cancelled, dialog]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
