// Sign-in (task 019): Better Auth on D1 with an emailed one-time code and
// Google. No passwords (hashing does not fit the free tier's 10 ms CPU).
// One flow for new and returning people: an unknown address or Google
// account becomes an account silently.
//
// The instance is built once per isolate (the configuration only changes
// with a deploy) so a request pays only for its own work.
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { type AccountEnv, type AuthConfig, authConfig, type D1Like } from './config.ts';
import { bump } from './quota.ts';

/** Codes per address per hour, and sends per IP per hour (on top of Better Auth's per-IP minute rule). */
export const OTP_PER_EMAIL_HOUR = 5;
export const OTP_PER_IP_HOUR = 20;
const OTP_MINUTES = 10;

/** Test hook: the last code per address (localhost only, see config.ts). */
const testCodes = new Map<string, string>();
export const lastTestCode = (email: string) => testCodes.get(email.trim().toLowerCase()) ?? null;

/** "2026-11-14T07": the UTC hour, as the prefix of rate-limit counters. */
const hourKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 13);

function codeMail(otp: string): { subject: string; text: string; html: string } {
  const subject = `${otp} 是你的 openSU 验证码 / your openSU code`;
  const text = `你的 openSU 验证码：${otp}\n${OTP_MINUTES} 分钟内有效。如果不是你本人操作，请忽略这封邮件。\n\nYour openSU code: ${otp}\nIt expires in ${OTP_MINUTES} minutes. If you did not ask for it, ignore this email.\n`;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#1c1c1e">
<p>你的 openSU 验证码 / Your openSU code</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">${otp}</p>
<p>${OTP_MINUTES} 分钟内有效。如果不是你本人操作，请忽略这封邮件。<br>It expires in ${OTP_MINUTES} minutes. If you did not ask for it, ignore this email.</p></div>`;
  return { subject, text, html };
}

/** Sends one code with Resend (https://resend.com/docs/api-reference/emails/send-email). */
async function sendWithResend(env: AccountEnv, email: string, otp: string): Promise<void> {
  const mail = codeMail(otp);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.AUTH_EMAIL_FROM!.trim(), to: [email], ...mail }),
  });
  if (!res.ok) {
    // Never log the key or the code; the status is enough to diagnose.
    console.error(`resend: HTTP ${res.status}`);
    throw new APIError('BAD_GATEWAY', { message: 'The code could not be sent.', code: 'EMAIL_NOT_SENT' });
  }
}

/** A plausible address (Better Auth validates properly; this only gates our counter). */
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

/** True while `warmUp` runs (startup, no I/O allowed): rate limits are skipped. */
let warming = false;

export type Auth = ReturnType<typeof createAuth>;

/** Tests only: make the next builds throw (scripts/auth-check.ts). */
export const authTesting = { failBuild: false };

/** Builds per isolate: at most this many attempts, then sign-in stays off until the next deploy. */
const MAX_BUILDS = 2;
let cached: { key: string; auth: Auth | null; ready: Promise<boolean> } | null = null;
let builds = 0;

const reason = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 200);

/**
 * The Better Auth instance for this isolate, ready to use, or null when
 * sign-in is off or could not be built. Never throws: a failed build is
 * logged in one line (never a secret) and retried once, on the next call
 * (the first /api/auth request after a failed startup); after that the
 * sign-in routes answer `auth_off` and everyone counts as anonymous.
 */
export async function loadAuth(env: AccountEnv): Promise<Auth | null> {
  let cfg: AuthConfig;
  try {
    cfg = authConfig(env);
  } catch (e) {
    console.error(`auth: configuration unreadable (${reason(e)})`);
    return null;
  }
  if (!cfg.enabled) return null;
  const key = `${cfg.siteUrl}|${cfg.email}|${cfg.google}|${cfg.testHook}`;
  // A new configuration, or a failed build with an attempt left: build.
  if (cached && cached.key === key && cached.auth === null && builds >= MAX_BUILDS) return null;
  if (!cached || cached.key !== key || cached.auth === null) {
    builds = cached?.key === key ? builds + 1 : 1;
    try {
      if (authTesting.failBuild) throw new Error('build failure (test)');
      const auth = createAuth(env, cfg);
      cached = {
        key,
        auth,
        ready: auth.$context.then(
          () => true,
          (e) => {
            console.error(`auth: sign-in unavailable, Better Auth did not start (${reason(e)})`);
            if (cached?.auth === auth) cached = { key, auth: null, ready: Promise.resolve(false) };
            return false;
          },
        ),
      };
    } catch (e) {
      console.error(`auth: sign-in unavailable, Better Auth did not build (${reason(e)})`);
      cached = { key, auth: null, ready: Promise.resolve(false) };
    }
  }
  const c = cached!;
  return (await c.ready) ? c.auth : null;
}

function createAuth(env: AccountEnv, cfg: AuthConfig) {
  const db = env.DB as D1Like;
  return betterAuth({
    // D1 is detected from the binding (Better Auth's built-in Kysely D1 dialect).
    database: env.DB as never,
    secret: cfg.secret!,
    baseURL: cfg.siteUrl!,
    basePath: '/api/auth',
    trustedOrigins: [cfg.siteUrl!],
    telemetry: { enabled: false },
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 60 * 86_400,
      updateAge: 86_400,
      // The signed session cookie answers most reads without D1 (5 minutes).
      cookieCache: { enabled: true, maxAge: 300 },
    },
    account: { accountLinking: { enabled: true, trustedProviders: ['google', 'email-otp'] } },
    advanced: {
      // The deploy applies migrations/ (checked against Better Auth's own
      // schema in scripts/auth-check.ts); skipping the runtime check saves
      // seven D1 queries on every new isolate.
      database: { validateSchema: false },
      cookiePrefix: 'opensu',
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    // Per-IP limits, counted atomically in D1 (fixed windows); see quota.ts `bump`.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        '/get-session': false,
        '/ok': false,
        '/email-otp/send-verification-otp': { window: 3600, max: OTP_PER_IP_HOUR },
        '/sign-in/email-otp': { window: 600, max: 20 },
      },
      customStorage: {
        consume: async (key, rule) => {
          if (warming) return { allowed: true, retryAfter: null };
          const now = Date.now();
          const start = Math.floor(now / 1000 / rule.window) * rule.window;
          const prefix = new Date(start * 1000).toISOString().slice(0, 19);
          const [n] = await bump(db, [`${prefix}|rl:${rule.window}:${key}`]);
          const allowed = (n ?? 0) <= rule.max;
          return { allowed, retryAfter: allowed ? null : Math.max(1, start + rule.window - Math.floor(now / 1000)) };
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/email-otp/send-verification-otp') return;
        const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase();
        if (warming || !EMAIL.test(email)) return;
        const [n] = await bump(db, [`${hourKey()}|otp-e:${email}`]);
        if ((n ?? 0) > OTP_PER_EMAIL_HOUR) throw new APIError('TOO_MANY_REQUESTS', { message: 'Too many codes for this address. Try again later.', code: 'TOO_MANY_CODES' });
      }),
    },
    socialProviders: cfg.google
      ? { google: { clientId: env.GOOGLE_CLIENT_ID!.trim(), clientSecret: env.GOOGLE_CLIENT_SECRET!.trim(), prompt: 'select_account' as const } }
      : {},
    plugins: cfg.email
      ? [
          emailOTP({
            otpLength: 6,
            expiresIn: OTP_MINUTES * 60,
            allowedAttempts: 5,
            storeOTP: 'hashed',
            async sendVerificationOTP({ email, otp, type }) {
              if (type !== 'sign-in') return;
              if (cfg.testHook) {
                testCodes.set(email.toLowerCase(), otp);
                console.log(`[auth test hook] sign-in code for ${email}: ${otp}`);
                return;
              }
              await sendWithResend(env, email, otp);
            },
          }),
        ]
      : [],
  });
}

/**
 * Runs the sign-in router once without touching the database, so most of
 * the one-time work of a first call (route table, middleware, JIT) happens
 * at Worker startup instead of in a visitor's request. Only GET requests:
 * the global scope allows no I/O, and workerd treats a request body as a
 * stream it refuses there.
 */
export async function warmUp(auth: Auth, siteUrl: string): Promise<void> {
  warming = true;
  const headers = { 'cf-connecting-ip': '127.0.0.1' };
  try {
    await auth.handler(new Request(`${siteUrl}/api/auth/ok`, { headers }));
    await auth.handler(new Request(`${siteUrl}/api/auth/get-session`, { headers }));
  } finally {
    warming = false;
  }
}

/** The signed-in user of a request (id and email), or null. */
/**
 * The signed-in user of a request (id and email), or null. Never throws:
 * when sign-in is broken the caller counts as anonymous (the quota still
 * applies).
 */
export async function sessionUser(req: Request, env: AccountEnv): Promise<{ id: string; email: string } | null> {
  if (!/opensu\.session_token=/.test(req.headers.get('cookie') ?? '')) return null;
  try {
    const auth = await loadAuth(env);
    if (!auth) return null;
    const s = await auth.api.getSession({ headers: req.headers });
    return s?.user ? { id: s.user.id, email: s.user.email } : null;
  } catch (e) {
    console.error(`auth: session not readable (${reason(e)})`);
    return null;
  }
}
