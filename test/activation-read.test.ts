import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

function readDuring(scenario: string) {
  const child = spawnSync('node', ['--experimental-strip-types', 'test/activation-read-fixture.ts', scenario], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 5000,
    env: { ...process.env, TYPESAFE_API_KEY: undefined },
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.intercepted, true, 'the fixture must reach its read boundary');
  assert.equal(result.closed, true, 'the reader must close its descriptor');
  return result;
}

for (const scenario of ['ancestor-symlink', 'ancestor-replacement', 'directory-symlink', 'directory-replacement']) {
  test(`activation rejects ${scenario} during a control read even when the file inode is unchanged`, () => {
    const result = readDuring(scenario);
    assert.equal(result.sameInode, true, 'the final path still names the opened file');
    assert.equal(result.value, 'unavailable');
  });
}

for (const scenario of ['directory-mode', 'file-replacement', 'file-symlink', 'file-missing',
  'file-mode', 'file-links', 'file-size', 'file-mtime', 'file-content', 'descriptor-ctime', 'path-mode', 'short-read']) {
  test(`activation rejects ${scenario} during a control read`, () => {
    assert.equal(readDuring(scenario).value, 'unavailable');
  });
}

test('activation accepts an unchanged control descriptor read', () => {
  assert.equal(readDuring('unchanged').value, 'off');
});
