// Unit tests of the daily quota and its configuration (task 019; node --test,
// types stripped). The SQL runs on Node's SQLite through a D1 look-alike with
// the real migrations.
//   node --experimental-strip-types --no-warnings --test scripts/quota-test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authConfig, intVar, QUOTA_DEFAULTS, quotaConfig, siteOrigin } from '../src/server/config.ts';
import { bump, cleanup, consume, quotaDay, status, type Subject } from '../src/server/quota.ts';
import { migratedD1 } from './d1-shim.ts';

const cfg = (over: Record<string, string> = {}) => quotaConfig(over);
const user = (id = 'u1'): Subject => ({ kind: 'user', id });
const anon = (id = 'v1'): Subject => ({ kind: 'anon', id });
// 2026-11-14 10:00 in Shanghai.
const T0 = Date.UTC(2026, 10, 14, 2, 0, 0);
let turnSeq = 0;
const turn = () => `turn-${String(++turnSeq).padStart(6, '0')}`;

test('configuration: defaults, numbers, fallbacks', () => {
  const c = cfg();
  assert.equal(c.enabled, true);
  assert.deepEqual({ ...c, enabled: undefined }, { ...QUOTA_DEFAULTS, enabled: undefined });
  const d = cfg({ QUOTA_USER_DAILY: '25', QUOTA_ANON_TRIAL: '0', QUOTA_IP_DAILY: ' 7 ', QUOTA_SITE_DAILY: '1000', QUOTA_CALLS_PER_TURN: '3', QUOTA_TZ: 'Europe/Berlin' });
  assert.deepEqual([d.userDaily, d.anonTrial, d.ipDaily, d.siteDaily, d.callsPerTurn, d.tz], [25, 0, 7, 1000, 3, 'Europe/Berlin']);
  const bad = cfg({ QUOTA_USER_DAILY: 'ten', QUOTA_IP_DAILY: '-1', QUOTA_SITE_DAILY: '1e3', QUOTA_CALLS_PER_TURN: '0', QUOTA_TZ: 'Mars/Olympus' });
  assert.deepEqual([bad.userDaily, bad.ipDaily, bad.siteDaily, bad.callsPerTurn, bad.tz], [10, 60, 500, 1, 'Asia/Shanghai']);
  for (const v of ['false', 'FALSE', '0', 'off', 'no']) assert.equal(cfg({ QUOTA_ENABLED: v }).enabled, false, v);
  for (const v of ['true', '1', '', 'yes']) assert.equal(cfg({ QUOTA_ENABLED: v }).enabled, true, v);
  assert.equal(intVar(undefined, 4), 4);
});

test('configuration: sign-in only with database, secret, site URL and a method', () => {
  const db = migratedD1();
  const secret = 's'.repeat(32);
  const full = { DB: db, BETTER_AUTH_SECRET: secret, SITE_URL: 'https://opensu.example/', RESEND_API_KEY: 're_test', AUTH_EMAIL_FROM: 'openSU <code@mail.opensu.example>' };
  assert.deepEqual(authConfig(full), { enabled: true, email: true, google: false, testHook: false, siteUrl: 'https://opensu.example', secret });
  assert.equal(authConfig({ ...full, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'gs' }).google, true);
  assert.equal(authConfig({ ...full, BETTER_AUTH_SECRET: 'short' }).enabled, false);
  assert.equal(authConfig({ ...full, DB: undefined }).enabled, false);
  assert.equal(authConfig({ ...full, SITE_URL: undefined }).enabled, false);
  assert.equal(authConfig({ ...full, SITE_URL: 'http://opensu.example' }).enabled, false, 'http only for localhost');
  assert.equal(authConfig({ ...full, AUTH_EMAIL_FROM: '' }).email, false);
  assert.equal(authConfig({ ...full, AUTH_ENABLED: 'false' }).enabled, false);
  assert.equal(authConfig({}).enabled, false);
  const dev = authConfig({ DB: db, BETTER_AUTH_SECRET: secret, SITE_URL: 'http://localhost:5173', AUTH_TEST_HOOK: '1' });
  assert.equal(dev.email && dev.testHook, true);
  assert.equal(siteOrigin('https://opensu.009003.xyz/studio'), 'https://opensu.009003.xyz');
});

test('day rolls over at midnight in the configured zone', () => {
  const sh = 'Asia/Shanghai';
  assert.equal(quotaDay(Date.UTC(2026, 10, 14, 15, 59, 59), sh).day, '2026-11-14');
  assert.equal(quotaDay(Date.UTC(2026, 10, 14, 16, 0, 0), sh).day, '2026-11-15');
  assert.equal(new Date(quotaDay(T0, sh).resetAt).toISOString(), '2026-11-14T16:00:00.000Z');
  assert.equal(new Date(quotaDay(Date.UTC(2026, 10, 14, 16, 0, 0), sh).resetAt).toISOString(), '2026-11-15T16:00:00.000Z');
  assert.equal(quotaDay(Date.UTC(2026, 10, 14, 23, 30), 'UTC').day, '2026-11-14');
  assert.equal(new Date(quotaDay(Date.UTC(2026, 10, 14, 23, 30), 'UTC').resetAt).toISOString(), '2026-11-15T00:00:00.000Z');
});

test('signed-in: 10 turns a day, then refused with the reset time; next day fresh', async () => {
  const db = migratedD1();
  const c = cfg();
  for (let i = 0; i < 10; i++) {
    const r = await consume(db, c, user(), '1.1.1.1', turn(), T0 + i);
    assert.ok(r.ok, `turn ${i + 1}`);
  }
  const no = await consume(db, c, user(), '1.1.1.1', turn(), T0 + 20);
  assert.equal(no.ok, false);
  if (!no.ok) assert.deepEqual(no.status, { kind: 'user', limit: 10, remaining: 0, resetAt: '2026-11-14T16:00:00.000Z', reason: 'user' });
  const st = await status(db, c, user(), '1.1.1.1', T0 + 30);
  assert.equal(st.remaining, 0);
  assert.equal((await status(db, c, user('u2'), '2.2.2.2', T0)).remaining, 10, 'another user is untouched');
  const tomorrow = Date.UTC(2026, 10, 14, 16, 0, 1);
  assert.ok((await consume(db, c, user(), '1.1.1.1', turn(), tomorrow)).ok, 'new day');
  assert.equal((await status(db, c, user(), '1.1.1.1', tomorrow)).remaining, 9);
});

test('anonymous trial: 3, reason anon', async () => {
  const db = migratedD1();
  const c = cfg();
  for (let i = 0; i < 3; i++) assert.ok((await consume(db, c, anon(), '1.1.1.1', turn(), T0)).ok);
  const no = await consume(db, c, anon(), '1.1.1.1', turn(), T0);
  assert.ok(!no.ok && no.status.reason === 'anon' && no.status.limit === 3);
  assert.equal((await status(db, c, anon(), '1.1.1.1', T0)).remaining, 0);
  // The same person signed in has their own allowance (IP and site permitting).
  assert.equal((await status(db, c, user(), '1.1.1.1', T0)).remaining, 10);
});

test('a turn is counted once; at most QUOTA_CALLS_PER_TURN calls', async () => {
  const db = migratedD1();
  const c = cfg({ QUOTA_CALLS_PER_TURN: '8' });
  const t = turn();
  for (let i = 1; i <= 8; i++) {
    const r = await consume(db, c, user(), '1.1.1.1', t, T0);
    assert.ok(r.ok && r.calls === i && r.newTurn === (i === 1), `call ${i}`);
  }
  const ninth = await consume(db, c, user(), '1.1.1.1', t, T0);
  assert.ok(!ninth.ok && ninth.status.reason === 'turn');
  assert.equal((await status(db, c, user(), '1.1.1.1', T0)).remaining, 9, 'eight calls, one credit');
  // A turn id is per subject: someone else using the same id takes their own credit.
  assert.ok((await consume(db, c, user('u2'), '1.1.1.1', t, T0)).ok);
  assert.equal((await status(db, c, user('u2'), '1.1.1.1', T0)).remaining, 9, 'u2 pays its own credit');
});

test('the last credit: later calls of that turn still go through', async () => {
  const db = migratedD1();
  const c = cfg({ QUOTA_ANON_TRIAL: '1' });
  const t = turn();
  assert.ok((await consume(db, c, anon(), '1.1.1.1', t, T0)).ok);
  assert.ok((await consume(db, c, anon(), '1.1.1.1', t, T0)).ok, 'second call of the counted turn');
  assert.ok(!(await consume(db, c, anon(), '1.1.1.1', turn(), T0)).ok, 'a new turn is refused');
});

test('per-IP and whole-site limits', async () => {
  const db = migratedD1();
  const c = cfg({ QUOTA_IP_DAILY: '4', QUOTA_SITE_DAILY: '6' });
  for (let i = 0; i < 4; i++) assert.ok((await consume(db, c, user(`a${i}`), '9.9.9.9', turn(), T0)).ok);
  const ip = await consume(db, c, user('a9'), '9.9.9.9', turn(), T0);
  assert.ok(!ip.ok && ip.status.reason === 'ip');
  assert.ok((await consume(db, c, user('b1'), '8.8.8.8', turn(), T0)).ok);
  assert.ok((await consume(db, c, user('b2'), '7.7.7.7', turn(), T0)).ok);
  const site = await consume(db, c, user('b3'), '6.6.6.6', turn(), T0);
  assert.ok(!site.ok && site.status.reason === 'site', 'site limit stops everyone');
  assert.equal((await status(db, c, user('fresh'), '5.5.5.5', T0)).reason, 'site');
});

test('races: concurrent new turns never pass the limit', async () => {
  // A small network delay interleaves the requests as on D1.
  const db = migratedD1(2);
  const c = cfg({ QUOTA_USER_DAILY: '10' });
  const results = await Promise.all(Array.from({ length: 40 }, () => consume(db, c, user(), '1.1.1.1', turn(), T0)));
  assert.equal(results.filter((r) => r.ok).length, 10);
  const same = turn();
  const calls = await Promise.all(Array.from({ length: 20 }, () => consume(db, cfg({ QUOTA_USER_DAILY: '20' }), user('r2'), '2.2.2.2', same, T0)));
  assert.equal(calls.filter((r) => r.ok).length, 8, 'one turn, 8 calls, counted once');
  assert.equal((await status(db, cfg({ QUOTA_USER_DAILY: '20' }), user('r2'), '2.2.2.2', T0)).remaining, 19);
});

test('one statement per allowed call', async () => {
  const db = migratedD1();
  const c = cfg();
  const before = db.statements;
  await consume(db, c, user(), '1.1.1.1', 'abcdefgh-1', T0 + 1);
  await consume(db, c, user(), '1.1.1.1', 'abcdefgh-1', T0 + 1);
  // (cleanup may run on a new turn with 2% probability; T0 + 1 avoids nothing, so allow it)
  assert.ok(db.statements - before <= 4 && db.statements - before >= 2);
});

test('cleanup removes old days; bump counts atomically', async () => {
  const db = migratedD1();
  const c = cfg();
  await consume(db, c, user(), '1.1.1.1', turn(), T0 - 5 * 86_400_000);
  await consume(db, c, user(), '1.1.1.1', turn(), T0);
  await cleanup(db, T0, c.tz);
  const rows = db.sqlite.prepare('select key from quota_counter').all() as { key: string }[];
  assert.ok(rows.every((r) => r.key.startsWith('2026-11-14')), JSON.stringify(rows));
  assert.deepEqual(await bump(db, ['2026-11-14T02|otp-e:a@b.c', '2026-11-14T02|otp-ip:1']), [1, 1]);
  assert.deepEqual(await bump(db, ['2026-11-14T02|otp-e:a@b.c']), [2]);
});
