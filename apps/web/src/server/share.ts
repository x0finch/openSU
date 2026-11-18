// Share links (task 028): what anyone with the link may read, without a
// session. The token (16 random bytes, base64url, src/server/projects.ts
// `shareRoute`) is the only thing that grants it, and only for its own
// project: the house, the name and when it changed. Never the
// conversation, the owner or the project id.
//
//   GET /api/share/:token        {name, updatedAt, house}; `no-cache` + ETag (a 304 skips the house)
//   GET /api/share/:token/thumb  the project's thumbnail (the link preview's image)
//   /studio?s=<token>            the prerendered studio with its title and og:* tags set (src/server.ts)
//
// Trivial on purpose (10 ms CPU): one indexed read and the per-IP counter
// in one D1 batch; the house is put into the answer as the text it was
// stored as, never parsed. "Cache briefly" is a revalidation, not a
// lifetime: a link turned off stops working at once (the spec's
// precedent), and an unchanged house is not sent twice.
import { clientIp } from './visitor.ts';
import { type AccountEnv, type D1Like, projectsConfig } from './config.ts';
import { hourKey } from './projects.ts';

/** Share tokens: 128 random bits, base64url (as project ids, but never one). */
export const SHARE_TOKEN = /^[A-Za-z0-9_-]{22}$/;
/** Public reads (the house, the thumbnail) per IP per hour. Generous: carriers put many phones behind one address. */
export const SHARE_READS_PER_HOUR = 1200;

const jsonError = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status, headers: { 'cache-control': 'no-store' } });
const gone = () => jsonError(404, 'not_shared', 'This link is no longer shared.');

/** FNV-1a of a string, hex: the name's part of the ETag (a rename changes it, the revision does not). */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}
const etagOf = (revision: number, name: string) => `"${revision}.${fnv(name)}"`;

/** Bumps the IP's counter and runs `stmt`, in one batch; null when the IP is over its limit. */
async function counted<T>(db: D1Like, req: Request, stmt: ReturnType<D1Like['prepare']>): Promise<T | null | 'limited'> {
  const bump = db.prepare('INSERT INTO quota_counter (key, n) VALUES (?1, 1) ON CONFLICT (key) DO UPDATE SET n = n + 1 RETURNING n').bind(`${hourKey()}|share-ip:${clientIp(req)}`);
  const [c, r] = await db.batch([bump, stmt]);
  if (Number((c?.results?.[0] as { n?: number } | undefined)?.n ?? 0) > SHARE_READS_PER_HOUR) return 'limited';
  return ((r?.results?.[0] as T | undefined) ?? null);
}

type HouseRow = { name: string; revision: number; updated_at: number; house: string | null };

/** GET /api/share/:token and /api/share/:token/thumb. No session; the token is the only key. */
export async function sharedRoute(req: Request, env: AccountEnv, token: string, what: 'house' | 'thumb'): Promise<Response> {
  if (!projectsConfig(env).enabled || !env.DB) return jsonError(404, 'projects_off', 'Projects are not kept with accounts on this server.');
  if (req.method !== 'GET' && req.method !== 'HEAD') return jsonError(405, 'bad_method', 'Method not allowed.');
  if (!SHARE_TOKEN.test(token)) return gone();
  const db = env.DB;
  try {
    if (what === 'thumb') {
      const r = await counted<{ thumb: ArrayBuffer | Uint8Array; thumb_type: string }>(db, req, db.prepare('SELECT thumb, thumb_type FROM project WHERE share_token = ?1 AND thumb_at > 0').bind(token));
      if (r === 'limited') return jsonError(429, 'too_many', 'Too many requests. Try again later.');
      if (!r?.thumb) return gone();
      return new Response((r.thumb instanceof Uint8Array ? r.thumb : new Uint8Array(r.thumb)) as unknown as BodyInit, { headers: { 'content-type': r.thumb_type, 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
    }
    // The revision the browser already has (its ETag): the house is left out of the read when it is still current.
    const have = /^(?:W\/)?"(\d+)\.[0-9a-f]+"$/.exec((req.headers.get('if-none-match') ?? '').trim());
    const sel = 'SELECT name, revision, updated_at, CASE WHEN revision = ?2 THEN NULL ELSE house END AS house FROM project WHERE share_token = ?1';
    const r = await counted<HouseRow>(db, req, db.prepare(sel).bind(token, have ? Number(have[1]) : -1));
    if (r === 'limited') return jsonError(429, 'too_many', 'Too many requests. Try again later.');
    if (!r) return gone();
    const etag = etagOf(r.revision, r.name);
    const headers = { 'cache-control': 'no-cache', etag, 'x-content-type-options': 'nosniff' };
    if (have && (req.headers.get('if-none-match') ?? '').includes(etag)) return new Response(null, { status: 304, headers });
    let house = r.house;
    // Same revision, another name (a rename): the house after all.
    if (house === null) house = (await db.prepare('SELECT house FROM project WHERE share_token = ?1').bind(token).first<{ house: string }>())?.house ?? null;
    if (house === null) return gone();
    // The house as stored (JSON text, never parsed here), last.
    const body = `{"name":${JSON.stringify(r.name)},"updatedAt":${r.updated_at},"house":${house}}`;
    return new Response(req.method === 'HEAD' ? null : body, { headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
  } catch (e) {
    console.error('share: database error', e instanceof Error ? e.message.slice(0, 160) : 'error');
    return jsonError(503, 'unavailable', 'Sharing is not available right now.');
  }
}

/* ------------------------------------------------------------------ */
/* The link preview (title, description, image)                         */
/* ------------------------------------------------------------------ */

export interface SharePreview {
  title: string;
  description: string;
  /** Absolute address of the image, or null (the site's default image). */
  image: string | null;
  url: string;
}

/** What the browser stores as a project's summary (src/lib/project-sync.ts `Summary`). */
type Summary = { title?: unknown; w?: unknown; d?: unknown; area?: unknown; storeys?: unknown; attic?: unknown };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const len = (mm: number) => String(Math.round(mm / 100) / 10);

/**
 * The preview of a shared address, from one indexed read (name, summary,
 * thumbnail time); null when projects are off. A token that is not shared
 * gets the "no longer shared" title.
 */
export async function sharePreview(env: AccountEnv, url: URL, lang: 'zh' | 'en'): Promise<SharePreview | null> {
  if (!projectsConfig(env).enabled || !env.DB) return null;
  const token = url.searchParams.get('s') ?? '';
  const site = url.origin;
  const r = SHARE_TOKEN.test(token) ? await env.DB.prepare('SELECT name, summary, thumb_at FROM project WHERE share_token = ?1').bind(token).first<{ name: string; summary: string; thumb_at: number }>() : null;
  const page = `${site}/studio?s=${encodeURIComponent(token)}`;
  if (!r) {
    return lang === 'en'
      ? { title: 'This link is no longer shared · openSU', description: 'The owner turned sharing off, or the link is incomplete.', image: null, url: page }
      : { title: '这个链接已不再分享 · openSU', description: '分享者关闭了分享，或者链接不完整。', image: null, url: page };
  }
  let s: Summary = {};
  try {
    const v = JSON.parse(r.summary) as unknown;
    if (v && typeof v === 'object') s = v as Summary;
  } catch {
    /* no facts */
  }
  const own = typeof s.title === 'string' && !s.title.startsWith('Golden sample') ? s.title : '';
  const name = (r.name || own || 'openSU').slice(0, 80);
  const [w, d, area, storeys] = [num(s.w), num(s.d), num(s.area), num(s.storeys)];
  const facts: string[] = [];
  if (w && d) facts.push(lang === 'en' ? `${len(w)} × ${len(d)} m plot` : `${len(w)} × ${len(d)} m 宅基地`);
  if (area) facts.push(`${(Math.round(area * 10) / 10).toFixed(1)} m²`);
  if (storeys) facts.push(lang === 'en' ? `${storeys} storeys${s.attic === true ? ' + attic' : ''}` : `${storeys} 层${s.attic === true ? ' + 阁楼' : ''}`);
  const tail = lang === 'en' ? 'A self-built house designed in openSU: 3D, plans and sunlight in the browser.' : '用 openSU 设计的自建房：在浏览器里看 3D、平面图和日照。';
  const description = facts.length ? `${facts.join(lang === 'en' ? ' · ' : '，')}${lang === 'en' ? '. ' : '。'}${tail}` : tail;
  return { title: `${name} · openSU`, description, image: r.thumb_at > 0 ? `${site}/api/share/${token}/thumb?v=${r.thumb_at}` : null, url: page };
}

const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The prerendered studio page with the preview's title, description and
 * og:* / twitter:* tags (plain string handling on the page's head).
 */
export function sharePreviewHtml(html: string, p: SharePreview, site: string): string {
  const image = p.image ?? `${site}/og-default.png`;
  const size = p.image ? ['480', '360'] : ['1200', '630'];
  const tags = [
    ['og:type', 'website'],
    ['og:site_name', 'openSU'],
    ['og:title', p.title],
    ['og:description', p.description],
    ['og:url', p.url],
    ['og:image', image],
    ['og:image:width', size[0]!],
    ['og:image:height', size[1]!],
  ]
    .map(([k, v]) => `<meta property="${k}" content="${attr(v!)}"/>`)
    .concat([`<meta name="twitter:card" content="summary_large_image"/>`]);
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${attr(p.title)}</title>`);
  out = out.replace(/<meta name="description" content="[^"]*"\/?>/, `<meta name="description" content="${attr(p.description)}"/>`);
  const head = out.indexOf('</head>');
  return head < 0 ? out : `${out.slice(0, head)}${tags.join('')}${out.slice(head)}`;
}
