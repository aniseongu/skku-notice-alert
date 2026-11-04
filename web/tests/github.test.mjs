import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubError, listSecrets, readVariable } from '../src/github.ts';

test('authentication and temporary server failures retain distinct HTTP status', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 403, 429, 500, 503]) {
      globalThis.fetch = async () => new Response('{}', { status });
      await assert.rejects(listSecrets('owner/repo', 'fixture-token'),
        error => error instanceof GitHubError && error.status === status && !error.message.includes('fixture-token'));
    }
  } finally { globalThis.fetch = original; }
});

test('only absent variables are empty; authorization and server failures propagate', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{}', { status: 404 });
    assert.equal(await readVariable('owner/repo', 'fixture-token', 'INTEREST_KEYWORDS'), null);
    for (const status of [401, 403, 503]) {
      globalThis.fetch = async () => new Response('{}', { status });
      await assert.rejects(readVariable('owner/repo', 'fixture-token', 'INTEREST_KEYWORDS'),
        error => error instanceof GitHubError && error.status === status);
    }
  } finally { globalThis.fetch = original; }
});

test('manual collection dispatches the default branch using its existing workflow', async () => {
  const { requestCollection } = await import('../src/github.ts');
  const original = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, init) => {
      requests.push([url, init]);
      return requests.length === 1 ? Response.json({ default_branch: 'main' }) : new Response(null, { status: 204 });
    };
    await requestCollection('owner/repo', 'fixture-token');
    assert.match(requests[1][0], /notice-and-pages.yml\/dispatches$/);
    assert.deepEqual(JSON.parse(requests[1][1].body), { ref: 'main' });
  } finally { globalThis.fetch = original; }
});

test('manual fallback only builds links to valid GitHub repositories', async () => {
  const { collectionWorkflowUrl } = await import('../src/github.ts');
  assert.equal(collectionWorkflowUrl('owner/repo'), 'https://github.com/owner/repo/actions/workflows/notice-and-pages.yml');
  assert.equal(collectionWorkflowUrl('../evil'), null);
  assert.equal(collectionWorkflowUrl('owner/repo?x=1'), null);
});
