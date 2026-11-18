// Unit test of the canonical host redirect (task 026; node --test, types stripped).
//   node --experimental-strip-types --no-warnings --test scripts/canonical-test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalRedirect } from '../src/server/config.ts';

const env = { SITE_URL: 'https://opensu.example.com' };

test('another host redirects to SITE_URL with path and query kept', () => {
  assert.equal(canonicalRedirect('https://opensu-web.someone.workers.dev/studio?signin=1&mode=plan', env), 'https://opensu.example.com/studio?signin=1&mode=plan');
  assert.equal(canonicalRedirect('https://opensu-web.someone.workers.dev/', env), 'https://opensu.example.com/');
  assert.equal(canonicalRedirect('http://www.opensu.example.com/api/chat', env), 'https://opensu.example.com/api/chat');
  // SITE_URL with a trailing slash or a path: only its origin counts.
  assert.equal(canonicalRedirect('https://x.workers.dev/a?b=c', { SITE_URL: 'https://opensu.example.com/' }), 'https://opensu.example.com/a?b=c');
});

test('the canonical host does not redirect', () => {
  assert.equal(canonicalRedirect('https://opensu.example.com/studio?x=1', env), null);
  assert.equal(canonicalRedirect('https://opensu.example.com/', env), null);
});

test('localhost does not redirect', () => {
  assert.equal(canonicalRedirect('http://localhost:8787/studio', env), null);
  assert.equal(canonicalRedirect('http://127.0.0.1:4173/', env), null);
  assert.equal(canonicalRedirect('http://[::1]:4173/', env), null);
});

test('the off switch and a missing or malformed SITE_URL do not redirect', () => {
  for (const v of ['false', 'FALSE', '0', 'off', 'no']) assert.equal(canonicalRedirect('https://x.workers.dev/', { ...env, CANONICAL_REDIRECT: v }), null);
  assert.equal(canonicalRedirect('https://x.workers.dev/', { ...env, CANONICAL_REDIRECT: 'true' }), 'https://opensu.example.com/');
  assert.equal(canonicalRedirect('https://x.workers.dev/', {}), null);
  assert.equal(canonicalRedirect('https://x.workers.dev/', { SITE_URL: 'not a url' }), null);
  assert.equal(canonicalRedirect('https://x.workers.dev/', { SITE_URL: 'http://opensu.example.com' }), null);
});
