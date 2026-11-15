// API keys saved with the account (task 022): the list the server keeps
// (provider, last four characters, model; never the key itself), which one
// the assistant uses, and the picker / key sheet state. The browser-held key
// (settings.ts) stays for visitors who are not signed in.
import { create } from 'zustand';
import { DEFAULT_MODELS, isKeyProvider, type KeyProvider, PROVIDER_BASE_URLS } from '../lib/providers';
import { useStudio } from '../lib/store';
import { useChat } from './chat-store';
import { type AiSettings, usesOwnKey } from './settings';

export type { KeyProvider } from '../lib/providers';
export { DEFAULT_MODELS, PROVIDER_NAMES } from '../lib/providers';

export interface SavedKey {
  provider: KeyProvider;
  /** The key's last four characters. */
  hint: string;
  /** Empty: the provider's default. */
  model: string;
  updatedAt: number;
}

/** What the key sheet shows: add a key, change one, or the one-time offer to save the browser's key. */
export type KeySheetMode = { mode: 'add'; provider?: KeyProvider } | { mode: 'edit'; provider: KeyProvider } | { mode: 'offer' };

interface KeysState {
  /** Signed in on a server that keeps keys (and the list has been read). */
  ready: boolean;
  keys: SavedKey[];
  /** The saved key in use; null: the site's free allowance (or the browser's key). */
  active: KeyProvider | null;
  /** The pop-up menu that is open (its button's id; "any" / "pinned": the recent strip's / the pinned input's), or null. */
  picker: string | null;
  sheet: KeySheetMode | null;
  /** Where the sheet grows from (and flows back into). */
  anchor: HTMLElement | null;
  busy: boolean;
  error: string | null;
}

export const useKeys = create<KeysState>(() => ({ ready: false, keys: [], active: null, picker: null, sheet: null, anchor: null, busy: false, error: null }));

const ENDPOINT = '/api/keys';

interface ListReply {
  keys?: SavedKey[];
  active?: string | null;
}

function apply(r: ListReply): void {
  const keys = (r.keys ?? []).filter((k) => isKeyProvider(k.provider));
  const active = isKeyProvider(r.active) ? r.active : null;
  useKeys.setState({ ready: true, keys, active });
}

/** After every status read: the list when signed in on a server that keeps keys, else nothing. */
export async function syncKeys(): Promise<void> {
  const s = useChat.getState().server;
  if (!s?.user || !s.keys) {
    if (useKeys.getState().ready) useKeys.setState({ ready: false, keys: [], active: null, sheet: null, picker: null });
    return;
  }
  try {
    const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
    if (res.ok) apply((await res.json()) as ListReply);
  } catch {
    /* the picker shows the free allowance and the browser key only */
  }
  maybeOffer();
}

/** One write; on success the server's new list. Returns an error code, or null. */
async function write(method: 'PUT' | 'PATCH' | 'DELETE', body: unknown): Promise<string | null> {
  try {
    const res = await fetch(ENDPOINT, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
    const data = (await res.json().catch(() => null)) as (ListReply & { error?: { code?: string } }) | null;
    if (!res.ok) return data?.error?.code ?? 'network';
    if (data) apply(data);
    return null;
  } catch {
    return 'network';
  }
}

/** Saves (or replaces) a key; `use`: it becomes the one in use (also over a key held in this browser). */
export async function saveKey(provider: KeyProvider, key: string, model: string, use = true): Promise<string | null> {
  const err = await write('PUT', { provider, key, model, use });
  const chat = useChat.getState();
  if (!err && use && usesOwnKey(chat.settings)) chat.setSettings({ ...chat.settings, useOwn: false });
  return err;
}
export const setKeyModel = (provider: KeyProvider, model: string) => write('PATCH', { provider, model });
export const deleteKey = (provider: KeyProvider) => write('DELETE', { provider });

/** What the next turn uses. */
export type KeySource = { kind: 'site' } | { kind: 'browser' } | { kind: 'account'; provider: KeyProvider };

/** The browser's key wins while it is switched on; else the saved key in use; else the site's. */
export function currentSource(settings: AiSettings = useChat.getState().settings): KeySource {
  if (usesOwnKey(settings)) return { kind: 'browser' };
  const k = useKeys.getState();
  if (k.ready && k.active && k.keys.some((x) => x.provider === k.active)) return { kind: 'account', provider: k.active };
  return { kind: 'site' };
}

/** The saved key a turn should name (`x-opensu-account-key`), or null. */
export function accountKeyInUse(): KeyProvider | null {
  const s = currentSource();
  return s.kind === 'account' ? s.provider : null;
}

/** The model a saved key runs (its own, or the provider's default). */
export const modelOf = (k: SavedKey) => k.model || DEFAULT_MODELS[k.provider];

/** Choosing an entry switches at once; the choice is kept with the account. */
export async function choose(source: KeySource): Promise<void> {
  const chat = useChat.getState();
  const k = useKeys.getState();
  if (source.kind === 'browser') {
    chat.setSettings({ ...chat.settings, useOwn: true });
    if (k.ready && k.active) await write('PATCH', { active: null });
    return;
  }
  if (usesOwnKey(chat.settings)) chat.setSettings({ ...chat.settings, useOwn: false });
  if (!k.ready) return;
  const active = source.kind === 'account' ? source.provider : null;
  if (k.active === active) return;
  // Shown at once; the server's answer confirms it (or puts the old choice back).
  useKeys.setState({ active });
  const err = await write('PATCH', { active });
  if (err) useKeys.setState({ active: k.active });
}

export function openPicker(which: string | null): void {
  useKeys.setState({ picker: which });
}

export function openKeySheet(sheet: KeySheetMode, anchor: HTMLElement | null): void {
  useKeys.setState({ sheet, anchor, picker: null, error: null, busy: false });
  // One glass surface at a time: the recent strip makes way (as for sign-in).
  if (!useStudio.getState().pinned) useStudio.getState().setRecent(false);
}

export function closeKeySheet(): void {
  useKeys.setState({ sheet: null, busy: false, error: null });
}

/* ------------------------------------------------------------------ */
/* The browser's key, after sign-in                                    */
/* ------------------------------------------------------------------ */

/** The provider a browser-held key can be saved under (custom servers other than Anthropic's cannot). */
export function browserKeyProvider(s: AiSettings): KeyProvider | null {
  if (!s.key.trim()) return null;
  if (s.provider === 'openrouter' || s.provider === 'openai') return s.provider;
  const base = s.baseUrl.trim().replace(/\/+$/, '');
  for (const p of ['openrouter', 'openai', 'anthropic'] as const) if (base === PROVIDER_BASE_URLS[p]) return p;
  return null;
}

const OFFERED = 'opensu.keys.offered.v1';
const offeredFor = (email: string): boolean => {
  try {
    return (JSON.parse(localStorage.getItem(OFFERED) ?? '[]') as string[]).includes(email);
  } catch {
    return true;
  }
};
export function markOffered(): void {
  const email = useChat.getState().server?.user?.email;
  if (!email) return;
  try {
    const list = JSON.parse(localStorage.getItem(OFFERED) ?? '[]') as string[];
    if (!list.includes(email)) localStorage.setItem(OFFERED, JSON.stringify([...list, email].slice(-20)));
  } catch {
    /* private mode: offered again next time */
  }
}

/**
 * Once per account and browser: a key kept in this browser can be saved
 * with the account. Asked, never done silently; only for a provider the
 * account can keep, and not when that provider already has a saved key.
 */
function maybeOffer(): void {
  const chat = useChat.getState();
  const email = chat.server?.user?.email;
  const k = useKeys.getState();
  const p = browserKeyProvider(chat.settings);
  if (!email || !k.ready || !p || k.sheet || offeredFor(email)) return;
  if (k.keys.some((x) => x.provider === p)) return;
  openKeySheet({ mode: 'offer' }, document.querySelector<HTMLElement>('[data-testid=prompt]'));
}

/** Saves the browser's key with the account (the offer's "save"); the browser copy is then removed. */
export async function saveBrowserKey(): Promise<string | null> {
  const chat = useChat.getState();
  const p = browserKeyProvider(chat.settings);
  if (!p) return 'bad_key';
  const err = await saveKey(p, chat.settings.key.trim(), chat.settings.model.trim());
  if (!err) chat.setSettings({ ...chat.settings, key: '', useOwn: false });
  return err;
}
