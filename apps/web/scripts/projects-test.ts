// Unit tests of projects kept with the account (task 027; node --test,
// types stripped). Real sign-in (Better Auth with the localhost test hook)
// on Node's SQLite through the D1 look-alike with the real migrations.
//   node --experimental-strip-types --no-warnings --test scripts/projects-test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lastTestCode, loadAuth } from '../src/server/auth.ts';
import { relayStatus } from '../src/server/chat-relay.ts';
import { PROJECT_TYPE, PROJECT_WRITES_PER_HOUR, projectsRoute } from '../src/server/projects.ts';
import { migratedD1, type ShimD1 } from './d1-shim.ts';

const SITE = 'http://localhost:8787';
const envOf = (db: ShimD1, over: Record<string, string> = {}) => ({
  DB: db,
  SITE_URL: SITE,
  BETTER_AUTH_SECRET: 'test-secret-not-real-0123456789abcdef',
  AUTH_TEST_HOOK: '1',
  ...over,
});
type Env = ReturnType<typeof envOf>;
const shared = migratedD1();

const lines: string[] = [];
const log = console.log;
const err = console.error;
console.log = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
console.error = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
process.on('exit', () => {
  console.log = log;
  console.error = err;
});

const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
let ipSeq = 0;
async function signIn(env: Env, email: string): Promise<string> {
  const auth = (await loadAuth(env))!;
  const ip = `198.51.100.${++ipSeq}`;
  const req = (path: string, body: unknown) => new Request(`${SITE}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: SITE, 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
  assert.equal((await auth.handler(req('/email-otp/send-verification-otp', { email, type: 'sign-in' }))).status, 200);
  const res = await auth.handler(req('/sign-in/email-otp', { email, otp: lastTestCode(email) }));
  assert.equal(res.status, 200);
  return cookiesOf(res);
}

/** A framed body (fields, house, conversation): what the browser sends to create or save. */
class Framed {
  text: string;
  constructor(fields: unknown, house: string, chat: string) {
    this.text = `${JSON.stringify(fields)}\n${house}\n${chat}`;
  }
}
const framed = (fields: unknown, house: string, chat: string) => new Framed(fields, house, chat);
const call = async (env: Env, method: string, cookie: string, id?: string, body?: unknown, headers: Record<string, string> = {}) => {
  const url = `${SITE}/api/projects${id ? `/${id}` : ''}`;
  const type = body instanceof Framed ? PROJECT_TYPE : 'application/json';
  const raw = body === undefined ? undefined : body instanceof Framed ? body.text : typeof body === 'string' ? body : JSON.stringify(body);
  const res = await projectsRoute(new Request(url, { method, headers: { 'content-type': type, origin: SITE, cookie, ...headers }, body: raw }), env, id);
  const text = await res.text();
  if ((res.headers.get('content-type') ?? '').startsWith(PROJECT_TYPE)) {
    const a = text.indexOf('\n');
    const b = text.indexOf('\n', a + 1);
    return { status: res.status, data: { ...JSON.parse(text.slice(0, a)), house: text.slice(a + 1, b), chat: text.slice(b + 1) } as Record<string, any> };
  }
  return { status: res.status, data: JSON.parse(text) as Record<string, any> };
};

const HOUSE = JSON.stringify({ version: 1, name: '白墙坡顶小院', style: 'modern-pitched', site: {}, grid: {}, levels: [{}], roofs: [] });
const CHAT = JSON.stringify({ conversation: 'conv-0001', items: [{ id: 'm1', role: 'user', text: '你好' }] });
const SUMMARY = JSON.stringify({ title: '白墙坡顶小院', style: 'modern-pitched', w: 12000, d: 14000, area: 186.4, storeys: 2, attic: false });

test('off without sign-in, with PROJECTS_ENABLED=false, and the status says so', async () => {
  const db = migratedD1();
  for (const env of [{ DB: db, SITE_URL: SITE }, envOf(db, { PROJECTS_ENABLED: 'false' })]) {
    const r = await call(env as Env, 'GET', '');
    assert.equal(r.status, 404);
    assert.equal(r.data.error.code, 'projects_off');
    const st = (await (await relayStatus(new Request(`${SITE}/api/chat`), env as never)).json()) as { projects: unknown };
    assert.equal(st.projects, null);
  }
  const st = (await (await relayStatus(new Request(`${SITE}/api/chat`), envOf(db, { PROJECTS_MAX: '7', PROJECT_MAX_KB: '64' }) as never)).json()) as { projects: unknown };
  assert.deepEqual(st.projects, { max: 7, maxKb: 64 });
});

test('create, list (no large columns), read, save with the revision, rename, duplicate, delete', async () => {
  const env = envOf(shared);
  const cookie = await signIn(env, 'projects-a@example.com');
  assert.equal((await call(env, 'GET', '')).status, 401, 'signed out: refused');
  const empty = await call(env, 'GET', cookie);
  assert.deepEqual(empty.data, { projects: [], max: 20, maxKb: 512 });

  const made = await call(env, 'POST', cookie, undefined, framed({ summary: SUMMARY }, HOUSE, CHAT));
  assert.equal(made.status, 201);
  const p = made.data.project;
  assert.match(p.id, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(p.revision, 1);
  assert.equal(p.name, '');

  // The list query never reads the house or the conversation.
  const list = await call(env, 'GET', cookie);
  assert.deepEqual(Object.keys(list.data.projects[0]).sort(), ['createdAt', 'id', 'name', 'revision', 'summary', 'updatedAt']);

  const read = await call(env, 'GET', cookie, p.id);
  assert.equal(read.data.house, HOUSE);
  assert.equal(read.data.chat, CHAT);

  const house2 = HOUSE.replace('白墙坡顶小院', '白墙坡顶小院 2');
  const saved = await call(env, 'PUT', cookie, p.id, framed({ base: 1, summary: SUMMARY }, house2, CHAT));
  assert.equal(saved.status, 200);
  assert.equal(saved.data.project.revision, 2);
  assert.equal((await call(env, 'GET', cookie, p.id)).data.house, house2);

  // A save based on an old revision is refused with the current one.
  const stale = await call(env, 'PUT', cookie, p.id, framed({ base: 1, summary: SUMMARY }, HOUSE, CHAT));
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error.code, 'conflict');
  assert.equal(stale.data.error.revision, 2);
  assert.equal((await call(env, 'GET', cookie, p.id)).data.house, house2, 'nothing overwritten');

  // Rename: neither the revision nor the time changes.
  const t0 = saved.data.project.updatedAt;
  const renamed = await call(env, 'PATCH', cookie, p.id, { name: '  我的  老家 ' });
  assert.equal(renamed.data.project.name, '我的 老家');
  assert.equal(renamed.data.project.revision, 2);
  assert.equal(renamed.data.project.updatedAt, t0);
  assert.equal((await call(env, 'PATCH', cookie, p.id, { name: 'x'.repeat(81) })).status, 400);

  // Duplicate inside D1.
  const dup = await call(env, 'POST', cookie, undefined, { from: p.id, name: '我的 老家 副本' });
  assert.equal(dup.status, 201);
  assert.notEqual(dup.data.project.id, p.id);
  assert.equal(dup.data.project.revision, 1);
  assert.equal((await call(env, 'GET', cookie, dup.data.project.id)).data.house, house2);
  assert.equal((await call(env, 'GET', cookie)).data.projects.length, 2);

  assert.equal((await call(env, 'DELETE', cookie, p.id)).status, 200);
  assert.equal((await call(env, 'GET', cookie, p.id)).status, 404);
  assert.equal((await call(env, 'DELETE', cookie, p.id)).status, 404);
  assert.equal((await call(env, 'PUT', cookie, p.id, framed({ base: 2, summary: SUMMARY }, HOUSE, CHAT))).status, 404);
  assert.equal((await call(env, 'GET', cookie)).data.projects.length, 1);
});

test('another user cannot list, read, save, rename, duplicate or delete', async () => {
  const env = envOf(shared);
  const a = await signIn(env, 'owner-b@example.com');
  const b = await signIn(env, 'intruder@example.com');
  const p = (await call(env, 'POST', a, undefined, framed({ summary: SUMMARY }, HOUSE, CHAT))).data.project;
  assert.equal((await call(env, 'GET', b)).data.projects.length, 0);
  assert.equal((await call(env, 'GET', b, p.id)).status, 404);
  assert.equal((await call(env, 'PUT', b, p.id, framed({ base: 1, summary: '{}' }, '{}', ''))).status, 404);
  assert.equal((await call(env, 'PATCH', b, p.id, { name: 'mine' })).status, 404);
  assert.equal((await call(env, 'POST', b, undefined, { from: p.id, name: 'mine' })).status, 404);
  assert.equal((await call(env, 'DELETE', b, p.id)).status, 404);
  const still = await call(env, 'GET', a, p.id);
  assert.equal(still.data.house, HOUSE);
  assert.equal(still.data.project.name, '');
});

test('limits: the number of projects and the size, both from the environment', async () => {
  const env = envOf(shared, { PROJECTS_MAX: '3', PROJECT_MAX_KB: '16' });
  const cookie = await signIn(env, 'limits@example.com');
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) ids.push((await call(env, 'POST', cookie, undefined, framed({ summary: SUMMARY }, HOUSE, ''))).data.project.id);
  const full = await call(env, 'POST', cookie, undefined, framed({ summary: SUMMARY }, HOUSE, ''));
  assert.equal(full.status, 409);
  assert.equal(full.data.error.code, 'full');
  assert.equal((await call(env, 'POST', cookie, undefined, { from: ids[0], name: 'x' })).data.error.code, 'full');
  assert.equal((await call(env, 'GET', cookie)).data.projects.length, 3);
  // 16 KB: a body over it is refused before anything is stored.
  const big = 'x'.repeat(17 * 1024);
  const tooBig = await call(env, 'PUT', cookie, ids[0], framed({ base: 1, summary: SUMMARY }, big, ''));
  assert.equal(tooBig.status, 413);
  assert.equal((await call(env, 'GET', cookie, ids[0])).data.project.revision, 1);
  const fits = await call(env, 'PUT', cookie, ids[0], framed({ base: 1, summary: SUMMARY }, 'x'.repeat(15 * 1024), ''));
  assert.equal(fits.status, 200);
});

test('bad input, other origins, unknown methods and the hourly write limit', async () => {
  const env = envOf(shared);
  const cookie = await signIn(env, 'bad@example.com');
  assert.equal((await call(env, 'POST', cookie, undefined, { house: HOUSE }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(env, 'POST', cookie, undefined, { house: HOUSE }, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await call(env, 'POST', cookie, undefined, 'not json')).status, 400);
  assert.equal((await call(env, 'POST', cookie, undefined, { house: { an: 'object' }, chat: '', summary: '{}' })).data.error.code, 'bad_project', 'the house travels as a line of a framed body');
  assert.equal((await call(env, 'POST', cookie, undefined, Object.assign(framed({ summary: '{}' }, HOUSE, ''), { text: `{"summary":"{}"}\n${HOUSE}` }))).data.error.code, 'bad_project', 'three lines');
  assert.equal((await call(env, 'POST', cookie, undefined, framed({ summary: 'x'.repeat(1025) }, HOUSE, ''))).data.error.code, 'bad_project');
  assert.equal((await call(env, 'GET', cookie, '../etc')).status, 404);
  const p = (await call(env, 'POST', cookie, undefined, framed({ summary: '{}' }, HOUSE, ''))).data.project;
  assert.equal((await call(env, 'PUT', cookie, p.id, framed({ base: '1', summary: '{}' }, HOUSE, ''))).status, 400);
  assert.equal((await call(env, 'POST', cookie, p.id, {})).status, 405);
  // Writes per hour.
  let last = 0;
  for (let i = 0; i < PROJECT_WRITES_PER_HOUR; i++) last = (await call(env, 'PATCH', cookie, p.id, { name: `n${i}` })).status;
  assert.equal(last, 429);
});

test('a deleted user takes their projects along', async () => {
  // One database for the tests: Better Auth is built once per configuration, on the first one.
  const env = envOf(shared);
  const cookie = await signIn(env, 'gone@example.com');
  assert.equal((await call(env, 'POST', cookie, undefined, framed({ summary: '{}' }, HOUSE, ''))).status, 201);
  const count = () => (shared.sqlite.prepare(`SELECT count(*) AS n FROM project WHERE user_id = (SELECT id FROM "user" WHERE email = 'gone@example.com')`).get() as { n: number }).n;
  const all = () => (shared.sqlite.prepare('SELECT count(*) AS n FROM project').get() as { n: number }).n;
  assert.equal(count(), 1);
  const n0 = all();
  shared.sqlite.exec('PRAGMA foreign_keys = ON');
  shared.sqlite.exec(`DELETE FROM "user" WHERE email = 'gone@example.com'`);
  assert.equal(all(), n0 - 1);
});
