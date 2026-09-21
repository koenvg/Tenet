// Runs the production client in a DOM with real local HTTP, not a live provider.
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { recordFixture } from '../../test/recording-fixture.ts';
import { ArchiveWriter } from '../../src/recording/archive.ts';
import { startInspector } from '../../src/inspector/server.ts';
const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-ui-')));
let app, dom, intervals = [];
try {
  const fixture = await recordFixture(directory); // Writer and Pi harness are gone before server startup.
  app = await startInspector({ directory, assets: resolve('inspector/dist') });
  const html = await (await fetch(app.origin)).text();
  const scriptPath = /src="([^"]+\.js)"/.exec(html)?.[1];
  assert.ok(scriptPath);
  const script = await (await fetch(app.origin + scriptPath)).text();
  dom = new JSDOM(html, { url: app.url, runScripts: 'outside-only', pretendToBeVisual: true });
  const nativeSetInterval = dom.window.setInterval.bind(dom.window);
  dom.window.setInterval = (callback, _delay, ...args) => {
    const id = nativeSetInterval(callback, 25, ...args); intervals.push(id); return id;
  };
  const requests = [];
  let failures = 0;
  dom.window.fetch = (path, init) => {
    const url = new URL(path, app.origin);
    assert.equal(url.origin, app.origin, 'no external calls');
    requests.push(url.pathname);
    if (failures > 0) { failures--; return Promise.reject(new Error('offline')); }
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
  for (const label of ['Counterfactual decision', 'Actual permission', 'Observed execution', 'Native approval'])
    assert.ok(document.body.textContent.includes(label), label);
  failures = 3;
  await wait(() => document.querySelector('[role="alert"]')?.textContent.includes('reconnecting automatically'));
  await wait(() => document.querySelector('[role="alert"]') === null);
  const concerningButton = buttons().find(b => b.textContent.includes('concerning'));
  const selectedInvocation = concerningButton?.textContent;
  const selectedRule = buttons().find(b => b.textContent.includes('FAIL'));
  selectedRule?.click();
  const selectedRuleText = selectedRule?.textContent;
  const article = document.querySelector('article');
  article.scrollTop = 37;
  const discovered = new ArchiveWriter({ enabled: true, directory });
  const discoveredSink = discovered.bind({ sessionId: 'live-session', invocationId: 'live-invocation', callId: 'live-call',
    toolName: 'edit', cwd: '/live-project', mode: 'observe' });
  discoveredSink('begin', {}); discoveredSink('decision', { decision: 'ALLOW', reason: 'all-rules-pass' });
  discoveredSink('permission', { outcome: 'released' });
  await discovered.close();
  await wait(() => buttons().some(b => b.querySelector('strong')?.textContent === 'live-session'));
  assert.ok(buttons().some(b => b.classList.contains('chosen') && b.textContent === selectedInvocation));
  const delayed = new ArchiveWriter({ enabled: true, directory });
  const delayedRecord = fixture.records.find(r => r.callId === 'concerning');
  assert.ok(delayedRecord);
  delayed.bind({ sessionId: delayedRecord.sessionId, invocationId: delayedRecord.invocationId, callId: delayedRecord.callId,
    toolName: delayedRecord.toolName, cwd: delayedRecord.cwd, mode: delayedRecord.mode })('execution', { outcome: 'executed', origin: 'pi-tool-result' });
  await delayed.close();
  await wait(() => document.body.textContent.includes('executed'));
  assert.equal(buttons().find(b => b.getAttribute('aria-pressed') === 'true')?.textContent, selectedRuleText);
  assert.ok(buttons().some(b => b.classList.contains('chosen') && b.textContent === selectedInvocation));
  assert.equal(article.scrollTop, 37);
  assert.ok(document.body.textContent.includes('rule-fail'));
  assert.ok(!document.body.textContent.includes('fixture-transport-secret'));
  assert.ok(requests.some(p => p.includes('/invocations/')));
  console.log('PASS: production client browses retained assessments without authentication; hostile evidence remains inert.');
  assert.equal(document.querySelector('[role="alert"]'), null);
} finally {
  for (const id of intervals) dom?.window.clearInterval(id);
  await new Promise(resolve => setTimeout(resolve, 50));
  dom?.window.close(); await app?.close(); await rm(directory, { recursive: true, force: true });
}
