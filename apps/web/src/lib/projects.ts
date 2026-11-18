// Projects kept with the account (task 027): the app's side of the sync
// logic (project-sync.ts). The HTTP calls, the browser copy's link, the
// swap of house, conversation and undo history, and the hook that starts
// and stops syncing with the sign-in. Signed out (or on a server that does
// not keep projects) nothing here runs: one local house, as before.
import type { House } from '@opensu/model';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { type ChatItem, newChat, restoreItems, useChat } from '../chat/chat-store';
import { autosaveHooks, clearSaved, quietly, restoreChat, savedHouse, saveNow } from './autosave';
import { type Lang, type MessageKey, translate } from './i18n';
import { createProjectSync, type Current, type LocalLink, parseSummary, type ProjectMeta, type ProjectsApi, type ProjectsState, type Result, type Summary } from './project-sync';
import { freshView, useStudio } from './store';
import { thumbSource } from './thumb-source';
import { toast, useToast } from './toast';

export type { ProjectMeta, ProjectsState, Summary } from './project-sync';
export { parseSummary } from './project-sync';

/* ------------------------------------------------------------------ */
/* Names and facts                                                     */
/* ------------------------------------------------------------------ */

/** The house's own title: its name; the internal golden benchmark shows its style title instead. */
export function houseTitle(lang: Lang, house: { name: string; style: string } | null | undefined): string {
  if (house?.name && !house.name.startsWith('Golden sample')) return house.name;
  const key = `project.title.${house?.style ?? 'modern-pitched'}` as MessageKey;
  return translate(lang, key) || house?.style || '';
}

/** Lengths and areas as the facts line shows them (the house name's facts and the projects list). */
export const fmtArea = (a: number) => (Math.round(a * 10) / 10).toFixed(1);
export const fmtLen = (m: number) => String(Math.round(m * 10) / 10);

/** A project's display name: the name the user gave, else its house's title. */
export function projectName(lang: Lang, p: { name: string; summary: string }): string {
  if (p.name) return p.name;
  const s = parseSummary(p.summary);
  return houseTitle(lang, s ? { name: s.title, style: s.style } : null);
}

/* ------------------------------------------------------------------ */
/* The API                                                             */
/* ------------------------------------------------------------------ */

const ENDPOINT = '/api/projects';
/** The framed body of src/server/projects.ts: the small fields, the house and the conversation on three lines. */
const PROJECT_TYPE = 'application/x-opensu-project';

async function call<T>(method: string, path: string, body?: { json: unknown } | { framed: [unknown, string, string] }, keepalive = false): Promise<Result<T>> {
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    let data: string | undefined;
    if (body && 'json' in body) {
      headers['content-type'] = 'application/json';
      data = JSON.stringify(body.json);
    } else if (body) {
      headers['content-type'] = PROJECT_TYPE;
      data = `${JSON.stringify(body.framed[0])}\n${body.framed[1]}\n${body.framed[2]}`;
    }
    // A save while the page goes away: `keepalive` lets it finish, within the browser's 64 KB for such requests.
    const res = await fetch(`${ENDPOINT}${path}`, { method, headers, body: data, credentials: 'same-origin', keepalive: keepalive && !!data && data.length < 60_000 });
    const text = await res.text();
    if ((res.headers.get('content-type') ?? '').startsWith(PROJECT_TYPE)) {
      const a = text.indexOf('\n');
      const b = text.indexOf('\n', a + 1);
      return { ok: true, value: { ...(JSON.parse(text.slice(0, a)) as object), house: text.slice(a + 1, b), chat: text.slice(b + 1) } as T };
    }
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok) {
      const e = (json.error ?? {}) as { code?: string; revision?: number };
      return { ok: false, status: res.status, code: e.code ?? 'error', revision: e.revision };
    }
    return { ok: true, value: json as T };
  } catch {
    return { ok: false, status: 0, code: 'network' };
  }
}

let leaving = false;
const api: ProjectsApi = {
  list: () => call('GET', ''),
  create: (p) => call('POST', '', { framed: [{ summary: p.summary, name: p.name ?? '' }, p.house, p.chat] }),
  duplicate: (from, name) => call('POST', '', { json: { from, name } }),
  read: (id) => call('GET', `/${id}`),
  save: (id, p) => call('PUT', `/${id}`, { framed: [{ base: p.base, summary: p.summary }, p.house, p.chat] }, leaving),
  rename: (id, name) => call('PATCH', `/${id}`, { json: { name } }),
  remove: (id) => call('DELETE', `/${id}`),
  putThumb: async (id, image) => {
    try {
      const res = await fetch(`${ENDPOINT}/${id}/thumb`, { method: 'PUT', headers: { 'content-type': image.type }, body: image, credentials: 'same-origin' });
      const json = (await res.json().catch(() => ({}))) as { project?: ProjectMeta; error?: { code?: string } };
      return res.ok && json.project ? { ok: true, value: { project: json.project } } : { ok: false, status: res.status, code: json.error?.code ?? 'error' };
    } catch {
      return { ok: false, status: 0, code: 'network' };
    }
  },
};

/** The address of a project's thumbnail (its version makes it cacheable for good); null: none yet. */
export const thumbUrl = (p: { id: string; thumbAt: number }) => (p.thumbAt ? `${ENDPOINT}/${p.id}/thumb?v=${p.thumbAt}` : null);

/* ------------------------------------------------------------------ */
/* The browser copy's link and the studio                              */
/* ------------------------------------------------------------------ */

const LINK_KEY = 'opensu.project.v1';
const LAST_KEY = 'opensu.projects.last.v1';

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown): void {
  try {
    if (v === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode: this page only */
  }
}

/** The conversation as uploaded: the newest items up to this many characters of JSON, without the tool-call records (used by the export only). */
export const CHAT_UPLOAD_MAX = 160 * 1024;

export function chatText(conversation: string, items: ChatItem[]): string {
  const kept: string[] = [];
  let size = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const { calls: _calls, live: _live, ...it } = items[i]!;
    const j = JSON.stringify(it);
    if (size + j.length + 1 > CHAT_UPLOAD_MAX) break;
    kept.unshift(j);
    size += j.length + 1;
  }
  // A reply never opens the list without the message it answers.
  while (kept.length && (JSON.parse(kept[0]!) as ChatItem).role === 'assistant' && !(JSON.parse(kept[0]!) as ChatItem).manual) kept.shift();
  return `{"conversation":${JSON.stringify(conversation)},"items":[${kept.join(',')}]}`;
}

type HouseData = typeof import('../studio/house-data');
let houseData: HouseData | null = null;
const templateJson = new Map<string, string>();

const lang = () => useStudio.getState().lang;

/** The house, conversation and undo history swap together; the browser copy follows at once. */
function applyCurrent(c: Current): void {
  quietly(() => {
    newChat();
    restoreItems(c.items, null, c.house, c.conversation);
    freshView();
    useStudio.getState().setSitePanel(null);
    useStudio.getState().setHouse(c.house, { fromLevel: 0 });
  });
  saveNow();
}

const randomId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export const projectSync = createProjectSync({
  api,
  current: () => {
    const house = useStudio.getState().house;
    const chat = useChat.getState();
    return house ? { house, conversation: chat.conversation, items: chat.items } : null;
  },
  apply: applyCurrent,
  busy: () => useChat.getState().running,
  readLink: () => {
    const l = readJson<LocalLink>(LINK_KEY);
    return l && typeof l === 'object' && typeof l.revision === 'number' ? l : null;
  },
  writeLink: (l) => writeJson(LINK_KEY, l),
  pristine: (c) => {
    if (c.items.length || !houseData) return false;
    const h = JSON.stringify(c.house);
    for (const id of ['t1', 't2', 't3']) {
      if (!templateJson.has(id)) templateJson.set(id, JSON.stringify(houseData.templateById(id)));
      if (templateJson.get(id) === h) return true;
    }
    return false;
  },
  template: (id) => houseData!.templateById(id ?? 't1'),
  summary: (house: House): Summary => {
    const d = houseData!.derive(house);
    return { title: house.name, style: house.style, w: house.site.width, d: house.site.depth, area: Math.round(d.area * 10) / 10, storeys: d.storeys, attic: d.attic };
  },
  chatText,
  copyName: (name) => translate(lang(), 'projects.copyName', { name }),
  displayName: (m) => projectName(lang(), m),
  notify: (kind) => {
    if (kind === 'conflict') toast(translate(lang(), 'projects.conflict'), 'project-toast');
  },
  newConversation: randomId,
  lastOpened: {
    get: (user) => readJson<Record<string, string>>(LAST_KEY)?.[user] ?? null,
    set: (user, id) => writeJson(LAST_KEY, { ...(readJson<Record<string, string>>(LAST_KEY) ?? {}), [user]: id }),
  },
  setTimer: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer: (t) => globalThis.clearTimeout(t as ReturnType<typeof setTimeout>),
  // Never on the server: keeps three.js out of the Worker bundle.
  thumb: async () => {
    // When the browser is idle; drawn by the studio's own viewer (src/lib/thumb-source.ts).
    await new Promise<void>((ok) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => ok(), { timeout: 4000 }) : setTimeout(ok, 0)));
    const t0 = performance.now();
    const blob = await thumbSource.capture();
    // Test hook (e2e): what the last picture cost on this machine (main thread, ms) and weighed.
    if (blob) (globalThis as { __thumb?: unknown }).__thumb = { ms: Math.round(performance.now() - t0), mainMs: (globalThis as { __thumbMainMs?: number }).__thumbMainMs, kb: Math.round(blob.size / 102.4) / 10, type: blob.type };
    return blob;
  },
  now: () => Date.now(),
  forgetLocal: () => {
    clearSaved();
    writeJson(LINK_KEY, null);
  },
});

/** Set while the hook runs: looks again at whether to sync (a template opened by address became the browser's house). */
let recheck: (() => void) | null = null;
autosaveHooks.edit = () => projectSync.noteEdit();
autosaveHooks.detach = () => {
  projectSync.detach();
  queueMicrotask(() => recheck?.());
};

export function useProjects<T>(pick: (s: ProjectsState) => T): T {
  return useStore(projectSync.store, pick);
}

/** The open house's display name: the name the user gave, else its own title. */
export function useHouseName(): string {
  const name = useProjects((s) => s.name);
  const house = useStudio((s) => s.house);
  const l = useStudio((s) => s.lang);
  return name || houseTitle(l, house);
}

/** The server keeps projects with accounts (and offers sign-in). */
export const useProjectsOffered = () => useChat((s) => !!s.server?.projects && !!(s.server.auth?.email || s.server.auth?.google));

/** To the projects page (`/projects`), after the open project's pending save. */
export async function goToProjects(): Promise<void> {
  await projectSync.flush();
  location.assign('/projects');
}

/** Sends a pending save before the account goes (sign-out). */
export const flushProjects = () => projectSync.flush();

/** The address's wishes: `?p=<id>` (a project) and `?new=<template>` (a new project, from the projects page). */
function wantedFromUrl(): { id: string | null; template: string | null } {
  const q = new URLSearchParams(location.search);
  const id = q.get('p');
  const tpl = q.get('new');
  return { id: id && /^[A-Za-z0-9_-]{22}$/.test(id) ? id : id ? id.slice(0, 64) : null, template: tpl && /^t\d$/.test(tpl) ? tpl : null };
}

/** Writes the open project into the address (`?p=`), keeping the other parameters; `push`: a new history entry. */
function writeUrl(id: string | null, push: boolean): void {
  const u = new URL(location.href);
  if (id) u.searchParams.set('p', id);
  else u.searchParams.delete('p');
  u.searchParams.delete('new');
  if (u.href === location.href) return;
  if (push) history.pushState(history.state, '', u);
  else history.replaceState(history.state, '', u);
}

/** Opened by address while signed out (or without projects here): nothing to open, say so. */
export const useUrlMissing = () => useProjects((s) => s.missing);

/**
 * Starts syncing when someone is signed in on a server that keeps projects
 * and a house is on screen; stops on sign-out. Saves when the page is
 * hidden, checks for changes from another device when it shows again, and
 * retries when the connection comes back. Every project has its address
 * (`/studio?p=<id>`): the open one is written there, back and forward
 * open the project they name.
 */
export function useProjectSync(opts: { page?: boolean } = {}): void {
  const page = !!opts.page;
  useEffect(() => {
    // The projects page has no studio: this browser's house (if any) is put in the store without being shown,
    // so a sign-in there adopts an edited one as the studio would.
    if (page && !useStudio.getState().house) {
      const saved = savedHouse();
      if (saved) {
        quietly(() => useStudio.getState().setHouse(saved));
        restoreChat();
      }
    }
    // A template opened by address (`?sample=`) is not a project until it is edited (autosave detaches it then).
    const sample = () => new URLSearchParams(location.search).has('sample');
    let user: string | null = null;
    let fromHistory = false;
    const update = () => {
      const s = useChat.getState().server;
      const wanted = page ? { id: null } : wantedFromUrl();
      // An address of a project, and nobody (or no projects) to open it with: "not found or no access".
      if (s && wanted.id && !(s.user && s.projects)) projectSync.store.setState({ missing: wanted.id });
      const want = s?.user && s.projects && useStudio.getState().house && !sample() ? s.user.email : null;
      if (want === user) return;
      if (user) projectSync.stop();
      user = want;
      if (!want) return;
      void (import.meta.env.SSR ? new Promise<HouseData>(() => {}) : import('../studio/house-data')).then((m) => {
        houseData = m;
        if (user === want) void projectSync.start(want, page ? { browse: true } : wantedFromUrl());
      });
    };
    update();
    recheck = update;
    const offChat = useChat.subscribe((s, p) => {
      if (s.server !== p.server) update();
    });
    const offHouse = useStudio.subscribe((s, p) => {
      if (!p.house && s.house) update();
    });
    // The open project goes into the address: a switch is a new history entry, the first one is not.
    const offOpen = projectSync.store.subscribe((s, p) => {
      if (page || s.openId === p.openId || !s.openId) return;
      // A project made from the projects page (`?new=`) takes that entry's place.
      writeUrl(s.openId, !!p.openId && !fromHistory && !new URLSearchParams(location.search).has('new'));
    });
    const onPop = () => {
      if (page) return;
      const { id } = wantedFromUrl();
      if (!id || id === projectSync.store.getState().openId || !projectSync.store.getState().on) return;
      fromHistory = true;
      void projectSync.open(id).then((ok) => {
        fromHistory = false;
        if (!ok) projectSync.store.setState({ missing: id });
      });
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        leaving = true;
        void projectSync.flush().finally(() => (leaving = false));
      } else void projectSync.check();
    };
    const onLeave = () => {
      leaving = true;
      void projectSync.flush();
    };
    const onOnline = () => projectSync.retryNow();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('online', onOnline);
    window.addEventListener('popstate', onPop);
    // Test hook (e2e): the sync's store and its calls.
    window.__studio = { ...window.__studio, projects: projectSync, toast: useToast };
    return () => {
      recheck = null;
      offChat();
      offHouse();
      offOpen();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('popstate', onPop);
    };
  }, [page]);
}
