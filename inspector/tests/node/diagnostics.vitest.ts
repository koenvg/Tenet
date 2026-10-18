import { expect, test } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';

const artifacts = resolve('coverage/inspector-artifacts/playwright');
const cases = [
  ['missing', 'setup.browser', 'Headless Chromium was not started'],
  ['launch', 'setup.browser', 'LAUNCH_SENTINEL'],
  ['seed', 'setup.seed', 'SEED_SENTINEL'],
  ['navigation', 'navigation', 'NAVIGATION_SENTINEL'],
  ['callback', 'test', 'CALLBACK_SENTINEL'],
  ['original', 'test', 'CALLBACK_SENTINEL'],
  ['teardown', 'teardown', 'TEARDOWN_SENTINEL'],
  ['timeout', 'test', 'Test timeout of 20000ms exceeded'],
  ['late-server', 'setup.server', 'Test timeout of 500ms exceeded'],
  ['late-context', 'setup.context', 'Test timeout of 500ms exceeded'],
  ['late-seed', 'setup.seed', 'Test timeout of 500ms exceeded'],
  ['late-trace', 'test', 'CALLBACK_SENTINEL'],
  ['late-callback', 'test', 'Test timeout of 500ms exceeded'],
  ['reuse', 'test', 'CALLBACK_SENTINEL'],
  ['events', 'test', 'CALLBACK_SENTINEL'],
  ['bounds', 'test', 'CALLBACK_SENTINEL'],
  ['interrupted', 'test', 'Test interrupted'],
  ['success', '', ''],
] as const;

const debuggerCases = [
  ['launch', 'setup.browser', 'LAUNCH_SENTINEL'],
  ['seed', 'setup.seed', 'SEED_SENTINEL'],
  ['navigation', 'navigation', 'NAVIGATION_SENTINEL'],
  ['callback', 'test', 'CALLBACK_SENTINEL'],
  ['original', 'test', 'CALLBACK_SENTINEL'],
  ['context-close', 'teardown', 'CONTEXT_SENTINEL'],
  ['teardown', 'teardown', 'TEARDOWN_SENTINEL'],
  ['timeout', 'test', 'Test timeout of 20000ms exceeded'],
  ['late-browser', 'setup.browser', 'Fixture "debuggerSuite" timeout of 30000ms exceeded during setup.'],
  ['late-seed', 'setup.seed', 'Fixture "debuggerSuite" timeout of 30000ms exceeded during setup.'],
  ['guard', 'test', 'non-local requests must not leave this test'],
  ['pageerror', 'test', 'uncaught browser errors must not leave this test'],
  ['late-guard', 'teardown', 'non-local requests must not leave this test'],
  ['late-pageerror', 'teardown', 'uncaught browser errors must not leave this test'],
  ['success', '', ''],
] as const;
for (const [target, modes] of [['integration', cases], ['debugger', debuggerCases]] as const)
for (const [mode, phase, message] of modes) test(`${target} fixture diagnostics retain ${mode} evidence and release owned resources`, async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'tenet-diagnostic-regression-')));
  const name = `regression-${mode}-${randomUUID()}`;
  const bun = execFileSync('which', ['bun'], { encoding: 'utf8' }).trim();
  await mkdir(join(home, 'bin'));
  await writeFile(join(home, 'bin/bun'), `#!/bin/sh\nexec ${JSON.stringify(bun)} --no-env-file "$@"\n`, { mode: 0o700 });
  let output = '';
  const before = new Set(await readdir(artifacts).catch(() => []));
  try {
    const child = spawn(process.execPath, ['node_modules/playwright/cli.js', 'test', '--config', 'inspector/tests/diagnostics/child.config.ts'], {
      cwd: resolve('.'),
      env: {
        PATH: `${home}/bin:${process.env.PATH}`, HOME: home, TMPDIR: '/tmp', CI: '1',
        ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH } : {}),
        TENET_DIAGNOSTIC_TARGET: target, TENET_DIAGNOSTIC_CASE: mode, TENET_DIAGNOSTIC_NAME: name,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-128_000); });
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-128_000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
    let interrupted = false;
    const interrupt = mode === 'interrupted' ? setInterval(() => {
      void readFile(join(home, 'ready')).then(() => {
        if (!interrupted) { interrupted = true; child.kill('SIGINT'); }
      }, () => {});
    }, 50) : undefined;
    const started = Date.now();
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }).finally(() => { clearTimeout(timer); clearInterval(interrupt); });
    expect(code, output).toBe(mode === 'success' ? 0 : mode === 'interrupted' ? 130 : 1);
    if (message && mode !== 'interrupted') expect(output).toContain(message);
    if (mode === 'timeout') expect(Date.now() - started).toBeGreaterThanOrEqual(20_000);
    if (mode === 'interrupted') expect(interrupted).toBe(true);
    expect(output).not.toContain('Unhandled Rejection');
    const failures = (await readdir(artifacts).catch(() => [])).filter(file => !before.has(file) && file.startsWith('failure-') && (target === 'debugger' || file.includes(name) || (mode === 'launch' && file.includes('browser-launch'))));
    if (mode === 'success') expect(failures).toEqual([]);
    else {
      expect(failures, output).toHaveLength(1);
      const failure = join(artifacts, failures[0]!);
      const report = JSON.parse(await readFile(join(failure, 'report.json'), 'utf8'));
      expect(report.version).toBe(1);
      expect(report.failure.phase).toBe(phase);
      expect(report.failure.message).toContain(message);
      expect(report.timeline[0]).toMatchObject({ kind: 'phase', phase: 'setup.browser' });
      expect(report.timeline.every((entry: { wallTime: string; elapsedMs: number }) => !Number.isNaN(Date.parse(entry.wallTime)) && entry.elapsedMs >= 0)).toBe(true);
      if (target === 'integration') {
        expect(report.cleanup.some((entry: { outcome: string }) => entry.outcome === 'pending')).toBe(['timeout', 'interrupted'].includes(mode));
        if (mode === 'late-trace') expect(report.cleanup.every((entry: { outcome: string }) => entry.outcome === 'closed')).toBe(true);
        if (['callback', 'original', 'bounds', 'timeout', 'teardown'].includes(mode)) {
          expect(report.browser.connected).toBe(true);
          expect(report.health.status).toBe(200);
          expect(report.timeline.some((entry: { kind: string; durationMs?: number }) => entry.kind === 'response' && typeof entry.durationMs === 'number')).toBe(true);
          if (mode !== 'bounds') expect(report.evidence.some((entry: { kind: string; outcome: string }) => entry.kind === 'trace' && entry.outcome === 'saved')).toBe(true);
        }
        if (mode === 'original') {
          expect(report.cleanup.some((entry: { error?: string }) => entry.error?.includes('TEARDOWN_SENTINEL'))).toBe(true);
          expect(report.omissions.some((entry: string) => entry.includes('SCREENSHOT_SENTINEL'))).toBe(true);
          expect(report.cleanup.some((entry: { error?: string }) => entry.error?.includes('CONTEXT_SENTINEL'))).toBe(true);
        }
        if (mode === 'bounds') {
          expect(report.timeline.length).toBeLessThanOrEqual(400);
          expect(report.droppedEvents).toBeGreaterThan(0);
          expect(report.omissions.join(' ')).toContain('page limit');
          expect(report.omissions.join(' ')).toContain('trace storage budget exceeded');
          expect(report.evidence).toContainEqual({ kind: 'trace', outcome: 'omitted' });
          expect(report.truncatedStrings).toBeGreaterThan(0);
          expect((await stat(join(failure, 'report.json'))).size).toBeLessThan(1_000_000);
        }
        if (mode === 'events') {
          expect(report.timeline.some((entry: { kind: string; detail?: string }) => entry.kind === 'console' && entry.detail?.includes('SYNTHETIC_CONSOLE'))).toBe(true);
          expect(report.timeline.some((entry: { kind: string; detail?: string }) => entry.kind === 'pageerror' && entry.detail?.includes('PAGE_ERROR_SENTINEL'))).toBe(true);
          expect(report.timeline.some((entry: { kind: string; durationMs?: number }) => entry.kind === 'requestfailed' && typeof entry.durationMs === 'number')).toBe(true);
          expect(JSON.stringify(report)).not.toMatch(/HEADER_SENTINEL|COOKIE_SENTINEL|QUERY_SENTINEL/);
          const entries = unzipSync(await readFile(join(failure, 'trace.zip')));
          expect(Object.keys(entries).some(name => name.endsWith('.network'))).toBe(false);
          expect(strFromU8(entries['trace.trace']!)).not.toMatch(/HEADER_SENTINEL|COOKIE_SENTINEL|QUERY_SENTINEL/);
        }
        if (mode === 'reuse') expect(report.evidence).toContainEqual({ kind: 'trace', outcome: 'saved', file: 'trace.zip' });
      } else {
        expect(report.cleanup.some((entry: { outcome: string }) => entry.outcome === 'pending')).toBe(['late-browser', 'late-seed'].includes(mode));
        if (['navigation', 'callback', 'original', 'context-close', 'timeout', 'guard', 'pageerror', 'late-guard', 'late-pageerror'].includes(mode)) {
          expect(report.browser.connected).toBe(true);
          expect(report.health.status).toBe(200);
          expect(report.evidence).toContainEqual({ kind: 'trace', outcome: 'saved', file: 'trace.zip' });
        }
        if (['guard', 'late-guard'].includes(mode)) expect(JSON.stringify(report)).not.toContain('QUERY_SENTINEL');
        if (['pageerror', 'late-pageerror'].includes(mode)) expect(report.timeline.some((entry: { kind: string; detail?: string }) => entry.kind === 'pageerror' && entry.detail?.includes('PAGE_ERROR_SENTINEL'))).toBe(true);
        if (mode === 'original') {
          expect(report.failure.message).not.toContain('CONTEXT_SENTINEL');
          expect(report.cleanup.some((entry: { error?: string }) => entry.error?.includes('CONTEXT_SENTINEL'))).toBe(true);
          expect(report.omissions.join(' ')).toContain('SCREENSHOT_SENTINEL');
        }
      }
    }
    const runnerFiles = await readdir(resolve('coverage/inspector-artifacts/diagnostic-runner'), { recursive: true });
    expect(runnerFiles.filter(file => file !== '.last-run.json'), 'only shared sanitized diagnostics may survive a child run').toEqual([]);
    const witness = JSON.parse(await readFile(join(home, 'witness.json'), 'utf8'));
    expect(witness.directoryExists).toBe(false);
    expect(witness.listening).toBe(false);
    expect(witness.closed).toBe(witness.contexts);
    if (!['missing', 'launch'].includes(mode)) expect(witness.disconnected).toBe(true);
    if (target === 'debugger') {
      expect(witness.tracesExist).toBe(false);
      expect(witness.launches).toBe(1);
      expect(witness.guardRequests).toEqual(['guard', 'late-guard'].includes(mode) ? [{ navigation: true, resourceType: 'document', debuggerPage: false }] : []);
      expect(witness.errorDocuments).toBe(0);
      if (mode === 'success') {
        expect(witness.seeds).toBe(1);
        expect(witness.servers).toBe(1);
        expect(witness.contexts).toBe(2);
        expect(witness.between).toEqual([
          { closed: 0, contexts: 1, directoryExists: true, listening: true },
          { closed: 1, contexts: 2, directoryExists: true, listening: true },
        ]);
      }
    }
  } finally {
    await writeFile(join(artifacts, `${name}.log`), output).catch(() => {});
    await rm(home, { recursive: true, force: true });
  }
}, 75_000);
