export interface ObservationLimits { running: number; waiting: number; bytes: number; ageMs: number }
export const OBSERVATION_LIMITS: Readonly<ObservationLimits> = Object.freeze({ running: 2, waiting: 32, bytes: 1024 * 1024, ageMs: 5000 });
export type ObservationState = 'pending' | 'completed' | 'unavailable' | 'dropped' | 'cancelled';

type Job = { bytes: number; queuedAt: number; signal: AbortSignal; run: (waitMs: number) => Promise<'completed' | 'unavailable'>;
  status: (state: ObservationState, reason?: string, waitMs?: number) => void;
  started: boolean; done: boolean; waitMs: number; timer?: ReturnType<typeof setTimeout>; cancel: () => void };

/** FIFO, drop-newest scheduler. A cancelled provider never holds a slot even if it ignores abort. */
export class ObservationQueue {
  private active = new Set<Job>();
  private waiting: Job[] = [];
  private running = 0;
  private bytes = 0;
  readonly limits: Readonly<ObservationLimits>;
  readonly counts = { completed: 0, unavailable: 0, dropped: 0, cancelled: 0 };
  constructor(limits: Partial<ObservationLimits> = {}) {
    this.limits = Object.freeze({ ...OBSERVATION_LIMITS, ...limits });
    if (Object.values(this.limits).some(v => !Number.isSafeInteger(v) || v < 1) || this.limits.ageMs > 2147483647) throw new Error('invalid-observation-limits');
  }
  health() { return { running: this.running, waiting: this.waiting.length, retainedBytes: this.bytes, ...this.counts, limits: this.limits }; }
  submit(bytes: number, signal: AbortSignal, run: Job['run'], status: Job['status']): void {
    if (signal.aborted) { status('cancelled', 'host-cancelled'); this.counts.cancelled++; return; }
    if (!Number.isSafeInteger(bytes) || bytes > this.limits.bytes || this.bytes + bytes > this.limits.bytes ||
      (this.running >= this.limits.running && this.waiting.length >= this.limits.waiting)) {
      status('dropped', bytes > this.limits.bytes || this.bytes + bytes > this.limits.bytes ? 'snapshot-capacity' : 'queue-capacity');
      this.counts.dropped++; return;
    }
    const job: Job = { bytes, signal, run, status, queuedAt: Date.now(), started: false, done: false, waitMs: 0, cancel: () => {} };
    job.cancel = () => this.finish(job, 'cancelled', typeof signal.reason === 'string' ? signal.reason.slice(0, 256) : 'host-cancelled');
    this.bytes += bytes;
    this.active.add(job);
    this.waiting.push(job);
    signal.addEventListener('abort', job.cancel, { once: true });
    status('pending');
    // Pump reserves a running slot now; the provider still starts in a later microtask.
    job.timer = setTimeout(() => { if (!job.started) this.finish(job, 'dropped', 'queue-expired'); }, this.limits.ageMs);
    this.pump();
  }
  private finish(job: Job, state: Exclude<ObservationState, 'pending'>, reason?: string): void {
    if (job.done) return;
    job.done = true;
    if (job.timer) clearTimeout(job.timer);
    job.signal.removeEventListener('abort', job.cancel);
    this.active.delete(job);
    if (job.started) this.running--;
    else this.waiting.splice(this.waiting.indexOf(job), 1);
    this.bytes -= job.bytes;
    this.counts[state]++;
    job.status(state, reason, job.started ? job.waitMs : Date.now() - job.queuedAt);
    queueMicrotask(() => this.pump());
  }
  private pump(): void {
    while (this.running < this.limits.running && this.waiting.length) {
      const job = this.waiting[0]!;
      if (Date.now() - job.queuedAt >= this.limits.ageMs) { this.finish(job, 'dropped', 'queue-expired'); continue; }
      this.waiting.shift();
      job.started = true; job.waitMs = Date.now() - job.queuedAt; this.running++;
      if (job.timer) clearTimeout(job.timer);
      void Promise.resolve().then(() => job.run(job.waitMs)).then(
        state => this.finish(job, state), () => this.finish(job, 'unavailable', 'guard-error'));
    }
  }
}
