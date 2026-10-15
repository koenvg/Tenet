import { mkdtemp, mkdir, readdir, rm, stat, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Page, Request } from 'playwright';

export type FixturePhase = 'setup.browser' | 'setup.archive' | 'setup.seed' | 'setup.server' | 'setup.context' | 'navigation' | 'test' | 'teardown';
type Event = { wallTime: string; elapsedMs: number; phase: FixturePhase; kind: string; detail?: string; url?: string; durationMs?: number; status?: number; page?: string };
type Evidence = { kind: 'trace' | 'screenshot'; outcome: 'saved' | 'omitted'; file?: string };
export type FixtureDiagnosticReport = {
  version: 1;
  testName: string;
  startedAt: string;
  finishedAt?: string;
  failure?: { phase: FixturePhase; message: string };
  timeline: Event[];
  droppedEvents: number;
  truncatedStrings: number;
  droppedOmissions: number;
  omissions: string[];
  browser: { connected: boolean; pages: Array<{ url: string; closed: boolean }>; omittedPages: number };
  health?: { url: string; status?: number; durationMs: number; error?: string };
  evidence: Evidence[];
  cleanup: Array<{ resource: string; outcome: 'closed' | 'failed' | 'pending'; error?: string }>;
};

export const diagnosticLimits = { events: 400, string: 1024, pages: 3, operationMs: 1500, traceMs: 15_000, traceBytes: 12 * 1024 * 1024 };
const artifacts = resolve('coverage/inspector-artifacts/playwright');
export const errorText = (error: unknown) => error instanceof Error || (typeof error === 'object' && error !== null && 'message' in error) ? String(error.message) : String(error);
export function diagnosticUrl(value: string) {
  try { const url = new URL(value); return `${url.origin}${url.pathname}`.slice(0, diagnosticLimits.string); }
  catch { return value.slice(0, diagnosticLimits.string); }
}

export async function bounded<T>(operation: () => Promise<T>, ms = diagnosticLimits.operationMs): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(operation), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`operation exceeded ${ms}ms; completion unverified`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}

// The browser owns this store. A fixture may clear it only after the last tracing context releases it.
export class TraceStore {
  private active = new Set<FixtureDiagnostics>();
  constructor(readonly directory: string) {}
  private idleCleanup: Promise<void> = Promise.resolve();
  async lease(owner: FixtureDiagnostics) { await (this.idleCleanup = this.idleCleanup.then(async () => { this.active.add(owner); await mkdir(this.directory, { recursive: true }); })); }
  async release(owner: FixtureDiagnostics) {
    await (this.idleCleanup = this.idleCleanup.then(async () => {
      this.active.delete(owner);
      if (!this.active.size) await rm(this.directory, { recursive: true, force: true });
    }));
  }
  async overBudget() {
    let bytes = 0, files = 0;
    const visit = async (directory: string): Promise<boolean> => {
      for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
        if (++files > 512) return true;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) { if (await visit(path)) return true; }
        else if (entry.isFile()) bytes += (await stat(path).catch(() => ({ size: 0 }))).size;
        if (bytes > diagnosticLimits.traceBytes) return true;
      }
      return false;
    };
    return visit(this.directory);
  }
}

export class FixtureDiagnostics {
  readonly report: FixtureDiagnosticReport;
  readonly cancellation = new AbortController();
  private started = performance.now();
  private phase: FixturePhase = 'setup.browser';
  private stopping = false;
  private finished?: Promise<unknown>;
  private resources: Array<{ name: string; close: () => Promise<void> }> = [];
  private pending = new Map<Promise<unknown>, string>();
  private browser?: Browser;
  private context?: BrowserContext;
  private origin?: string;
  private scratch?: string;
  private trace?: { store: TraceStore; stop: () => Promise<void>; timer: ReturnType<typeof setTimeout>; monitor: ReturnType<typeof setInterval> };
  private removeAbort?: () => void;
  constructor(testName: string, signal?: AbortSignal, browser?: Browser) {
    this.browser = browser;
    this.report = { version: 1, testName: testName.slice(0, 160), startedAt: new Date().toISOString(), timeline: [], droppedEvents: 0, truncatedStrings: 0,
      droppedOmissions: 0, omissions: [], browser: { connected: false, pages: [], omittedPages: 0 }, evidence: [], cleanup: [] };
    this.enter('setup.browser');
    if (signal) {
      const abort = () => { this.fail(signal.reason); this.cancellation.abort(signal.reason); };
      signal.addEventListener('abort', abort, { once: true });
      this.removeAbort = () => signal.removeEventListener('abort', abort);
      if (signal.aborted) abort();
    }
  }
  text(value: string) {
    value = value.replace(/https?:\/\/[^\s"'<>`\\)]+/g, diagnosticUrl);
    if (value.length > diagnosticLimits.string) { this.report.truncatedStrings++; return `${value.slice(0, diagnosticLimits.string - 12)}...[omitted]`; }
    return value;
  }
  omit(detail: string) { if (this.report.omissions.length < 40) this.report.omissions.push(this.text(detail)); else this.report.droppedOmissions++; }
  event(kind: string, data: Partial<Event> = {}) {
    const limit = kind === 'phase' ? diagnosticLimits.events : diagnosticLimits.events - 40;
    if (this.report.timeline.length >= limit) { this.report.droppedEvents++; return; }
    this.report.timeline.push({ kind, phase: this.phase, wallTime: new Date().toISOString(), elapsedMs: Math.round(performance.now() - this.started), ...data });
  }
  enter(phase: FixturePhase) { this.check(); this.phase = phase; this.event('phase'); }
  check() { if (this.stopping || this.cancellation.signal.aborted) throw this.cancellation.signal.reason ?? new Error('Fixture is already finished'); }
  fail(error: unknown) { this.report.failure ??= { phase: this.phase, message: this.text(errorText(error)) }; }
  own(name: string, close: () => Promise<void>) { this.resources.push({ name, close }); }
  async wait<T>(operation: Promise<T>): Promise<T> {
    void operation.catch(() => {});
    this.check();
    const signal = this.cancellation.signal;
    let abort: () => void = () => {};
    try {
      return await Promise.race([operation, new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      })]);
    } finally { signal.removeEventListener('abort', abort); }
  }
  async prepare<T>(operation: Promise<T>, cleanLateWrites: () => Promise<void>) {
    const tracked = operation.finally(async () => {
      if (this.stopping || this.cancellation.signal.aborted) await this.cleanup('late archive preparation', cleanLateWrites);
    });
    this.pending.set(tracked, 'archive preparation');
    tracked.then(() => this.pending.delete(tracked), () => this.pending.delete(tracked));
    return this.wait(tracked);
  }
  async acquire<T>(name: string, create: () => Promise<T>, close: (value: T) => Promise<void>): Promise<T> {
    this.check();
    const operation = Promise.resolve().then(create).then(async value => {
      if (this.stopping || this.cancellation.signal.aborted) {
        await this.cleanup(name, () => close(value));
        throw this.cancellation.signal.reason ?? new Error('Fixture finished during acquisition');
      }
      this.own(name, () => close(value));
      return value;
    });
    this.pending.set(operation, name);
    operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation));
    return this.wait(operation);
  }
  server(origin: string) { this.origin = origin; }
  async observe(browser: Browser, context: BrowserContext, origin: string, store: TraceStore) {
    this.browser = browser; this.context = context; this.origin = origin;
    const requests = new WeakMap<Request, number>();
    const watchPage = (page: Page) => {
      if (context.pages().indexOf(page) >= 8) { this.omit('page event listener limit 8'); return; }
      page.on('console', message => this.event('console', { detail: this.text(`${message.type()}: ${message.text()}`), page: diagnosticUrl(page.url()) }));
      page.on('pageerror', error => this.event('pageerror', { detail: this.text(error.message), page: diagnosticUrl(page.url()) }));
      page.on('crash', () => this.event('crash', { page: diagnosticUrl(page.url()) }));
    };
    context.on('page', watchPage);
    context.on('request', request => { requests.set(request, performance.now()); this.event('request', { url: diagnosticUrl(request.url()), detail: request.method() }); });
    context.on('response', response => this.event('response', { url: diagnosticUrl(response.url()), status: response.status(), durationMs: Math.round(performance.now() - (requests.get(response.request()) ?? performance.now())) }));
    context.on('requestfinished', request => this.event('requestfinished', { url: diagnosticUrl(request.url()), durationMs: Math.round(performance.now() - (requests.get(request) ?? performance.now())) }));
    context.on('requestfailed', request => this.event('requestfailed', { url: diagnosticUrl(request.url()), detail: this.text(request.failure()?.errorText ?? 'unknown'), durationMs: Math.round(performance.now() - (requests.get(request) ?? performance.now())) }));
    browser.on('disconnected', this.disconnected);
    try {
      this.scratch = await this.acquire('diagnostic scratch', () => mkdtemp(join(tmpdir(), 'tenet-inspector-evidence-')), path => rm(path, { recursive: true, force: true }));
      await store.lease(this);
      this.check();
      const starting = context.tracing.start({ snapshots: true, screenshots: true, sources: false });
      let stopped: Promise<void> | undefined;
      const stop = () => stopped ??= bounded(async () => {
        await starting;
        await context.tracing.stop({ path: join(this.scratch!, 'raw-trace.zip') });
      }).catch(error => { this.omit(`trace stop: ${errorText(error)}`); });
      const timer = setTimeout(() => { this.omit(`trace lifetime limit ${diagnosticLimits.traceMs}ms; later actions omitted`); void stop(); }, diagnosticLimits.traceMs);
      let checking = false;
      const monitor = setInterval(() => {
        if (checking) return;
        checking = true;
        void bounded(() => store.overBudget()).then(over => {
          if (over) { this.omit('trace storage budget exceeded; trace omitted'); void stop(); }
        }, error => { this.omit(`trace budget inspection: ${errorText(error)}`); void stop(); }).finally(() => { checking = false; });
      }, 250);
      this.trace = { store, stop, timer, monitor };
      await this.wait(bounded(() => starting));
    } catch (error) {
      this.omit(`trace start: ${errorText(error)}`);
      if (!this.trace) await store.release(this).catch(error => this.omit(errorText(error)));
    }
  }
  private disconnected = () => this.event('browser-disconnected');
  private async cleanup(resource: string, close: () => Promise<void>) {
    try { await bounded(close); this.report.cleanup.push({ resource, outcome: 'closed' }); }
    catch (error) { this.report.cleanup.push({ resource, outcome: 'failed', error: this.text(errorText(error)) }); this.fail(error); return error; }
  }
  finish(error?: unknown): Promise<unknown> {
    if (error !== undefined) this.fail(error);
    return this.finished ??= this.finalize();
  }
  private async finalize() {
    this.stopping = true;
    let cleanupError: unknown;
    try {
      if (this.pending.size) {
        await bounded(() => Promise.allSettled([...this.pending.keys()])).catch(error => this.omit(`late acquisition: ${errorText(error)}`));
        for (const name of this.pending.values()) this.report.cleanup.push({ resource: name, outcome: 'pending' });
      }
      const pages = this.context?.pages() ?? [];
      this.report.browser = { connected: this.browser?.isConnected() ?? false,
        pages: pages.slice(0, diagnosticLimits.pages).map(page => ({ url: diagnosticUrl(page.url()), closed: page.isClosed() })), omittedPages: Math.max(0, pages.length - diagnosticLimits.pages) };
      if (pages.length > diagnosticLimits.pages) this.omit(`page limit ${diagnosticLimits.pages}; omitted ${pages.length - diagnosticLimits.pages} pages`);
      if (this.origin) {
        const started = performance.now(), url = `${this.origin}/api/status`;
        try {
          const response = await bounded(() => fetch(url, { signal: AbortSignal.timeout(diagnosticLimits.operationMs) }));
          this.report.health = { url, status: response.status, durationMs: Math.round(performance.now() - started) };
          await bounded(async () => { await response.body?.cancel(); });
        } catch (error) { this.report.health = { url, durationMs: Math.round(performance.now() - started), error: this.text(errorText(error)) }; }
      }
      if (this.trace) {
        clearTimeout(this.trace.timer); clearInterval(this.trace.monitor);
        await this.trace.stop();
      }
      if (this.report.failure && this.scratch) {
        await Promise.all(pages.slice(0, diagnosticLimits.pages).map(async (page, index) => {
          try {
            const buffer = await bounded(() => page.screenshot({ timeout: diagnosticLimits.operationMs, type: 'png' }));
            if (buffer.byteLength > 2 * 1024 * 1024) { this.omit(`screenshot ${index} exceeds byte limit`); return; }
            await bounded(() => writeFile(join(this.scratch!, `page-${index}.png`), buffer));
            this.report.evidence.push({ kind: 'screenshot', outcome: 'saved', file: `page-${index}.png` });
          } catch (error) { this.omit(`screenshot ${index}: ${errorText(error)}`); }
        }));
      }
    } catch (error) {
      this.omit(`diagnostic capture: ${errorText(error)}`);
    }
    this.phase = 'teardown'; this.event('phase');
    for (const resource of this.resources.filter(resource => resource.name !== 'diagnostic scratch').reverse()) {
      const error = await this.cleanup(resource.name, resource.close);
      cleanupError ??= error;
    }
    try {
      if (this.report.failure) {
        if (!this.report.evidence.some(item => item.kind === 'screenshot')) this.omit('screenshots unavailable; teardown or setup failed without a capturable page');
        await this.retain();
      }
    } catch (error) {
      console.error(`Inspector diagnostics incomplete for ${this.report.testName}: ${this.text(errorText(error))}`);
    } finally {
      this.removeAbort?.();
      this.browser?.off('disconnected', this.disconnected);
      if (this.trace) { clearTimeout(this.trace.timer); clearInterval(this.trace.monitor); await bounded(() => this.trace!.store.release(this)).catch(() => {}); }
      if (this.scratch) await bounded(() => rm(this.scratch!, { recursive: true, force: true })).catch(() => {});
    }
    return cleanupError;
  }
  private async retain() {
    await bounded(() => mkdir(artifacts, { recursive: true }));
    const name = this.report.testName.replace(/[^a-z0-9-]+/gi, '-').slice(0, 100);
    const failure = await bounded(() => mkdtemp(join(artifacts, `failure-${name}-`)));
    if (this.scratch) {
      for (const item of this.report.evidence) if (item.file) await bounded(() => copyFile(join(this.scratch!, item.file!), join(failure, item.file!))).catch(error => { item.outcome = 'omitted'; this.omit(errorText(error)); });
      try {
        if (this.report.omissions.some(item => item.includes('trace storage budget exceeded'))) throw new Error('trace storage budget exceeded');
        await this.sanitizeTrace(join(this.scratch, 'raw-trace.zip'), join(failure, 'trace.zip'));
        this.report.evidence.push({ kind: 'trace', outcome: 'saved', file: 'trace.zip' });
        this.omit('trace network entries, header/cookie fields and URL credentials omitted for privacy');
      } catch (error) { this.report.evidence.push({ kind: 'trace', outcome: 'omitted' }); this.omit(`trace export: ${errorText(error)}`); }
    } else {
      this.report.evidence.push({ kind: 'trace', outcome: 'omitted' });
      this.omit('trace unavailable before browser context setup');
    }
    this.report.finishedAt = new Date().toISOString();
    await bounded(() => writeFile(join(failure, 'report.json'), JSON.stringify(this.report, null, 2)));
    console.error(`Inspector diagnostic report: ${join(failure, 'report.json')}`);
  }
  private async sanitizeTrace(input: string, output: string) {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./sanitize-trace.mjs', import.meta.url)), input, output], { stdio: ['ignore', 'ignore', 'pipe'], env: { PATH: process.env.PATH } });
    let detail = '';
    child.stderr.on('data', chunk => { detail = (detail + chunk).slice(-1024); });
    try {
      await bounded(() => new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`trace sanitizer failed (${code}): ${detail}`)));
      }));
    } catch (error) { child.kill('SIGKILL'); await bounded(() => rm(output, { force: true })).catch(() => {}); throw error; }
  }
}
