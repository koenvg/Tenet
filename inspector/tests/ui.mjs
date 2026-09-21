// Runs the production client in a DOM with real local HTTP, not a live provider.
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { recordFixture } from '../../test/recording-fixture.ts';
import { startInspector } from '../../src/inspector/server.ts';

const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-ui-')));
let app, dom;
try {
  await recordFixture(directory); // Writer and Pi harness are gone before server startup.
  app = await startInspector({ directory, assets: resolve('inspector/dist') });
  const html = await (await fetch(app.origin)).text();
  const scriptPath = /src="([^"]+\.js)"/.exec(html)?.[1];
  assert.ok(scriptPath);
  const script = await (await fetch(app.origin + scriptPath)).text();
  dom = new JSDOM(html, { url: app.url, runScripts: 'outside-only', pretendToBeVisual: true });
  const requests = [];
  dom.window.fetch = (path, init) => {
    const url = new URL(path, app.origin);
    assert.equal(url.origin, app.origin, 'no external calls');
    requests.push(url.pathname);
    assert.equal(init?.headers?.Authorization, undefined);
    return fetch(url, { ...init, headers: { ...init?.headers, Origin: app.origin } });
  };
  dom.window.eval(script);
  const document = dom.window.document;
  async function wait(check) {
    for (let n = 0; n < 100; n++) { if (check()) return; await new Promise(r => setTimeout(r, 20)); }
    throw new Error('UI condition timed out: ' + document.body.textContent);
  }
  const buttons = () => [...document.querySelectorAll('button')];
  await wait(() => buttons().some(b => b.querySelector('strong')?.textContent === 's'));
  assert.equal(dom.window.location.hash, '', 'plain launch URL');
  assert.equal(dom.window.sessionStorage.length, 0);
  buttons().find(b => b.querySelector('strong')?.textContent === 's').click();
  await wait(() => buttons().some(b => b.textContent.includes('passing')));
  buttons().find(b => b.textContent.includes('passing')).click();
  await wait(() => document.querySelector('[aria-label="Invocation detail"]'));
  assert.ok(document.body.textContent.includes('PASS'));
  assert.ok(document.body.textContent.includes('executed'));
  assert.ok(document.body.textContent.includes('window.hostile = true'));
  assert.equal(dom.window.hostile, undefined);
  assert.equal(document.querySelector('article script'), null);
  assert.ok(document.body.textContent.includes('SUFFICIENT'));
  buttons().find(b => b.textContent.includes('Built-in integrity')).click();
  await wait(() => document.querySelector('article h3')?.textContent === 'Rules');
  assert.ok([...document.querySelectorAll('h3')].some(h => h.textContent === 'Built-in integrity'));
  buttons().find(b => b.textContent.includes('concerning')).click();
  await wait(() => document.querySelector('article h2')?.textContent.includes('concerning'));
  assert.ok(document.body.textContent.includes('FAIL'));
  assert.ok(document.body.textContent.includes('released'));
  assert.ok(document.body.textContent.includes('unknown'));
  assert.ok(document.body.textContent.includes('rule-fail'));
  assert.ok(!document.body.textContent.includes('fixture-transport-secret'));
  assert.ok(requests.some(p => p.includes('/invocations/')));
  console.log('PASS: production client browses retained assessments without authentication; hostile evidence remains inert.');
  assert.equal(document.querySelector('[role="alert"]'), null);
} finally { dom?.window.close(); await app?.close(); await rm(directory, { recursive: true, force: true }); }
