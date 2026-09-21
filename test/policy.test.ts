import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { loadPolicy, policyIsCurrent, POLICY_LIMITS, RULE } from '../src/decision/policy.js';

async function fixture(run: (file: string, dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'tenet-policy-'));
  try { await run(join(dir, 'TENET.md'), dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('explicit rules retain text, order, source lines and immutable snapshot identities', async () => {
  await fixture(async file => {
    const text = '# Rules\r\n  Rule; Never delete; ask the owner instead.  \r\nprose\r\n```\r\nRule; Same\r\n```\r\nRule; Same\r\nrule; inert\r\n';
    await writeFile(file, text);
    const policy = await loadPolicy(file);
    assert.ok(policy.available);
    assert.deepEqual(policy.rules.map(r => [r.line, r.text]), [[2, 'Never delete; ask the owner instead.'], [5, 'Same'], [7, 'Same']]);
    assert.equal(policy.digest, createHash('sha256').update(text).digest('hex'));
    assert.equal(policy.source, file);
    assert.equal(new Set(policy.rules.map(r => r.id)).size, 3);
    assert.ok(policy.rules.every(r => r.id.includes(policy.digest)));
    assert.ok(Object.isFrozen(policy) && Object.isFrozen(policy.rules) && Object.isFrozen(policy.rules[0]));
    assert.equal(await policyIsCurrent(policy), true);
    await writeFile(file, 'Rule; New');
    assert.equal(await policyIsCurrent(policy), false);
    assert.equal(policy.rules[0]!.text, 'Never delete; ask the owner instead.');
  });
});

test('BLOCK and WARN declarations preserve semantic text and legacy semicolons', async () => {
  await fixture(async file => {
    await writeFile(file, '# Policy\n Rule; WARN; Keep edits small; prefer focus.\nRule; BLOCK; Never commit.\nRule; Never delete; ask first.\nRule; warn; legacy text');
    const policy = await loadPolicy(file); assert.ok(policy.available);
    assert.deepEqual(policy.rules.map(r => [r.line, r.enforcement, r.text]), [
      [2, 'WARN', 'Keep edits small; prefer focus.'], [3, 'BLOCK', 'Never commit.'],
      [4, 'BLOCK', 'Never delete; ask first.'], [5, 'BLOCK', 'warn; legacy text'],
    ]);
    assert.equal(new Set(policy.rules.map(r => r.id)).size, 4);
    assert.ok(policy.rules.every(r => Object.isFrozen(r) && r.id === `${policy.digest}:${r.line}`));
    for (const prefix of ['BLOCK', 'WARN']) {
      await writeFile(file, `Rule; ${prefix}; `);
      assert.equal((await loadPolicy(file)).available, false);
      await writeFile(file, `Rule; ${prefix}; ${'x'.repeat(POLICY_LIMITS.ruleBytes)}`);
      assert.equal((await loadPolicy(file)).available, true);
      await writeFile(file, `Rule; ${prefix}; ${'x'.repeat(POLICY_LIMITS.ruleBytes + 1)}`);
      assert.equal((await loadPolicy(file)).available, false);
    }
  });
});

test('missing, directory, invalid UTF-8, empty and malformed policies fail closed', async () => {
  await fixture(async (file, dir) => {
    assert.equal((await loadPolicy(file)).available, false);
    assert.equal((await loadPolicy(dir)).available, false);
    for (const value of ['', ' ', RULE, 'Rule; ', 'Rule; valid\nRule; ', Buffer.from([0xc3, 0x28])]) {
      await writeFile(file, value);
      const policy = await loadPolicy(file);
      assert.equal(policy.available, false);
      if (!policy.available) assert.match(policy.reason, /policy-format/);
    }
  });
});

test('bounded byte, rule-count and per-rule limits reject rather than truncate', async () => {
  await fixture(async file => {
    const limits = POLICY_LIMITS;
    for (const [valid, invalid, reason] of [
      ['Rule; ok\n' + 'x'.repeat(limits.fileBytes - 9), 'Rule; ok\n' + 'x'.repeat(limits.fileBytes - 8), 'policy-file-limit'],
      [Array(limits.rules).fill('Rule; ok').join('\n'), Array(limits.rules + 1).fill('Rule; ok').join('\n'), 'policy-rule-count-limit'],
      ['Rule; ' + 'é'.repeat(limits.ruleBytes / 2), 'Rule; ' + 'é'.repeat(limits.ruleBytes / 2) + 'x', 'policy-rule-size-limit'],
    ]) {
      await writeFile(file, valid!); assert.equal((await loadPolicy(file)).available, true);
      await writeFile(file, invalid!); const policy = await loadPolicy(file);
      assert.equal(policy.available, false); if (!policy.available) assert.equal(policy.reason, reason);
    }
  });
});

test('freshness detects deletion and same-byte symlink retargeting', async () => {
  await fixture(async (file, dir) => {
    const a = join(dir, 'a'), b = join(dir, 'b');
    await writeFile(a, 'Rule; Example'); await writeFile(b, 'Rule; Example');
    await symlink(a, file);
    const policy = await loadPolicy(file); assert.ok(policy.available);
    assert.equal(policy.target, await import('node:fs/promises').then(fs => fs.realpath(a)));
    assert.equal(await policyIsCurrent(policy), true);
    await unlink(file); await symlink(b, file);
    assert.equal(await policyIsCurrent(policy), false);
    await unlink(file); assert.equal(await policyIsCurrent(policy), false);
  });
});

test('README policy examples parse as documented without touching the active policy', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const examples = [...readme.matchAll(/```tenet-policy\n([\s\S]*?)```/g)];
  assert.equal(examples.length, 2);
  await fixture(async file => {
    for (const example of examples) {
      await writeFile(file, example[1]!);
      const policy = await loadPolicy(file); assert.ok(policy.available);
      assert.equal(policy.rules.length, example[1]!.trim().split('\n').length);
    }
  });
});
