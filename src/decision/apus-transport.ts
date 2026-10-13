import { assessmentBudget } from './assessment-budget.js';
import { JudgeFailure } from './contracts.js';

export class NativeFailure extends JudgeFailure {
  constructor(readonly category: string, reason: 'invalid-response' | 'provider-error' = 'invalid-response') { super(reason); }
}
export const NATIVE_BODY_LIMIT = 1024 * 1024;
export const NATIVE_REQUEST_LIMIT = 8 * 1024 * 1024;

/** One budget for the entire assessment, including stalled noncooperative readers. */
export function nativeTransport(baseUrl: string, deadlineMs: number, parent: AbortSignal, fetcher: typeof fetch) {
  const budget = assessmentBudget(deadlineMs, parent);
  const { check, bounded } = budget;
  async function json(path: '/v1/models' | '/props' | '/tokenize' | '/completion', body?: Record<string, unknown>): Promise<unknown> {
    check();
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    if (serialized && Buffer.byteLength(serialized) > NATIVE_REQUEST_LIMIT) throw new NativeFailure('request-limit', 'provider-error');
    const discard = (response: Response) => { try { void response.body?.cancel().catch(() => {}); } catch { /* Best effort only. */ } };
    const response = await bounded(() => fetcher(baseUrl.replace(/\/$/, '') + path, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(serialized === undefined ? {} : { body: serialized }), signal: budget.signal,
    }).then(value => { if (budget.signal.aborted) discard(value); return value; }));
    if (!response.ok || response.redirected) { discard(response); throw new NativeFailure('http', 'provider-error'); }
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > NATIVE_BODY_LIMIT)) { discard(response); throw new NativeFailure('body-limit'); }
    if (!response.body) throw new NativeFailure('body-missing');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      for (;;) {
        const next = await bounded(() => reader.read());
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > NATIVE_BODY_LIMIT) throw new NativeFailure('body-limit');
        chunks.push(next.value);
      }
      check();
      try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { throw new NativeFailure('body-json'); }
    } finally {
      // Do not await cancellation: a backend or injected reader can ignore it.
      void reader.cancel().catch(() => {});
    }
  }
  return { json, check, signal: budget.signal, close: budget.close };
}
