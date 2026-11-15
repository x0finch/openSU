// API keys saved with the account (task 022). A signed-in user keeps their
// own OpenRouter, OpenAI or Anthropic key here and picks which one the
// assistant uses; the relay (chat-relay.ts) decrypts it per call.
//
// Trivial on purpose (10 ms CPU): one D1 statement per request plus, for a
// write, the rate-limit counter; AES-256-GCM through Web Crypto with a key
// derived once per isolate (HKDF-SHA-256) from the Worker secret
// KEYS_SECRET. Without that secret (or without sign-in) the feature is off
// and every route answers `keys_off`; keys held in the browser keep working.
//
// Never logged, never returned: the browser gets the provider, the last
// four characters and the model, nothing else.
//
//   GET    /api/keys                       {enabled, keys: [{provider, hint, model, updatedAt}], active}
//   PUT    /api/keys {provider, key, model?, use?}   save or replace (use: make it the one in use)
//   PATCH  /api/keys {provider, model}    change the model
//   PATCH  /api/keys {active: provider|null}          choose (null: the site's free allowance)
//   DELETE /api/keys {provider}
// Every write answers with the new list.
import { DEFAULT_MODELS, isKeyProvider, KEY_PROVIDERS, type KeyProvider, PROVIDER_BASE_URLS } from '../lib/providers.ts';
import { type AccountEnv, authConfig, isLocalRequest } from './config.ts';
import { bump } from './quota.ts';

export interface KeysEnv extends AccountEnv {
  /** 32+ random characters; encrypts saved keys. Unset: saving keys to an account is not offered. */
  KEYS_SECRET?: string;
  /**
   * Local tests only: send account-key calls to `<this>/<provider>/v1`
   * instead of the provider (the scripted stub). Honoured only for requests
   * to localhost.
   */
  KEYS_TEST_UPSTREAM?: string;
}

/** The request header naming which saved key a chat call uses. */
export const ACCOUNT_KEY_HEADER = 'x-opensu-account-key';
/** Writes (save, change, choose, delete) per user per hour. */
export const KEY_WRITES_PER_HOUR = 30;
const MAX_BODY = 4096;
const KEY_TEXT = /^[\x21-\x7e]{8,512}$/;
const MODEL_TEXT = /^[\x20-\x7e]{0,200}$/;

/** On when sign-in works and KEYS_SECRET has 32+ characters. */
export function keysConfig(env: KeysEnv): { enabled: boolean; secret: string | null } {
  const secret = (env.KEYS_SECRET ?? '').trim();
  const ok = secret.length >= 32 && authConfig(env).enabled;
  return { enabled: ok, secret: ok ? secret : null };
}

/* ------------------------------------------------------------------ */
/* Encryption                                                          */
/* ------------------------------------------------------------------ */

const enc = new TextEncoder();
const aesKeys = new Map<string, Promise<CryptoKey>>();
/** AES-256-GCM key from the secret (HKDF-SHA-256), derived once per isolate. */
function aesKey(secret: string): Promise<CryptoKey> {
  let k = aesKeys.get(secret);
  if (!k) {
    k = crypto.subtle
      .importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey'])
      .then((base) => crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('opensu/account-keys'), info: enc.encode('aes-256-gcm/v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
    aesKeys.set(secret, k);
  }
  return k;
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
/** Binds a ciphertext to its user and provider. */
const aad = (userId: string, provider: string) => enc.encode(`opensu-key:v1|${userId}|${provider}`);

/** Encrypts `plain` for this user and provider: "v1.<iv>.<ciphertext+tag>". */
export async function sealKey(secret: string, userId: string, provider: KeyProvider, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(userId, provider) }, await aesKey(secret), enc.encode(plain));
  return `v1.${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}

/** The key, or null when it cannot be decrypted (another secret, user or provider, or tampered). Fails closed. */
export async function openKey(secret: string, userId: string, provider: KeyProvider, sealed: string): Promise<string | null> {
  const m = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{24,})$/.exec(sealed);
  if (!m) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(m[1]!), additionalData: aad(userId, provider) }, await aesKey(secret), fromB64url(m[2]!));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

const noStore = { 'cache-control': 'no-store' };
const jsonError = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status, headers: noStore });

export interface SavedKeyInfo {
  provider: KeyProvider;
  hint: string;
  model: string;
  updatedAt: number;
}
export interface KeyList {
  enabled: true;
  keys: SavedKeyInfo[];
  /** The key in use; null: the site's free allowance. */
  active: KeyProvider | null;
}

/** The signed-in user (Better Auth loads only when sign-in is configured). */
const userOf = (req: Request, env: KeysEnv) => import('./auth.ts').then((m) => m.sessionUser(req, env), () => null);

async function list(env: KeysEnv, userId: string): Promise<KeyList> {
  const { results = [] } = await env.DB!.prepare('SELECT provider, hint, model, chosen, updated_at FROM account_key WHERE user_id = ?1').bind(userId).all<{ provider: KeyProvider; hint: string; model: string; chosen: number; updated_at: number }>();
  const rows = results.filter((r) => isKeyProvider(r.provider)).sort((a, b) => KEY_PROVIDERS.indexOf(a.provider) - KEY_PROVIDERS.indexOf(b.provider));
  return { enabled: true, keys: rows.map((r) => ({ provider: r.provider, hint: r.hint, model: r.model, updatedAt: r.updated_at })), active: rows.find((r) => r.chosen)?.provider ?? null };
}

const UPSERT = `INSERT INTO account_key (user_id, provider, secret, hint, model, chosen, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)
ON CONFLICT (user_id, provider) DO UPDATE SET secret = excluded.secret, hint = excluded.hint, model = excluded.model, updated_at = excluded.updated_at`;
const CHOOSE = 'UPDATE account_key SET chosen = (provider IS ?2) WHERE user_id = ?1';

/** "2026-11-15T07": the UTC hour, the prefix of the write counter (the quota's cleanup removes old ones). */
const hourKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 13);

/** /api/keys: list, save, change, choose, delete. Signed-in users only; writes from this site only. */
export async function keysRoute(req: Request, env: KeysEnv): Promise<Response> {
  const cfg = keysConfig(env);
  if (!cfg.enabled || !env.DB) return jsonError(404, 'keys_off', 'Saving keys to an account is not available on this server.');
  const write = req.method !== 'GET';
  if (write) {
    // Same rule as the sign-in routes (Better Auth's trusted origin): only this site may write.
    if (req.headers.get('origin') !== authConfig(env).siteUrl) return jsonError(403, 'bad_origin', 'Not allowed from this origin.');
    if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) return jsonError(415, 'bad_request', 'Expected JSON.');
  }
  try {
    const user = await userOf(req, env);
    if (!user) return jsonError(401, 'signed_out', 'Sign in to save keys with your account.');
    if (!write) return Response.json(await list(env, user.id), { headers: noStore });
    if (!['PUT', 'PATCH', 'DELETE'].includes(req.method)) return jsonError(405, 'bad_method', 'Method not allowed.');
    const raw = await req.text();
    if (raw.length > MAX_BODY) return jsonError(413, 'too_large', 'Too large.');
    let body: Record<string, unknown>;
    try {
      const v: unknown = JSON.parse(raw);
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
      body = v as Record<string, unknown>;
    } catch {
      return jsonError(400, 'bad_request', 'Expected a JSON object.');
    }
    const [n] = await bump(env.DB, [`${hourKey()}|keys:${user.id}`]);
    if ((n ?? 0) > KEY_WRITES_PER_HOUR) return jsonError(429, 'too_many', 'Too many changes. Try again later.');
    const db = env.DB;
    const now = Date.now();
    if (req.method === 'PATCH' && 'active' in body) {
      const active = body.active;
      if (active !== null && !isKeyProvider(active)) return jsonError(400, 'bad_provider', 'Unknown provider.');
      if (active) {
        const has = await db.prepare('SELECT 1 AS x FROM account_key WHERE user_id = ?1 AND provider = ?2').bind(user.id, active).first();
        if (!has) return jsonError(404, 'not_found', 'No key saved for this provider.');
      }
      await db.prepare(CHOOSE).bind(user.id, active).run();
      return Response.json(await list(env, user.id), { headers: noStore });
    }
    const provider = body.provider;
    if (!isKeyProvider(provider)) return jsonError(400, 'bad_provider', 'Unknown provider.');
    const model = body.model === undefined ? undefined : typeof body.model === 'string' ? body.model.trim() : null;
    if (model === null || (model !== undefined && !MODEL_TEXT.test(model))) return jsonError(400, 'bad_model', 'The model id is not valid.');
    if (req.method === 'PUT') {
      const key = typeof body.key === 'string' ? body.key.trim() : '';
      if (!KEY_TEXT.test(key)) return jsonError(400, 'bad_key', 'That does not look like an API key.');
      const sealed = await sealKey(cfg.secret!, user.id, provider, key);
      const stmts = [db.prepare(UPSERT).bind(user.id, provider, sealed, key.slice(-4), model ?? '', now)];
      if (body.use === true) stmts.push(db.prepare(CHOOSE).bind(user.id, provider));
      await db.batch(stmts);
    } else if (req.method === 'PATCH') {
      if (model === undefined) return jsonError(400, 'bad_request', 'Nothing to change.');
      const r = await db.prepare('UPDATE account_key SET model = ?3, updated_at = ?4 WHERE user_id = ?1 AND provider = ?2 RETURNING 1 AS x').bind(user.id, provider, model, now).first();
      if (!r) return jsonError(404, 'not_found', 'No key saved for this provider.');
    } else {
      await db.prepare('DELETE FROM account_key WHERE user_id = ?1 AND provider = ?2').bind(user.id, provider).run();
    }
    return Response.json(await list(env, user.id), { headers: noStore });
  } catch (e) {
    console.error('keys: database error', e instanceof Error ? e.message.slice(0, 160) : 'error');
    return jsonError(503, 'unavailable', 'Keys are not available right now.');
  }
}

/* ------------------------------------------------------------------ */
/* The relay's side                                                    */
/* ------------------------------------------------------------------ */

export interface AccountUpstream {
  url: string;
  key: string;
  model: string;
  provider: KeyProvider;
}

/**
 * The saved key a chat call names (`x-opensu-account-key: <provider>`), for
 * the signed-in caller only, decrypted; or a refusal. Never falls back to
 * the site's key: a call that asks for the user's key either uses it or fails.
 */
export async function accountUpstream(req: Request, env: KeysEnv, provider: string): Promise<AccountUpstream | Response> {
  const cfg = keysConfig(env);
  if (!cfg.enabled || !env.DB) return jsonError(503, 'account_key_off', 'Keys saved with an account are not available on this server.');
  if (!isKeyProvider(provider)) return jsonError(400, 'account_key_missing', 'Unknown provider.');
  const user = await userOf(req, env);
  if (!user) return jsonError(401, 'account_key_signed_out', 'Sign in again to use the key saved with your account.');
  let row: { secret: string; model: string } | null;
  try {
    row = await env.DB.prepare('SELECT secret, model FROM account_key WHERE user_id = ?1 AND provider = ?2').bind(user.id, provider).first<{ secret: string; model: string }>();
  } catch (e) {
    console.error('keys: database error', e instanceof Error ? e.message.slice(0, 160) : 'error');
    return jsonError(503, 'account_key_unavailable', 'The saved key cannot be read right now.');
  }
  if (!row) return jsonError(409, 'account_key_missing', 'No key is saved for this provider.');
  const key = await openKey(cfg.secret!, user.id, provider, row.secret);
  if (key === null) {
    // The secret changed or the row was altered: say so once per call, without any key material.
    console.error(`keys: a saved ${provider} key could not be decrypted`);
    return jsonError(503, 'account_key_unreadable', 'The saved key can no longer be read. Add it again.');
  }
  const test = (env.KEYS_TEST_UPSTREAM ?? '').trim().replace(/\/+$/, '');
  const base = test && isLocalRequest(req) ? `${test}/${provider}/v1` : PROVIDER_BASE_URLS[provider];
  return { url: `${base}/chat/completions`, key, model: row.model || DEFAULT_MODELS[provider], provider };
}
