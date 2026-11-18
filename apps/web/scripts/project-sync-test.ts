// Unit tests of the projects sync logic (task 027; node --test, types
// stripped): src/lib/project-sync.ts against an in-memory account (the same
// rules as src/server/projects.ts: revisions, the count limit, 404s) with
// fake timers and a fake studio.
//   node --experimental-strip-types --no-warnings --test scripts/project-sync-test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProjectSync, type Current, type LocalLink, type ProjectMeta, type ProjectsApi, RETRY_MIN, SAVE_DELAY, type SyncDeps, THUMB_EVERY, THUMB_QUIET } from '../src/lib/project-sync.ts';

type Row = ProjectMeta & { house: string; chat: string; thumb?: string };

/** An account on a server: what src/server/projects.ts keeps, in memory. */
class Account {
  rows = new Map<string, Row>();
  max = 20;
  clock = 1_000_000;
  down = false;
  calls: string[] = [];
  seq = 0;
  meta = (r: Row): ProjectMeta => ({ id: r.id, name: r.name, summary: r.summary, revision: r.revision, createdAt: r.createdAt, updatedAt: r.updatedAt, thumbAt: r.thumbAt });
  add(house: unknown, name = '', chat = ''): Row {
    const r: Row = { id: `p${String(++this.seq).padStart(21, '0')}`, name, summary: JSON.stringify({ title: (house as { name: string }).name, style: 's', w: 1, d: 1, area: 1, storeys: 1, attic: false }), revision: 1, createdAt: ++this.clock, updatedAt: this.clock, thumbAt: 0, house: JSON.stringify(house), chat };
    this.rows.set(r.id, r);
    return r;
  }
  api(): ProjectsApi {
    const fail = (status: number, code: string, extra: object = {}) => ({ ok: false as const, status, code, ...extra });
    const wrap = <T>(name: string, fn: () => T) => {
      this.calls.push(name);
      return Promise.resolve(this.down ? fail(0, 'network') : fn());
    };
    return {
      list: () => wrap('list', () => ({ ok: true as const, value: { projects: [...this.rows.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(this.meta), max: this.max, maxKb: 512 } })),
      create: (p) => wrap('create', () => {
        if (this.rows.size >= this.max) return fail(409, 'full');
        const r = this.add(JSON.parse(p.house), p.name ?? '', p.chat);
        r.summary = p.summary;
        return { ok: true as const, value: { project: this.meta(r) } };
      }),
      duplicate: (from, name) => wrap('duplicate', () => {
        const src = this.rows.get(from);
        if (!src) return fail(404, 'not_found');
        if (this.rows.size >= this.max) return fail(409, 'full');
        const r = this.add(JSON.parse(src.house), name, src.chat);
        return { ok: true as const, value: { project: this.meta(r) } };
      }),
      read: (id) => wrap('read', () => {
        const r = this.rows.get(id);
        return r ? { ok: true as const, value: { project: this.meta(r), house: r.house, chat: r.chat } } : fail(404, 'not_found');
      }),
      save: (id, p) => wrap(`save ${id} @${p.base}`, () => {
        const r = this.rows.get(id);
        if (!r) return fail(404, 'not_found');
        if (r.revision !== p.base) return fail(409, 'conflict', { revision: r.revision });
        Object.assign(r, { house: p.house, chat: p.chat, summary: p.summary, revision: r.revision + 1, updatedAt: ++this.clock });
        return { ok: true as const, value: { project: this.meta(r) } };
      }),
      rename: (id, name) => wrap('rename', () => {
        const r = this.rows.get(id);
        if (!r) return fail(404, 'not_found');
        r.name = name;
        return { ok: true as const, value: { project: this.meta(r) } };
      }),
      remove: (id) => wrap('remove', () => (this.rows.delete(id) ? { ok: true as const, value: {} } : fail(404, 'not_found'))),
      putThumb: (id, image) => wrap(`thumb ${id}`, () => {
        const r = this.rows.get(id);
        if (!r) return fail(404, 'not_found');
        r.thumb = (image as unknown as { house: string }).house;
        r.thumbAt = ++this.clock;
        return { ok: true as const, value: { project: this.meta(r) } };
      }),
      share: (id, on) => wrap(`share ${id} ${on}`, () => {
        const r = this.rows.get(id);
        if (!r) return fail(404, 'not_found');
        return { ok: true as const, value: { project: { ...this.meta(r), share: on ? `tok-${id}` : null } } };
      }),
    };
  }
}

const house = (name: string, extra = 0) => ({ version: 1, name, style: 'modern-pitched', site: { w: 12000 + extra }, grid: {}, levels: [{ id: 'L1' }], roofs: [] }) as never;
const TEMPLATE = house('白墙坡顶小院');

/** A studio: the house and conversation on screen, the browser copy, timers that run when told. */
function studio(account: Account, start: Partial<Current> = {}, link: LocalLink | null = null) {
  const timers = new Map<number, { at: number; fn: () => void }>();
  let now = 0;
  let tid = 0;
  const s = {
    current: { house: TEMPLATE, conversation: 'c-local', items: [], ...start } as Current,
    link,
    applied: [] as Current[],
    notes: [] as string[],
    last: new Map<string, string>(),
    running: false,
    forgot: 0,
    /** No 3D viewer to draw a thumbnail with (a plan-only session). */
    noViewer: false,
    /** Advances the fake clock, running due timers. */
    async tick(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await settle();
      }
      now = end;
      await settle();
    },
    pending: () => timers.size,
  };
  const deps: SyncDeps = {
    api: account.api(),
    current: () => s.current,
    apply: (c) => {
      s.current = c;
      s.applied.push(c);
    },
    busy: () => s.running,
    readLink: () => s.link,
    writeLink: (l) => void (s.link = l ? { ...l } : null),
    pristine: (c) => JSON.stringify(c.house) === JSON.stringify(TEMPLATE) && !c.items.length,
    template: () => TEMPLATE,
    summary: (h) => ({ title: (h as { name: string }).name, style: 's', w: 1, d: 1, area: 1, storeys: 1, attic: false }),
    chatText: (conversation, items) => JSON.stringify({ conversation, items }),
    copyName: (n) => `${n} 副本`,
    displayName: (m) => m.name || JSON.parse(m.summary).title,
    notify: (k) => void s.notes.push(k),
    newConversation: () => `c-${Math.random().toString(36).slice(2)}`,
    lastOpened: { get: (u) => s.last.get(u) ?? null, set: (u, id) => void s.last.set(u, id) },
    setTimer: (fn, ms) => {
      timers.set(++tid, { at: now + ms, fn });
      return tid;
    },
    clearTimer: (t) => void timers.delete(t as number),
    // The picture of a house is its name here (what was on screen when it was taken).
    thumb: async (h) => (s.noViewer ? null : ({ house: (h as { name: string }).name } as unknown as Blob)),
    now: () => now,
    forgetLocal: () => void s.forgot++,
  };
  const sync = createProjectSync(deps);
  /** The studio edits its house (as autosave reports it). */
  const edit = (name: string) => {
    s.current = { ...s.current, house: house(name) };
    sync.noteEdit();
  };
  return { s, sync, edit, state: () => sync.store.getState() };
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};
const saves = (a: Account) => a.calls.filter((c) => c.startsWith('save'));

test('first sign-in with an edited local house: it becomes a project and stays open', async () => {
  const a = new Account();
  const { s, sync, state } = studio(a, { house: house('我的房子') });
  await sync.start('me@example.com');
  assert.equal(a.rows.size, 1);
  const row = [...a.rows.values()][0]!;
  assert.equal(JSON.parse(row.house).name, '我的房子');
  assert.equal(state().openId, row.id);
  assert.equal(s.applied.length, 0, 'nothing replaced what is on screen');
  assert.deepEqual(s.link, { user: 'me@example.com', id: row.id, revision: 1, dirty: false, name: '' });
});

test('first sign-in when the account already has projects: the local house is added and stays open', async () => {
  const a = new Account();
  a.add(house('旧项目一'));
  a.add(house('旧项目二'));
  const { s, sync, state } = studio(a, { house: house('新画的房子'), items: [{ id: 'm1', role: 'user', text: '你好' }] as never });
  await sync.start('me@example.com');
  assert.equal(a.rows.size, 3);
  assert.equal(state().projects.length, 3);
  assert.equal(JSON.parse(a.rows.get(state().openId!)!.house).name, '新画的房子');
  assert.equal(state().projects[0]!.id, state().openId, 'newest first');
  assert.equal(s.applied.length, 0);
});

test('an untouched template is not adopted: the last opened, else the newest, else a new project', async () => {
  const a = new Account();
  const older = a.add(house('较早'));
  const newer = a.add(house('较新'));
  const one = studio(a);
  await one.sync.start('me@example.com');
  assert.equal(a.rows.size, 2, 'no copy of the template');
  assert.equal(one.state().openId, newer.id, 'the most recently changed');
  assert.equal(one.s.current.house.name, '较新');

  const two = studio(a);
  two.s.last.set('me@example.com', older.id);
  await two.sync.start('me@example.com');
  assert.equal(two.state().openId, older.id, 'the one open last on this browser');

  const empty = new Account();
  const three = studio(empty);
  await three.sync.start('me@example.com');
  assert.equal(empty.rows.size, 1, 'a new project from the default template');
  assert.equal(three.state().openId, [...empty.rows.keys()][0]);
});

test('debounce: edits save once, SAVE_DELAY after the last one; flush sends at once', async () => {
  const a = new Account();
  const { sync, edit, s } = studio(a, { house: house('甲') });
  await sync.start('me@example.com');
  const id = sync.store.getState().openId!;
  edit('甲 1');
  await s.tick(SAVE_DELAY - 100);
  edit('甲 2');
  await s.tick(SAVE_DELAY - 100);
  edit('甲 3');
  assert.equal(saves(a).length, 0, 'nothing while editing');
  assert.equal(s.link?.dirty, true, 'the browser copy knows edits are pending');
  await s.tick(SAVE_DELAY);
  assert.deepEqual(saves(a), [`save ${id} @1`]);
  assert.equal(JSON.parse(a.rows.get(id)!.house).name, '甲 3');
  assert.equal(s.link?.revision, 2);
  assert.equal(s.link?.dirty, false);
  edit('甲 4');
  await sync.flush();
  assert.deepEqual(saves(a), [`save ${id} @1`, `save ${id} @2`]);
  await s.tick(SAVE_DELAY);
  assert.equal(saves(a).length, 2, 'the debounce timer is gone');
  await sync.flush();
  assert.equal(saves(a).length, 2, 'nothing to send');
  // While the assistant works, saves wait (unless flushed).
  s.running = true;
  edit('甲 5');
  await s.tick(SAVE_DELAY * 3);
  assert.equal(saves(a).length, 2);
  s.running = false;
  await s.tick(SAVE_DELAY);
  assert.equal(saves(a).length, 3);
});

test('an edit made while a save is on its way stays pending', async () => {
  const a = new Account();
  const { sync, edit, s } = studio(a, { house: house('乙') });
  await sync.start('me@example.com');
  edit('乙 1');
  const p = sync.flush();
  edit('乙 2');
  await p;
  assert.equal(sync.debug().dirty, true);
  await s.tick(SAVE_DELAY);
  assert.equal(JSON.parse(a.rows.get(sync.store.getState().openId!)!.house).name, '乙 2');
  assert.equal(sync.debug().dirty, false);
});

test('revision conflict with local edits: both kept, the local one as a copy that stays open; one notice', async () => {
  const a = new Account();
  const { sync, edit, s, state } = studio(a, { house: house('丙') });
  await sync.start('me@example.com');
  const id = state().openId!;
  // Another device saves first.
  const r = a.rows.get(id)!;
  Object.assign(r, { house: JSON.stringify(house('丙 另一台')), revision: 2, updatedAt: ++a.clock });
  edit('丙 这台');
  await s.tick(SAVE_DELAY);
  assert.equal(JSON.parse(a.rows.get(id)!.house).name, '丙 另一台', 'the other device is not overwritten');
  assert.equal(a.rows.size, 2);
  const copy = state().openId!;
  assert.notEqual(copy, id);
  assert.equal(JSON.parse(a.rows.get(copy)!.house).name, '丙 这台');
  assert.equal(a.rows.get(copy)!.name, '丙 副本');
  assert.deepEqual(s.notes, ['conflict']);
  assert.equal(s.applied.length, 0, 'what is on screen stays');
  assert.equal(s.link?.id, copy);
});

test('revision conflict without local edits: the other device\'s version is loaded (start and when visible again)', async () => {
  const a = new Account();
  const row = a.add(house('丁'));
  const { sync, s, state } = studio(a, { house: house('丁') }, { user: 'me@example.com', id: row.id, revision: 1, dirty: false, name: '' });
  Object.assign(row, { house: JSON.stringify(house('丁 改过')), revision: 3 });
  await sync.start('me@example.com');
  assert.equal(s.current.house.name, '丁 改过');
  assert.equal(s.link?.revision, 3);
  assert.equal(a.rows.size, 1);
  Object.assign(row, { house: JSON.stringify(house('丁 又改过')), revision: 4, chat: JSON.stringify({ conversation: 'c-other', items: [{ id: 'm1', role: 'user', text: 'hi' }] }) });
  await sync.check();
  assert.equal(s.current.house.name, '丁 又改过');
  assert.equal(s.current.conversation, 'c-other');
  assert.equal(s.current.items.length, 1);
  assert.equal(state().openId, row.id);
  assert.equal(s.notes.length, 0);
});

test('a reload with edits not yet uploaded: sent with the revision they were based on', async () => {
  const a = new Account();
  const row = a.add(house('戊'));
  const { sync, s } = studio(a, { house: house('戊 未上传') }, { user: 'me@example.com', id: row.id, revision: 1, dirty: true, name: '' });
  await sync.start('me@example.com');
  assert.deepEqual(saves(a), [`save ${row.id} @1`]);
  assert.equal(JSON.parse(row.house).name, '戊 未上传');
  assert.equal(s.link?.dirty, false);
});

test('sign-out: the house stays as this browser\'s; signing in again resumes the same project (no copy)', async () => {
  const a = new Account();
  const { sync, edit, s, state } = studio(a, { house: house('己') });
  await sync.start('me@example.com');
  const id = state().openId!;
  edit('己 1');
  await sync.flush();
  sync.stop();
  assert.equal(state().on, false);
  assert.equal(state().openId, null);
  assert.equal(s.current.house.name, '己 1', 'still on screen');
  assert.equal(s.link?.id, id, 'the link is kept');
  edit('己 签出后');
  await s.tick(SAVE_DELAY * 2);
  assert.equal(saves(a).length, 1, 'nothing goes to the account signed out');
  assert.equal(s.link?.dirty, true);
  await sync.start('me@example.com');
  assert.equal(a.rows.size, 1, 'no duplicate');
  assert.equal(state().openId, id);
  assert.equal(JSON.parse(a.rows.get(id)!.house).name, '己 签出后');
});

test('another account signing in on this browser gets the house as a new project of its own', async () => {
  const a = new Account();
  const b = new Account();
  b.seq = 100;
  const one = studio(a, { house: house('庚') });
  await one.sync.start('a@example.com');
  one.sync.stop();
  const two = studio(b, one.s.current, one.s.link);
  await two.sync.start('b@example.com');
  assert.equal(b.rows.size, 1);
  assert.equal(two.s.link?.user, 'b@example.com');
  assert.notEqual(two.s.link?.id, one.s.link?.id);
});

test('a failed save: "not synced", retried with back-off, nothing lost; online retries at once', async () => {
  const a = new Account();
  const { sync, edit, s, state } = studio(a, { house: house('辛') });
  await sync.start('me@example.com');
  a.down = true;
  edit('辛 1');
  await s.tick(SAVE_DELAY);
  assert.equal(state().failed, 'retry');
  await s.tick(RETRY_MIN);
  await s.tick(RETRY_MIN * 2);
  assert.equal(saves(a).length, 3, 'tried at 0, +2 s, +4 s');
  assert.equal(s.link?.dirty, true);
  a.down = false;
  sync.retryNow();
  await settle();
  assert.equal(state().failed, null);
  assert.equal(JSON.parse(a.rows.get(state().openId!)!.house).name, '辛 1');
  const n = saves(a).length;
  await s.tick(60_000);
  assert.equal(saves(a).length, n, 'no retry left over');
});

test('switch, create, rename, duplicate, delete (the open one: the next most recent opens)', async () => {
  const a = new Account();
  const other = a.add(house('别的'), '', JSON.stringify({ conversation: 'c-other', items: [{ id: 'm1', role: 'user', text: '旧对话' }] }));
  const { sync, edit, s, state } = studio(a, { house: house('壬') });
  await sync.start('me@example.com');
  const first = state().openId!;
  edit('壬 未存');
  assert.equal(await sync.open(other.id), true);
  assert.equal(JSON.parse(a.rows.get(first)!.house).name, '壬 未存', 'the pending save went first');
  assert.equal(s.current.house.name, '别的');
  assert.equal(s.current.conversation, 'c-other');
  assert.equal(s.last.get('me@example.com'), other.id);

  assert.equal(await sync.create(), null);
  const fresh = state().openId!;
  assert.equal(a.rows.size, 3);
  assert.equal(s.current.items.length, 0);

  assert.equal(await sync.rename(fresh, ' 老家 '), true);
  assert.equal(state().name, '老家');
  assert.equal(a.rows.get(fresh)!.revision, 1, 'a rename is not a save');

  assert.ok('id' in (await sync.duplicate(fresh)));
  assert.equal(a.rows.size, 4);
  assert.ok([...a.rows.values()].some((r) => r.name === '老家 副本'));

  // Delete the open project: the most recent other one opens.
  assert.equal(await sync.remove(fresh), true);
  assert.equal(a.rows.has(fresh), false);
  assert.notEqual(state().openId, fresh);
  assert.equal(state().openId, state().projects[0]!.id);

  // At the limit, nothing more is created.
  a.max = a.rows.size;
  await sync.refresh();
  assert.equal(await sync.create(), 'full');
  assert.deepEqual(await sync.duplicate(state().openId!), { error: 'full' });
});

test('deleting the last project opens a new one from the default template', async () => {
  const a = new Account();
  const { sync, state, s } = studio(a, { house: house('癸') });
  await sync.start('me@example.com');
  const only = state().openId!;
  await sync.remove(only);
  assert.equal(a.rows.size, 1);
  assert.notEqual(state().openId, only);
  assert.equal(s.current.house.name, '白墙坡顶小院');
});

test('the open project deleted on another device: when visible again the next opens; with pending edits they become a project', async () => {
  const a = new Account();
  const keep = a.add(house('留下'));
  const { sync, edit, s, state } = studio(a, { house: house('子') });
  await sync.start('me@example.com');
  const gone = state().openId!;
  a.rows.delete(gone);
  await sync.check();
  assert.equal(state().openId, keep.id);
  // Pending edits on a project deleted elsewhere: they are not lost.
  a.rows.delete(keep.id);
  edit('留下 改过');
  await s.tick(SAVE_DELAY);
  assert.equal(a.rows.size, 1);
  assert.equal(JSON.parse([...a.rows.values()][0]!.house).name, '留下 改过');
  assert.equal(state().openId, [...a.rows.keys()][0]);
});

const thumbs = (a: Account) => a.calls.filter((c) => c.startsWith('thumb'));

test('thumbnails: one after a save and a quiet moment, then at most one per THUMB_EVERY, of the house as saved; a project without one gets one when opened', async () => {
  const a = new Account();
  const old = a.add(house('旧的，没有图'));
  const { sync, edit, s, state } = studio(a, { house: house('图') });
  await sync.start('me@example.com');
  const id = state().openId!;
  await s.tick(THUMB_QUIET - 100);
  assert.equal(thumbs(a).length, 0, 'not at once: after a quiet moment');
  await s.tick(100);
  assert.equal(thumbs(a).length, 1, 'the adopted project gets its picture');
  assert.equal(a.rows.get(id)!.thumb, '图');
  edit('图 1');
  await s.tick(SAVE_DELAY);
  assert.equal(thumbs(a).length, 1, 'not again within THUMB_EVERY');
  edit('图 2');
  await s.tick(SAVE_DELAY);
  await s.tick(THUMB_EVERY);
  assert.equal(thumbs(a).length, 2, 'once the interval has passed');
  assert.equal(a.rows.get(id)!.thumb, '图 2');
  assert.ok(state().projects.find((p) => p.id === id)!.thumbAt > 0, 'the list knows the new version');
  await s.tick(THUMB_EVERY * 3);
  assert.equal(thumbs(a).length, 2, 'nothing changed: no new picture');
  await sync.open(old.id);
  await s.tick(THUMB_EVERY + THUMB_QUIET);
  assert.equal(a.rows.get(old.id)!.thumb, '旧的，没有图');
});

test('the address: ?p= opens that project; an unknown one is "not found" and nothing else opens; ?new= makes one from a template', async () => {
  const a = new Account();
  const one = a.add(house('一'));
  a.add(house('二'));
  const x = studio(a);
  await x.sync.start('me@example.com', { id: one.id });
  assert.equal(x.state().openId, one.id);
  assert.equal(x.s.current.house.name, '一');
  assert.equal(x.s.applied.length, 1, 'only the asked-for project was put on screen');

  const y = studio(a);
  await y.sync.start('me@example.com', { id: 'p-not-mine-000000000000' });
  assert.equal(y.state().missing, 'p-not-mine-000000000000');
  assert.equal(y.state().openId, null);
  assert.equal(y.s.applied.length, 0);
  assert.equal(a.rows.size, 2, 'nothing created');

  const z = studio(a);
  await z.sync.start('me@example.com', { template: 't2' });
  assert.equal(a.rows.size, 3, 'one new project, no default one besides');
  assert.equal(z.state().openId, z.state().projects[0]!.id);
});

test('deleting from the projects page the project this browser holds: the browser copy goes too', async () => {
  const a = new Account();
  const { sync, s, state } = studio(a, { house: house('页') });
  await sync.start('me@example.com');
  const id = state().openId!;
  sync.stop();
  // The projects page: the sync is not started there.
  await sync.remove(id);
  assert.equal(a.rows.size, 0);
  assert.equal(s.link, null);
  assert.equal(s.forgot, 1);
});

test('no viewer to draw with (plan only): no picture, asked again later, drawn once one is there', async () => {
  const a = new Account();
  const { sync, s, state } = studio(a, { house: house('平面') });
  s.noViewer = true;
  await sync.start('me@example.com');
  const id = state().openId!;
  await s.tick(THUMB_QUIET + THUMB_EVERY * 2);
  assert.equal(a.rows.get(id)!.thumbAt, 0);
  s.noViewer = false;
  await s.tick(THUMB_EVERY);
  assert.ok(a.rows.get(id)!.thumbAt > 0);
  assert.equal(a.rows.get(id)!.thumb, '平面');
});

test('share (task 028): on and off update the list; a failure changes nothing', async () => {
  const a = new Account();
  const { sync, state } = studio(a, { house: house('分享') });
  await sync.start('me@example.com');
  const id = state().openId!;
  assert.equal((await sync.share(id, true))?.share, `tok-${id}`);
  assert.equal(state().projects.find((p) => p.id === id)!.share, `tok-${id}`);
  assert.equal((await sync.share(id, false))?.share, null);
  assert.equal(state().projects.find((p) => p.id === id)!.share, null);
  a.down = true;
  assert.equal(await sync.share(id, true), null);
  assert.equal(state().projects.find((p) => p.id === id)!.share, null);
});
