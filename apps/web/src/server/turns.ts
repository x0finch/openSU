// `/api/turns` (task 020): the browser saves each finished assistant turn
// here so the owner can see where the assistant missed what people meant.
// Trivial on purpose (10 ms CPU): check the size and the ids, store the
// record as sent. The record is built in the browser (src/chat/turn-record.ts)
// and never holds a visitor's API key.
//
//   POST  body = the record (JSON); one row per turn id, a resend replaces it.
//   PATCH body = {"turn": "<id>", "undone": true|false}; flags an undo / redo.
//
// The caller is identified like the quota does (signed-in user, else the
// anonymous visitor); a row is only replaced or flagged by whoever wrote
// it. Writes per IP per day are limited with the quota's counter (`bump`).
// Without a database, or with TURN_RECORDS=false, both answer 204 and store
// nothing.
import { identify, type RelayEnv } from './chat-relay.ts';
import { quotaConfig, turnsConfig } from './config.ts';
import { bump, quotaDay, subjectKey, TURN_ID } from './quota.ts';
import { clientIp } from './visitor.ts';

/**
 * Largest record accepted, in bytes. Realistic records
 * (scripts/turn-fixtures.ts, real agent turns on a scripted model): 13 KB
 * for one edit on the sample house, 70 KB for the largest template built
 * from a blank plot in one turn (a rejected 70-command batch, its repair,
 * get_house); the house after the turn is 9-11 KB of it. 256 KB is more
 * than three times the large turn, still cheap to check (about 3 ms of CPU
 * in scripts/auth-check.ts) and far below D1's 2 MB row limit.
 */
export const MAX_RECORD = 256 * 1024;
/** Records and undo flags per IP per quota day. */
export const TURNS_PER_IP_DAILY = 400;
/** Conversation ids: the same plain format as turn ids. */
const CONVERSATION_ID = TURN_ID;

const noStore = { 'cache-control': 'no-store' };
const jsonError = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status, headers: noStore });

function done(setCookie: string | null): Response {
  const headers: Record<string, string> = { ...noStore };
  if (setCookie) headers['set-cookie'] = setCookie;
  return new Response(null, { status: 204, headers });
}

/** The body as text, or a refusal when it is larger than `max` bytes. */
async function readBody(req: Request, max: number): Promise<string | Response> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return jsonError(413, 'too_large', 'The record is too large.');
  const buf = await req.arrayBuffer();
  if (buf.byteLength > max) return jsonError(413, 'too_large', 'The record is too large.');
  return new TextDecoder().decode(buf);
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Counts one write for the caller's IP; false when over the day's limit. */
async function underLimit(req: Request, env: RelayEnv): Promise<boolean> {
  const { day } = quotaDay(Date.now(), quotaConfig(env).tz);
  const [n] = await bump(env.DB!, [`${day}|turns-ip:${clientIp(req)}`]);
  return (n ?? 0) <= TURNS_PER_IP_DAILY;
}

const UPSERT = `INSERT INTO turn_record (turn, at, who, conversation, own_key, model, record) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
ON CONFLICT (turn) DO UPDATE SET at = excluded.at, conversation = excluded.conversation, own_key = excluded.own_key, model = excluded.model, record = excluded.record
WHERE turn_record.who = excluded.who`;

/** POST /api/turns: store one turn record. */
export async function saveTurn(req: Request, env: RelayEnv): Promise<Response> {
  const cfg = turnsConfig(env);
  if (!cfg.enabled) return done(null);
  const text = await readBody(req, MAX_RECORD);
  if (text instanceof Response) return text;
  const rec = parseObject(text);
  const turn = rec?.turn, conversation = rec?.conversation, model = rec?.model, ownKey = rec?.ownKey;
  if (!rec || typeof turn !== 'string' || !TURN_ID.test(turn) || typeof conversation !== 'string' || !CONVERSATION_ID.test(conversation) || typeof model !== 'string' || model.length > 200 || typeof ownKey !== 'boolean') {
    return jsonError(400, 'bad_record', 'Not a turn record.');
  }
  try {
    const caller = await identify(req, env);
    if (!(await underLimit(req, env))) return jsonError(429, 'too_many', 'Too many records today.');
    const now = Date.now();
    await env.DB!.prepare(UPSERT).bind(turn, now, subjectKey(caller.subject), conversation, ownKey ? 1 : 0, model, text).run();
    // Housekeeping on roughly one record in fifty (range delete on the `at` index).
    if (Math.random() < 0.02) await cleanupTurns(env, now).catch(() => {});
    return done(caller.setCookie);
  } catch (e) {
    console.error('turns: database error', e instanceof Error ? e.message : e);
    return jsonError(503, 'unavailable', 'The record could not be saved.');
  }
}

/** PATCH /api/turns: the turn's changes were undone (true) or redone (false). */
export async function flagTurn(req: Request, env: RelayEnv): Promise<Response> {
  if (!turnsConfig(env).enabled) return done(null);
  const text = await readBody(req, 1024);
  if (text instanceof Response) return text;
  const body = parseObject(text);
  if (!body || typeof body.turn !== 'string' || !TURN_ID.test(body.turn) || typeof body.undone !== 'boolean') return jsonError(400, 'bad_request', 'Expected {"turn", "undone"}.');
  try {
    const caller = await identify(req, env);
    if (!(await underLimit(req, env))) return jsonError(429, 'too_many', 'Too many records today.');
    await env.DB!.prepare('UPDATE turn_record SET undone = ?1 WHERE turn = ?2 AND who = ?3').bind(body.undone ? 1 : 0, body.turn, subjectKey(caller.subject)).run();
    return done(caller.setCookie);
  } catch (e) {
    console.error('turns: database error', e instanceof Error ? e.message : e);
    return jsonError(503, 'unavailable', 'The flag could not be saved.');
  }
}

/** Deletes records older than TURN_RECORDS_DAYS. */
export async function cleanupTurns(env: RelayEnv, now = Date.now()): Promise<void> {
  const { days } = turnsConfig(env);
  await env.DB!.prepare('DELETE FROM turn_record WHERE at < ?1').bind(now - days * 86_400_000).run();
}
