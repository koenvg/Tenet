#!/usr/bin/env node
import assert from 'node:assert/strict';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8080');
assert(['http:', 'https:'].includes(base.protocol), 'Expected an HTTP(S) base URL');
const assets = new Map([
  ['/fonts/Geist-latin.woff2', 'font/woff2'],
  ['/fonts/OFL-Geist.txt', 'text/plain'],
  ['/THIRD_PARTY_NOTICES.txt', 'text/plain'],
]);
let checks = 0;

async function request(path, status, type) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, status, `${path}: HTTP status`);
  assert.equal(new URL(response.url).origin, base.origin, `${path}: unexpected redirect origin`);
  if (type) assert.equal(response.headers.get('content-type')?.split(';')[0], type, `${path}: content type`);
  checks++;
  return response;
}

try {
  for (const [path, title] of [
    ['/', 'TENET | Your rules. Their next move.'],
    ['/index.html', 'TENET | Your rules. Their next move.'],
    ['/docs.html', 'Documentation | TENET'],
  ]) {
    const html = await (await request(path, 200, 'text/html')).text();
    assert(html.includes(`<title>${title}</title>`), `${path}: expected page title`);
    assert(html.includes('/fonts/Geist-latin.woff2'), `${path}: font preload`);
    assert(html.includes(path === '/docs.html' ? 'href="./index.html"' : 'href="./docs.html"'), `${path}: navigation link`);
    assert(html.includes(path === '/docs.html' ? 'Use TENET in Pi.' : 'Never delete production data.'), `${path}: content must exist without JavaScript`);
    const references = [...html.matchAll(/(?:src|href)="(\/assets\/[\w.-]+\.(?:js|css))"/g)].map(match => match[1]);
    assert(references.some(file => file.endsWith('.css')), `${path}: built stylesheet`);
    assert(references.some(file => file.endsWith('.js')), `${path}: React client entry`);
    for (const file of references) assets.set(file, file.endsWith('.css') ? 'text/css' : 'text/javascript');
  }
  for (const [path, type] of assets) {
    const body = new Uint8Array(await (await request(path, 200, type)).arrayBuffer());
    assert(body.length > 0, `${path}: empty asset`);
    if (type === 'font/woff2') assert.equal(new TextDecoder().decode(body.slice(0, 4)), 'wOF2', `${path}: font signature`);
    if (type === 'text/css') assert(new TextDecoder().decode(body).includes('/fonts/Geist-latin.woff2'), `${path}: font URL`);
  }
  for (const path of [
    '/does-not-exist', '/TENET.md', '/.git/config', '/Caddyfile', '/Dockerfile',
    '/DESIGN.md', '/railway.toml', '/.dockerignore', '/Dockerfile.dockerignore', '/smoke.mjs', '/package.json',
    '/src/main.tsx', '/src/pi/extension.ts', '/web/components/ui/button.tsx', '/inspector/', '/.tenet/', '/fonts/', '/assets/',
  ]) await (await request(path, 404)).arrayBuffer();
  console.log(`PASS: ${checks} website HTTP checks at ${base.origin}`);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
