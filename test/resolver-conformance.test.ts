import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile, symlink, link, readFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ActionResolution, type ActionBinding, type ActionFacts, type ActionResolver } from '../src/runtime/resolved-action.js';
import { argumentDigest } from '../src/decision/evidence.js';

// Contract-only executor fixture. It resolves explicit files, never walks a tree.
// This is not shipped as a Pi/Claude adapter or a claim about their executors.
async function executor() {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tenet-conformance-')));
  const target = join(cwd, 'TENET.md'), other = join(cwd, 'README.md');
  await writeFile(target, 'Rule; Never commit.'); await writeFile(other, 'docs');
  await symlink(target, join(cwd, 'policy-link'));
  await link(target, join(cwd, 'policy-hardlink'));
  const aliases = new Map([['abcd', target], ['efgh', other]]);
  let pending = true;
  const binding: ActionBinding = { host: 'fixture', sessionId: 's', contextId: 'parent', invocationId: 'inv-1',
    callId: 'call-1', toolName: 'edit', argumentDigest: argumentDigest({ anchor: 'abcd' }), cwd };
  const describe = async (bound: ActionBinding, requested: string, parent: boolean): Promise<ActionFacts | null> => {
    if (!pending) return null;
    const resolved = await realpath(aliases.get(requested) ?? requested);
    const info = await stat(resolved);
    const before = parent ? null : await readFile(resolved, 'utf8');
    return { version: 1, binding: bound, integration: { id: 'contract-fixture', version: '1' }, resolverState: 'generation-1', coverage: 'complete', limitations: [],
      operations: [{ id: 'operation-1', semantics: parent ? 'remove' : 'file-edit',
        resources: [{ requested, resolved, identity: `${info.dev}:${info.ino}:${argumentDigest(before)}`, relation: parent ? 'ancestor' : requested.endsWith('link') ? 'link' : 'direct' }],
        content: [{ role: 'literal', value: 'replacement' }], before, after: 'replacement' }] };
  };
  let requested = 'abcd', parent = false;
  const adapter: ActionResolver = { id: 'contract-fixture', version: '1', semantics: ['file-edit', 'remove'],
    resolve: async ({ binding }) => describe(binding, requested, parent),
    revalidate: async ({ binding }) => describe(binding, requested, parent),
  };
  const resolution = new ActionResolution(adapter);
  const capture = () => {
    const input = { anchor: requested };
    return resolution.capture({ ...binding, argumentDigest: argumentDigest(input) }, input, [], new AbortController().signal);
  };
  return { cwd, target, other, aliases, binding, capture,
    select: (path: string, ancestor = false) => { requested = path; parent = ancestor; }, cancel: () => { pending = false; },
    close: () => rm(cwd, { recursive: true, force: true }) };
}

for (const name of ['abcd', 'policy-link', 'policy-hardlink']) {
  test(`contract fixture retains alias/link identity for ${name} and rejects stale contents`, async () => {
    const e = await executor();
    try {
      e.select(name === 'abcd' ? name : join(e.cwd, name));
      const resolved = await e.capture();
      assert.equal(resolved.evidence.status, 'authenticated-complete');
      const resource = resolved.evidence.facts.operations[0]!.resources[0]!;
      const policyStat = await stat(e.target);
      assert.ok(resource.identity.startsWith(`${policyStat.dev}:${policyStat.ino}:`));
      assert.equal(await resolved.revalidate(new AbortController().signal), true);
      await writeFile(e.target, 'changed bytes');
      assert.equal(await resolved.revalidate(new AbortController().signal), false);
    } finally { await e.close(); }
  });
}

for (const change of ['alias-retarget', 'link-retarget', 'cancel']) {
  test(`contract fixture rejects ${change} instead of replaying old resolution`, async () => {
    const e = await executor();
    try {
      if (change === 'link-retarget') e.select(join(e.cwd, 'policy-link'));
      const resolved = await e.capture();
      if (change === 'alias-retarget') e.aliases.set('abcd', e.other);
      if (change === 'link-retarget') { await unlink(join(e.cwd, 'policy-link')); await symlink(e.other, join(e.cwd, 'policy-link')); }
      if (change === 'cancel') e.cancel();
      assert.equal(await resolved.revalidate(new AbortController().signal), false);
    } finally { await e.close(); }
  });
}

test('parent-directory operation is explicit and cannot masquerade as an unrelated literal edit', async () => {
  const e = await executor();
  try {
    e.select(e.cwd, true);
    const resolved = await e.capture();
    if (resolved.evidence.status === 'unsupported') throw new Error('missing facts');
    const operation = resolved.evidence.facts.operations[0]!;
    assert.equal(operation.semantics, 'remove');
    assert.equal(operation.resources[0]!.relation, 'ancestor');
    assert.equal(operation.resources[0]!.resolved, e.cwd);
    assert.ok(e.target.startsWith(operation.resources[0]!.resolved + '/'));
  } finally { await e.close(); }
});
