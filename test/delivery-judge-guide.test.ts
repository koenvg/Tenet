import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readOwnerSettings } from '../src/runtime/settings.js';

const guide = readFileSync(new URL('../docs/judge.md', import.meta.url), 'utf8');
test('shipped judge guide has parsed private settings and consistent experimental budgets', () => {
  const home = realpathSync(mkdtempSync('/tmp/tenet-delivery-guide-'));
  try {
    mkdirSync(join(home, '.tenet'), { mode: 0o700 });
    const examples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m => JSON.parse(m[1]!));
    assert.equal(examples.length, 2, 'one TypeSafe rollback and one APUS example');
    for (const value of examples) {
      writeFileSync(join(home, '.tenet/config.json'), JSON.stringify(value), { mode: 0o600 });
      assert.equal(readOwnerSettings(home).state, 'valid');
      if (value.judge.provider === 'apus-llamacpp') {
        assert.equal(value.judge.baseUrl, 'http://127.0.0.1:8088');
        assert.equal(value.judge.model, 'apus-openjev-v1-4b-q8');
        assert.equal(value.decision.deadlineMs, 120000);
        assert.deepEqual(value.observation, { running: 1, waiting: 8, bytes: 1048576, ageMs: 120000 });
      }
    }
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('shipped judge guide includes bounded owner setup and full-payload evaluation, not trial scripts', () => {
  assert.match(guide, /--host 127\.0\.0\.1/);
  assert.match(guide, /--parallel 1/);
  assert.match(guide, /--n-gpu-layers 0/);
  assert.match(guide, /--ctx-size 32768/);
  assert.match(guide, /--alias apus-openjev-v1-4b-q8/);
  assert.match(guide, /--log-disable/);
  assert.match(guide, /127\.0\.0\.1:8088:127\.0\.0\.1:8088/);
  for (const term of ['4.992', 'denominator', 'opaque', 'authenticated', 'APPROVAL_REQUIRED', 'NOT_APPLICABLE', 'INCOMPLETE'])
    assert.ok(guide.includes(term), `missing evaluation limit: ${term}`);
  assert.ok(!guide.includes('](../CONTRIBUTING.md'), 'required archive steps must not depend on checkout');
  assert.ok(!guide.includes('](../test/'), 'development fixture link must be labelled repository-only and absolute');
  assert.ok(!guide.includes('Token arrays, credential fields and headers stay omitted'), 'submitted prompt/labelIds are retained, not omitted');
  assert.match(guide, /tokenizer IDs in `prompt` and `labelIds` remain/);
});
