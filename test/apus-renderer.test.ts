import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { renderApus, sortedJson, APUS_RENDERING_VERSION } from '../src/decision/apus-renderer.js';

test('renderer is byte-equivalent to the independent pinned Python contract and Qwen wrapper', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/apus/rendering.json', import.meta.url), 'utf8'));
  assert.equal(APUS_RENDERING_VERSION, 'jev.dynamic.prompt.v2');
  for (const fixture of fixtures) {
    const rendered = renderApus(fixture.request);
    for (const key of ['prefix', 'suffix', 'prompt', 'chat'] as const)
      assert.deepEqual(Buffer.from(rendered[key]), Buffer.from(fixture[key]), `${fixture.name}/${key}`);
    assert.deepEqual(rendered.mapping, fixture.mapping);
    if (fixture.stateInput) assert.equal(sortedJson(fixture.stateInput), fixture.request.state);
  }
});

test('renderer rejects invalid candidate count, duplicate ids and empty descriptions', () => {
  const record = { state: 'state', instructions: 'instruction', criteria: [{ id: 'a', description: 'first' }, { id: 'b', description: 'second' }] };
  for (const criteria of [record.criteria.slice(0, 1), Array(17).fill(record.criteria[0]), [record.criteria[0], record.criteria[0]], [{ id: 'a', description: '' }, record.criteria[1]]])
    assert.throws(() => renderApus({ ...record, criteria } as typeof record));
});
