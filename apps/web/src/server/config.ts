// Deployment configuration of accounts and the daily quota (task 019).
// Everything here comes from Worker variables and secrets; nothing about a
// deployment (site address, sender, numbers) is written in code. Missing
// or malformed values fall back to safe defaults, so a deploy without the
// new secrets keeps working: sign-in is hidden and the quota applies the
// anonymous limits. See apps/web/README.md "Accounts and quota".

/** The D1 binding, reduced to what we use (structurally a `D1Database`). */
export interface D1Like {
  prepare(sql: string): D1Stmt;
  batch(stmts: D1Stmt[]): Promise<{ results?: unknown[] }[]>;
  exec(sql: string): Promise<unknown>;
}
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

export interface AccountEnv {
  /** D1 database (wrangler.jsonc `d1_databases`, binding `DB`). */
  DB?: D1Like;
  /** Public site URL, e.g. https://opensu.example (Google redirect URI and cookies derive from it). */
  SITE_URL?: string;
  /** "false" stops redirecting other hosts (the workers.dev address) to SITE_URL (task 026). */
  CANONICAL_REDIRECT?: string;
  /** "false" turns sign-in off even when the secrets exist (self-hosters). */
  AUTH_ENABLED?: string;
  /** Better Auth secret (32+ random bytes); also signs the anonymous visitor cookie. */
  BETTER_AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  /** Sender address for sign-in codes, e.g. "openSU <code@mail.opensu.example>". */
  AUTH_EMAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /**
   * Local development and tests only: sign-in codes are logged and readable
   * at /api/auth-test/code instead of being emailed. Honoured only for
   * requests to localhost.
   */
  AUTH_TEST_HOOK?: string;
  QUOTA_ENABLED?: string;
  QUOTA_USER_DAILY?: string;
  QUOTA_ANON_TRIAL?: string;
  QUOTA_IP_DAILY?: string;
  QUOTA_SITE_DAILY?: string;
  QUOTA_CALLS_PER_TURN?: string;
  /** IANA time zone in which the quota day rolls over (default Asia/Shanghai). */
  QUOTA_TZ?: string;
  /** "false" stops saving conversation turns (task 020, POST /api/turns answers 204). */
  TURN_RECORDS?: string;
  /** Days a saved turn is kept (default 30). */
  TURN_RECORDS_DAYS?: string;
  /** Site-wide budget of saved records per quota day, MB (default 15). */
  TURN_RECORDS_DAILY_MB?: string;
  /** "false" turns projects kept with the account off (task 027); they are also off without sign-in. */
  PROJECTS_ENABLED?: string;
  /** Projects per account (default 20). */
  PROJECTS_MAX?: string;
  /** Largest project, KB: the house and the conversation as sent (default 512). */
  PROJECT_MAX_KB?: string;
}

export const QUOTA_DEFAULTS = { userDaily: 10, anonTrial: 3, ipDaily: 60, siteDaily: 500, callsPerTurn: 8, tz: 'Asia/Shanghai' } as const;

export interface QuotaConfig {
  enabled: boolean;
  userDaily: number;
  anonTrial: number;
  ipDaily: number;
  siteDaily: number;
  callsPerTurn: number;
  tz: string;
}

export interface AuthConfig {
  /** Sign-in is offered (at least one method works). */
  enabled: boolean;
  email: boolean;
  google: boolean;
  /** Codes go to the test hook instead of Resend (localhost only). */
  testHook: boolean;
  siteUrl: string | null;
  secret: string | null;
}

const off = (v: string | undefined) => /^(false|0|no|off)$/i.test((v ?? '').trim());

/** A non-negative integer variable, or the default when missing or malformed. */
export function intVar(v: string | undefined, fallback: number): number {
  const s = (v ?? '').trim();
  if (!/^\d{1,9}$/.test(s)) return fallback;
  return Number(s);
}

const tzCache = new Map<string, boolean>();
/** True for a time zone this runtime knows. */
export function validTz(tz: string): boolean {
  let ok = tzCache.get(tz);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      ok = true;
    } catch {
      ok = false;
    }
    tzCache.set(tz, ok);
  }
  return ok;
}

/**
 * The quota applies whenever a database is bound, unless QUOTA_ENABLED is
 * "false". Without a database it cannot count; `relay` then refuses the
 * owner's key (fail closed) unless the quota is explicitly off.
 */
export function quotaConfig(env: AccountEnv): QuotaConfig {
  const tz = (env.QUOTA_TZ ?? '').trim();
  return {
    enabled: !off(env.QUOTA_ENABLED),
    userDaily: intVar(env.QUOTA_USER_DAILY, QUOTA_DEFAULTS.userDaily),
    anonTrial: intVar(env.QUOTA_ANON_TRIAL, QUOTA_DEFAULTS.anonTrial),
    ipDaily: intVar(env.QUOTA_IP_DAILY, QUOTA_DEFAULTS.ipDaily),
    siteDaily: intVar(env.QUOTA_SITE_DAILY, QUOTA_DEFAULTS.siteDaily),
    callsPerTurn: Math.max(1, intVar(env.QUOTA_CALLS_PER_TURN, QUOTA_DEFAULTS.callsPerTurn)),
    tz: tz && validTz(tz) ? tz : QUOTA_DEFAULTS.tz,
  };
}

export const TURN_RECORDS_DEFAULT_DAYS = 30;
/** 1.5 times the normal maximum (500 turns of about 20 KB); 30 days of it stay under D1 Free's 500 MB. */
export const TURN_RECORDS_DEFAULT_DAILY_MB = 15;

/** Turn records (task 020): on whenever a database is bound, unless TURN_RECORDS is "false". */
export function turnsConfig(env: AccountEnv): { enabled: boolean; days: number; dailyKb: number } {
  return {
    enabled: !off(env.TURN_RECORDS) && !!env.DB,
    days: Math.max(1, intVar(env.TURN_RECORDS_DAYS, TURN_RECORDS_DEFAULT_DAYS)),
    dailyKb: intVar(env.TURN_RECORDS_DAILY_MB, TURN_RECORDS_DEFAULT_DAILY_MB) * 1024,
  };
}

export const PROJECTS_DEFAULT_MAX = 20;
export const PROJECT_DEFAULT_MAX_KB = 512;

/**
 * Projects kept with the account (task 027): on whenever sign-in works
 * (which needs the database), unless PROJECTS_ENABLED is "false". The size
 * stays under D1's 2 MB row limit.
 */
export function projectsConfig(env: AccountEnv): { enabled: boolean; max: number; maxKb: number } {
  return {
    enabled: !off(env.PROJECTS_ENABLED) && authConfig(env).enabled,
    max: Math.max(1, intVar(env.PROJECTS_MAX, PROJECTS_DEFAULT_MAX)),
    maxKb: Math.min(1800, Math.max(16, intVar(env.PROJECT_MAX_KB, PROJECT_DEFAULT_MAX_KB))),
  };
}

/** The configured site URL as an origin (https, or http for localhost), else null. */
export function siteOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * One canonical host (task 026): a session cookie lands on the host that
 * set it, so a visitor signed in on `SITE_URL` looks signed out on the
 * `workers.dev` address. When `SITE_URL` is set and a request's host is
 * another one, the answer is the same path and query on `SITE_URL`. Not
 * for localhost, and not with CANONICAL_REDIRECT=false (the escape hatch
 * if the custom domain breaks). A string comparison: no measurable CPU.
 */
export function canonicalRedirect(requestUrl: string, env: Pick<AccountEnv, 'SITE_URL' | 'CANONICAL_REDIRECT'>): string | null {
  if (!env.SITE_URL || off(env.CANONICAL_REDIRECT)) return null;
  const site = siteOrigin(env.SITE_URL);
  if (!site) return null;
  const u = new URL(requestUrl);
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]') return null;
  const s = new URL(site);
  if (u.host === s.host) return null;
  return `${site}${u.pathname}${u.search}`;
}

/** True when a request is addressed to this machine (the test hook's guard). */
export const isLocalRequest = (req: Request) => {
  const h = new URL(req.url).hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
};

/**
 * Sign-in needs the database, the secret (32+ characters) and the site URL,
 * plus at least one method: email (Resend key and sender, or the test hook)
 * or Google (client id and secret).
 */
export function authConfig(env: AccountEnv): AuthConfig {
  const secret = (env.BETTER_AUTH_SECRET ?? '').trim();
  const siteUrl = siteOrigin(env.SITE_URL);
  const base = !off(env.AUTH_ENABLED) && !!env.DB && secret.length >= 32 && !!siteUrl;
  const testHook = (env.AUTH_TEST_HOOK ?? '').trim() === '1';
  const email = base && ((!!env.RESEND_API_KEY?.trim() && !!env.AUTH_EMAIL_FROM?.trim()) || testHook);
  const google = base && !!env.GOOGLE_CLIENT_ID?.trim() && !!env.GOOGLE_CLIENT_SECRET?.trim();
  return { enabled: email || google, email, google, testHook: base && testHook, siteUrl, secret: secret.length >= 32 ? secret : null };
}
