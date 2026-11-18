// Projects kept with the account (task 027). A signed-in user keeps several
// houses here and opens them on another device; the browser does all the
// work (validation, the conversation, the facts shown in the list) and the
// Worker only stores what it is sent.
//
// Trivial on purpose (10 ms CPU): the house and the conversation are never
// parsed or re-serialised here. They travel as lines of a small framed body
// (PROJECT_TYPE): the first line is a JSON object with the small fields,
// the second the house JSON, the third the conversation JSON (JSON.stringify
// never writes a raw line break). The server splits at the first two line
// breaks, checks sizes, ownership and the revision, and stores the text as
// sent; a read answers in the same framing. One D1 statement per request
// plus, for a write, the rate-limit counter. Every statement is scoped by
// the signed-in user's id.
//
//   GET    /api/projects                  {projects: [meta], max, maxKb}   newest first; never reads the large columns
//   POST   /api/projects  framed {summary, name?} + house + chat   create  -> {project: meta}
//   POST   /api/projects  JSON {from, name}                       duplicate inside D1 -> {project: meta}
//   GET    /api/projects/:id              framed {project: meta} + house + chat
//   PUT    /api/projects/:id  framed {base, summary} + house + chat  save -> {project: meta}; 409 {revision} when base is not current
//   PATCH  /api/projects/:id  JSON {name}  rename (revision and time unchanged) -> {project: meta}
//   DELETE /api/projects/:id                                       -> {ok: true}
//
// Off (404 `projects_off`) without sign-in, without D1 or with
// PROJECTS_ENABLED=false; the browser then keeps its one local house.
import { type AccountEnv, authConfig, projectsConfig } from './config.ts';
import { bump } from './quota.ts';

/** Writes (create, save, rename, duplicate, delete) per user per hour; autosave sends at most one save per 3 s of editing. */
export const PROJECT_WRITES_PER_HOUR = 600;
/** The name a user gives, characters. */
export const NAME_MAX = 80;
/** The list's summary (a small JSON text built by the browser), characters. */
export const SUMMARY_MAX = 1024;
/** The framed body of a create, save or read (see the header). */
export const PROJECT_TYPE = 'application/x-opensu-project';
/** Project ids: 128 random bits, base64url. */
export const PROJECT_ID = /^[A-Za-z0-9_-]{22}$/;

export interface ProjectMeta {
  id: string;
  name: string;
  summary: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

const noStore = { 'cache-control': 'no-store' };
const jsonError = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => Response.json({ error: { code, message, ...extra } }, { status, headers: noStore });
const ok = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

const META = 'id, name, summary, revision, created_at, updated_at';
type Row = { id: string; name: string; summary: string; revision: number; created_at: number; updated_at: number };
const meta = (r: Row): ProjectMeta => ({ id: r.id, name: r.name, summary: r.summary, revision: r.revision, createdAt: r.created_at, updatedAt: r.updated_at });

/** A new project id: 16 random bytes, base64url (22 characters). */
export function newProjectId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** "2026-11-15T07": the UTC hour, the prefix of the write counter (the quota's cleanup removes old ones). */
const hourKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 13);

/** The signed-in user (Better Auth loads only when sign-in is configured). */
const userOf = (req: Request, env: AccountEnv) => import('./auth.ts').then((m) => m.sessionUser(req, env), () => null);

/** A parsed body: the small fields, and for a framed body the house and the conversation as text. */
interface Body {
  fields: Record<string, unknown>;
  house?: string;
  chat?: string;
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The body (JSON, or framed: fields, house, chat), or a refusal (too large, malformed). `max` bytes. */
async function readBody(req: Request, max: number): Promise<Body | Response> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return jsonError(413, 'too_large', 'The project is too large.');
  const buf = await req.arrayBuffer();
  if (buf.byteLength > max) return jsonError(413, 'too_large', 'The project is too large.');
  const text = new TextDecoder().decode(buf);
  if (!framed(req)) {
    const fields = parseObject(text);
    return fields ? { fields } : jsonError(400, 'bad_request', 'Expected a JSON object.');
  }
  const a = text.indexOf('\n');
  const b = a < 0 ? -1 : text.indexOf('\n', a + 1);
  const fields = a > 0 && a <= 4096 ? parseObject(text.slice(0, a)) : null;
  if (!fields || b < 0) return jsonError(400, 'bad_project', 'Expected three lines: fields, house, conversation.');
  return { fields, house: text.slice(a + 1, b), chat: text.slice(b + 1) };
}

const framed = (req: Request) => (req.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase() === PROJECT_TYPE;

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const cleanName = (v: unknown): string | null => (typeof v === 'string' && v.trim().length <= NAME_MAX ? v.trim().replace(/\s+/g, ' ') : null);

const CREATE = `INSERT INTO project (id, user_id, name, summary, revision, created_at, updated_at, house, chat)
SELECT ?1, ?2, ?3, ?4, 1, ?5, ?5, ?6, ?7 WHERE (SELECT count(*) FROM project WHERE user_id = ?2) < ?8
RETURNING ${META}`;
const DUPLICATE = `INSERT INTO project (id, user_id, name, summary, revision, created_at, updated_at, house, chat)
SELECT ?1, user_id, ?3, summary, 1, ?4, ?4, house, chat FROM project
WHERE id = ?2 AND user_id = ?5 AND (SELECT count(*) FROM project WHERE user_id = ?5) < ?6
RETURNING ${META}`;
const SAVE = `UPDATE project SET house = ?4, chat = ?5, summary = ?6, revision = revision + 1, updated_at = ?7
WHERE id = ?1 AND user_id = ?2 AND revision = ?3 RETURNING ${META}`;

/** /api/projects and /api/projects/:id. Signed-in users only; writes from this site only. */
export async function projectsRoute(req: Request, env: AccountEnv, id?: string): Promise<Response> {
  const cfg = projectsConfig(env);
  if (!cfg.enabled || !env.DB) return jsonError(404, 'projects_off', 'Projects are not kept with accounts on this server.');
  if (id !== undefined && !PROJECT_ID.test(id)) return jsonError(404, 'not_found', 'No such project.');
  const write = req.method !== 'GET';
  const allowed = id === undefined ? ['GET', 'POST'] : ['GET', 'PUT', 'PATCH', 'DELETE'];
  if (!allowed.includes(req.method)) return jsonError(405, 'bad_method', 'Method not allowed.');
  if (write) {
    // Same rule as the sign-in and key routes: only this site may write.
    if (req.headers.get('origin') !== authConfig(env).siteUrl) return jsonError(403, 'bad_origin', 'Not allowed from this origin.');
    if (req.method !== 'DELETE' && !framed(req) && !/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) return jsonError(415, 'bad_request', 'Expected JSON.');
  }
  const maxBytes = cfg.maxKb * 1024;
  try {
    const user = await userOf(req, env);
    if (!user) return jsonError(401, 'signed_out', 'Sign in to keep projects with your account.');
    const db = env.DB;
    if (!write) {
      if (id === undefined) {
        const { results = [] } = await db.prepare(`SELECT ${META} FROM project WHERE user_id = ?1 ORDER BY updated_at DESC`).bind(user.id).all<Row>();
        return ok({ projects: results.map(meta), max: cfg.max, maxKb: cfg.maxKb });
      }
      const r = await db.prepare(`SELECT ${META}, house, chat FROM project WHERE id = ?1 AND user_id = ?2`).bind(id, user.id).first<Row & { house: string; chat: string }>();
      if (!r) return jsonError(404, 'not_found', 'No such project.');
      return new Response(`${JSON.stringify({ project: meta(r) })}\n${r.house}\n${r.chat}`, { headers: { ...noStore, 'content-type': `${PROJECT_TYPE}; charset=utf-8` } });
    }
    const read = req.method === 'DELETE' ? { fields: {} } : await readBody(req, maxBytes);
    if (read instanceof Response) return read;
    const body = read.fields;
    const { house, chat } = read;
    const [n] = await bump(db, [`${hourKey()}|projects:${user.id}`]);
    if ((n ?? 0) > PROJECT_WRITES_PER_HOUR) return jsonError(429, 'too_many', 'Too many changes. Try again later.');
    const now = Date.now();

    if (req.method === 'POST') {
      const name = body.name === undefined ? '' : cleanName(body.name);
      if (name === null) return jsonError(400, 'bad_name', 'The name is too long.');
      const fresh = newProjectId();
      let row: Row | null;
      if (body.from !== undefined) {
        if (typeof body.from !== 'string' || !PROJECT_ID.test(body.from)) return jsonError(404, 'not_found', 'No such project.');
        row = await db.prepare(DUPLICATE).bind(fresh, body.from, name, now, user.id, cfg.max).first<Row>();
        if (!row) {
          const has = await db.prepare('SELECT 1 AS x FROM project WHERE id = ?1 AND user_id = ?2').bind(body.from, user.id).first();
          return has ? jsonError(409, 'full', 'The account holds as many projects as it can.', { max: cfg.max }) : jsonError(404, 'not_found', 'No such project.');
        }
      } else {
        const { summary } = body;
        if (!house || chat === undefined || !isText(summary, SUMMARY_MAX)) return jsonError(400, 'bad_project', 'Expected the framed fields, house and conversation.');
        row = await db.prepare(CREATE).bind(fresh, user.id, name, summary, now, house, chat, cfg.max).first<Row>();
        if (!row) return jsonError(409, 'full', 'The account holds as many projects as it can.', { max: cfg.max });
      }
      return ok({ project: meta(row) }, 201);
    }

    if (req.method === 'PUT') {
      const { base, summary } = body;
      if (typeof base !== 'number' || !Number.isInteger(base) || !house || chat === undefined || !isText(summary, SUMMARY_MAX)) {
        return jsonError(400, 'bad_project', 'Expected the framed fields {base, summary}, house and conversation.');
      }
      const row = await db.prepare(SAVE).bind(id, user.id, base, house, chat, summary, now).first<Row>();
      if (row) return ok({ project: meta(row) });
      // Not saved: another device saved first (a newer revision), or the project is gone.
      const cur = await db.prepare('SELECT revision FROM project WHERE id = ?1 AND user_id = ?2').bind(id, user.id).first<{ revision: number }>();
      return cur ? jsonError(409, 'conflict', 'The project was changed elsewhere.', { revision: cur.revision }) : jsonError(404, 'not_found', 'No such project.');
    }

    if (req.method === 'PATCH') {
      const name = cleanName(body.name);
      if (name === null) return jsonError(400, 'bad_name', 'Expected {name}, at most 80 characters.');
      const row = await db.prepare(`UPDATE project SET name = ?3 WHERE id = ?1 AND user_id = ?2 RETURNING ${META}`).bind(id, user.id, name).first<Row>();
      return row ? ok({ project: meta(row) }) : jsonError(404, 'not_found', 'No such project.');
    }

    // DELETE
    const gone = await db.prepare('DELETE FROM project WHERE id = ?1 AND user_id = ?2 RETURNING id').bind(id, user.id).first();
    return gone ? ok({ ok: true }) : jsonError(404, 'not_found', 'No such project.');
  } catch (e) {
    console.error('projects: database error', e instanceof Error ? e.message.slice(0, 160) : 'error');
    return jsonError(503, 'unavailable', 'Projects are not available right now.');
  }
}
