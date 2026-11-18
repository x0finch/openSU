// Autosave: the current house, the assistant transcript and the last undo /
// redo steps (bounded, `SAVED_STEPS`) are kept in this
// browser (localStorage, one versioned key), so a reload continues where the
// user left off. Quota and private-mode errors are ignored (nothing is lost
// but the save). "Reset to template" clears it.
//
// This is the one place that tells an edit from a load (task 027): every
// edit is passed on to `autosaveHooks.edit` (projects kept with the account
// save it there too); a house put on screen by the code (`quietly`: a
// template reset, a project opened) is saved here but is not an edit.
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
  /** The conversation's id (task 020; saves before it have none). */
  conversation?: string;
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

/** Where edits go besides this browser (src/lib/projects.ts sets them; nothing by default). */
export const autosaveHooks = {
  /** The house or the conversation changed by an edit. */
  edit: () => {},
  /** The browser's house is a new one, not the project it was linked to. */
  detach: () => {},
};

let quiet = 0;
/** Runs `fn` (which replaces the house and conversation) without it counting as an edit. */
export function quietly(fn: () => void): void {
  quiet++;
  try {
    fn();
  } finally {
    quiet--;
  }
}

/** Writes the browser copy now (after a project was opened). */
export function saveNow(): void {
  const house = useStudio.getState().house;
  const chat = useChat.getState();
  if (house) save(house, chat.items, chat.conversation);
}

function save(house: House, chat: ChatItem[], conversation: string): void {
  const data: Saved = { v: VERSION, savedAt: Date.now(), house, chat, history: undoHistory(), conversation };
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
  if (s?.chat.length) restoreItems(s.chat, s.history, s.house, typeof s.conversation === 'string' ? s.conversation : undefined);
}

/**
 * The edited house becomes the saved one: `?sample=` is dropped from the
 * address (a reload then restores the edits instead of the template).
 */
function adoptSample(): void {
  autosaveHooks.detach();
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
        save(house, chat.items, chat.conversation);
      }, DELAY);
    };
    const offHouse = useStudio.subscribe((s, p) => {
      if (s.house === p.house) return;
      // The template arriving (or a reset to it) is not an edit.
      if (sampleRequested() && (!p.house || quiet)) return;
      if (sampleRequested()) adoptSample();
      schedule();
      // The first house of the page (the saved one or the template) and a house the code put there are not edits.
      if (p.house && !quiet) autosaveHooks.edit();
    });
    const offChat = useChat.subscribe((s, p) => {
      if (s.items !== p.items || s.running !== p.running) schedule();
      if (s.items !== p.items && !quiet && !sampleRequested()) autosaveHooks.edit();
    });
    return () => {
      clearTimeout(timer);
      offHouse();
      offChat();
    };
  }, []);
}

/** Starts over (signed out): the template house, an empty conversation, nothing saved, no longer a project's. */
export async function resetToTemplate(): Promise<void> {
  // Never on the server: keeps the model chunk out of the Worker bundle.
  const m = await (import.meta.env.SSR ? new Promise<never>(() => {}) : import('../studio/house-data'));
  quietly(() => {
    newChat();
    clearSaved();
    autosaveHooks.detach();
    freshView();
    useStudio.getState().setHouse(m.loadSample(), { fromLevel: 0 });
  });
}
