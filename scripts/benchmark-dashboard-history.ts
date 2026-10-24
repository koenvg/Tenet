import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, readdir, rm, writeFile } from 'node:fs/promises';
import { cpus, loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { DashboardArchiveReader } from '../src/inspector/dashboard-reader.js';
import { DashboardHistoryIndex } from '../src/inspector/dashboard-history-index.js';
import { dashboardHost } from '../bb-plugin-tenet-status/dashboard-host.js';
import { dashboardHandlers } from '../bb-plugin-tenet-status/dashboard.js';
import { readPrivateFile } from '../src/recording/files.js';
import { FixtureArchiveWriter } from '../test/archive-fixture.js';
import { ruleRecording } from '../test/session-rules-fixture.js';

assert.equal(process.env.TYPESAFE_API_KEY, undefined, 'Run in the disposable focused-check environment from CONTRIBUTING.md');
const base = process.env.TENET_BENCH_BASE ?? 'b2ec5a980452804548ff41d4d7b1246730939b4a';
const samples = Number(process.env.TENET_BENCH_SAMPLES ?? 5);
assert.ok(Number.isInteger(samples) && samples > 0);
const scratch = await realpath(await mkdtemp(join(tmpdir(), 'tenet-history-benchmark-')));
const report: any = { base, runtime: process.version, bun: process.versions.bun, cores: cpus().length, loadBefore: loadavg(), samples,
  scope: 'Synthetic private archives on the local filesystem. Cold means empty index, not flushed OS cache. No deployed BB transport or live authorization service.', scenarios: [] };
try {
  const root = resolve('.');
  const baseline = await build({ stdin: { contents: `export { DashboardArchiveReader } from './src/inspector/dashboard-reader.ts'; export { dashboardHost } from './bb-plugin-tenet-status/dashboard-host.ts'; export { dashboardHandlers } from './bb-plugin-tenet-status/dashboard.ts';`, resolveDir: root },
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'fixed-baseline', setup(builder) {
      builder.onLoad({ filter: /(?:dashboard-reader|dashboard-host|dashboard-contract|dashboard)\.ts$/ }, args => {
        const path = args.path.slice(root.length + 1);
        return { contents: execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' }), loader: 'ts', resolveDir: dirname(args.path) };
      });
    } }] });
  const modulePath = join(scratch, 'baseline.mjs'); await writeFile(modulePath, baseline.outputFiles[0]!.text);
  const old = await import(pathToFileURL(modulePath).href);
  for (const config of [{ invocations: 64, threads: 16, evidenceBytes: 65536 }, { invocations: 256, threads: 128, evidenceBytes: 262144 }]) {
    const archive = join(scratch, `archive-${config.invocations}`);
    const ids = Array.from({ length: config.threads }, (_, n) => `thr_${String(n).padStart(12, '0')}`);
    const writer = new FixtureArchiveWriter({ enabled: true, directory: archive });
    try {
      for (let n = 0; n < config.invocations; n++) {
        const sink = writer.bindHistorical({ sessionId: `session-${n % config.threads}`, invocationId: `inv-${n}`, callId: `call-${n}`, toolName: 'edit', cwd: '/synthetic', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: ids[n % ids.length] }, 4);
        const data = ruleRecording({ outcome: n % 10 === 0 ? 'FAIL' : 'PASS' });
        data.request = { questionVersion: 'policy-rules-v5-resolved-action', profile: 'legacy', policy: data.begin.policy,
          mapping: data.begin.policy.rules.map((rule: any) => ({ id: rule.id, outcomeKey: rule.id, evidenceKey: `${rule.id}-evidence` })),
          payload: { model: 'offline', questions: {}, state: { action: { tool: 'edit', path: '/synthetic/file.ts' }, policy: data.begin.policy,
            context: { sourceText: 'x'.repeat(config.evidenceBytes) }, trajectory: {}, integrity: data.begin.integrity } } };
        data.response = { truncated: false, bytes: Buffer.byteLength(JSON.stringify(data.assessment.assessment)), value: data.assessment.assessment };
        for (const stage of ['begin', 'request', 'response', 'validation', 'assessment', 'decision']) sink(stage as any, data[stage]);
        await writer.settle();
      }
      await writer.complete();
    } finally { await writer.close(); }
    let files = 0;
    for (const session of await readdir(archive)) files += (await readdir(join(archive, session))).filter(name => name.endsWith('.json')).length;
    const scenario: any = { ...config, files, direct: [], endToEnd: [] }; report.scenarios.push(scenario);
    async function direct(Reader: typeof DashboardArchiveReader, index?: DashboardHistoryIndex) {
      let reads = 0, bytes = 0, observations = 0, failed = 0, passed = 0, turns = 0;
      const digest = createHash('sha256');
      const read = async (root: string, path: string) => { const text = await readPrivateFile(root, path); reads++; bytes += Buffer.byteLength(text); return text; };
      const cpu = process.cpuUsage(), started = performance.now();
      const reader = new Reader(archive, new Set(ids), 'a'.repeat(64), read, index?.source(archive));
      try {
        let result;
        do {
          result = await reader.advance(); turns++;
          for (const row of result.contributions) { digest.update(JSON.stringify(row)); observations++; if (row.state === 'failed') failed++; if (row.state === 'passed') passed++; }
        } while (!result.finished && turns < 1000);
        assert.equal(result.finished, true); assert.equal(result.association, 'complete'); assert.deepEqual(result.reasons, []);
        assert.equal(observations, config.invocations * 2); assert.equal(failed, Math.ceil(config.invocations / 10)); assert.equal(passed, observations - failed);
        const cpuUsed = process.cpuUsage(cpu);
        return { ms: performance.now() - started, cpuMs: (cpuUsed.user + cpuUsed.system) / 1000, digest: digest.digest('hex'), turns, reads, bytes, observations, failed, passed };
      } finally { await reader.close(); }
    }
    for (let n = 0; n < samples; n++) {
      const index = new DashboardHistoryIndex();
      try {
        const cold = await direct(DashboardArchiveReader, index);
        const a = await direct(old.DashboardArchiveReader);
        const warm = await direct(DashboardArchiveReader, index);
        assert.equal(a.reads, files); assert.equal(warm.reads, 0);
        assert.equal(cold.digest, a.digest); assert.equal(warm.digest, a.digest);
        scenario.direct.push({ n, baseline: a, cold, warm, index: { ...index.metrics } });
      } finally { index.close(); }
    }
    for (const delay of [0, 2]) {
      const previousHost = old.dashboardHost(), currentHost = dashboardHost();
      async function endToEnd(factory: typeof dashboardHandlers, host: ReturnType<typeof dashboardHost>) {
        let archiveMs = 0, hostCalls = 0, sdkCalls = 0;
        const wait = async () => { sdkCalls++; if (delay) await new Promise(resolve => setTimeout(resolve, delay)); };
        const sdk: any = { projects: { get: async () => { await wait(); return { id: 'proj_fixture0001' }; } },
          threads: { list: async ({ archived, offset, limit }: any) => { await wait(); return archived ? [] : ids.slice(offset, offset + limit).map(id => ({ id, projectId: 'proj_fixture0001', providerId: 'pi' })); },
            get: async ({ threadId }: any) => { await wait(); return { id: threadId, projectId: 'proj_fixture0001', providerId: 'pi', environmentId: 'env_fixture0001' }; } },
          environments: { get: async () => { await wait(); return { id: 'env_fixture0001', hostId: 'host_fixture0001' }; } } };
        const owner = factory(sdk, async () => JSON.stringify({ host_fixture0001: archive }), {
          stop: token => host.stopDashboard({ token }), read: async input => {
            const started = performance.now(); hostCalls++;
            try { return await host.readDashboard(input); } finally { archiveMs += performance.now() - started; }
          },
        });
        const started = performance.now();
        let page = await owner.dashboard({ kind: 'start', scope: { kind: 'project', projectId: 'proj_fixture0001' } });
        for (let n = 0; page.next && n < 1000; n++) page = await owner.dashboard({ kind: 'advance', token: page.next });
        const ms = performance.now() - started;
        assert.equal(page.state, 'finished', JSON.stringify(page.coverage)); assert.equal(page.coverage.invocations, config.invocations); assert.equal(page.coverage.processed, ids.length);
        assert.equal(page.rows.reduce((sum, row) => sum + row.failed, 0), Math.ceil(config.invocations / 10));
        assert.equal(page.rows.reduce((sum, row) => sum + row.passed, 0), 2 * config.invocations - Math.ceil(config.invocations / 10));
        assert.deepEqual(page.coverage.reasons, []);
        await owner.dashboardStop({ token: page.run });
        return { ms, archiveMs, authorizationAndCoordinatorMs: ms - archiveMs, hostCalls, sdkCalls, digest: createHash('sha256').update(JSON.stringify(page.rows)).digest('hex') };
      }
      try {
        for (let n = 0; n <= samples; n++) {
          const a = await endToEnd(old.dashboardHandlers, previousHost);
          const b = await endToEnd(dashboardHandlers, currentHost);
          assert.equal(a.digest, b.digest);
          scenario.endToEnd.push({ n, injectedSdkDelayMs: delay, baseline: a, candidate: b, candidateCache: n === 0 ? 'cold' : 'warm' });
        }
      } finally { await previousHost.dispose(); await currentHost.dispose(); }
    }
  }
  report.loadAfter = loadavg(); report.maxRss = process.resourceUsage().maxRSS;
  console.log(JSON.stringify(report, null, 2));
} finally { await rm(scratch, { recursive: true, force: true }); }
