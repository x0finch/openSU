// The daily quota on the owner's model key (task 019). Pure logic plus two
// SQL statements; the relay decides when it applies (owner's key only).
//
// One credit is one user message (a "turn", identified by the id the
// browser sends in `x-opensu-turn`); a turn may make up to
// `callsPerTurn` model calls. Counters per subject (a signed-in user or an
// anonymous visitor), per IP and for the whole site, per day in the
// configured time zone. Counting is one atomic statement: the INSERT of a
// new turn happens only while every counter is under its limit, and a
// trigger (migrations/0002_quota.sql) bumps the three counters in the same
// statement. A known turn only bumps its call count, up to the cap. No
// read-then-write: concurrent requests are serialised by SQLite.
import type { D1Like, QuotaConfig } from './config.ts';

export type Subject = { kind: 'user'; id: string } | { kind: 'anon'; id: string };

export type QuotaReason = 'user' | 'anon' | 'ip' | 'site' | 'turn';

export interface QuotaStatus {
  /** Whose credits these are. */
  kind: 'user' | 'anon';
  /** The subject's daily allowance. */
  limit: number;
  /** Credits left today for this caller (the smallest of subject, IP and site). */
  remaining: number;
  /** When the counters roll over (ISO 8601). */
  resetAt: string;
  /** Why `remaining` is 0, the binding limit first. */
  reason: QuotaReason | null;
}

export type ConsumeResult = { ok: true; calls: number; newTurn: boolean } | { ok: false; status: QuotaStatus };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    fmtCache.set(tz, f);
  }
  return f;
}

/** The quota day ("YYYY-MM-DD" in `tz`) of `now`, and the next local midnight. */
export function quotaDay(now: number, tz: string): { day: string; resetAt: number } {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(now))) p[x.type] = x.value;
  const day = `${p.year}-${p.month}-${p.day}`;
  const sinceMidnight = ((Number(p.hour) * 60 + Number(p.minute)) * 60 + Number(p.second)) * 1000 + (now % 1000);
  // Zones with daylight saving can be off by an hour on the switch days; China has none.
  return { day, resetAt: now - sinceMidnight + 86_400_000 };
}

/** Subject key in the counters: user ids and visitor ids never collide. */
export const subjectKey = (s: Subject) => (s.kind === 'user' ? `u:${s.id}` : `v:${s.id}`);
const limitOf = (cfg: QuotaConfig, s: Subject) => (s.kind === 'user' ? cfg.userDaily : cfg.anonTrial);

/** Turn ids from the browser: short and plain (they go into a key). */
export const TURN_ID = /^[A-Za-z0-9_-]{8,64}$/;

const CONSUME = `INSERT INTO quota_turn (key, day, subject, ip, calls)
SELECT ?1, ?2, ?3, ?4, 1
WHERE EXISTS (SELECT 1 FROM quota_turn WHERE key = ?1)
   OR (coalesce((SELECT n FROM quota_counter WHERE key = ?2 || '|' || ?3), 0) < ?5
   AND coalesce((SELECT n FROM quota_counter WHERE key = ?2 || '|ip:' || ?4), 0) < ?6
   AND coalesce((SELECT n FROM quota_counter WHERE key = ?2 || '|site'), 0) < ?7)
ON CONFLICT (key) DO UPDATE SET calls = calls + 1 WHERE calls < ?8
RETURNING calls`;

const READ = `SELECT
  (SELECT n FROM quota_counter WHERE key = ?1 || '|' || ?2) AS s,
  (SELECT n FROM quota_counter WHERE key = ?1 || '|ip:' || ?3) AS ip,
  (SELECT n FROM quota_counter WHERE key = ?1 || '|site') AS site,
  (SELECT calls FROM quota_turn WHERE key = ?4) AS calls`;

/** Rows older than this many days are deleted now and then. */
const KEEP_DAYS = 3;

interface Counts {
  s: number | null;
  ip: number | null;
  site: number | null;
  calls: number | null;
}

function statusOf(cfg: QuotaConfig, subject: Subject, c: Counts, resetAt: number, turnCapped = false): QuotaStatus {
  const limit = limitOf(cfg, subject);
  const left = { site: cfg.siteDaily - (c.site ?? 0), subject: limit - (c.s ?? 0), ip: cfg.ipDaily - (c.ip ?? 0) };
  const remaining = Math.max(0, Math.min(left.site, left.subject, left.ip));
  let reason: QuotaReason | null = null;
  if (turnCapped) reason = 'turn';
  else if (left.site <= 0) reason = 'site';
  else if (left.subject <= 0) reason = subject.kind;
  else if (left.ip <= 0) reason = 'ip';
  return { kind: subject.kind, limit, remaining, resetAt: new Date(resetAt).toISOString(), reason };
}

/**
 * Counts one model call of `turnId` for `subject` from `ip`. A new turn
 * takes a credit; later calls of the same turn are free up to
 * `callsPerTurn`. One statement when allowed; a refusal reads the counters
 * once more to say why.
 */
export async function consume(db: D1Like, cfg: QuotaConfig, subject: Subject, ip: string, turnId: string, now = Date.now()): Promise<ConsumeResult> {
  const { day, resetAt } = quotaDay(now, cfg.tz);
  const sk = subjectKey(subject);
  const turnKey = `${day}|${sk}|${turnId}`;
  const row = await db
    .prepare(CONSUME)
    .bind(turnKey, day, sk, ip, limitOf(cfg, subject), cfg.ipDaily, cfg.siteDaily, cfg.callsPerTurn)
    .first<{ calls: number }>();
  if (row) {
    // Housekeeping on roughly one new turn in fifty: old days go (keys start with the day).
    if (row.calls === 1 && Math.random() < 0.02) await cleanup(db, now, cfg.tz).catch(() => {});
    return { ok: true, calls: row.calls, newTurn: row.calls === 1 };
  }
  const c = await db.prepare(READ).bind(day, sk, ip, turnKey).first<Counts>();
  const counts = c ?? { s: null, ip: null, site: null, calls: null };
  return { ok: false, status: statusOf(cfg, subject, counts, resetAt, counts.calls != null && counts.calls >= cfg.callsPerTurn) };
}

/** The caller's credits now (GET /api/chat). One read. */
export async function status(db: D1Like, cfg: QuotaConfig, subject: Subject, ip: string, now = Date.now()): Promise<QuotaStatus> {
  const { day, resetAt } = quotaDay(now, cfg.tz);
  const c = await db.prepare(READ).bind(day, subjectKey(subject), ip, '').first<Counts>();
  return statusOf(cfg, subject, c ?? { s: null, ip: null, site: null, calls: null }, resetAt);
}

/** Deletes counters and turns of days before `KEEP_DAYS` ago (primary-key range scans). */
export async function cleanup(db: D1Like, now: number, tz: string): Promise<void> {
  const { day } = quotaDay(now - KEEP_DAYS * 86_400_000, tz);
  await db.batch([db.prepare('DELETE FROM quota_turn WHERE key < ?1').bind(day), db.prepare('DELETE FROM quota_counter WHERE key < ?1').bind(day)]);
}

/**
 * A plain rate limit: bumps `keys` (one statement each, in one batch) and
 * returns the new counts. Keys must start with the day or hour they belong
 * to so `cleanup` removes them.
 */
export async function bump(db: D1Like, keys: string[]): Promise<number[]> {
  const stmt = 'INSERT INTO quota_counter (key, n) VALUES (?1, 1) ON CONFLICT (key) DO UPDATE SET n = n + 1 RETURNING n';
  const res = await db.batch(keys.map((k) => db.prepare(stmt).bind(k)));
  return res.map((r) => Number((r.results?.[0] as { n?: number } | undefined)?.n ?? 0));
}
