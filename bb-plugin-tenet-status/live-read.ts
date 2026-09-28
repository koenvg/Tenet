/** A hung host read must not leave an old result looking current. */
export function liveRead<T>(read: Promise<T>, signal?: AbortSignal, timeoutMs = 8_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new Error('read-unavailable')); };
    const timer = setTimeout(abort, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    read.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
