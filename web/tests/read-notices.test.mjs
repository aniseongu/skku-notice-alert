import assert from 'node:assert/strict';
import test from 'node:test';
import { READ_LIMIT, addRead, mergeRead, parseRead } from '../src/read-notices.ts';

test('reading keeps the latest ids only and moves a re-read id to the end', () => {
  let ids = [];
  for (let i = 0; i < READ_LIMIT + 5; i += 1) ids = addRead(ids, `n${i}`);
  assert.equal(ids.length, READ_LIMIT);
  assert.equal(ids[0], 'n5');
  assert.deepEqual(addRead(['a', 'b'], 'a'), ['b', 'a']);
});

test('merging two devices never loses a read notice', () => {
  assert.deepEqual(mergeRead(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(parseRead('{broken'), []);
  assert.deepEqual(parseRead('["a", 1, "b"]'), ['a', 'b']);
});
