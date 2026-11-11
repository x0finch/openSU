// Bring-your-own-key settings. Stored only in this browser (localStorage);
// sent per request in headers that the /api/chat relay forwards to the
// provider and never logs or stores.

export type ProviderId = 'openrouter' | 'openai' | 'custom';

export interface AiSettings {
  /** Use the key below instead of the site's key. */
  useOwn: boolean;
  provider: ProviderId;
  key: string;
  /** Base URL for `custom` (OpenAI-compatible, https). */
  baseUrl: string;
  /** Model id; empty = the default for the provider. */
  model: string;
}

export const PROVIDER_BASE: Record<Exclude<ProviderId, 'custom'>, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
};

const KEY = 'opensu.ai';
export const EMPTY_SETTINGS: AiSettings = { useOwn: false, provider: 'openrouter', key: '', baseUrl: '', model: '' };

export function loadSettings(): AiSettings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return EMPTY_SETTINGS;
    const v = JSON.parse(raw) as Partial<AiSettings>;
    return { ...EMPTY_SETTINGS, ...v };
  } catch {
    return EMPTY_SETTINGS;
  }
}

export function saveSettings(s: AiSettings): void {
  try {
    if (!s.key && !s.useOwn) globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: settings last for this page only */
  }
}

/** True when requests will carry the user's own key. */
export const usesOwnKey = (s: AiSettings) => s.useOwn && s.key.trim().length > 0;

/** Request headers for the relay (empty when the site's key is used). */
export function relayHeaders(s: AiSettings): Record<string, string> {
  if (!usesOwnKey(s)) return {};
  const base = s.provider === 'custom' ? s.baseUrl.trim() : PROVIDER_BASE[s.provider];
  return { 'x-opensu-key': s.key.trim(), ...(base ? { 'x-opensu-base-url': base } : {}) };
}

/** Model to request: the user's choice with their own key, else the relay's default. */
export const requestModel = (s: AiSettings) => (usesOwnKey(s) && s.model.trim() ? s.model.trim() : 'default');
