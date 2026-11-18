// Share links (task 028): the browser's side. The owner's switch goes
// through the project sync (so the list and the cards follow); the share
// surface's state lives here (`openShare`: one surface for the studio's
// button and the projects page's card menu); the viewer's loader puts a
// shared project on screen and keeps it current; "make my own copy" turns
// it into the viewer's project. The view-only flag itself is
// src/lib/view-only.ts.
import type { House } from '@opensu/model';
import { useEffect } from 'react';
import { create } from 'zustand';
import { fetchServerStatus, newChat, useChat } from '../chat/chat-store';
import { quietly } from './autosave';
import { createProjectFrom, keepAsLocal, localHouseEdited, projectSync } from './projects';
import { freshView, useStudio } from './store';
import { toast } from './toast';
import { useShared } from './view-only';

/** The address of a shared project. */
export const shareUrl = (token: string) => `${location.origin}/studio?s=${token}`;

/* ------------------------------------------------------------------ */
/* The share surface                                                   */
/* ------------------------------------------------------------------ */

interface ShareUi {
  open: boolean;
  /** The control it stands at (the share button, a card's "more" button). */
  anchor: HTMLElement | null;
  /** The project it shares; null: the one open in the studio. */
  project: string | null;
  /** Turning sharing on or off. */
  busy: boolean;
  /** The last change failed. */
  failed: boolean;
  /** Signed out, "登录" was chosen: the surface opens again once the house is a project of the account. */
  afterSignIn: boolean;
}

export const useShareUi = create<ShareUi>(() => ({ open: false, anchor: null, project: null, busy: false, failed: false, afterSignIn: false }));

export function openShare(anchor: HTMLElement | null, project: string | null = null): void {
  useShareUi.setState({ open: true, anchor, project, busy: false, failed: false, afterSignIn: false });
}

export function closeShare(): void {
  useShareUi.setState({ open: false });
}

/** Turns sharing of `id` on or off; the surface shows a calm line when it fails. */
export async function setShared(id: string, on: boolean): Promise<void> {
  useShareUi.setState({ busy: true, failed: false });
  const r = await projectSync.share(id, on);
  useShareUi.setState({ busy: false, failed: !r });
}

/**
 * The link to the clipboard (toast "Link copied"); on a phone with the
 * system share sheet, that sheet instead (`send`). Falls back to selecting
 * the link's field when the clipboard is not available.
 */
export async function copyLink(url: string, copied: string, opts: { title: string; send?: boolean; field?: HTMLInputElement | null }): Promise<void> {
  if (opts.send && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: opts.title, url });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(copied, 'share-copied');
    return;
  } catch {
    /* no clipboard here (an insecure origin, a denied permission): the old way */
  }
  const f = opts.field;
  if (f) {
    f.focus();
    f.select();
    if (document.execCommand('copy')) toast(copied, 'share-copied');
  }
}

/* ------------------------------------------------------------------ */
/* The viewer                                                          */
/* ------------------------------------------------------------------ */

type Payload = { name: string; updatedAt: number; house: House };

/** Reads the shared project; `null`: not shared (any more), 'error': cannot tell right now. */
async function fetchShared(token: string): Promise<Payload | null | 'error'> {
  try {
    // `no-cache` + ETag on the server: an unchanged project comes back from the browser's cache after a 304.
    const res = await fetch(`/api/share/${encodeURIComponent(token)}`, { headers: { accept: 'application/json' }, credentials: 'omit' });
    if (res.status === 404) return null;
    if (!res.ok) return 'error';
    const v = (await res.json()) as Partial<Payload>;
    return v && typeof v.house === 'object' && v.house && typeof v.name === 'string' ? (v as Payload) : 'error';
  } catch {
    return 'error';
  }
}

/** Puts a shared house on screen: an empty conversation, no undo history, nothing saved. */
async function show(p: Payload): Promise<boolean> {
  const m = await import('../studio/house-data');
  try {
    m.derive(p.house);
  } catch {
    return false;
  }
  const first = !useStudio.getState().house;
  quietly(() => {
    newChat();
    if (first) freshView();
    useStudio.getState().setHouse(p.house, first ? undefined : { fromLevel: 0 });
  });
  useShared.setState({ status: 'ready', name: p.name, updatedAt: p.updatedAt });
  return true;
}

/**
 * The viewer's loader (the studio, view-only): reads the shared project,
 * puts it on screen, and reads it again whenever the page is shown again
 * (the viewer always sees the owner's current version; a link turned off
 * shows the "no longer shared" page).
 */
export function useSharedProject(): void {
  useEffect(() => {
    const token = useShared.getState().token;
    if (!token) return;
    // The viewer's own conversation and its pinned column are not part of what is shown.
    useStudio.setState({ pinned: false, recent: false });
    // Who is signed in decides what "make my own copy" does (the prompt, which usually asks, is not there).
    void fetchServerStatus();
    let alive = true;
    const load = async () => {
      const p = await fetchShared(token);
      if (!alive) return;
      if (p === null) useShared.setState({ status: 'gone' });
      else if (p === 'error') {
        // A passing failure keeps what is on screen; with nothing on screen, say so.
        if (useShared.getState().status !== 'ready') useShared.setState({ status: 'error' });
      } else if (p.updatedAt !== useShared.getState().updatedAt || p.name !== useShared.getState().name || !useStudio.getState().house) {
        if (!(await show(p))) useShared.setState({ status: 'error' });
      }
    };
    void load();
    const onShow = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onShow);
    // Test hook (e2e).
    window.__studio = { ...window.__studio, shared: useShared, reloadShared: load };
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onShow);
    };
  }, []);
}

/**
 * "Make my own copy". Signed in where projects are kept: a new project of
 * the account (named "<name> 副本"), opened. Otherwise the house becomes
 * this browser's own project; when that would replace one with edits,
 * `confirm` is asked first (once). Returns why it did not happen, or null
 * (the page is on its way to the copy).
 */
export async function makeCopy(name: string, copyName: string, confirm: () => Promise<boolean>): Promise<'full' | 'failed' | 'cancelled' | null> {
  const house = useStudio.getState().house;
  if (!house) return 'failed';
  const server = useChat.getState().server;
  if (server?.user && server.projects) {
    const r = await createProjectFrom(house, copyName);
    if ('error' in r) return r.error === 'full' ? 'full' : 'failed';
    location.assign(`/studio?p=${r.id}`);
    return null;
  }
  if ((await localHouseEdited()) && !(await confirm())) return 'cancelled';
  keepAsLocal(house, name);
  location.assign('/studio');
  return null;
}
