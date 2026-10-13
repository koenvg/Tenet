import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparisonPlan, runComparison, type ComparisonLifecycleObserver } from '../eval/judge-prompt-comparison.js';
import { scriptedNative } from './apus-scripted.js';

test('observer starts each whole assessment before native work and ends after canonical assembly', async () => {
  const fake = scriptedNative(), events: string[] = [];
  const observer: ComparisonLifecycleObserver = {
    start(event) {
      events.push(`start:${event.side}`);
      assert.equal(fake.calls.length, event.side === 'baseline' ? 0 : 38);
      assert.equal(event.deadline.signal.aborted, false);
      event.deadline.checkDeadline();
      assert.ok(event.deadline.remainingMs() > 0 && event.deadline.remainingMs() <= 240000);
    },
    end(event) {
      events.push(`end:${event.side}:${event.status}`);
      assert.equal(event.status, 'complete'); assert.equal(event.failure, null);
      assert.equal(fake.calls.length, event.side === 'baseline' ? 38 : 76);
      event.deadline.checkDeadline();
    },
  };
  const report = await runComparison(comparisonPlan(), { scriptedFetch: fake.fetch, observer });
  assert.deepEqual(events, ['start:baseline', 'end:baseline:complete', 'start:candidate', 'end:candidate:complete']);
  assert.deepEqual(report.counts, { planned: 2, started: 2, complete: 2, failed: 0, unstarted: 0 });
  assert.equal(report.httpRequests, 76);
  assert.ok(report.rows.every(row => row.pureGates?.decision === 'ALLOW'));
});


test('failed side delivers bounded cleanup observation after assessment cancellation and leaves candidate unstarted', async () => {
  const fake = scriptedNative(), controller = new AbortController();
  const ended: string[] = [];
  const report = await runComparison(comparisonPlan(), { scriptedFetch: fake.fetch, signal: controller.signal, observer: {
    start(event) { controller.abort(); event.deadline.checkDeadline(); },
    end(event) {
      ended.push(event.side);
      assert.equal(event.status, 'failed'); assert.equal(event.failure, 'cancelled');
      assert.equal(event.deadline.signal.aborted, false);
      event.deadline.checkDeadline(); assert.ok(event.deadline.remainingMs() <= 10000);
    },
  } });
  assert.deepEqual(ended, ['baseline']); assert.equal(fake.calls.length, 0);
  assert.deepEqual(report.counts, { planned: 2, started: 1, complete: 0, failed: 1, unstarted: 1 });
  assert.equal(report.rows[1]!.status, 'unstarted');
});


for (const stage of ['start', 'end'] as const) test(`observer ${stage} control failure is not provider success and stops later work`, async () => {
  const fake = scriptedNative(), ended: string[] = [];
  const report = await runComparison(comparisonPlan(), { scriptedFetch: fake.fetch, observer: {
    start() { if (stage === 'start') throw Error('SYNTHETIC-control-not-provider'); },
    end(event) { ended.push(event.status); if (stage === 'end') throw Error('SYNTHETIC-control-not-provider'); },
  } });
  assert.equal(report.rows[0]!.failure, `observer-${stage}-failed`);
  assert.equal(report.rows[0]!.pureGates, null); assert.equal(report.rows[0]!.labels, null);
  assert.equal(report.rows[1]!.status, 'unstarted'); assert.equal(fake.calls.length, stage === 'start' ? 0 : 38);
  assert.deepEqual(ended, [stage === 'start' ? 'failed' : 'complete']);
});


test('async observer admission shares the original absolute side deadline and cannot reset it', async () => {
  const { performance } = await import('node:perf_hooks');
  const descriptor = Object.getOwnPropertyDescriptor(performance, 'now'); let clock = 0;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
  try {
    const fake = scriptedNative(), failures: string[] = [];
    const report = await runComparison(comparisonPlan(), { scriptedFetch: fake.fetch, observer: {
      async start(event) { assert.ok(Object.isFrozen(event.deadline)); await Promise.resolve(); clock = 240001; },
      end(event) { failures.push(event.failure!); assert.equal(event.status, 'failed'); assert.equal(event.deadline.signal.aborted, false); },
    } });
    assert.equal(report.rows[0]!.failure, 'timeout'); assert.equal(report.rows[1]!.status, 'unstarted');
    assert.deepEqual(failures, ['timeout']); assert.equal(fake.calls.length, 0);
  } finally { if (descriptor) Object.defineProperty(performance, 'now', descriptor); else Reflect.deleteProperty(performance, 'now'); }
});

test('delegated clock check after asynchronous supervision denies expired actual submission', async () => {
  const { performance } = await import('node:perf_hooks');
  const descriptor = Object.getOwnPropertyDescriptor(performance, 'now'); let clock = 0;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
  try {
    const fake = scriptedNative(); let deadline: Parameters<ComparisonLifecycleObserver['start']>[0]['deadline'];
    const fetcher: typeof fetch = async (url, init) => {
      await Promise.resolve(); clock = 240001;
      assert.throws(() => deadline.remainingMs(), /timeout/);
      deadline.checkDeadline(); return fake.fetch(url, init);
    };
    const report = await runComparison(comparisonPlan(), { scriptedFetch: fetcher, observer: {
      start(event) { deadline = event.deadline; }, end() {},
    } });
    assert.equal(fake.calls.length, 0); assert.equal(report.rows[0]!.failure, 'timeout'); assert.equal(report.rows[1]!.status, 'unstarted');
  } finally { if (descriptor) Object.defineProperty(performance, 'now', descriptor); else Reflect.deleteProperty(performance, 'now'); }
});

test('cancelled stalled observer setup cannot continue the assessment', async () => {
  const controller = new AbortController(), fake = scriptedNative(); let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const pending = runComparison(comparisonPlan(), { scriptedFetch: fake.fetch, signal: controller.signal, observer: {
    start() { entered(); return new Promise<void>(() => {}); }, end(event) { assert.equal(event.status, 'failed'); },
  } });
  await started; controller.abort(); const report = await pending;
  assert.equal(report.rows[0]!.failure, 'cancelled'); assert.equal(report.rows[1]!.status, 'unstarted'); assert.equal(fake.calls.length, 0);
});

test('observer cannot grant absent approval or start pre-cancelled work', async () => {
  let calls = 0; const observer: ComparisonLifecycleObserver = { start() { calls++; }, end() { calls++; } };
  const denied = await runComparison(comparisonPlan(), { observer });
  const controller = new AbortController(); controller.abort();
  const cancelled = await runComparison(comparisonPlan(), { scriptedFetch: scriptedNative().fetch, observer, signal: controller.signal });
  assert.equal(calls, 0); assert.equal(denied.counts.unstarted, 2); assert.equal(cancelled.counts.unstarted, 2);
});


test('end control work remains inside the full side deadline after native scoring completes', async () => {
  const { performance } = await import('node:perf_hooks');
  const descriptor = Object.getOwnPropertyDescriptor(performance, 'now'); let clock = 0;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
  try {
    const fake = scriptedNative();
    const report = await runComparison(comparisonPlan(), { scriptedFetch: fake.fetch, observer: {
      start() {}, async end() { await Promise.resolve(); clock = 240001; },
    } });
    assert.equal(fake.calls.length, 38); assert.equal(report.rows[0]!.failure, 'timeout');
    assert.equal(report.rows[0]!.pureGates, null); assert.equal(report.rows[1]!.status, 'unstarted');
  } finally { if (descriptor) Object.defineProperty(performance, 'now', descriptor); else Reflect.deleteProperty(performance, 'now'); }
});

test('failed cleanup is reported rather than turning a cancelled side into completion', async () => {
  const fake = scriptedNative(), controller = new AbortController();
  const report = await runComparison(comparisonPlan(), { scriptedFetch: fake.fetch, signal: controller.signal, observer: {
    start() { controller.abort(); }, end() { throw Error('SYNTHETIC-stop-unproven'); },
  } });
  assert.equal(report.rows[0]!.failure, 'cancelled:observer-cleanup-failed');
  assert.equal(report.rows[0]!.status, 'failed'); assert.equal(report.rows[1]!.status, 'unstarted'); assert.equal(fake.calls.length, 0);
});
