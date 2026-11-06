import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../src/browser-push.ts', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(source.replace(/^import .*;$/gm, '').replace(/\bexport\s+/g, ''), { mode: 'strip' })
  + '\nObject.assign(exports, { defaultCanvasPushMode, canvasPushMode, connectBrowserPush, disconnectBrowserPush, setCanvasPushMode });';

function makeEnvironment({ mobile = false, subscription = true, used = {}, saveFails = false, deleteFails = false } = {}) {
  const storage = new Map();
  const writes = [];
  const secretNames = { ...used };
  let permissionRequests = 0;
  const current = { endpoint: 'https://push.example/subscription', toJSON: () => ({
    endpoint: 'https://push.example/subscription', keys: { p256dh: 'public-key', auth: 'auth-key' },
  }) };
  let unsubscribed = false;
  current.unsubscribe = async () => { unsubscribed = true; return true; };
  const manager = { getSubscription: async () => subscription ? current : null, subscribe: async () => current };
  const registration = { pushManager: manager };
  const notification = { permission: 'granted', requestPermission: async () => { permissionRequests++; return 'granted'; } };
  class GitHubError extends Error {}
  const github = {
    GitHubError,
    listSecrets: async () => secretNames,
    saveSecret: async (_repo, _token, slot, value) => {
      if (saveFails) throw new GitHubError("GitHub 저장 실패");
      writes.push({ slot, value: JSON.parse(value) });
      secretNames[slot] = 'date';
    },
    deleteSecret: async (_repo, _token, slot) => { if (deleteFails) throw new GitHubError('실패'); delete secretNames[slot]; },
  };
  const sandbox = {
    exports: {}, APP_NAME: '앱', ...github,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key) },
    isSecureContext: true, window: { Notification: notification, PushManager: {} }, Notification: notification,
    matchMedia: () => ({ matches: mobile }),
    navigator: { serviceWorker: { getRegistration: async () => registration, ready: Promise.resolve(registration) } },
    document: { baseURI: 'https://site.example/' },
    fetch: async () => ({ ok: true, json: async () => ({ repository: 'owner/repo', publicKey: 'AAAA' }) }),
    crypto: webcrypto, TextEncoder, Uint8Array, URL,
  };
  vm.runInNewContext(js, sandbox);
  return { api: sandbox.exports, storage, writes, permissionRequests: () => permissionRequests, unsubscribed: () => unsubscribed };
}

test('mobile defaults to reminders and desktop to off without storing a selection', () => {
  const mobile = makeEnvironment({ mobile: true });
  const desktop = makeEnvironment();
  assert.equal(mobile.api.defaultCanvasPushMode(), 'reminders');
  assert.equal(desktop.api.defaultCanvasPushMode(), 'off');
  assert.equal(mobile.api.canvasPushMode(), null);
  assert.equal(desktop.api.canvasPushMode(), null);
});

test('connecting includes per-device default and respects explicit selection', async () => {
  const env = makeEnvironment({ mobile: true });
  await env.api.connectBrowserPush('owner/repo', 'token');
  assert.equal(env.writes[0].slot, 'WEB_PUSH_SUB_1');
  assert.equal(env.writes[0].value.preferences.canvas, 'reminders');
  assert.equal(env.api.canvasPushMode(), 'reminders');
  env.storage.set('browser-push-canvas-mode', 'off');
  await env.api.connectBrowserPush('owner/repo', 'token');
  assert.equal(env.writes[1].slot, 'WEB_PUSH_SUB_1');
  assert.equal(env.writes[1].value.preferences.canvas, 'off');
});

test('updating mode requires an existing subscription and does not request permission', async () => {
  const env = makeEnvironment({ subscription: false });
  await assert.rejects(() => env.api.setCanvasPushMode('owner/repo', 'token', 'summary'), /먼저 이 기기/);
  assert.equal(env.permissionRequests(), 0);
  assert.equal(env.writes.length, 0);
  assert.equal(env.api.canvasPushMode(), null);
});

test('legacy subscription migrates into free slot without changing another device', async () => {
  const env = makeEnvironment({ used: { WEB_PUSH_SUB_1: 'date', WEB_PUSH_SUBSCRIPTION: 'date' } });
  env.storage.set('browser-push-registered', 'old-fingerprint');
  await env.api.setCanvasPushMode('owner/repo', 'token', 'summary');
  assert.equal(env.writes[0].slot, 'WEB_PUSH_SUB_2');
  assert.equal(env.writes[0].value.preferences.canvas, 'summary');
  assert.equal(env.api.canvasPushMode(), 'summary');
  assert.equal(env.permissionRequests(), 0);
});

test('old fingerprint cannot overwrite a slot and unsuccessful writes do not set mode', async () => {
  const env = makeEnvironment({ used: { WEB_PUSH_SUB_1: 'date' } });
  env.storage.set('browser-push-device', JSON.stringify({ fingerprint: 'different', slot: 'WEB_PUSH_SUB_1' }));
  await assert.rejects(() => env.api.setCanvasPushMode('other/repo', 'token', 'reminders'), /배포한 GitHub/);
  assert.equal(env.api.canvasPushMode(), null);
  await env.api.setCanvasPushMode('owner/repo', 'token', 'reminders');
  assert.equal(env.writes[0].slot, 'WEB_PUSH_SUB_2');
  assert.equal(env.api.canvasPushMode(), 'reminders');
});


test('failed secret save does not change the remembered preference', async () => {
  const env = makeEnvironment({ saveFails: true });
  env.storage.set('browser-push-canvas-mode', 'off');
  await assert.rejects(() => env.api.setCanvasPushMode('owner/repo', 'token', 'summary'), /GitHub 저장 실패/);
  assert.equal(env.api.canvasPushMode(), 'off');
  assert.equal(env.writes.length, 0);
});

test('failed remote disconnect keeps the subscription and can be retried', async () => {
  const env = makeEnvironment({ deleteFails: true });
  await env.api.connectBrowserPush('owner/repo', 'token');
  await assert.rejects(() => env.api.disconnectBrowserPush('owner/repo', 'token'), /실패/);
  assert.equal(env.unsubscribed(), false);
  assert.notEqual(env.storage.get('browser-push-device'), undefined);
});
