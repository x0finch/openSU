// Checks sign-in and the quota paths in Node (D1 look-alike over Node's
// SQLite, no network) and estimates their CPU time per request. workerd
// has no per-request CPU readout locally, so these are V8-in-Node
// approximations of the 10 ms free-tier limit, like relay-check.mjs.
//
//   node --experimental-transform-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/auth-check.ts
// (the resolve hook lets the turn record fixtures load the agent's sources).
import { getMigrations } from 'better-auth/db/migration';
import { accountRoute, startAuth } from '../src/server/accounts.ts';
import { authTesting, lastTestCode, loadAuth, sessionUser, warmUp } from '../src/server/auth.ts';
import { relayChat, relayStatus } from '../src/server/chat-relay.ts';
import { keysRoute } from '../src/server/keys.ts';
import { flagTurn, MAX_RECORD, saveTurn } from '../src/server/turns.ts';
import { migratedD1 } from './d1-shim.ts';
import { fixtureRecords } from './turn-fixtures.ts';

// The test hook logs every code and the relay one JSON line per call; keep the output readable.
const log = console.log;
const chatLines: string[] = [];
console.log = (...a: unknown[]) => {
  const first = String(a[0]);
  if (first.startsWith('{"msg":"chat"')) chatLines.push(first);
  else if (!first.startsWith('[auth test hook]')) log(...a);
};

const failures: string[] = [];
const check = (cond: boolean, msg: string) => {
  if (!cond) failures.push(msg);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`);
};

const SITE = 'http://localhost:8787';
const db = migratedD1();
const env = {
  DB: db,
  SITE_URL: SITE,
  BETTER_AUTH_SECRET: 'test-secret-not-real-0123456789abcdef',
  AUTH_TEST_HOOK: '1',
  OPENROUTER_API_KEY: 'sk-or-test',
  KEYS_SECRET: 'keys-secret-not-real-0123456789abcdef',
};

/** CPU of `fn` in this process minus the time spent inside SQLite (D1 runs that remotely). */
const cpu = async <T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> => {
  const d0 = db.dbCpuUs;
  const c0 = process.cpuUsage();
  const value = await fn();
  const c = process.cpuUsage(c0);
  return { ms: (c.user + c.system - (db.dbCpuUs - d0)) / 1000, value };
};
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]!;
const median = (xs: number[]) => pct(xs, 0.5);

const authReq = (path: string, body?: unknown, cookie = '', ip = '203.0.113.7') =>
  new Request(`${SITE}/api/auth${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', origin: SITE, cookie, 'cf-connecting-ip': ip },
    body: body ? JSON.stringify(body) : undefined,
  });
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

// Upstream mock for the relay.
globalThis.fetch = (async () => new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch;

console.log('sign-in (email code, test hook)');
const first = await cpu(async () => (await loadAuth(env))!);
const ctx = { ms: 0 };
const statementsBefore = db.statements;
const warm = await cpu(async () => warmUp(first.value, SITE));
console.log(`  Worker startup (src/server.ts, not a request): Better Auth instance ${(first.ms + ctx.ms).toFixed(2)} ms + warm-up ${warm.ms.toFixed(2)} ms`);
check(db.statements === statementsBefore, 'startup warm-up runs no query (no I/O is allowed in the global scope)');
const auth = first.value;

// migrations/0001_auth.sql is exactly what this Better Auth version expects
// (the runtime schema check is off; see auth.ts).
{
  const m = await getMigrations({ ...auth.options, database: db.sqlite } as never);
  check(m.toBeCreated.length === 0 && m.toBeAdded.length === 0, `migrations match Better Auth's schema (missing: ${[...m.toBeCreated, ...m.toBeAdded].map((t: { table: string }) => t.table).join(', ') || 'none'})`);
}

let sendMs: number[] = [];
let signMs: number[] = [];
let sessMs: number[] = [];
let cookie = '';
for (let i = 0; i < 60; i++) {
  const email = `person${i}@example.com`;
  const s = await cpu(() => auth.handler(authReq('/email-otp/send-verification-otp', { email, type: 'sign-in' }, '', `198.51.${i >> 8}.${i & 255}`)));
  if (i === 0) check(s.value.status === 200, `send code -> ${s.value.status}`);
  sendMs.push(s.ms);
  const otp = lastTestCode(email);
  if (i === 0) check(!!otp && /^\d{6}$/.test(otp), 'the test hook holds a 6-digit code');
  if (i === 0) {
    const wrong = await auth.handler(authReq('/sign-in/email-otp', { email, otp: otp === '000000' ? '111111' : '000000' }));
    check(wrong.status >= 400, `a wrong code is refused (${wrong.status})`);
  }
  const r = await cpu(() => auth.handler(authReq('/sign-in/email-otp', { email, otp }, '', `198.51.${i >> 8}.${i & 255}`)));
  if (i === 0) check(r.value.status === 200, `sign in with the code -> ${r.value.status}`);
  signMs.push(r.ms);
  cookie = cookiesOf(r.value);
  if (i === 0) check(/opensu\.session_token=/.test(cookie), 'session cookie set');
  const g = await cpu(() => sessionUser(new Request(`${SITE}/api/chat`, { headers: { cookie } }), env));
  if (i === 0) check(g.value?.email === email, 'the session names the user');
  sessMs.push(g.ms);
}
// The first calls include one-time lazy work (JIT, lazily built schemas).
const firsts = { send: sendMs[0]!, sign: signMs[0]!, sess: sessMs[0]! };
sendMs = sendMs.slice(10);
signMs = signMs.slice(10);
sessMs = sessMs.slice(10);
const show = (label: string, xs: number[], first: number) =>
  console.log(`  ${label}: median ${median(xs).toFixed(2)} ms, p90 ${pct(xs, 0.9).toFixed(2)} ms, max ${Math.max(...xs).toFixed(2)} ms; first call ${first.toFixed(2)} ms`);
show('send code', sendMs, firsts.send);
show('sign in with code', signMs, firsts.sign);
show('read session (cookie cache)', sessMs, firsts.sess);

// Per-address limit.
{
  const email = 'flood@example.com';
  const codes: number[] = [];
  for (let i = 0; i < 7; i++) codes.push((await auth.handler(authReq('/email-otp/send-verification-otp', { email, type: 'sign-in' }, '', `192.0.2.${i}`))).status);
  check(codes.slice(0, 5).every((c) => c === 200) && codes.slice(5).every((c) => c === 429), `codes per address per hour limited (${codes.join(',')})`);
}
// Per-IP limit.
{
  const codes: number[] = [];
  for (let i = 0; i < 22; i++) codes.push((await auth.handler(authReq('/email-otp/send-verification-otp', { email: `ip${i}@example.com`, type: 'sign-in' }, '', '192.0.2.200'))).status);
  check(codes.filter((c) => c === 429).length >= 1 && codes[0] === 200, `sends per IP limited (${codes.filter((c) => c === 200).length} allowed of 22)`);
}

console.log('quota on /api/chat');
const chatReq = (turn: string, cookieHeader = '', ip = '203.0.113.50') =>
  new Request(`${SITE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-opensu-turn': turn, cookie: cookieHeader, 'cf-connecting-ip': ip },
    body: JSON.stringify({ model: 'default', messages: [{ role: 'user', content: 'x'.repeat(30000) }] }),
  });
{
  // Anonymous: a visitor cookie, three turns.
  const st = await relayStatus(new Request(`${SITE}/api/chat`, { headers: { 'cf-connecting-ip': '203.0.113.50' } }), env);
  const visitor = cookiesOf(st);
  check(/opensu_v=/.test(visitor), 'GET /api/chat issues the visitor cookie');
  const j = (await st.json()) as { quota: { remaining: number; kind: string }; auth: { email: boolean } };
  check(j.quota.remaining === 3 && j.quota.kind === 'anon' && j.auth.email === true, 'status: anonymous, 3 left, email sign-in on');
  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) statuses.push((await relayChat(chatReq(`anon-turn-${i}`, visitor), env)).status);
  check(statuses.join() === '200,200,200,429', `anonymous: 3 turns then 429 (${statuses.join()})`);
  const signed: number[] = [];
  for (let i = 0; i < 11; i++) signed.push((await relayChat(chatReq(`user-turn-${i}`, cookie), env)).status);
  check(signed.filter((s) => s === 200).length === 10 && signed[10] === 429, 'signed in: 10 turns then 429');
  const own = await relayChat(new Request(`${SITE}/api/chat`, { method: 'POST', headers: { 'x-opensu-key': 'sk-own', 'x-opensu-turn': 'own-turn-1', cookie }, body: '{"messages":[]}' }), env);
  check(own.status === 200, 'own key: never limited');
}
// CPU of the quota path (owner's key): new turns and repeated calls.
{
  const c2 = { ...env, QUOTA_USER_DAILY: '100000', QUOTA_IP_DAILY: '100000', QUOTA_SITE_DAILY: '100000', QUOTA_CALLS_PER_TURN: '100000' };
  const anonStatus = await relayStatus(new Request(`${SITE}/api/chat`), c2);
  const visitor = cookiesOf(anonStatus);
  const ms = { anonNew: [] as number[], userNew: [] as number[], userSame: [] as number[], status: [] as number[] };
  for (let i = 0; i < 60; i++) {
    ms.anonNew.push((await cpu(async () => (await relayChat(chatReq(`anon-cpu-${i}-xxxx`, visitor), { ...c2, QUOTA_ANON_TRIAL: '100000' })).arrayBuffer())).ms);
    ms.userNew.push((await cpu(async () => (await relayChat(chatReq(`user-cpu-${i}-xxxx`, cookie), c2)).arrayBuffer())).ms);
    ms.userSame.push((await cpu(async () => (await relayChat(chatReq('user-cpu-same', cookie), c2)).arrayBuffer())).ms);
    ms.status.push((await cpu(async () => (await relayStatus(new Request(`${SITE}/api/chat`, { headers: { cookie } }), c2)).arrayBuffer())).ms);
  }
  const names: Record<string, string> = { anonNew: 'POST, anonymous, new turn', userNew: 'POST, signed in, new turn', userSame: 'POST, signed in, same turn', status: 'GET status, signed in' };
  for (const [k, v] of Object.entries(ms)) console.log(`  /api/chat ${names[k]}: median ${median(v.slice(5)).toFixed(2)} ms, p90 ${pct(v.slice(5), 0.9).toFixed(2)} ms, max ${Math.max(...v.slice(5)).toFixed(2)} ms (30 KB body, upstream mocked)`);
  const worst = Math.max(...Object.values(ms).map((v) => median(v.slice(5))), median(sendMs), median(signMs));
  check(worst < 5, `every path well under 10 ms in this approximation (worst median ${worst.toFixed(2)} ms)`);
}

// Keys saved with the account (task 022): list, save (one AES-GCM encryption),
// and a relayed chat call that decrypts the key. The first call of an isolate
// also derives the AES key (HKDF), included in "first".
console.log('keys saved with the account (/api/keys, /api/chat with x-opensu-account-key)');
{
  const kenv = { ...env, QUOTA_IP_DAILY: '100000' };
  const keysReq = (method: string, body?: unknown) =>
    new Request(`${SITE}/api/keys`, { method, headers: { 'content-type': 'application/json', origin: SITE, cookie, 'cf-connecting-ip': '198.18.3.1' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const ms = { save: [] as number[], list: [] as number[], choose: [] as number[], relay: [] as number[] };
  const firsts: Record<string, number> = {};
  const now = Date.now;
  for (let i = 0; i < 60; i++) {
    // A new hour every 20 writes keeps the write limit (30 per hour) out of the measurement.
    Date.now = () => now() + Math.floor(i / 10) * 3_600_000;
    const save = await cpu(async () => (await keysRoute(keysReq('PUT', { provider: 'anthropic', key: `sk-ant-api03-not-real-${i}-abcdefgh`, model: '', use: true }), kenv)).text());
    const list = await cpu(async () => (await keysRoute(keysReq('GET'), kenv)).text());
    const choose = await cpu(async () => (await keysRoute(keysReq('PATCH', { active: 'anthropic' }), kenv)).text());
    const relay = await cpu(async () => (await relayChat(new Request(`${SITE}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-opensu-turn': `key-cpu-${i}-xxxx`, 'x-opensu-account-key': 'anthropic', cookie, 'cf-connecting-ip': '198.18.3.2' }, body: JSON.stringify({ model: 'default', messages: [{ role: 'user', content: 'x'.repeat(30000) }] }) }), kenv)).arrayBuffer());
    if (i === 0) {
      check(JSON.parse(save.value).active === 'anthropic' && JSON.parse(list.value).keys[0]?.hint === 'efgh', 'save and list answer with the hint, not the key');
      Object.assign(firsts, { save: save.ms, list: list.ms, choose: choose.ms, relay: relay.ms });
    }
    ms.save.push(save.ms);
    ms.list.push(list.ms);
    ms.choose.push(choose.ms);
    ms.relay.push(relay.ms);
  }
  Date.now = now;
  const names: Record<string, string> = { save: 'PUT /api/keys (save, encrypt)', list: 'GET /api/keys (list)', choose: 'PATCH /api/keys (choose)', relay: '/api/chat POST with a saved key (decrypt, 30 KB body)' };
  for (const [k, v] of Object.entries(ms)) console.log(`  ${names[k]}: median ${median(v.slice(5)).toFixed(2)} ms, p90 ${pct(v.slice(5), 0.9).toFixed(2)} ms, max ${Math.max(...v.slice(5)).toFixed(2)} ms; first call ${firsts[k]!.toFixed(2)} ms`);
  const worst = Math.max(...Object.values(ms).map((v) => median(v.slice(5))));
  check(worst < 5, `keys paths well under 10 ms in this approximation (worst median ${worst.toFixed(2)} ms)`);
}

// The relay's log line (task 020): one per POST, no content, keys or email.
{
  const n = chatLines.length;
  await relayChat(chatReq('log-turn-0000', cookie, '198.18.0.1'), env);
  await (await relayChat(chatReq('log-turn-0001', cookie, '198.18.0.1'), { ...env, QUOTA_USER_DAILY: '100000' })).arrayBuffer();
  const own = await relayChat(new Request(`${SITE}/api/chat`, { method: 'POST', headers: { 'x-opensu-key': 'sk-own-secret-value', 'x-opensu-turn': 'log-turn-0002', cookie: 'opensu_v=abc' }, body: '{"messages":[{"role":"user","content":"secret message text"}]}' }), env);
  await own.arrayBuffer();
  const lines = chatLines.slice(n).map((l) => JSON.parse(l) as Record<string, unknown>);
  check(lines.length === 3, `one log line per POST (${lines.length})`);
  check(lines[0]?.quota === 'quota_exhausted' && lines[0]?.upstream === null && lines[0]?.caller === 'user', `refused by the quota: ${chatLines[n]}`);
  lines.shift();
  check(JSON.stringify(Object.keys(lines[0] ?? {})) === JSON.stringify(['msg', 'turn', 'caller', 'key', 'quota', 'model', 'upstream', 'ttfbMs']), `log fields: ${Object.keys(lines[0] ?? {}).join(', ')}`);
  check(lines[0]?.turn === 'log-turn-0001' && lines[0]?.caller === 'user' && lines[0]?.key === 'owner' && lines[0]?.quota === 'ok' && lines[0]?.upstream === 200 && typeof lines[0]?.ttfbMs === 'number', `owner's key, signed in: ${chatLines[n + 1]}`);
  check(lines[1]?.key === 'own' && lines[1]?.caller === 'anon' && lines[1]?.quota === null, `own key: ${chatLines[n + 2]}`);
  const all = chatLines.slice(n).join('\n');
  check(!/sk-own|sk-or|secret message|@example\.com/.test(all), 'no key, message or email in the log lines');
}

// Turn records (task 020): POST /api/turns with realistic records.
console.log('turn records (POST /api/turns)');
{
  const { small, large } = await fixtureRecords();
  // The largest body accepted: the large record padded with one long text piece.
  const capRec = JSON.parse(large) as { parts: unknown[] };
  capRec.parts.push({ type: 'text', text: '' });
  const pad = MAX_RECORD - Buffer.byteLength(JSON.stringify(capRec)) - 64;
  (capRec.parts.at(-1) as { text: string }).text = '房'.repeat(Math.floor(pad / 3));
  const cap = JSON.stringify(capRec);
  console.log(`  record sizes: small ${(Buffer.byteLength(small) / 1024).toFixed(1)} KB (one edit, sample house), large ${(Buffer.byteLength(large) / 1024).toFixed(1)} KB (largest template built in one turn), cap test ${(Buffer.byteLength(cap) / 1024).toFixed(1)} KB (limit ${MAX_RECORD / 1024} KB)`);
  const tenv = { ...env, QUOTA_IP_DAILY: '100000', TURN_RECORDS_DAILY_MB: '1000' };
  const anon = cookiesOf(await relayStatus(new Request(`${SITE}/api/chat`, { headers: { 'cf-connecting-ip': '198.18.1.1' } }), tenv));
  const req = (body: string, who: string, method = 'POST') => new Request(`${SITE}/api/turns`, { method, headers: { 'content-type': 'application/json', cookie: who, 'cf-connecting-ip': `198.18.2.${Math.floor(Math.random() * 250)}` }, body });
  const withTurn = (json: string, turn: string) => json.replace(/"turn":"[^"]+"/, `"turn":"${turn}"`);
  const ms: Record<string, number[]> = { 'anonymous, small': [], 'anonymous, large': [], 'signed in, large': [], 'signed in, at the cap': [], 'undo flag (PATCH)': [] };
  let statuses = new Set<number>();
  for (let i = 0; i < 60; i++) {
    const run = async (k: string, r: Request, f = saveTurn) => {
      const x = await cpu(() => f(r, tenv));
      statuses.add(x.value.status);
      ms[k]!.push(x.ms);
    };
    await run('anonymous, small', req(withTurn(small, `cpu-small-${i}-xxxx`), anon));
    await run('anonymous, large', req(withTurn(large, `cpu-large-${i}-xxxx`), anon));
    await run('signed in, large', req(withTurn(large, `cpu-ularge-${i}-xxxx`), cookie));
    await run('signed in, at the cap', req(withTurn(cap, `cpu-cap-${i}-xxxx`), cookie));
    await run('undo flag (PATCH)', req(JSON.stringify({ turn: `cpu-ularge-${i}-xxxx`, undone: true }), cookie, 'PATCH'), flagTurn);
  }
  check(statuses.size === 1 && statuses.has(204), `every record stored (${[...statuses].join(',')})`);
  const stored = db.sqlite.prepare("select count(*) as n, sum(undone) as u from turn_record where turn like 'cpu-%'").get() as { n: number; u: number };
  check(stored.n === 240 && stored.u === 60, `240 rows, 60 flagged undone (${stored.n}, ${stored.u})`);
  for (const [k, v] of Object.entries(ms)) console.log(`  /api/turns ${k}: median ${median(v.slice(5)).toFixed(2)} ms, p90 ${pct(v.slice(5), 0.9).toFixed(2)} ms, max ${Math.max(...v.slice(5)).toFixed(2)} ms`);
  const worst = Math.max(...Object.values(ms).map((v) => median(v.slice(5))));
  check(worst < 5, `/api/turns well under 10 ms in this approximation (worst median ${worst.toFixed(2)} ms)`);
  statuses = new Set();
}

// A sign-in that cannot start must not take anything else down (task 019 review).
console.log('sign-in that fails to build');
{
  const broken = { ...env, SITE_URL: 'http://localhost:8788', QUOTA_ANON_TRIAL: '3' };
  authTesting.failBuild = true;
  const errors: string[] = [];
  const err = console.error;
  console.error = (...a: unknown[]) => void errors.push(String(a[0]));
  let threw = false;
  try {
    await startAuth(broken);
  } catch {
    threw = true;
  }
  check(!threw && errors.some((e) => /auth: sign-in unavailable/.test(e)), 'startup survives a throwing build and logs one line');
  check(!errors.join(' ').includes(env.BETTER_AUTH_SECRET), 'the log line carries no secret');
  const r = await accountRoute(new Request('http://localhost:8788/api/auth/email-otp/send-verification-otp', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:8788' }, body: '{"email":"x@example.com","type":"sign-in"}' }), broken);
  check(r?.status === 503 && ((await r.json()) as { error: { code: string } }).error.code === 'auth_off', 'the lazy retry fails too: sign-in routes answer auth_off (503)');
  const other = await accountRoute(new Request('http://localhost:8788/studio'), broken);
  check(other === null, 'other paths are left to the app (the page is served as before)');
  const st = await relayStatus(new Request('http://localhost:8788/api/chat', { headers: { cookie } }), broken);
  const sj = (await st.json()) as { user: unknown; quota: { kind: string } | null };
  check(st.status === 200 && sj.user === null && sj.quota?.kind === 'anon', `GET /api/chat works; a session cookie counts as anonymous (${st.status}, ${JSON.stringify(sj.quota)})`);
  const post = await relayChat(chatReq('broken-auth-turn-1', cookie, '198.18.0.9'), broken);
  check(post.status === 200, `POST /api/chat works on the owner's key, metered as anonymous (${post.status})`);
  console.error = err;
  authTesting.failBuild = false;
  const again = await loadAuth({ ...broken, SITE_URL: 'http://localhost:8789' });
  check(!!again, 'a later build (new configuration) is not blocked by the failure');
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll auth and quota checks passed.');
