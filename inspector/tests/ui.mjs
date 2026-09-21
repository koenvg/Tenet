// Runs the production client in a DOM with real local HTTP, not a live provider.
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { recordFixture } from '../../test/recording-fixture.ts';
import { ArchiveWriter, sessionKey } from '../../src/recording/archive.ts';
import { recordFailureFixture } from '../../test/failure-fixture.ts';
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
    throw new Error('UI condition timed out: ' + check.toString() + '\n' + document.body.textContent.slice(0,1600));
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
  assert.equal([...document.querySelectorAll('article button')].find(b => b.getAttribute('aria-pressed') === 'true')?.textContent, selectedRuleText);
  assert.ok(buttons().some(b => b.classList.contains('chosen') && b.querySelector('[data-call-id]')?.textContent === 'concerning'));
  assert.equal(article.scrollTop, 37);
  assert.ok(document.body.textContent.includes('rule-fail'));
  assert.ok(!document.body.textContent.includes('fixture-transport-secret'));
  assert.ok(requests.some(p => p.includes('/invocations/')));
  const writer = new ArchiveWriter({ enabled: true, directory });
  const arbitrary = '../雪 ?#%';
  for (let n = 0; n < 55; n++) {
    writer.bind({ sessionId: arbitrary, invocationId: `page-${n}`, callId: 'reused', toolName: 'edit', cwd: '/second-project', mode: 'observe' })('begin', {});
  }
  writer.bind({ sessionId: 'fork', invocationId: 'fork-call', callId: 'reused', toolName: 'edit', cwd: '/third-project', mode: 'observe' })('begin', {});
  await writer.close();
  buttons().find(b => b.textContent === 'Refresh sessions').click();
  await wait(() => buttons().some(b => b.querySelector('strong')?.textContent === arbitrary));
  const filter = document.querySelector('input[aria-label="Project directory"]');
  assert.ok(filter, 'project filter');
  filter.value = '/second-project'; filter.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await wait(() => buttons().some(b => b.textContent === 'Filter projects' && !b.disabled));
  buttons().find(b => b.textContent === 'Filter projects').click();
  await wait(() => document.querySelectorAll('nav button strong').length === 1);
  buttons().find(b => b.querySelector('strong')?.textContent === arbitrary).click();
  await wait(() => buttons().some(b => b.textContent === 'More invocations'));
  const callButtons = () => buttons().filter(b => b.querySelector('[data-call-id]'));
  assert.equal(callButtons().length, 50);
  callButtons()[0].click();
  await wait(() => document.querySelector('article h2')?.textContent.includes('reused'));
  const selectedLink = dom.window.location.href;
  assert.ok(new URL(selectedLink).searchParams.get('session') === sessionKey(arbitrary));
  assert.match(new URL(selectedLink).searchParams.get('invocation'), /^[a-f0-9]{64}$/);
  assert.ok(!selectedLink.includes('window.hostile'));
  buttons().find(b => b.textContent === 'More invocations').click();
  await wait(() => callButtons().length === 55);
  assert.equal(dom.window.location.href, selectedLink, 'pagination preserves selection and deep link');
  assert.ok(document.querySelector('[aria-label="Invocation detail"]'));
  const beforePoll = requests.length;
  await wait(() => requests.length >= beforePoll + 6);
  assert.equal(callButtons().length, 55, 'live polling preserves loaded pages');
  assert.equal(document.querySelectorAll('nav button strong').length, 1, 'live polling preserves the project filter');
  assert.equal(dom.window.location.href, selectedLink, 'live polling preserves the deep link');
  // Reload directly into a call that is not on the first timeline page.
  dom.window.history.replaceState(null, '', `/?session=${sessionKey(arbitrary)}&invocation=${sessionKey('page-0')}`);
  dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
  await wait(() => document.querySelector('article')?.textContent.includes('page-0'));
  assert.ok(document.querySelector('article')?.textContent.includes(arbitrary));
  dom.window.history.replaceState(null, '', '/?session=../../unsafe&invocation=bad');
  dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
  await wait(() => document.querySelector('[role="alert"]'));
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('Invalid'));
  dom.window.history.replaceState(null, '', '/'); dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
  await wait(() => !document.querySelector('[role="alert"]'));
  filter.value = '/no-recordings'; filter.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  buttons().find(b => b.textContent === 'Filter projects').click();
  await wait(() => document.body.textContent.includes('No recorded sessions for this project.'));
  buttons().find(b => b.textContent === 'All projects').click();
  await wait(() => buttons().some(b => b.querySelector('strong')?.textContent === arbitrary));
  const realFetch = dom.window.fetch;
  dom.window.fetch = async () => new Response('', { status: 503 });
  buttons().find(b => b.textContent === 'Refresh sessions').click();
  await wait(() => document.querySelector('[role="alert"]')?.textContent.includes('503'));
  dom.window.fetch = realFetch;
  buttons().find(b => b.textContent === 'Refresh sessions').click();
  await wait(() => !document.querySelector('[role="alert"]'));
  const linked = new JSDOM(html, { url: `${app.origin}/?session=${sessionKey(arbitrary)}&invocation=${sessionKey('page-0')}`, runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    linked.window.fetch = realFetch; linked.window.eval(script);
    for (let n = 0; n < 100 && !linked.window.document.querySelector('[aria-label="Invocation detail"]'); n++) await new Promise(r => setTimeout(r, 20));
    assert.ok(linked.window.document.querySelector('article').textContent.includes('page-0'), 'fresh launch restores a deep-linked call beyond the first page');
  } finally { linked.window.close(); }
  console.log('PASS: production client browses retained assessments without authentication; hostile evidence remains inert.');
  assert.equal(document.querySelector('[role="alert"]'), null);
  await recordFailureFixture(directory);
  await app.close();
  app = await startInspector({ directory, assets: resolve('inspector/dist') });
  // Live polling reconnects to the restarted reader and discovers failure history.
  await wait(() => buttons().some(b => b.querySelector('strong')?.textContent === 'failure-history'));
  buttons().find(b => b.querySelector('strong')?.textContent === 'failure-history').click();
  await wait(() => buttons().some(b => b.textContent.includes('missing-credentials')));
  for (const reason of ['temporary-record', 'corrupt-record', 'unsupported-schema']) assert.ok(document.body.textContent.includes(reason));
  assert.ok(document.body.textContent.includes('Writer-wide capture health'));
  for (const kind of ['missing-credentials', 'provider-error', 'invalid-response', 'interrupted', 'truncated-response', 'unavailable-response', 'missing-payload', 'capture-loss']) {
    buttons().find(b => b.querySelector('span')?.textContent === kind).click();
    await wait(() => document.querySelector('article h2')?.textContent.includes(kind));
    const detail = document.querySelector('article').textContent;
    if (kind === 'interrupted' || kind === 'capture-loss') {
      assert.ok(detail.includes('Assessment incomplete'));
      assert.ok(detail.includes('unknown'));
      assert.ok(![...document.querySelectorAll('article .rules strong')].some(el => el.textContent === 'PASS'));
    } else {
      assert.ok(detail.includes('Assessment failed'));
    }
    if (kind === 'missing-credentials') assert.ok(detail.includes('not submitted'));
    if (kind === 'missing-payload') assert.ok(detail.includes('submitted; payload unavailable'));
    if (kind === 'truncated-response') assert.ok(detail.includes('Response truncated'));
    if (kind === 'unavailable-response') assert.ok(detail.includes('Response snapshot unavailable'));
    assert.equal(dom.window.hostile, undefined);
    assert.equal(document.querySelector('article script'), null);
  }
  assert.ok(!document.body.textContent.includes('fixture-transport-secret'));
  console.log('PASS: restarted API and client distinguish failed, unsubmitted, incomplete, truncated and unavailable history with capture-health and record issues.');
} finally {
  for (const id of intervals) dom?.window.clearInterval(id);
  await new Promise(resolve => setTimeout(resolve, 50));
  dom?.window.close(); await app?.close(); await rm(directory, { recursive: true, force: true });
}
