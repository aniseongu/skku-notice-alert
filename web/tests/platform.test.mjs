import test from 'node:test';
import assert from 'node:assert/strict';
import { isSamsungInternet } from '../src/platform.ts';

test('Samsung Internet on Android reserves the browser scroll button area', () => {
  assert.equal(isSamsungInternet('Mozilla/5.0 (Linux; Android 16; SM-S938B) SamsungBrowser/30.0 Chrome/144.0'), true);
  assert.equal(isSamsungInternet('Mozilla/5.0 (Linux; Android 16) Chrome/144.0 Mobile Safari/537.36'), false);
  assert.equal(isSamsungInternet('Mozilla/5.0 (Windows NT 10.0) SamsungBrowser/30.0'), false);
});
