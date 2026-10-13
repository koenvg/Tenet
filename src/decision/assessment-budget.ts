import { performance } from 'node:perf_hooks';
import { JudgeFailure } from './contracts.js';

/** One deadline and cancellation boundary, including noncooperative provider work. */
export function assessmentBudget(deadlineMs: number, parent: AbortSignal) {
  const controller = new AbortController();
  const end = performance.now() + deadlineMs;
  let failure: JudgeFailure | undefined;
  const abort = (reason: 'cancelled' | 'timeout') => { failure ??= new JudgeFailure(reason); controller.abort(); };
  const cancelled = () => abort('cancelled');
  parent.addEventListener('abort', cancelled, { once: true });
  if (parent.aborted) cancelled();
  const timer = setTimeout(() => abort('timeout'), deadlineMs);
  const check = () => {
    if (parent.aborted) cancelled();
    if (performance.now() >= end) abort('timeout');
    if (failure) throw failure;
  };
  async function bounded<T>(work: () => Promise<T>): Promise<T> {
    check();
    let stop = () => {};
    try {
      const interrupted = new Promise<never>((_resolve, reject) => {
        stop = () => reject(failure ?? new JudgeFailure('cancelled'));
        controller.signal.addEventListener('abort', stop, { once: true });
      });
      const result = await Promise.race([interrupted, Promise.resolve().then(() => { check(); return work(); })]);
      check();
      return result;
    } finally { controller.signal.removeEventListener('abort', stop); }
  }
  return { check, bounded, signal: controller.signal, remaining: () => { check(); return end - performance.now(); },
    close: () => { clearTimeout(timer); parent.removeEventListener('abort', cancelled); } };
}
