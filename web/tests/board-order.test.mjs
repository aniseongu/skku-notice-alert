import test from 'node:test';
import assert from 'node:assert/strict';
import { moveBoard, orderBoards, parseBoardOrder } from '../src/board-order.ts';

const sources = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const ids = (list) => list.map((s) => s.id);

test('saved order comes first and unsaved boards follow in config order', () => {
  assert.deepEqual(ids(orderBoards(sources, ['c', 'a'])), ['c', 'a', 'b', 'd']);
});

test('unknown and duplicate ids are ignored', () => {
  assert.deepEqual(ids(orderBoards(sources, ['x', 'b', 'b', 'y'])), ['b', 'a', 'c', 'd']);
});

test('empty saved order keeps config order and does not mutate input', () => {
  const copy = [...sources];
  assert.deepEqual(ids(orderBoards(sources, [])), ['a', 'b', 'c', 'd']);
  assert.deepEqual(sources, copy);
});

test('moveBoard moves one item and ignores out-of-range moves', () => {
  assert.deepEqual(moveBoard(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moveBoard(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveBoard(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(moveBoard(['a', 'b', 'c'], 2, 3), ['a', 'b', 'c']);
});

test('parseBoardOrder tolerates bad input', () => {
  assert.deepEqual(parseBoardOrder(null), []);
  assert.deepEqual(parseBoardOrder('nope'), []);
  assert.deepEqual(parseBoardOrder('{"a":1}'), []);
  assert.deepEqual(parseBoardOrder('["a",1,"b"]'), ['a', 'b']);
});
