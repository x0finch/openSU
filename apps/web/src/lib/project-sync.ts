// Projects kept with the account (task 027): the one sync logic. Plain
// TypeScript with its I/O injected (the API, timers, the studio's house and
// conversation, the browser copy), so it runs in Node's unit tests
// (scripts/project-sync-test.ts); `projects.ts` wires it to the app.
//
// Signed out nothing here runs and the browser keeps its one house, as
// before. Signed in, the open house is a project: an edit is saved in the
// browser at once (autosave.ts) and to the account `SAVE_DELAY` ms after the
// last change, or at once when the page is hidden. Every save names the
// revision it was based on. The browser copy carries the link (`LocalLink`):
// which project of which account it is, its revision, and whether it holds
// edits the account does not have yet.
import type { House } from '@opensu/model';
import { createStore } from 'zustand/vanilla';
import type { ChatItem } from '../chat/chat-store';

/** Quiet time after the last change before a save is sent. */
export const SAVE_DELAY = 3000;
/** Retry after a failed save: doubles from the first, up to the last. */
export const RETRY_MIN = 2000;
export const RETRY_MAX = 60_000;
/** At most one thumbnail per this many ms of editing (it is rendered in the browser, which costs a frame or more). */
export const THUMB_EVERY = 60_000;
/** ...and only after this much quiet since the change it shows (not while someone is working). */
export const THUMB_QUIET = 15_000;

export interface ProjectMeta {
  id: string;
  /** The name the user gave; '' shows the house's own title. */
  name: string;
  /** JSON text of `Summary`, built by the browser. */
  summary: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  /** When its thumbnail was stored (0: none yet); also the version in the image's address. */
  thumbAt: number;
  /** Its share token while anyone with the link can view (task 028); null: not shared. Older servers send none. */
  share?: string | null;
}

/** What a row shows besides the name (stored as text next to the project). */
export interface Summary {
  /** The house's own name (`House.name`). */
  title: string;
  style: string;
  /** Plot, mm. */
  w: number;
  d: number;
  /** Interior area, m². */
  area: number;
  storeys: number;
  attic: boolean;
}

export function parseSummary(text: string): Summary | null {
  try {
    const s = JSON.parse(text) as Partial<Summary>;
    return typeof s.title === 'string' && typeof s.w === 'number' ? (s as Summary) : null;
  } catch {
    return null;
  }
}

/** The house and conversation of the studio. */
export interface Current {
  house: House;
  conversation: string;
  items: ChatItem[];
}

/** The browser copy's link to a project (kept with the autosave). */
export interface LocalLink {
  /** The account (its email) the project belongs to; null: a house of this browser only. */
  user: string | null;
  id: string | null;
  revision: number;
  /** Edits the account does not have yet. */
  dirty: boolean;
  /** The user's name for it ('' = the house's own title). */
  name: string;
}

export type Fail = { ok: false; status: number; code: string; revision?: number };
export type Result<T> = { ok: true; value: T } | Fail;

export interface ProjectsApi {
  list(): Promise<Result<{ projects: ProjectMeta[]; max: number; maxKb: number }>>;
  create(p: { house: string; chat: string; summary: string; name?: string }): Promise<Result<{ project: ProjectMeta }>>;
  duplicate(from: string, name: string): Promise<Result<{ project: ProjectMeta }>>;
  read(id: string): Promise<Result<{ project: ProjectMeta; house: string; chat: string }>>;
  save(id: string, p: { base: number; house: string; chat: string; summary: string }): Promise<Result<{ project: ProjectMeta }>>;
  rename(id: string, name: string): Promise<Result<{ project: ProjectMeta }>>;
  remove(id: string): Promise<Result<unknown>>;
  putThumb(id: string, image: Blob): Promise<Result<{ project: ProjectMeta }>>;
  /** Turns sharing on (a token) or off (task 028). */
  share(id: string, on: boolean): Promise<Result<{ project: ProjectMeta }>>;
}

export interface SyncDeps {
  api: ProjectsApi;
  /** The studio's house and conversation; null until a house is loaded. */
  current(): Current | null;
  /** Swaps house, conversation and undo history together (not an edit). */
  apply(c: Current): void;
  /** A turn of the assistant is running (saves wait for it unless forced). */
  busy(): boolean;
  readLink(): LocalLink | null;
  writeLink(l: LocalLink | null): void;
  /** The house is a template as it comes and there is no conversation (not worth adopting). */
  pristine(c: Current): boolean;
  /** A house to start a new project from (a template; the default without an id). */
  template(id?: string): House;
  summary(house: House): Summary;
  /** The conversation as uploaded (bounded). */
  chatText(conversation: string, items: ChatItem[]): string;
  /** The name of a copy ("<name> 副本"). */
  copyName(name: string): string;
  /** The display name of a project: its name, else its house's title. */
  displayName(meta: { name: string; summary: string }): string;
  /** One short message for the user. */
  notify(kind: 'conflict'): void;
  /** A fresh conversation id. */
  newConversation(): string;
  lastOpened: { get(user: string): string | null; set(user: string, id: string): void };
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(t: unknown): void;
  /** A small image of the house's default view (null: cannot be drawn right now; it is asked again later). */
  thumb(house: House): Promise<Blob | null>;
  now(): number;
  /** The browser's copy of the house is dropped (its project was deleted while it was not open). */
  forgetLocal(): void;
}

/** What the address asks for: a project (`?p=`), or a new one from a template (`?new=`). */
export interface Wanted {
  id?: string | null;
  template?: string | null;
  /** The projects page: nothing is opened or made for an untouched house (an edited one is still adopted). */
  browse?: boolean;
}

/** What the UI shows. */
export interface ProjectsState {
  /** Signed in on a server that keeps projects, and started. */
  on: boolean;
  user: string | null;
  projects: ProjectMeta[];
  /** The list has been read at least once since sign-in. */
  loaded: boolean;
  max: number;
  maxKb: number;
  /** The open project (null: the house is in this browser only). */
  openId: string | null;
  /** The open house's name ('' = its own title); kept signed out too. */
  name: string;
  /** Saving to the account is failing: 'retry' (it retries by itself), 'too-large', 'full' (the house could not be added). */
  failed: 'retry' | 'too-large' | 'full' | null;
  /** Opening, creating or deleting (the list waits). */
  busy: boolean;
  /** The address names a project this account does not have (or it is gone). */
  missing: string | null;
}

const initial: ProjectsState = { on: false, user: null, projects: [], loaded: false, max: 20, maxKb: 512, openId: null, name: '', failed: null, busy: false, missing: null };

/** Newest first. */
const sorted = (list: ProjectMeta[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt);

export type ProjectSync = ReturnType<typeof createProjectSync>;

export function createProjectSync(deps: SyncDeps) {
  const store = createStore<ProjectsState>(() => ({ ...initial, name: deps.readLink()?.name ?? '' }));
  const set = (p: Partial<ProjectsState>) => store.setState(p);
  const get = () => store.getState();

  /** The revision the open house is based on. */
  let revision = 0;
  /** Edits since the last save that reached the account. */
  let dirty = deps.readLink()?.dirty ?? false;
  /** Bumped on every edit: a save only clears `dirty` when no edit came in while it was on its way. */
  let editSeq = 0;
  let timer: unknown = null;
  let retryTimer: unknown = null;
  let retryMs = RETRY_MIN;
  let inflight: Promise<void> | null = null;
  /** Operations (start, open, create, delete) run one at a time. */
  let chain: Promise<unknown> = Promise.resolve();
  let generation = 0;
  /** The open project's thumbnail is older than its house. */
  let thumbWanted = false;
  /** Not before this time (the quiet after the last change). */
  let thumbNotBefore = 0;
  let thumbTimer: unknown = null;
  let lastThumb = -Infinity;
  let thumbing = false;

  const link = (): LocalLink => ({ user: get().user, id: get().openId, revision, dirty, name: get().name });
  const persist = () => deps.writeLink(link());
  const upsert = (m: ProjectMeta) => set({ projects: sorted([m, ...get().projects.filter((p) => p.id !== m.id)]) });

  function serialise(c: Current) {
    return { house: JSON.stringify(c.house), chat: deps.chatText(c.conversation, c.items), summary: JSON.stringify(deps.summary(c.house)) };
  }

  function clearTimers(): void {
    if (timer !== null) deps.clearTimer(timer);
    if (retryTimer !== null) deps.clearTimer(retryTimer);
    if (thumbTimer !== null) deps.clearTimer(thumbTimer);
    timer = retryTimer = thumbTimer = null;
  }

  /** Renders and stores the open project's thumbnail: THUMB_QUIET after the change, at most once per THUMB_EVERY. */
  function maybeThumb(): void {
    const id = get().openId;
    if (!thumbWanted || !id || !get().on || thumbing || thumbTimer !== null) return;
    const wait = Math.max(lastThumb + THUMB_EVERY, thumbNotBefore) - deps.now();
    if (wait > 0) {
      thumbTimer = deps.setTimer(() => {
        thumbTimer = null;
        maybeThumb();
      }, wait);
      return;
    }
    const c = deps.current();
    if (!c) return;
    thumbWanted = false;
    thumbing = true;
    lastThumb = deps.now();
    void (async () => {
      try {
        const img = await deps.thumb(c.house);
        if (get().openId !== id) return;
        if (!img) {
          // Nothing to draw it with right now (no 3D view, or a cutaway / the sun study / walking): later.
          thumbWanted = true;
          return;
        }
        const r = await deps.api.putThumb(id, img);
        if (r.ok) upsert(r.value.project);
      } catch {
        /* a picture is never worth an error */
      } finally {
        thumbing = false;
        // Wanted again (not drawn this time, or a change since): the next try after THUMB_EVERY.
        if (thumbWanted) maybeThumb();
      }
    })();
  }

  function schedule(ms = SAVE_DELAY): void {
    if (timer !== null) deps.clearTimer(timer);
    timer = deps.setTimer(() => {
      timer = null;
      void save();
    }, ms);
  }

  function retryLater(): void {
    if (retryTimer !== null) return;
    const ms = retryMs;
    retryMs = Math.min(RETRY_MAX, retryMs * 2);
    retryTimer = deps.setTimer(() => {
      retryTimer = null;
      void save();
    }, ms);
  }

  /** Opens `c` as project `meta` (the server's version). */
  function show(meta: ProjectMeta, c: Current | null): void {
    if (c) deps.apply(c);
    revision = meta.revision;
    dirty = false;
    editSeq++;
    if (meta.id !== get().openId && thumbTimer !== null) {
      deps.clearTimer(thumbTimer);
      thumbTimer = null;
    }
    // A project without a picture yet (made elsewhere, or before pictures) gets one now.
    thumbWanted = !meta.thumbAt;
    thumbNotBefore = deps.now() + THUMB_QUIET;
    set({ openId: meta.id, name: meta.name, failed: null, missing: null });
    persist();
    if (get().user) deps.lastOpened.set(get().user!, meta.id);
  }

  function parseProject(house: string, chat: string): Current | null {
    try {
      const h = JSON.parse(house) as House;
      let conversation = deps.newConversation();
      let items: ChatItem[] = [];
      if (chat) {
        const c = JSON.parse(chat) as { conversation?: unknown; items?: unknown };
        if (typeof c.conversation === 'string') conversation = c.conversation;
        if (Array.isArray(c.items)) items = c.items as ChatItem[];
      }
      return { house: h, conversation, items };
    } catch {
      return null;
    }
  }

  /** Reads a project and puts it on screen. */
  async function load(id: string): Promise<boolean> {
    const r = await deps.api.read(id);
    if (!r.ok) return false;
    const c = parseProject(r.value.house, r.value.chat);
    if (!c) return false;
    upsert(r.value.project);
    show(r.value.project, c);
    maybeThumb();
    return true;
  }

  /** Creates a project from what is on screen (or `c`) and links to it. */
  async function adopt(name: string, c: Current | null = deps.current()): Promise<Fail | null> {
    if (!c) return { ok: false, status: 0, code: 'no_house' };
    const r = await deps.api.create({ ...serialise(c), name });
    if (!r.ok) {
      if (r.code === 'full') set({ failed: 'full' });
      return r;
    }
    upsert(r.value.project);
    show(r.value.project, null);
    maybeThumb();
    return null;
  }

  /** A save failed with a newer revision on the server: keep both, the local one as a copy that stays open. */
  async function keepBoth(): Promise<void> {
    const cur = get().projects.find((p) => p.id === get().openId);
    const base = cur ? deps.displayName(cur) : deps.displayName({ name: get().name, summary: JSON.stringify(deps.summary(deps.current()!.house)) });
    const failed = await adopt(deps.copyName(base));
    if (!failed) {
      deps.notify('conflict');
      void refresh();
    }
  }

  /** Sends the open house now (no-op when nothing changed). Resolves when it is done. */
  function save(force = false): Promise<void> {
    if (inflight) return inflight.then(() => (dirty ? save(force) : undefined));
    const s = get();
    if (!s.on || !s.openId || !dirty) return Promise.resolve();
    if (!force && deps.busy()) {
      schedule();
      return Promise.resolve();
    }
    const c = deps.current();
    if (!c) return Promise.resolve();
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
    const seq = editSeq;
    const id = s.openId;
    const gen = generation;
    inflight = (async () => {
      const r = await deps.api.save(id, { base: revision, ...serialise(c) });
      if (gen !== generation || get().openId !== id) return;
      if (r.ok) {
        revision = r.value.project.revision;
        if (seq === editSeq) dirty = false;
        retryMs = RETRY_MIN;
        set({ failed: null });
        upsert(r.value.project);
        persist();
        thumbWanted = true;
        thumbNotBefore = deps.now() + THUMB_QUIET;
        maybeThumb();
        return;
      }
      if (r.status === 409 && r.code === 'conflict') return keepBoth();
      // Deleted on another device while edited here: the edits become a project again.
      if (r.status === 404) {
        await adopt(get().name);
        return;
      }
      if (r.status === 413) {
        set({ failed: 'too-large' });
        return;
      }
      set({ failed: 'retry' });
      retryLater();
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  }

  /** Reads the list (and the limits). */
  async function refresh(): Promise<boolean> {
    const r = await deps.api.list();
    if (!r.ok) return false;
    set({ projects: sorted(r.value.projects), max: r.value.max, maxKb: r.value.maxKb, loaded: true });
    return true;
  }

  /** The project to open when the open one goes: the most recent other one, else a new one. */
  async function openNext(except: string | null): Promise<void> {
    const next = get().projects.find((p) => p.id !== except);
    if (next && (await load(next.id))) return;
    const house = deps.template();
    const fresh: Current = { house, conversation: deps.newConversation(), items: [] };
    deps.apply(fresh);
    await adopt('', fresh);
  }

  /**
   * The browser's house and the account, at sign-in: the linked project
   * resumes (its pending edits sent, or the other device's version loaded,
   * or both kept); an edited house of this browser becomes a project; else
   * the last opened, the most recent or a new project opens, unless the
   * address asks for one (`wanted`).
   */
  async function settleLocal(user: string, wanted: Wanted): Promise<void> {
    const l = deps.readLink();
    const c = deps.current();
    const meta = l?.user === user && l.id ? get().projects.find((p) => p.id === l.id) : undefined;
    if (l && meta) {
      revision = l.revision;
      dirty = l.dirty;
      thumbWanted = !meta.thumbAt;
      thumbNotBefore = deps.now() + THUMB_QUIET;
      set({ openId: meta.id, name: meta.name });
      deps.lastOpened.set(user, meta.id);
      if (meta.revision > l.revision) {
        // Changed on another device: theirs when nothing is pending here, else both.
        if (l.dirty) await keepBoth();
        else await load(meta.id);
      } else if (l.dirty) await save(true);
      persist();
      maybeThumb();
      return;
    }
    // A house of this browser (signed out, another account, or a project gone from the list).
    const edited = !!c && (!deps.pristine(c) || !!(l && l.id && l.dirty) || !!l?.name);
    if (c && edited) {
      await adopt(l?.name ?? '', c);
      return;
    }
    // An untouched house: the address decides, else the last opened, the most recent, or a new one.
    if (wanted.id || wanted.template || wanted.browse) return;
    const last = deps.lastOpened.get(user);
    const target = get().projects.find((p) => p.id === last) ?? get().projects[0];
    if (target && (await load(target.id))) return;
    await adopt('', c);
  }

  /** A new project from a template, opened in place. */
  async function createInline(templateId?: string): Promise<string | null> {
    if (get().projects.length >= get().max) return 'full';
    await save(true);
    const fresh: Current = { house: deps.template(templateId), conversation: deps.newConversation(), items: [] };
    const r = await deps.api.create({ ...serialise(fresh), name: '' });
    if (!r.ok) return r.code;
    upsert(r.value.project);
    show(r.value.project, fresh);
    maybeThumb();
    return null;
  }

  const sync = {
    store,

    /**
     * Signed in on a server that keeps projects, with a house on screen:
     * links the browser's house to the account (see the scope note,
     * docs/tasks/027-notes.md).
     */
    start(user: string, wanted: Wanted = {}): Promise<void> {
      const gen = ++generation;
      set({ on: true, user, failed: null, loaded: false, projects: [] });
      return enqueue(async () => {
        if (gen !== generation) return;
        set({ busy: true });
        try {
          if (!(await refresh())) {
            // The list is not there (offline, server error): stay local and try again later.
            set({ failed: 'retry' });
            retryTimer = deps.setTimer(() => {
              retryTimer = null;
              if (gen === generation) void sync.start(user, wanted);
            }, retryMs);
            retryMs = Math.min(RETRY_MAX, retryMs * 2);
            return;
          }
          retryMs = RETRY_MIN;
          await settleLocal(user, wanted);
          if (gen !== generation) return;
          if (wanted.id && wanted.id !== get().openId) {
            // The address names a project: it opens, or "not found" (nothing else is put on screen).
            const ok = get().projects.some((p) => p.id === wanted.id) && (await load(wanted.id));
            if (!ok) set({ missing: wanted.id });
          }
          if (wanted.template) await createInline(wanted.template);
        } finally {
          if (gen === generation) set({ busy: false });
        }
      });
    },
    /** Signed out (or the feature went away): the house stays on screen as this browser's; the link is kept for the next sign-in. */
    stop(): void {
      if (!get().on) return;
      generation++;
      clearTimers();
      persist();
      set({ ...initial, name: get().name });
    },

    /** The studio's house or conversation changed (an edit, not a load). */
    noteEdit(): void {
      editSeq++;
      dirty = true;
      if (get().on) {
        if (get().openId) schedule();
        persist();
        return;
      }
      // Signed out: the link stays as it was, now with edits the account does not have.
      const l = deps.readLink();
      if (l && !l.dirty) deps.writeLink({ ...l, dirty: true });
    },

    /** The browser's house is a new one (a template opened by address and edited): no longer linked to a project. */
    detach(): void {
      revision = 0;
      dirty = false;
      set({ openId: null, name: '' });
      deps.writeLink({ user: null, id: null, revision: 0, dirty: false, name: '' });
    },

    /** Sends a pending save now and waits for it (page hidden, before a switch, before sign-out). */
    flush(): Promise<void> {
      if (timer !== null) {
        deps.clearTimer(timer);
        timer = null;
      }
      return save(true);
    },

    /** The connection is back: retry at once. */
    retryNow(): void {
      if (retryTimer !== null) deps.clearTimer(retryTimer);
      retryTimer = null;
      retryMs = RETRY_MIN;
      if (get().on && get().openId) void save();
      else if (get().on && get().failed === 'retry' && get().user) void sync.start(get().user!);
    },

    /** The page is visible again: the list, and the open project if another device changed it while nothing is pending here. */
    check(): Promise<void> {
      if (!get().on) return Promise.resolve();
      return enqueue(async () => {
        if (!(await refresh())) return;
        const id = get().openId;
        if (!id || dirty || inflight) return;
        const meta = get().projects.find((p) => p.id === id);
        if (!meta) await openNext(id);
        else if (meta.revision > revision) await load(id);
      });
    },

    refresh,

    /** Opens another project: the open one's pending save goes first. */
    open(id: string): Promise<boolean> {
      return enqueue(async () => {
        if (id === get().openId) return true;
        set({ busy: true });
        try {
          await save(true);
          return await load(id);
        } finally {
          set({ busy: false });
        }
      });
    },

    /** A new project from a template; it opens. Null when done, else why not ('full', ...). */
    create(templateId?: string): Promise<string | null> {
      return enqueue(async () => {
        set({ busy: true });
        try {
          return await createInline(templateId);
        } finally {
          set({ busy: false });
        }
      });
    },

    rename(id: string, name: string): Promise<boolean> {
      return enqueue(async () => {
        const r = await deps.api.rename(id, name.trim());
        if (!r.ok) return false;
        upsert(r.value.project);
        if (id === get().openId) {
          set({ name: r.value.project.name });
          persist();
        }
        return true;
      });
    },

    /** A copy of a project (in the account); its id, or why not ('full', ...). */
    duplicate(id: string): Promise<{ id: string } | { error: string }> {
      return enqueue(async () => {
        if (get().projects.length >= get().max) return { error: 'full' };
        if (id === get().openId) await save(true);
        const meta = get().projects.find((p) => p.id === id);
        const r = await deps.api.duplicate(id, deps.copyName(meta ? deps.displayName(meta) : ''));
        if (!r.ok) return { error: r.code };
        upsert(r.value.project);
        return { id: r.value.project.id };
      });
    },

    /** Deletes a project; when it is the open one, the most recent other one opens (or a new one). */
    remove(id: string): Promise<boolean> {
      return enqueue(async () => {
        const open = id === get().openId;
        set({ busy: true });
        try {
          if (open && timer !== null) {
            deps.clearTimer(timer);
            timer = null;
          }
          if (open && inflight) await inflight;
          const r = await deps.api.remove(id);
          if (!r.ok && r.status !== 404) return false;
          set({ projects: get().projects.filter((p) => p.id !== id) });
          // The browser's copy was that project (deleted from the projects page): it goes too, or the next visit would bring it back.
          const l = deps.readLink();
          if (!open && l?.id === id) {
            deps.writeLink(null);
            deps.forgetLocal();
          }
          if (open) {
            dirty = false;
            await openNext(id);
          }
          return true;
        } finally {
          set({ busy: false });
        }
      });
    },

    /** Turns sharing of a project on or off (task 028); the project as it is now, or null when that failed. */
    share(id: string, on: boolean): Promise<ProjectMeta | null> {
      return enqueue(async () => {
        const r = await deps.api.share(id, on);
        if (!r.ok) return null;
        upsert(r.value.project);
        return r.value.project;
      });
    },

    /** For tests: the revision the open house is based on, and whether edits are pending. */
    debug: () => ({ revision, dirty, inflight: !!inflight }),
  };
  return sync;
}
