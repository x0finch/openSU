// Autosave: the current house, the assistant transcript and the last undo /
// redo steps (bounded, `SAVED_STEPS`) are kept in this
// browser (localStorage, one versioned key), so a reload continues where the
// user left off. Quota and private-mode errors are ignored (nothing is lost
// but the save). "Reset to template" clears it.
import type { House } from '@opensu/model';
import { useEffect } from 'react';
import { type ChatItem, newChat, restoreItems, type SavedHistory, undoHistory, useChat } from '../chat/chat-store';
import { freshView, useStudio } from './store';

const KEY = 'opensu.autosave.v1';
const VERSION = 1;
const DELAY = 600;

interface Saved {
  v: typeof VERSION;
  savedAt: number;
  house: House;
  chat: ChatItem[];
  /** Undo / redo steps of `house` (optional: saves before task 014 have none). */
  history?: SavedHistory;
}

/** The saved state, or null (none, another version, or unreadable). */
export function loadSaved(): Saved | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Saved>;
    if (s.v !== VERSION || !s.house || typeof s.house !== 'object' || !Array.isArray(s.chat)) return null;
    return s as Saved;
  } catch {
    return null;
  }
}

export function clearSaved(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

function save(house: House, chat: ChatItem[]): void {
  const data: Saved = { v: VERSION, savedAt: Date.now(), house, chat, history: undoHistory() };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded: try once more without the history and the transcript, then give up quietly.
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify({ ...data, chat: [], history: undefined }));
    } catch {
      /* private mode or full storage: keep working without a save */
    }
  }
}

/** True when the URL asks for a specific sample (then the save is not restored). */
function sampleRequested(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('sample');
}

/** The house to open with: the autosaved one unless a sample is requested. */
export function savedHouse(): House | null {
  if (sampleRequested()) return null;
  return loadSaved()?.house ?? null;
}

let restoredChat = false;

/** Puts the saved transcript back into the assistant (once per page). */
export function restoreChat(): void {
  if (restoredChat || sampleRequested()) return;
  restoredChat = true;
  const s = loadSaved();
  if (s?.chat.length) restoreItems(s.chat, s.history, s.house);
}

/**
 * The edited house becomes the saved one: `?sample=` is dropped from the
 * address (a reload then restores the edits instead of the template).
 */
function adoptSample(): void {
  try {
    const u = new URL(location.href);
    u.searchParams.delete('sample');
    history.replaceState(history.state, '', u);
  } catch {
    /* keep the address */
  }
}

/**
 * Saves the house and the transcript shortly after they change. A page
 * opened on an explicit template (`?sample=`) neither restores nor
 * overwrites the save while it shows that template untouched; its first
 * edit adopts it (see `adoptSample`) and saving starts.
 */
export function useAutosave(): void {
  useEffect(() => {
    if (!sampleRequested()) restoreChat();
    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const house = useStudio.getState().house;
        const chat = useChat.getState();
        if (!house || chat.running || sampleRequested()) return;
        save(house, chat.items);
      }, DELAY);
    };
    const offHouse = useStudio.subscribe((s, p) => {
      if (s.house === p.house) return;
      // The template arriving (or a reset to it) is not an edit.
      if (sampleRequested() && (!p.house || resetting)) return;
      if (sampleRequested()) adoptSample();
      schedule();
    });
    const offChat = useChat.subscribe((s, p) => {
      if (s.items !== p.items || s.running !== p.running) schedule();
    });
    return () => {
      clearTimeout(timer);
      offHouse();
      offChat();
    };
  }, []);
}

/** Starts over: the template house, an empty conversation, nothing saved. */
let resetting = false;

export async function resetToTemplate(): Promise<void> {
  // Never on the server: keeps the model chunk out of the Worker bundle.
  const m = await (import.meta.env.SSR ? new Promise<never>(() => {}) : import('../studio/house-data'));
  newChat();
  clearSaved();
  freshView();
  resetting = true;
  try {
    useStudio.getState().setHouse(m.loadSample(), { fromLevel: 0 });
  } finally {
    resetting = false;
  }
}
