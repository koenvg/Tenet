import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { startInspector } from '../src/inspector/server.js';
import { sessionKey } from '../src/recording/archive.js';
import { ruleRecording, writeRuleRecording } from './session-rules-fixture.js';

test('private rule routes share session facts, safe wording, exact nested actions and access guards', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-rule-routes-')));
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  writeRuleRecording(writer, 's', 'i', ruleRecording({ outcome: 'FAIL' })); await writer.complete();
  const app = await startInspector({ directory: root });
  try {
    const get = (path: string, init?: RequestInit) => fetch(`${app.origin}${path}`, init);
    const list: any = await (await get('/api/sessions')).json();
    const session = list.sessions[0];
    assert.deepEqual({ status: session.status, inventory: session.inventory },
      { status: 'violation', inventory: { state: 'known', rules: 2, unchecked: 0 } });
    const base = `/api/sessions/${session.id}/rules`;
    const response = await get(`${base}?limit=1`); assert.equal(response.status, 200);
    const rules: any = await response.json();
    assert.equal(rules.revision, session.revision);
    assert.equal(rules.status, 'violation'); assert.equal(rules.items.length, 1);
    const rest: any = await (await get(`${base}?cursor=${rules.next}`)).json();
    assert.equal(rest.items.length, 1);
    const rule = [...rules.items, ...rest.items].find(row => row.declarationId === 'r');
    const detailResponse = await get(`${base}/${rule.id}?revision=${rules.revision}`);
    assert.equal(detailResponse.status, 200);
    const detail: any = await detailResponse.json();
    assert.deepEqual(detail.wording, { state: 'available', text: 'Only synthetic actions. <script>inert()</script>' });
    const checks: any = await (await get(`${base}/${rule.id}/checks?revision=${rules.revision}`)).json();
    assert.deepEqual(checks.items.map((check: any) => ({ outcome: check.outcome, trusted: check.trusted })), [{ outcome: 'FAIL', trusted: true }]);
    const action: any = await (await get(`/api/sessions/${session.id}/invocations/${checks.items[0].invocation}`)).json();
    assert.equal(action.view.rules[0].text, detail.wording.text);
    assert.equal(action.view.decision, 'ALLOW');
    assert.equal((await get(`${base}/${'a'.repeat(64)}`)).status, 404);
    assert.equal((await get(`/api/sessions/${sessionKey('absent')}/rules`)).status, 404);
    assert.equal((await get(`${base}/${rule.id}/checks?cursor=${rules.next}`)).status, 400);
    assert.equal((await get(`${base}?limit=101`)).status, 400);
    assert.equal((await get(`${base}?category=violation`)).status, 400);
    assert.equal((await get(`${base}/${rule.id}?revision=${'0'.repeat(64)}`)).status, 409);
    assert.equal((await get(base, { method: 'POST' })).status, 405);
    assert.equal((await get(base, { headers: { Origin: 'https://hostile.invalid' } })).status, 403);
    assert.equal((await get(base, { headers: { Host: 'hostile.invalid' } })).status, 403);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-security-policy')?.includes("default-src 'none'"), true);
    const replacement = new FixtureArchiveWriter({ enabled: true, directory: root });
    writeRuleRecording(replacement, 's', 'later', ruleRecording()); await replacement.complete();
    const stale = await get(`${base}?cursor=${rules.next}`);
    assert.equal(stale.status, 409); assert.deepEqual(await stale.json(), { error: 'stale-cursor' });
    const next: any = await (await get(base)).json();
    assert.equal(next.items.find((row: any) => row.declarationId === 'r').checks, 2);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
