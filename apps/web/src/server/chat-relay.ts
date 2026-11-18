// `/api/chat`: a dumb relay to an OpenAI-compatible Chat Completions
// endpoint. It picks the key and the model, forwards the request and pipes
// the provider's response body back untouched (no parsing or re-encoding
// of the stream; waiting on the network costs no Worker CPU). Everything
// else - SSE parsing, tool calls, the agent loop - runs in the browser.
//
// Keys: the owner's key comes from the environment; a user may send their
// own in `x-opensu-key` (with an optional `x-opensu-base-url`). Keys are
// never logged, echoed, stored or put in URLs.
//
// A signed-in user may instead name a key saved with the account
// (`x-opensu-account-key: <provider>`, task 022, keys.ts): the Worker
// decrypts it for this call only.
//
// The owner's key is metered by the daily quota (task 019, quota.ts); a
// visitor's own key never is, nor is a key saved with the account.
import { DEFAULT_MODELS as PROVIDER_DEFAULTS, PROVIDER_BASE_URLS } from '../lib/providers.ts';
import { authConfig, quotaConfig } from './config.ts';
import { ACCOUNT_KEY_HEADER, accountUpstream, keysConfig, type KeysEnv } from './keys.ts';
import { consume, type QuotaStatus, type Subject, status as quotaStatus, TURN_ID } from './quota.ts';
import { clientIp, newVisitor, verifyVisitor } from './visitor.ts';

export interface RelayEnv extends KeysEnv {
  OPENROUTER_API_KEY?: string;
  OPENAI_API_KEY?: string;
  /** OpenAI-compatible base URL used with OPENAI_API_KEY (default https://api.openai.com/v1). */
  OPENAI_BASE_URL?: string;
  /** Model id for the configured provider. */
  OPENSU_MODEL?: string;
}

export const OPENROUTER_BASE_URL = PROVIDER_BASE_URLS.openrouter;
export const OPENAI_BASE_URL = PROVIDER_BASE_URLS.openai;
/** Default models (see apps/web/README.md "AI assistant"). */
export const DEFAULT_MODELS = PROVIDER_DEFAULTS;

/** Request headers of the bring-your-own-key flow. */
export const BYO_KEY_HEADER = 'x-opensu-key';
export const BYO_BASE_HEADER = 'x-opensu-base-url';
/** The user message a model call belongs to (one credit per turn). */
export const TURN_HEADER = 'x-opensu-turn';

/** Largest request body accepted (the house description plus a trimmed history fits easily). */
const MAX_BODY = 256 * 1024;
/** Output cap per model call on the owner's key. */
const OWNER_MAX_TOKENS = 4096;
/**
 * Output cap sent to Anthropic when the request names none (the Messages
 * API behind its compatibility layer requires one; every current Claude
 * model allows at least 64K, the current ones 128K).
 */
const ANTHROPIC_MAX_TOKENS = 32000;

interface Upstream {
  url: string;
  key: string;
  model: string;
  provider: 'openrouter' | 'openai' | 'anthropic' | 'custom';
  owner: boolean;
  /** A key saved with the account: its model is the saved one. */
  account?: boolean;
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { 'cache-control': 'no-store' } });
}

function serverUpstream(env: RelayEnv): Omit<Upstream, 'url'> & { base: string } | null {
  if (env.OPENROUTER_API_KEY) return { base: OPENROUTER_BASE_URL, key: env.OPENROUTER_API_KEY, model: env.OPENSU_MODEL || DEFAULT_MODELS.openrouter, provider: 'openrouter', owner: true };
  if (env.OPENAI_API_KEY) {
    const base = env.OPENAI_BASE_URL || OPENAI_BASE_URL;
    return { base, key: env.OPENAI_API_KEY, model: env.OPENSU_MODEL || DEFAULT_MODELS.openai, provider: base === OPENAI_BASE_URL ? 'openai' : 'custom', owner: true };
  }
  return null;
}

/** A user-supplied base URL: https only, no credentials or query. */
function userBase(raw: string | null): string | null {
  if (!raw) return OPENROUTER_BASE_URL;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null;
    return u.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

async function pickUpstream(req: Request, env: RelayEnv): Promise<Upstream | Response> {
  const byoKey = req.headers.get(BYO_KEY_HEADER)?.trim();
  const account = req.headers.get(ACCOUNT_KEY_HEADER)?.trim();
  if (!byoKey && account) {
    const a = await accountUpstream(req, env, account);
    return a instanceof Response ? a : { ...a, owner: false, account: true };
  }
  if (byoKey) {
    const base = userBase(req.headers.get(BYO_BASE_HEADER));
    if (!base) return jsonError(400, 'bad_base_url', 'The base URL must be an https:// URL without credentials or query.');
    const provider = base === OPENROUTER_BASE_URL ? 'openrouter' : base === OPENAI_BASE_URL ? 'openai' : 'custom';
    const model = env.OPENSU_MODEL || (provider === 'openai' ? DEFAULT_MODELS.openai : DEFAULT_MODELS.openrouter);
    return { url: `${base}/chat/completions`, key: byoKey, model, provider, owner: false };
  }
  const s = serverUpstream(env);
  if (!s) return jsonError(401, 'no_key', 'No AI provider key is configured on this server. Add your own key in the assistant settings.');
  return { url: `${s.base}/chat/completions`, key: s.key, model: s.model, provider: s.provider, owner: true };
}

/** Who is asking: the signed-in user, else the anonymous visitor (cookie, or the IP without a secret). */
interface Caller {
  subject: Subject;
  email: string | null;
  /** The signed-in account's name and picture (task 026), when it has them. */
  profile?: { name: string | null; image: string | null };
  /** Set-Cookie for a new visitor cookie. */
  setCookie: string | null;
}

export async function identify(req: Request, env: RelayEnv): Promise<Caller> {
  const auth = authConfig(env);
  if (auth.enabled) {
    // Better Auth loads only when sign-in is configured; if it cannot, the caller is anonymous.
    const user = await import('./auth.ts').then((m) => m.sessionUser(req, env), () => null);
    if (user) return { subject: { kind: 'user', id: user.id }, email: user.email, profile: { name: user.name, image: user.image }, setCookie: null };
  }
  if (auth.secret) {
    const id = await verifyVisitor(req, auth.secret);
    if (id) return { subject: { kind: 'anon', id }, email: null, setCookie: null };
    const v = await newVisitor(req, auth.secret);
    return { subject: { kind: 'anon', id: v.id }, email: null, setCookie: v.cookie };
  }
  // No secret to sign a visitor cookie with: the trial is counted per IP.
  return { subject: { kind: 'anon', id: `ip:${clientIp(req)}` }, email: null, setCookie: null };
}

function quotaError(st: QuotaStatus, setCookie: string | null): Response {
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  if (setCookie) headers['set-cookie'] = setCookie;
  const message =
    st.reason === 'site'
      ? "Today's shared credits are used up. Use your own key, or come back after the reset."
      : st.reason === 'turn'
        ? 'This message used the most model calls one message may use.'
        : 'No credits left for today.';
  return Response.json({ error: { code: st.reason === 'turn' ? 'quota_turn_limit' : 'quota_exhausted', message, quota: st } }, { status: 429, headers });
}

/**
 * One structured log line per POST /api/chat (task 020). No message
 * content, no keys, no email: `caller` is the kind of caller (checked when the
 * quota counts; otherwise only read from which cookie is present),
 * `key` whose key, `quota` the quota's answer ("ok", a refusal code, "off",
 * or null when it does not apply), `upstream` the provider's HTTP status
 * (null when the request never reached it), `ttfbMs` the time until the
 * provider's response headers arrived.
 */
interface ChatLog {
  msg: 'chat';
  turn: string | null;
  caller: 'user' | 'anon' | null;
  key: 'owner' | 'own' | null;
  quota: string | null;
  model: string | null;
  upstream: number | null;
  ttfbMs: number | null;
}

/** On an own key nobody is identified: the caller kind as the cookies suggest it (not verified). */
const callerHint = (req: Request): 'user' | 'anon' => (/opensu\.session_token=/.test(req.headers.get('cookie') ?? '') ? 'user' : 'anon');

/**
 * Credits: decides whether this request may use the owner's key. Returns a
 * Response to refuse, else the Set-Cookie (if any) to add to the reply.
 */
async function checkCredits(req: Request, upstream: Upstream, env: RelayEnv, log: ChatLog): Promise<Response | { setCookie: string | null }> {
  if (!upstream.owner) {
    log.caller = callerHint(req);
    return { setCookie: null };
  }
  const cfg = quotaConfig(env);
  if (!cfg.enabled) {
    log.caller = callerHint(req);
    log.quota = 'off';
    return { setCookie: null };
  }
  if (!env.DB) {
    log.quota = 'quota_unavailable';
    return jsonError(503, 'quota_unavailable', 'The shared key is not available on this server. Use your own key.');
  }
  try {
    const caller = await identify(req, env);
    log.caller = caller.subject.kind;
    const raw = req.headers.get(TURN_HEADER) ?? '';
    // Without a turn id every call is its own turn (older clients).
    const turn = TURN_ID.test(raw) ? raw : crypto.randomUUID();
    const r = await consume(env.DB, cfg, caller.subject, clientIp(req), turn);
    log.quota = r.ok ? 'ok' : r.status.reason === 'turn' ? 'quota_turn_limit' : 'quota_exhausted';
    return r.ok ? { setCookie: caller.setCookie } : quotaError(r.status, caller.setCookie);
  } catch (e) {
    console.error('quota: database error', e instanceof Error ? e.message : e);
    log.quota = 'quota_unavailable';
    return jsonError(503, 'quota_unavailable', 'The shared key is not available right now. Use your own key or try again later.');
  }
}

/**
 * GET /api/chat: what the assistant can use (no secrets): the owner's key
 * and model, the sign-in methods, who is signed in, and the caller's
 * credits with their reset time.
 */
export async function relayStatus(req: Request, env: RelayEnv): Promise<Response> {
  const s = serverUpstream(env);
  const auth = authConfig(env);
  const cfg = quotaConfig(env);
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  let quota: QuotaStatus | null = null;
  let email: string | null = null;
  let profile: { name: string | null; image: string | null } = { name: null, image: null };
  let quotaError: string | null = null;
  try {
    if (s && cfg.enabled && env.DB) {
      const caller = await identify(req, env);
      email = caller.email;
      if (caller.profile) profile = caller.profile;
      if (caller.setCookie) headers['set-cookie'] = caller.setCookie;
      quota = await quotaStatus(env.DB, cfg, caller.subject, clientIp(req));
    } else if (auth.enabled) {
      const user = await import('./auth.ts').then((m) => m.sessionUser(req, env), () => null);
      email = user?.email ?? null;
      if (user) profile = { name: user.name, image: user.image };
    }
  } catch (e) {
    console.error('status: database error', e instanceof Error ? e.message : e);
    quotaError = 'unavailable';
  }
  return Response.json(
    {
      serverKey: !!s && (!cfg.enabled || !!env.DB),
      provider: s?.provider ?? null,
      model: s?.model ?? null,
      auth: { email: auth.email, google: auth.google },
      user: email ? { email, ...profile } : null,
      // Keys can be saved with the account (task 022).
      keys: keysConfig(env).enabled,
      quota,
      limits: s && cfg.enabled ? { user: cfg.userDaily, anon: cfg.anonTrial } : null,
      quotaError,
    },
    { headers },
  );
}

/** POST /api/chat: relay one Chat Completions call (and log one line about it). */
export async function relayChat(req: Request, env: RelayEnv): Promise<Response> {
  const raw = req.headers.get(TURN_HEADER) ?? '';
  const log: ChatLog = { msg: 'chat', turn: TURN_ID.test(raw) ? raw : null, caller: null, key: null, quota: null, model: null, upstream: null, ttfbMs: null };
  try {
    return await relay(req, env, log);
  } finally {
    console.log(JSON.stringify(log));
  }
}

async function relay(req: Request, env: RelayEnv, log: ChatLog): Promise<Response> {
  const t0 = Date.now();
  const up = await pickUpstream(req, env);
  if (up instanceof Response) return up;
  log.key = up.owner ? 'owner' : 'own';
  const text = await req.text();
  if (text.length > MAX_BODY) return jsonError(413, 'too_large', 'The conversation is too long. Start a new chat.');
  // The only look at the request: set the model (and an output cap on the
  // owner's key). The response stream is never parsed.
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return jsonError(400, 'bad_request', 'Request body is not JSON.');
  }
  // Credits are taken only for a request that will reach the provider.
  const credits = await checkCredits(req, up, env, log);
  if (credits instanceof Response) return credits;
  if (up.owner || up.account || typeof body.model !== 'string' || body.model === 'default') body.model = up.model;
  log.model = String(body.model).slice(0, 200);
  body.stream = true;
  if (up.owner && up.provider !== 'custom') {
    // OpenRouter takes max_tokens; OpenAI's newer models only max_completion_tokens.
    const key = up.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens';
    body[key] = Math.min(Number(body[key] ?? body.max_tokens) || OWNER_MAX_TOKENS, OWNER_MAX_TOKENS);
    if (key !== 'max_tokens') delete body.max_tokens;
  }
  if (up.provider === 'anthropic' && body.max_tokens == null && body.max_completion_tokens == null) body.max_tokens = ANTHROPIC_MAX_TOKENS;

  const headers: Record<string, string> = {
    authorization: `Bearer ${up.key}`,
    'content-type': 'application/json',
    accept: 'text/event-stream',
  };
  if (up.provider === 'openrouter') {
    headers['http-referer'] = new URL(req.url).origin;
    headers['x-title'] = 'openSU';
  }
  let res: Response;
  try {
    res = await fetch(up.url, { method: 'POST', headers, body: JSON.stringify(body), signal: req.signal });
  } catch {
    log.ttfbMs = Date.now() - t0;
    return jsonError(502, 'upstream_unreachable', 'The AI provider could not be reached.');
  }
  log.upstream = res.status;
  log.ttfbMs = Date.now() - t0;
  // Pass the body through as is; keep only the content type of the upstream headers.
  const out = new Headers({
    'content-type': res.headers.get('content-type') ?? 'text/event-stream',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
  });
  if (credits.setCookie) out.set('set-cookie', credits.setCookie);
  return new Response(res.body, { status: res.status, headers: out });
}
