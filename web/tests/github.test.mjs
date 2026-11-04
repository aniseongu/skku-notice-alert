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
