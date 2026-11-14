// Checks sign-in and the quota paths in Node (D1 look-alike over Node's
// SQLite, no network) and estimates their CPU time per request. workerd
// has no per-request CPU readout locally, so these are V8-in-Node
// approximations of the 10 ms free-tier limit, like relay-check.mjs.
//
//   node --experimental-strip-types --no-warnings scripts/auth-check.ts
import { getMigrations } from 'better-auth/db/migration';
import { getAuth, lastTestCode, sessionUser, warmUp } from '../src/server/auth.ts';
import { relayChat, relayStatus } from '../src/server/chat-relay.ts';
import { migratedD1 } from './d1-shim.ts';

// The test hook logs every code; keep the output readable.
const log = console.log;
console.log = (...a: unknown[]) => {
  if (!String(a[0]).startsWith('[auth test hook]')) log(...a);
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
const first = await cpu(async () => getAuth(env)!);
const ctx = await cpu(async () => first.value.$context);
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

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll auth and quota checks passed.');
