// Unit tests of projects kept with the account (task 027; node --test,
// types stripped). Real sign-in (Better Auth with the localhost test hook)
// on Node's SQLite through the D1 look-alike with the real migrations.
//   node --experimental-strip-types --no-warnings --test scripts/projects-test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lastTestCode, loadAuth } from '../src/server/auth.ts';
import { relayStatus } from '../src/server/chat-relay.ts';
import { PROJECT_TYPE, PROJECT_WRITES_PER_HOUR, projectsRoute, shareRoute, THUMB_MAX, thumbRoute } from '../src/server/projects.ts';
import { SHARE_READS_PER_HOUR, sharedRoute, sharePreview, sharePreviewHtml } from '../src/server/share.ts';
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
  assert.deepEqual(Object.keys(list.data.projects[0]).sort(), ['createdAt', 'id', 'name', 'revision', 'share', 'summary', 'thumbAt', 'updatedAt']);

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

test('thumbnails: stored as sent, own column, versioned in the list, cached privately, copied with a duplicate, owner only', async () => {
  const env = envOf(shared);
  const a = await signIn(env, 'thumbs@example.com');
  const b = await signIn(env, 'thumbs-other@example.com');
  const p = (await call(env, 'POST', a, undefined, framed({ summary: SUMMARY }, HOUSE, ''))).data.project;
  assert.equal(p.thumbAt, 0, 'none yet');
  const img = new Uint8Array(2000).map((_, i) => i % 251);
  const put = (cookie: string, body: Uint8Array, type = 'image/webp', id = p.id) =>
    thumbRoute(new Request(`${SITE}/api/projects/${id}/thumb`, { method: 'PUT', headers: { 'content-type': type, origin: SITE, cookie }, body }), env, id);
  const get = (cookie: string, id = p.id) => thumbRoute(new Request(`${SITE}/api/projects/${id}/thumb?v=1`, { headers: { cookie } }), env, id);
  assert.equal((await get(a)).status, 404);
  const r = await put(a, img);
  assert.equal(r.status, 200);
  const meta = ((await r.json()) as { project: { thumbAt: number; revision: number } }).project;
  assert.ok(meta.thumbAt > 0);
  assert.equal(meta.revision, 1, 'a thumbnail is not a save');
  const g = await get(a);
  assert.equal(g.headers.get('content-type'), 'image/webp');
  assert.match(g.headers.get('cache-control') ?? '', /private, max-age=31536000, immutable/);
  assert.deepEqual(new Uint8Array(await g.arrayBuffer()), img);
  assert.equal((await call(env, 'GET', a)).data.projects.find((x: { id: string }) => x.id === p.id).thumbAt, meta.thumbAt);
  // Not someone else's; not other types; not too large.
  assert.equal((await get(b)).status, 404);
  assert.equal((await put(b, img)).status, 404);
  assert.equal((await put(a, img, 'image/png')).status, 415);
  assert.equal((await put(a, new Uint8Array(THUMB_MAX + 1))).status, 413);
  const dup = (await call(env, 'POST', a, undefined, { from: p.id, name: 'copy' })).data.project;
  assert.ok(dup.thumbAt > 0);
  assert.deepEqual(new Uint8Array(await (await get(a, dup.id)).arrayBuffer()), img);
});

/* ---- Share links (task 028) ---- */

const share = async (env: Env, method: 'POST' | 'DELETE', cookie: string, id: string, headers: Record<string, string> = {}) => {
  const res = await shareRoute(new Request(`${SITE}/api/projects/${id}/share`, { method, headers: { origin: SITE, cookie, ...headers } }), env, id);
  return { status: res.status, data: (await res.json()) as Record<string, any> };
};
let viewerIp = 0;
/** A public read by token: no cookie, its own IP unless given. */
const view = async (env: Env, token: string, headers: Record<string, string> = {}, what: 'house' | 'thumb' = 'house') => {
  const res = await sharedRoute(new Request(`${SITE}/api/share/${token}${what === 'thumb' ? '/thumb' : ''}`, { headers: { 'cf-connecting-ip': `192.0.2.${++viewerIp % 250}`, ...headers } }), env, token, what);
  const text = res.status === 304 ? '' : what === 'thumb' && res.ok ? '' : await res.text();
  return { res, status: res.status, data: text ? (JSON.parse(text) as Record<string, any>) : null, text };
};

test('share: on makes a random token (not the id), stable while on; the token reads only that house, no conversation or owner', async () => {
  const env = envOf(shared);
  const a = await signIn(env, 'share-a@example.com');
  const p = (await call(env, 'POST', a, undefined, framed({ summary: SUMMARY }, HOUSE, CHAT))).data.project;
  const other = (await call(env, 'POST', a, undefined, framed({ summary: SUMMARY }, HOUSE.replace('白墙坡顶小院', '另一座'), CHAT))).data.project;
  assert.equal(p.share, null, 'off by default');
  const on = await share(env, 'POST', a, p.id);
  assert.equal(on.status, 200);
  const token = on.data.project.share as string;
  assert.match(token, /^[A-Za-z0-9_-]{22}$/, '128 random bits, base64url');
  assert.notEqual(token, p.id);
  assert.equal((await share(env, 'POST', a, p.id)).data.project.share, token, 'on again while on: the same address');
  assert.equal((await call(env, 'GET', a)).data.projects.find((x: { id: string }) => x.id === p.id).share, token, 'the owner\'s list knows');
  assert.equal((await call(env, 'GET', a)).data.projects.find((x: { id: string }) => x.id === other.id).share, null);

  const r = await view(env, token);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.data!).sort(), ['house', 'name', 'updatedAt']);
  assert.deepEqual(r.data!.house, JSON.parse(HOUSE), 'the house as stored');
  assert.ok(!r.text.includes('conv-0001') && !r.text.includes('你好') && !r.text.includes('share-a@') && !r.text.includes(p.id), 'no conversation, owner or project id in the public payload');
  assert.equal(r.res.headers.get('cache-control'), 'no-cache');
  // Revalidation: the same revision and name answer 304 without the house; a save or a rename changes it.
  const etag = r.res.headers.get('etag')!;
  assert.equal((await view(env, token, { 'if-none-match': etag })).status, 304);
  await call(env, 'PUT', a, p.id, framed({ base: 1, summary: SUMMARY }, HOUSE.replace('白墙坡顶小院', '新版本'), CHAT));
  const v2 = await view(env, token, { 'if-none-match': etag });
  assert.equal(v2.status, 200, 'the viewer always gets the owner\'s current version');
  assert.equal(v2.data!.house.name, '新版本');
  await call(env, 'PATCH', a, p.id, { name: '给爸妈看的' });
  const v3 = await view(env, token, { 'if-none-match': v2.res.headers.get('etag')! });
  assert.equal(v3.status, 200, 'a rename alone is not a 304');
  assert.equal(v3.data!.name, '给爸妈看的');
  assert.equal(v3.data!.house.name, '新版本');
  // A duplicate is never shared; unknown and malformed tokens read nothing.
  assert.equal((await call(env, 'POST', a, undefined, { from: p.id, name: 'copy' })).data.project.share, null);
  assert.equal((await view(env, 'A'.repeat(22))).status, 404);
  assert.equal((await view(env, p.id)).status, 404, 'the project id is not a token');
  assert.equal((await view(env, '../x')).data!.error.code, 'not_shared');
});

test('share: off kills the address at once; on again makes a new one', async () => {
  const env = envOf(shared);
  const a = await signIn(env, 'share-off@example.com');
  const p = (await call(env, 'POST', a, undefined, framed({ summary: SUMMARY }, HOUSE, CHAT))).data.project;
  const t1 = (await share(env, 'POST', a, p.id)).data.project.share as string;
  assert.equal((await view(env, t1)).status, 200);
  const off = await share(env, 'DELETE', a, p.id);
  assert.equal(off.status, 200);
  assert.equal(off.data.project.share, null);
  const dead = await view(env, t1);
  assert.equal(dead.status, 404);
  assert.equal(dead.data!.error.code, 'not_shared');
  assert.equal((await view(env, t1, {}, 'thumb')).status, 404);
  const t2 = (await share(env, 'POST', a, p.id)).data.project.share as string;
  assert.notEqual(t2, t1);
  assert.equal((await view(env, t1)).status, 404, 'the old address stays dead');
  assert.equal((await view(env, t2)).status, 200);
  // Deleting the project ends the link too.
  await call(env, 'DELETE', a, p.id);
  assert.equal((await view(env, t2)).status, 404);
});

test('share: other users cannot turn it on or off; signed out, other origins and projects off are refused', async () => {
  const env = envOf(shared);
  const a = await signIn(env, 'share-owner@example.com');
  const b = await signIn(env, 'share-intruder@example.com');
  const p = (await call(env, 'POST', a, undefined, framed({ summary: SUMMARY }, HOUSE, CHAT))).data.project;
  assert.equal((await share(env, 'POST', b, p.id)).status, 404);
  assert.equal((await call(env, 'GET', a, p.id)).data.project.share, null);
  const token = (await share(env, 'POST', a, p.id)).data.project.share as string;
  assert.equal((await share(env, 'DELETE', b, p.id)).status, 404);
  assert.equal((await view(env, token)).status, 200, 'still shared');
  assert.equal((await share(env, 'POST', '', p.id)).status, 401);
  assert.equal((await share(env, 'DELETE', a, p.id, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await view(env, token)).status, 200);
  const offEnv = envOf(shared, { PROJECTS_ENABLED: 'false' });
  assert.equal((await share(offEnv, 'POST', a, p.id)).data.error.code, 'projects_off');
  assert.equal((await view(offEnv, token)).data!.error.code, 'projects_off', 'sharing is absent when projects are off');
  assert.equal(await sharePreview(offEnv, new URL(`${SITE}/studio?s=${token}`), 'zh'), null);
});

test('share: the thumbnail by token, public reads rate-limited per IP', async () => {
  const env = envOf(shared);
  const a = await signIn(env, 'share-thumb@example.com');
  const p = (await call(env, 'POST', a, undefined, framed({ summary: SUMMARY }, HOUSE, CHAT))).data.project;
  const token = (await share(env, 'POST', a, p.id)).data.project.share as string;
  assert.equal((await view(env, token, {}, 'thumb')).status, 404, 'no picture yet');
  const img = new Uint8Array(1500).map((_, i) => i % 13);
  await thumbRoute(new Request(`${SITE}/api/projects/${p.id}/thumb`, { method: 'PUT', headers: { 'content-type': 'image/webp', origin: SITE, cookie: a }, body: img }), env, p.id);
  const t = await view(env, token, {}, 'thumb');
  assert.equal(t.status, 200);
  assert.equal(t.res.headers.get('content-type'), 'image/webp');
  assert.match(t.res.headers.get('cache-control') ?? '', /public, max-age=300/);
  assert.deepEqual(new Uint8Array(await t.res.arrayBuffer()), img);
  // One IP over the hour's limit is refused; another IP is not.
  let last = 0;
  for (let i = 0; i < SHARE_READS_PER_HOUR; i++) last = (await view(env, token, { 'cf-connecting-ip': '203.0.113.99' })).status;
  assert.equal(last, 200);
  assert.equal((await view(env, token, { 'cf-connecting-ip': '203.0.113.99' })).status, 429);
  assert.equal((await view(env, token, { 'cf-connecting-ip': '203.0.113.98' })).status, 200);
});

test('share: the link preview (title, description, image) for the prerendered page', async () => {
  const env = envOf(shared);
  const a = await signIn(env, 'share-preview@example.com');
  const p = (await call(env, 'POST', a, undefined, framed({ summary: SUMMARY }, HOUSE, CHAT))).data.project;
  const token = (await share(env, 'POST', a, p.id)).data.project.share as string;
  const url = new URL(`${SITE}/studio?s=${token}`);
  const zh = (await sharePreview(env, url, 'zh'))!;
  assert.equal(zh.title, '白墙坡顶小院 · openSU', 'the house title until the owner renames');
  assert.match(zh.description, /12 × 14 m 宅基地，186\.4 m²，2 层。/);
  assert.equal(zh.image, null, 'no thumbnail: the default image');
  await call(env, 'PATCH', a, p.id, { name: '给"爸妈" <看>' });
  await thumbRoute(new Request(`${SITE}/api/projects/${p.id}/thumb`, { method: 'PUT', headers: { 'content-type': 'image/webp', origin: SITE, cookie: a }, body: new Uint8Array(10) }), env, p.id);
  const en = (await sharePreview(env, url, 'en'))!;
  assert.equal(en.title, '给"爸妈" <看> · openSU');
  assert.match(en.description, /^12 × 14 m plot · 186\.4 m² · 2 storeys\. /);
  assert.match(en.image!, new RegExp(`^${SITE}/api/share/${token}/thumb\\?v=\\d+$`));
  const page = '<!DOCTYPE html><html><head><meta charSet="utf-8"/><title>工作室 · openSU</title><meta name="description" content="描述你想要的房子"/><meta name="robots" content="noindex"/></head><body></body></html>';
  const html = sharePreviewHtml(page, en, SITE);
  assert.ok(html.includes('<title>给&quot;爸妈&quot; &lt;看&gt; · openSU</title>'), 'the title, escaped');
  assert.ok(html.includes(`<meta property="og:image" content="${en.image}"/>`));
  assert.ok(html.includes('<meta name="description" content="12 × 14 m plot'), 'the description replaced');
  assert.equal(html.match(/<title>/g)!.length, 1);
  assert.ok(html.indexOf('og:title') < html.indexOf('</head>'));
  const gone = (await sharePreview(env, new URL(`${SITE}/studio?s=${'B'.repeat(22)}`), 'zh'))!;
  assert.equal(gone.title, '这个链接已不再分享 · openSU');
});
