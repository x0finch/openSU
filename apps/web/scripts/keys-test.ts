// Unit tests of API keys saved with the account (task 022; node --test,
// types stripped). Real sign-in (Better Auth with the localhost test hook)
// on Node's SQLite through the D1 look-alike with the real migrations; the
// provider is a fetch mock.
//   node --experimental-strip-types --no-warnings --test scripts/keys-test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lastTestCode, loadAuth } from '../src/server/auth.ts';
import { relayChat, relayStatus } from '../src/server/chat-relay.ts';
import { KEY_WRITES_PER_HOUR, keysConfig, keysRoute, openKey, sealKey } from '../src/server/keys.ts';
import { migratedD1, type ShimD1 } from './d1-shim.ts';

const SITE = 'http://localhost:8787';
const KEYS_SECRET = 'keys-secret-for-tests-0123456789abcdef';
const envOf = (db: ShimD1, over: Record<string, string> = {}) => ({
  DB: db,
  SITE_URL: SITE,
  BETTER_AUTH_SECRET: 'test-secret-not-real-0123456789abcdef',
  AUTH_TEST_HOOK: '1',
  OPENROUTER_API_KEY: 'sk-or-site-key',
  KEYS_SECRET,
  ...over,
});
type Env = ReturnType<typeof envOf>;
// One database for every test: Better Auth is built once per configuration (as in a Worker isolate).
const shared = migratedD1();

// Quiet: the test hook logs codes, the relay one line per call (kept to check them).
const lines: string[] = [];
const log = console.log;
const err = console.error;
console.log = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
console.error = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
process.on('exit', () => {
  console.log = log;
  console.error = err;
});

/** Upstream calls the relay made (the provider is mocked). */
const upstream: { url: string; auth: string | null; body: Record<string, unknown> }[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const h = new Headers(init?.headers);
  upstream.push({ url: String(input), auth: h.get('authorization'), body: JSON.parse(String(init?.body ?? '{}')) });
  return new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
}) as typeof fetch;

const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
let ipSeq = 0;
/** Signs `email` in with the test hook; returns the session cookie. */
async function signIn(env: Env, email: string): Promise<string> {
  const auth = (await loadAuth(env))!;
  const ip = `198.51.100.${++ipSeq}`;
  const req = (path: string, body: unknown) => new Request(`${SITE}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: SITE, 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
  assert.equal((await auth.handler(req('/email-otp/send-verification-otp', { email, type: 'sign-in' }))).status, 200);
  const res = await auth.handler(req('/sign-in/email-otp', { email, otp: lastTestCode(email) }));
  assert.equal(res.status, 200);
  return cookiesOf(res);
}

const keysReq = (method: string, cookie: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${SITE}/api/keys`, { method, headers: { 'content-type': 'application/json', origin: SITE, cookie, 'cf-connecting-ip': '203.0.113.20', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const chatReq = (cookie: string, provider: string | null, turn = `turn-${Math.random().toString(36).slice(2, 12)}`) =>
  new Request(`${SITE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'x-opensu-turn': turn, 'cf-connecting-ip': '203.0.113.21', ...(provider ? { 'x-opensu-account-key': provider } : {}) },
    body: JSON.stringify({ model: 'default', messages: [{ role: 'user', content: 'hello' }], tools: [] }),
  });

const ANT = 'sk-ant-api03-not-a-real-key-abcd';
const OR = 'sk-or-v1-not-a-real-key-wxyz';

test('encryption: round trip; a wrong secret, another user or provider, or a changed byte fails closed', async () => {
  const sealed = await sealKey(KEYS_SECRET, 'user-a', 'anthropic', ANT);
  assert.match(sealed, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
  assert.ok(!sealed.includes(ANT) && !sealed.includes(ANT.slice(-12)), 'no plaintext in the stored value');
  assert.equal(await openKey(KEYS_SECRET, 'user-a', 'anthropic', sealed), ANT);
  assert.notEqual(await sealKey(KEYS_SECRET, 'user-a', 'anthropic', ANT), sealed, 'a fresh IV each time');
  assert.equal(await openKey('another-secret-0123456789abcdef-xyz', 'user-a', 'anthropic', sealed), null);
  assert.equal(await openKey(KEYS_SECRET, 'user-b', 'anthropic', sealed), null);
  assert.equal(await openKey(KEYS_SECRET, 'user-a', 'openai', sealed), null);
  const flipped = sealed.slice(0, -2) + (sealed.at(-2) === 'A' ? 'B' : 'A') + sealed.at(-1);
  assert.equal(await openKey(KEYS_SECRET, 'user-a', 'anthropic', flipped), null);
  assert.equal(await openKey(KEYS_SECRET, 'user-a', 'anthropic', 'garbage'), null);
});

test('no KEYS_SECRET (or a short one, or no sign-in): the feature is off everywhere', async () => {
  const db = shared;
  const on = envOf(db);
  const cookie = await signIn(on, 'off@example.com');
  for (const over of [{ KEYS_SECRET: '' }, { KEYS_SECRET: 'short' }, { AUTH_ENABLED: 'false' }]) {
    const env = envOf(db, over);
    assert.equal(keysConfig(env).enabled, false, JSON.stringify(over));
    for (const m of ['GET', 'PUT', 'PATCH', 'DELETE']) {
      const r = await keysRoute(keysReq(m, cookie, m === 'GET' ? undefined : { provider: 'openai', key: OR }), env);
      assert.equal(r.status, 404);
      assert.equal(((await r.json()) as { error: { code: string } }).error.code, 'keys_off');
    }
    const st = (await (await relayStatus(new Request(`${SITE}/api/chat`, { headers: { cookie } }), env)).json()) as { keys: boolean };
    assert.equal(st.keys, false, 'status says keys are off');
    const n = upstream.length;
    const r = await relayChat(chatReq(cookie, 'openai'), env);
    assert.equal(r.status, 503);
    assert.equal(((await r.json()) as { error: { code: string } }).error.code, 'account_key_off');
    assert.equal(upstream.length, n, 'never falls back to the site key');
  }
  const st = (await (await relayStatus(new Request(`${SITE}/api/chat`, { headers: { cookie } }), on)).json()) as { keys: boolean };
  assert.equal(st.keys, true);
});

test('save, list, choose, change the model, delete; the full key never comes back', async () => {
  const db = shared;
  const env = envOf(db);
  const cookie = await signIn(env, 'saver@example.com');
  assert.equal((await keysRoute(keysReq('GET', ''), env)).status, 401, 'signed out: refused');
  const empty = await (await keysRoute(keysReq('GET', cookie), env)).json();
  assert.deepEqual(empty, { enabled: true, keys: [], active: null });

  const saved = await keysRoute(keysReq('PUT', cookie, { provider: 'anthropic', key: `  ${ANT} `, model: '', use: true }), env);
  assert.equal(saved.status, 200);
  const text = await saved.text();
  assert.ok(!text.includes(ANT) && !text.includes(ANT.slice(0, -4)), 'the reply holds no key');
  const list = JSON.parse(text) as { keys: { provider: string; hint: string; model: string }[]; active: string };
  assert.deepEqual(list.keys.map((k) => [k.provider, k.hint, k.model]), [['anthropic', 'abcd', '']]);
  assert.equal(list.active, 'anthropic');
  const row = db.sqlite.prepare("select * from account_key where user_id = (select id from user where email = 'saver@example.com')").get() as Record<string, unknown>;
  assert.ok(!JSON.stringify(row).includes(ANT.slice(4, -4)), 'the database holds no plaintext');

  await keysRoute(keysReq('PUT', cookie, { provider: 'openrouter', key: OR, model: 'anthropic/claude-haiku-5.5' }), env);
  let l = (await (await keysRoute(keysReq('GET', cookie), env)).json()) as { keys: { provider: string; model: string }[]; active: string | null };
  assert.deepEqual(l.keys.map((k) => k.provider), ['openrouter', 'anthropic'], 'provider order');
  assert.equal(l.active, 'anthropic', 'saving without `use` keeps the choice');

  l = await (await keysRoute(keysReq('PATCH', cookie, { active: 'openrouter' }), env)).json();
  assert.equal(l.active, 'openrouter');
  l = await (await keysRoute(keysReq('PATCH', cookie, { active: null }), env)).json();
  assert.equal(l.active, null, 'back to the free allowance');
  l = await (await keysRoute(keysReq('PATCH', cookie, { provider: 'anthropic', model: 'claude-sonnet-5-5' }), env)).json();
  assert.equal(l.keys.find((k) => k.provider === 'anthropic')?.model, 'claude-sonnet-5-5');
  assert.equal((await keysRoute(keysReq('PATCH', cookie, { active: 'openai' }), env)).status, 404, 'cannot choose a provider without a key');
  assert.equal((await keysRoute(keysReq('PATCH', cookie, { provider: 'openai', model: 'x' }), env)).status, 404);

  // Replacing keeps one row per provider.
  await keysRoute(keysReq('PUT', cookie, { provider: 'openrouter', key: 'sk-or-v1-second-key-9876', use: true }), env);
  l = await (await keysRoute(keysReq('GET', cookie), env)).json();
  assert.equal(l.keys.length, 2);
  assert.equal((l.keys.find((k) => k.provider === 'openrouter') as unknown as { hint: string }).hint, '9876');
  // Deleting the key in use falls back to the free allowance.
  l = await (await keysRoute(keysReq('DELETE', cookie, { provider: 'openrouter' }), env)).json();
  assert.deepEqual([l.keys.map((k) => k.provider), l.active], [['anthropic'], null]);
});

test('bad input, other origins and non-JSON writes are refused', async () => {
  const db = shared;
  const env = envOf(db);
  const cookie = await signIn(env, 'strict@example.com');
  const code = async (r: Response) => [r.status, ((await r.json()) as { error: { code: string } }).error.code];
  assert.deepEqual(await code(await keysRoute(keysReq('PUT', cookie, { provider: 'openai', key: OR }, { origin: 'https://evil.example' }), env)), [403, 'bad_origin']);
  const noOrigin = new Request(`${SITE}/api/keys`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ provider: 'openai', key: OR }) });
  assert.deepEqual(await code(await keysRoute(noOrigin, env)), [403, 'bad_origin']);
  assert.deepEqual(await code(await keysRoute(keysReq('PUT', cookie, { provider: 'openai', key: OR }, { 'content-type': 'text/plain' }), env)), [415, 'bad_request']);
  assert.deepEqual(await code(await keysRoute(keysReq('PUT', cookie, { provider: 'gemini', key: OR }), env)), [400, 'bad_provider']);
  assert.deepEqual(await code(await keysRoute(keysReq('PUT', cookie, { provider: 'openai', key: 'short' }), env)), [400, 'bad_key']);
  assert.deepEqual(await code(await keysRoute(keysReq('PUT', cookie, { provider: 'openai', key: 'has a space in it' }), env)), [400, 'bad_key']);
  assert.deepEqual(await code(await keysRoute(keysReq('PUT', cookie, { provider: 'openai', key: OR, model: 'm'.repeat(201) }), env)), [400, 'bad_model']);
  assert.deepEqual(await code(await keysRoute(keysReq('PUT', cookie, { provider: 'openai', key: OR, model: '模型' }), env)), [400, 'bad_model']);
  assert.equal((await keysRoute(keysReq('POST', cookie, { provider: 'openai', key: OR }), env)).status, 405);
  assert.equal(db.sqlite.prepare("select count(*) as n from account_key where user_id = (select id from user where email = 'strict@example.com')").get()!.n, 0);
});

test('another user cannot read, use or delete a key', async () => {
  const db = shared;
  const env = envOf(db);
  const a = await signIn(env, 'alice@example.com');
  const b = await signIn(env, 'bob@example.com');
  await keysRoute(keysReq('PUT', a, { provider: 'anthropic', key: ANT, use: true }), env);
  const lb = (await (await keysRoute(keysReq('GET', b), env)).json()) as { keys: unknown[] };
  assert.deepEqual(lb.keys, [], 'bob sees none of alice\'s keys');
  assert.equal((await keysRoute(keysReq('PATCH', b, { active: 'anthropic' }), env)).status, 404);
  assert.equal((await keysRoute(keysReq('PATCH', b, { provider: 'anthropic', model: 'x' }), env)).status, 404);
  await keysRoute(keysReq('DELETE', b, { provider: 'anthropic' }), env);
  const la = (await (await keysRoute(keysReq('GET', a), env)).json()) as { keys: unknown[]; active: string };
  assert.equal(la.keys.length, 1, 'still there after bob\'s delete');
  const n = upstream.length;
  const r = await relayChat(chatReq(b, 'anthropic'), env);
  assert.equal(r.status, 409, 'bob cannot use it');
  assert.equal(upstream.length, n);
  // A row copied to bob does not decrypt (the user id is bound in).
  db.sqlite.exec("insert into account_key (user_id, provider, secret, hint, model, chosen, created_at, updated_at) select (select id from user where email = 'bob@example.com'), provider, secret, hint, model, 1, created_at, updated_at from account_key where user_id = (select id from user where email = 'alice@example.com')");
  const copied = await relayChat(chatReq(b, 'anthropic'), env);
  assert.equal(copied.status, 503);
  assert.equal(((await copied.json()) as { error: { code: string } }).error.code, 'account_key_unreadable');
  assert.equal(upstream.length, n, 'nothing reached the provider');
  // Signed out: refused, never the site key.
  const out = await relayChat(chatReq('', 'anthropic'), env);
  assert.equal(out.status, 401);
  assert.equal(((await out.json()) as { error: { code: string } }).error.code, 'account_key_signed_out');
  assert.equal(upstream.length, n);
});

test('the relay uses the saved key, skips the quota, and the key appears in no response or log line', async () => {
  const db = shared;
  const env = envOf(db, { QUOTA_USER_DAILY: '1' });
  const cookie = await signIn(env, 'relay@example.com');
  await keysRoute(keysReq('PUT', cookie, { provider: 'anthropic', key: ANT, use: true }), env);
  await keysRoute(keysReq('PUT', cookie, { provider: 'openai', key: OR, model: 'gpt-6-luna' }), env);
  const counters = () => db.sqlite.prepare("select count(*) as n from quota_counter where key not like '%|keys:%' and key not like '%|rl:%'").get()!.n;
  const before = counters();
  lines.length = 0;
  const n = upstream.length;
  for (let i = 0; i < 3; i++) {
    const r = await relayChat(chatReq(cookie, 'anthropic'), env);
    assert.equal(r.status, 200);
    const body = await r.text();
    assert.ok(!body.includes(ANT));
  }
  const calls = upstream.slice(n);
  assert.equal(calls.length, 3, 'three calls although the daily allowance is 1');
  assert.ok(calls.every((c) => c.url === 'https://api.anthropic.com/v1/chat/completions' && c.auth === `Bearer ${ANT}`), 'Anthropic\'s OpenAI-compatible endpoint, with the saved key');
  assert.equal(calls[0]!.body.model, 'claude-opus-5-5', 'the provider\'s default model');
  assert.equal(calls[0]!.body.max_tokens, 32000, 'an output cap for Anthropic');
  assert.equal(calls[0]!.body.stream, true);
  assert.equal(counters(), before, 'no quota counter moved');
  const r2 = await relayChat(chatReq(cookie, 'openai'), env);
  await r2.arrayBuffer();
  const last = upstream.at(-1)!;
  assert.equal(last.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(last.body.model, 'gpt-6-luna', 'the saved model');
  assert.equal(last.body.max_tokens, undefined, 'no cap added for OpenAI on the user\'s key');
  const chat = lines.filter((l) => l.startsWith('{"msg":"chat"')).map((l) => JSON.parse(l) as Record<string, unknown>);
  assert.equal(chat.length, 4);
  assert.ok(chat.every((c) => c.key === 'own' && c.quota === null && c.upstream === 200), JSON.stringify(chat[0]));
  assert.ok(!lines.join('\n').includes(ANT) && !lines.join('\n').includes(OR) && !lines.join('\n').includes('relay@example.com'), 'no key or email in any log line');
  // The site's key is still metered for the same user.
  const site1 = await relayChat(chatReq(cookie, null), env);
  const site2 = await relayChat(chatReq(cookie, null), env);
  assert.deepEqual([site1.status, site2.status], [200, 429]);
});

test('a changed KEYS_SECRET fails closed: refused, no call, one log line without the key', async () => {
  const db = shared;
  const env = envOf(db);
  const cookie = await signIn(env, 'rotate@example.com');
  await keysRoute(keysReq('PUT', cookie, { provider: 'openrouter', key: OR, use: true }), env);
  lines.length = 0;
  const n = upstream.length;
  const r = await relayChat(chatReq(cookie, 'openrouter'), envOf(db, { KEYS_SECRET: 'a-different-secret-0123456789abcdef' }));
  assert.equal(r.status, 503);
  assert.equal(((await r.json()) as { error: { code: string } }).error.code, 'account_key_unreadable');
  assert.equal(upstream.length, n);
  assert.ok(lines.some((l) => /could not be decrypted/.test(l)) && !lines.join('\n').includes(OR));
});

test('writes per user per hour are limited', async () => {
  const db = shared;
  const env = envOf(db);
  const cookie = await signIn(env, 'busy@example.com');
  const other = await signIn(env, 'calm@example.com');
  const statuses: number[] = [];
  for (let i = 0; i < KEY_WRITES_PER_HOUR + 2; i++) statuses.push((await keysRoute(keysReq('PUT', cookie, { provider: 'openai', key: `sk-test-key-${i}-0000` }), env)).status);
  assert.ok(statuses.slice(0, KEY_WRITES_PER_HOUR).every((s) => s === 200), statuses.join());
  assert.deepEqual(statuses.slice(KEY_WRITES_PER_HOUR), [429, 429]);
  assert.equal((await keysRoute(keysReq('DELETE', cookie, { provider: 'openai' }), env)).status, 429, 'every kind of write counts');
  assert.equal((await keysRoute(keysReq('GET', cookie), env)).status, 200, 'reading is not limited');
  assert.equal((await keysRoute(keysReq('PUT', other, { provider: 'openai', key: OR }), env)).status, 200, 'another user is not affected');
});
