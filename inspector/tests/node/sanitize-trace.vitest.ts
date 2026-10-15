import { expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { diagnosticUrl } from '../diagnostics/report.js';

const run = promisify(execFile);
test('retained trace keeps snapshots/screenshots without network headers, cookies or URL credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tenet-trace-privacy-'));
  try {
    const input = join(directory, 'raw.zip'), output = join(directory, 'trace.zip');
    await writeFile(input, zipSync({
      'trace.network': strToU8(JSON.stringify({ headers: 'HEADER_SENTINEL', cookies: 'COOKIE_SENTINEL' })),
      'trace.trace': strToU8(JSON.stringify({ type: 'frame-snapshot', snapshot: { html: ['HTML', {}, 'synthetic'], frameUrl: 'http://user:PASSWORD_SENTINEL@127.0.0.1/?token=QUERY_SENTINEL#FRAGMENT_SENTINEL' },
        params: { extraHTTPHeaders: { authorization: 'HEADER_SENTINEL' }, cookies: [{ value: 'COOKIE_SENTINEL' }] } }) + '\n'),
      'resources/screen.jpeg': new Uint8Array([1, 2, 3]),
    }));
    await run(process.execPath, ['inspector/tests/diagnostics/sanitize-trace.mjs', input, output], { timeout: 3000 });
    const entries = unzipSync(await readFile(output));
    expect(Object.keys(entries).sort()).toEqual(['resources/screen.jpeg', 'trace.trace']);
    const trace = strFromU8(entries['trace.trace']!);
    expect(trace).not.toMatch(/HEADER_SENTINEL|COOKIE_SENTINEL|PASSWORD_SENTINEL|QUERY_SENTINEL|FRAGMENT_SENTINEL/);
    expect(JSON.parse(trace).snapshot).toEqual({ html: ['HTML', {}, 'synthetic'], frameUrl: 'http://127.0.0.1/' });
    expect([...entries['resources/screen.jpeg']!]).toEqual([1, 2, 3]);
    expect(diagnosticUrl('http://user:password@127.0.0.1/path?token=secret#secret')).toBe('http://127.0.0.1/path');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('trace expansion overflow fails closed instead of retaining partial evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tenet-trace-bound-'));
  try {
    const input = join(directory, 'raw.zip'), output = join(directory, 'trace.zip');
    await writeFile(input, zipSync({ 'resources/huge': new Uint8Array(25 * 1024 * 1024) }));
    await expect(run(process.execPath, ['inspector/tests/diagnostics/sanitize-trace.mjs', input, output], { timeout: 3000 })).rejects.toThrow('expanded trace limit exceeded');
    await expect(readFile(output)).rejects.toThrow('ENOENT');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
