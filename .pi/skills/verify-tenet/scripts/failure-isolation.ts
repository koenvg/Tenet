import assert from 'node:assert/strict';
import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startInspector } from '../../../../src/inspector/server.js';
import { closeBrowser, launchBrowser, withInspector } from '../../../../inspector/tests/integration/fixture.js';
import { seedSessionRules, ruleSessionLink } from '../../../../inspector/tests/integration/session-rules-fixture.js';

export async function verifyFailureIsolation() {
  const evidence = process.env.TENET_VERIFY_EVIDENCE!;
  assert.equal(process.cwd(), evidence, 'failure artifacts must stay in the owned evidence directory');
  const dotenv = join(evidence, '.env');
  const probe = join(evidence, 'sanitizer-probe.mjs');
  const witness = join(evidence, 'sanitizer-witness.json');
  const originalExecutable = process.execPath;
  const report: Record<string, unknown> = { passed: false };
  let origin: string | undefined;
  let archive: string | undefined;
  let verified = false;
  await writeFile(dotenv, 'TENET_VERIFY_DOTENV_CANARY=must-not-load\n', { flag: 'wx' });
  try {
    await writeFile(probe, `#!${originalExecutable}
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
writeFileSync(${JSON.stringify(witness)}, JSON.stringify({ runtime: process.versions.bun ? 'bun' : 'node', dotenvCanary: process.env.TENET_VERIFY_DOTENV_CANARY ?? null }));
const target = process.argv[2];
process.argv.splice(1, 1);
await import(pathToFileURL(target).href);
`, { mode: 0o700, flag: 'wx' });
    await launchBrowser();
    await assert.rejects(withInspector({ signal: new AbortController().signal, onFinish() {} }, {
      start: options => startInspector({ ...options, assets: fileURLToPath(new URL('../../../../inspector/dist', import.meta.url)) }),
    }, 'verify-isolation', async ({ app, directory, page }) => {
      origin = app.origin;
      archive = directory;
      const status = await page.request.get('/api/status');
      assert.equal(status.status(), 200);
      assert.match((await status.json()).reader.build, /^tenet-reader-0\.1\.0\/assets-[a-f0-9]{12}$/);
      console.log(`Doctor passed before owned failure probe ${origin}`);
      process.execPath = probe;
      throw new Error('synthetic verification failure');
    }, { base: false, seed: seedSessionRules, path: ruleSessionLink() }), /synthetic verification failure/);
    process.execPath = originalExecutable;
    report.sanitizer = JSON.parse(await readFile(witness, 'utf8'));
    assert.deepEqual(report.sanitizer, { runtime: 'node', dotenvCanary: null });
    const diagnostics = join(evidence, 'coverage/inspector-artifacts/playwright');
    const failures = (await readdir(diagnostics)).filter(name => name.startsWith('failure-verify-isolation-'));
    assert.equal(failures.length, 1);
    const diagnostic = JSON.parse(await readFile(join(diagnostics, failures[0]!, 'report.json'), 'utf8'));
    assert.ok(diagnostic.evidence.some((item: { kind: string; outcome: string }) => item.kind === 'trace' && item.outcome === 'saved'), 'actual sanitizer must complete');
    await assert.rejects(stat(archive!), { code: 'ENOENT' });
    report.archiveRemoved = true;
    verified = true;
  } finally {
    process.execPath = originalExecutable;
    try {
      await closeBrowser();
      if (origin) {
        await assert.rejects(fetch(`${origin}/api/status`, { signal: AbortSignal.timeout(1000) }));
        report.serverClosed = true;
      }
      report.passed = verified;
    } finally {
      await rm(dotenv, { force: true });
      await rm(probe, { force: true });
      await writeFile(join(evidence, 'failure-isolation.json'), JSON.stringify(report, null, 2) + '\n');
    }
  }
}
