import assert from 'node:assert/strict';
import test from 'node:test';
import { SAVED_LIMIT_BYTES, parseSaved, toggleSaved } from '../src/saved-notices.ts';

const notice = (id) => ({
  id, source_id: 'cse-notice', article_no: id, title: `공지 ${id}`, category: '채용', url: `https://cse.skku.edu/${id}`,
  posted_on: '2026-11-03', pinned: false, deadline: null, first_seen: '2026-11-03T00:00:00Z',
});

test('saving keeps a snapshot so the notice survives leaving the list, and toggling removes it', () => {
  const saved = toggleSaved([], notice('1'), new Date('2026-11-03T01:00:00Z'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title, '공지 1');
  assert.equal(saved[0].saved_at, '2026-11-03T01:00:00.000Z');
  assert.equal('first_seen' in saved[0], false);
  assert.deepEqual(toggleSaved(saved, notice('1')), []);
});

test('refuses to grow past the GitHub variable size limit', () => {
  let saved = [];
  for (let i = 0; saved !== null; i += 1) {
    const next = toggleSaved(saved, notice(String(i)));
    if (next === null) break;
    saved = next;
  }
  assert.ok(new TextEncoder().encode(JSON.stringify(saved)).length <= SAVED_LIMIT_BYTES);
  assert.ok(saved.length > 100);
});

test('ignores broken or tampered saved data', () => {
  assert.deepEqual(parseSaved('{broken'), []);
  assert.deepEqual(parseSaved('{"a":1}'), []);
  assert.equal(parseSaved(JSON.stringify([{ id: 1 }, toggleSaved([], notice('2'))[0]])).length, 1);
});
