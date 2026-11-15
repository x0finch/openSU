// Unit tests of the turn records endpoint (task 020; node --test, types
// stripped). The SQL runs on Node's SQLite through the D1 look-alike with
// the real migrations.
//   node --experimental-strip-types --no-warnings --test scripts/turns-test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { turnsConfig } from '../src/server/config.ts';
import { cleanupTurns, flagTurn, MAX_RECORD, saveTurn, TURNS_PER_IP_DAILY } from '../src/server/turns.ts';
import { migratedD1, type ShimD1 } from './d1-shim.ts';

const SITE = 'http://localhost:8787';
const SECRET = 'test-secret-not-real-0123456789abcdef';
const envOf = (db: ShimD1 | undefined, over: Record<string, string> = {}) => ({ DB: db, BETTER_AUTH_SECRET: SECRET, ...over });

const record = (turn: string, extra: Record<string, unknown> = {}) => ({
  v: 1, turn, conversation: 'conv-00000001', app: '0.0.0+test', model: 'stub/model', ownKey: false,
  startedAt: '2026-11-15T01:00:00.000Z', durationMs: 1200, status: 'ok', user: '北侧房间加深', parts: [{ type: 'text', text: '好的' }], final: '好的', house: { name: 'T' },
  ...extra,
});
const post = (body: unknown, cookie = '', ip = '203.0.113.9', headers: Record<string, string> = {}) =>
  new Request(`${SITE}/api/turns`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, 'cf-connecting-ip': ip, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const patch = (body: unknown, cookie = '', ip = '203.0.113.9') =>
  new Request(`${SITE}/api/turns`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie, 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const rows = (db: ShimD1) => db.sqlite.prepare('select turn, who, conversation, own_key, model, undone, record from turn_record order by turn').all() as { turn: string; who: string; conversation: string; own_key: number; model: string; undone: number; record: string }[];

/** A visitor: the first record sets the cookie, later ones carry it. */
async function visitor(db: ShimD1, turn = 'first-turn-000') {
  const res = await saveTurn(post(record(turn)), envOf(db));
  assert.equal(res.status, 204);
  const cookie = cookieOf(res);
  assert.match(cookie, /^opensu_v=/);
  return cookie;
}

test('configuration: on with a database, off with TURN_RECORDS=false, 30 days by default', () => {
  const db = migratedD1();
  assert.deepEqual(turnsConfig({ DB: db }), { enabled: true, days: 30, dailyKb: 15 * 1024 });
  assert.equal(turnsConfig({ DB: db, TURN_RECORDS_DAILY_MB: '40' }).dailyKb, 40 * 1024);
  for (const v of ['', 'lots', '-1', '1.5']) assert.equal(turnsConfig({ DB: db, TURN_RECORDS_DAILY_MB: v }).dailyKb, 15 * 1024, `fallback for "${v}"`);
  assert.equal(turnsConfig({}).enabled, false);
  assert.equal(turnsConfig({ DB: db, TURN_RECORDS: 'false' }).enabled, false);
  assert.equal(turnsConfig({ DB: db, TURN_RECORDS_DAYS: '7' }).days, 7);
  assert.equal(turnsConfig({ DB: db, TURN_RECORDS_DAYS: '0' }).days, 1);
  assert.equal(turnsConfig({ DB: db, TURN_RECORDS_DAYS: 'x' }).days, 30);
});

test('a record is stored once per turn id; a resend replaces it', async () => {
  const db = migratedD1();
  const cookie = await visitor(db, 'turn-aaaaaaaa');
  const text = JSON.stringify(record('turn-aaaaaaaa', { final: '第二次' }));
  assert.equal((await saveTurn(post(text, cookie), envOf(db))).status, 204);
  const r = rows(db);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.record, text, 'stored exactly as sent');
  assert.match(r[0]!.who, /^v:/);
  assert.deepEqual([r[0]!.conversation, r[0]!.own_key, r[0]!.model, r[0]!.undone], ['conv-00000001', 0, 'stub/model', 0]);
  // Own key, another turn.
  assert.equal((await saveTurn(post(record('turn-bbbbbbbb', { ownKey: true, model: 'default' }), cookie), envOf(db))).status, 204);
  assert.equal(rows(db).find((x) => x.turn === 'turn-bbbbbbbb')?.own_key, 1);
});

test('only the caller who wrote a turn can replace or flag it', async () => {
  const db = migratedD1();
  const a = await visitor(db, 'turn-shared-1');
  const b = cookieOf(await saveTurn(post(record('turn-other-1')), envOf(db)));
  assert.equal((await saveTurn(post(record('turn-shared-1', { final: 'hijack' }), b), envOf(db))).status, 204);
  assert.equal(JSON.parse(rows(db).find((x) => x.turn === 'turn-shared-1')!.record).final, '好的', 'not replaced by someone else');
  assert.equal((await flagTurn(patch({ turn: 'turn-shared-1', undone: true }, b), envOf(db))).status, 204);
  assert.equal(rows(db).find((x) => x.turn === 'turn-shared-1')!.undone, 0, 'not flagged by someone else');
  assert.equal((await flagTurn(patch({ turn: 'turn-shared-1', undone: true }, a), envOf(db))).status, 204);
  assert.equal(rows(db).find((x) => x.turn === 'turn-shared-1')!.undone, 1);
});

test('undo sets the flag, redo clears it; a resend keeps it', async () => {
  const db = migratedD1();
  const cookie = await visitor(db, 'turn-undo-01');
  await flagTurn(patch({ turn: 'turn-undo-01', undone: true }, cookie), envOf(db));
  assert.equal(rows(db)[0]!.undone, 1);
  await saveTurn(post(record('turn-undo-01'), cookie), envOf(db));
  assert.equal(rows(db)[0]!.undone, 1, 'a resend does not clear the flag');
  await flagTurn(patch({ turn: 'turn-undo-01', undone: false }, cookie), envOf(db));
  assert.equal(rows(db)[0]!.undone, 0);
  assert.equal((await flagTurn(patch({ turn: 'turn-undo-01', undone: 'yes' }, cookie), envOf(db))).status, 400);
  assert.equal((await flagTurn(patch({ turn: 'bad id!', undone: true }, cookie), envOf(db))).status, 400);
});

test('oversize and malformed bodies are refused', async () => {
  const db = migratedD1();
  const big = JSON.stringify(record('turn-big-0001', { final: 'x'.repeat(MAX_RECORD) }));
  assert.equal((await saveTurn(post(big), envOf(db))).status, 413);
  // A body larger than its content-length says is still measured.
  const lying = post(big, '', '203.0.113.9', { 'content-length': '100' });
  assert.equal((await saveTurn(lying, envOf(db))).status, 413);
  // Multi-byte text counts in bytes: 100k Chinese characters are ~300 KB.
  assert.equal((await saveTurn(post(record('turn-big-0002', { final: '房'.repeat(100_000) })), envOf(db))).status, 413);
  assert.equal((await saveTurn(post('{not json'), envOf(db))).status, 400);
  assert.equal((await saveTurn(post('[1,2]'), envOf(db))).status, 400);
  assert.equal((await saveTurn(post(record('short')), envOf(db))).status, 400, 'turn id too short');
  assert.equal((await saveTurn(post(record('turn-ok-00001', { turn: 'has spaces in it' })), envOf(db))).status, 400);
  assert.equal((await saveTurn(post(record('turn-ok-00002', { conversation: undefined })), envOf(db))).status, 400);
  assert.equal((await saveTurn(post(record('turn-ok-00003', { ownKey: 'no' })), envOf(db))).status, 400);
  assert.equal((await saveTurn(post(record('turn-ok-00004', { model: 'm'.repeat(201) })), envOf(db))).status, 400);
  assert.equal(rows(db).length, 0);
  // Just under the cap is fine.
  const near = record('turn-near-cap', { final: '' });
  near.final = 'x'.repeat(MAX_RECORD - Buffer.byteLength(JSON.stringify(near)));
  assert.equal(Buffer.byteLength(JSON.stringify(near)), MAX_RECORD);
  assert.equal((await saveTurn(post(near), envOf(db))).status, 204);
});

test('writes per IP per day are limited', async () => {
  const db = migratedD1();
  const cookie = await visitor(db, 'turn-lim-00000');
  let last = 0;
  for (let i = 1; i < TURNS_PER_IP_DAILY; i++) last = (await saveTurn(post(record(`turn-lim-${String(i).padStart(5, '0')}`), cookie), envOf(db))).status;
  assert.equal(last, 204, `write ${TURNS_PER_IP_DAILY} is allowed`);
  const over = await saveTurn(post(record('turn-lim-over'), cookie), envOf(db));
  assert.equal(over.status, 429);
  assert.equal((await flagTurn(patch({ turn: 'turn-lim-00001', undone: true }, cookie), envOf(db))).status, 429, 'flags count too');
  assert.equal(rows(db).length, TURNS_PER_IP_DAILY);
  assert.equal((await saveTurn(post(record('turn-lim-other'), cookie, '198.51.100.1'), envOf(db))).status, 204, 'another IP is not affected');
});

test('records off: 204 and nothing stored', async () => {
  const db = migratedD1();
  const off = await saveTurn(post(record('turn-off-0001')), envOf(db, { TURN_RECORDS: 'false' }));
  assert.equal(off.status, 204);
  assert.equal((await flagTurn(patch({ turn: 'turn-off-0001', undone: true }), envOf(db, { TURN_RECORDS: 'false' }))).status, 204);
  assert.equal(rows(db).length, 0);
  assert.equal(db.statements, 0, 'no query at all');
  const none = await saveTurn(post(record('turn-off-0002')), envOf(undefined));
  assert.equal(none.status, 204, 'no database: 204');
});

test('retention: rows older than TURN_RECORDS_DAYS are deleted', async () => {
  const db = migratedD1();
  const cookie = await visitor(db, 'turn-new-00001');
  const now = Date.now();
  db.sqlite.prepare("insert into turn_record (turn, at, who, conversation, own_key, model, record) values ('turn-old-00001', ?, 'v:x', 'c', 0, 'm', '{}')").run(now - 31 * 86_400_000);
  db.sqlite.prepare("insert into turn_record (turn, at, who, conversation, own_key, model, record) values ('turn-mid-00001', ?, 'v:x', 'c', 0, 'm', '{}')").run(now - 3 * 86_400_000);
  await cleanupTurns(envOf(db), now);
  assert.deepEqual(rows(db).map((r) => r.turn), ['turn-mid-00001', 'turn-new-00001']);
  await cleanupTurns(envOf(db, { TURN_RECORDS_DAYS: '2' }), now);
  assert.deepEqual(rows(db).map((r) => r.turn), ['turn-new-00001']);
  assert.ok(cookie);
});

/** A record of about `kb` KB. */
const sized = (turn: string, kb: number) => {
  const r = record(turn, { final: '' });
  r.final = 'x'.repeat(kb * 1024 - Buffer.byteLength(JSON.stringify(r)) - 10);
  return JSON.stringify(r);
};

test('site-wide daily budget: stops storing at the limit, silently; flags still work; a new day resets it', async () => {
  const db = migratedD1();
  const env = envOf(db, { TURN_RECORDS_DAILY_MB: '1' });
  const cookie = await visitor(db, 'turn-bud-first');
  const logs: string[] = [];
  const log = console.log;
  console.log = (...a: unknown[]) => void logs.push(String(a[0]));
  try {
    const statuses: number[] = [];
    // 1 KB used by the first record; 100 KB each: 10 more fit in 1024 KB.
    for (let i = 0; i < 13; i++) statuses.push((await saveTurn(post(sized(`turn-bud-${String(i).padStart(4, '0')}`, 100), cookie), env)).status);
    assert.ok(statuses.every((s) => s === 204), 'the browser always sees 204');
    assert.equal(rows(db).length, 11, 'stored until the budget is used');
    const n = db.sqlite.prepare("select n from quota_counter where key like '%|turns-kb'").get() as { n: number };
    assert.ok(n.n <= 1024, `counter within the budget (${n.n} KB)`);
    assert.equal(logs.filter((l) => l.includes('"budget":"full"')).length, 1, 'one log line, not one per request');
    // Undo flags do not count against the budget.
    await flagTurn(patch({ turn: 'turn-bud-0000', undone: true }, cookie), env);
    assert.equal(rows(db).find((r) => r.turn === 'turn-bud-0000')!.undone, 1);
    // Tomorrow starts afresh.
    const now = Date.now;
    Date.now = () => now() + 86_400_000;
    try {
      assert.equal((await saveTurn(post(sized('turn-bud-tomorrow', 100), cookie), env)).status, 204);
    } finally {
      Date.now = now;
    }
    assert.ok(rows(db).some((r) => r.turn === 'turn-bud-tomorrow'), 'a new day resets the budget');
  } finally {
    console.log = log;
  }
});

test('site-wide daily budget holds under concurrent writes', async () => {
  const db = migratedD1(2);
  const env = envOf(db, { TURN_RECORDS_DAILY_MB: '1' });
  const cookie = await visitor(db, 'turn-race-first');
  const log = console.log;
  console.log = () => {};
  try {
    const res = await Promise.all(Array.from({ length: 30 }, (_, i) => saveTurn(post(sized(`turn-race-${String(i).padStart(4, '0')}`, 100), cookie, `198.51.100.${i}`), env)));
    assert.ok(res.every((r) => r.status === 204));
  } finally {
    console.log = log;
  }
  assert.equal(rows(db).length, 11, '1 small + 10 of 100 KB, never more');
});
