// Who is asking, without an account: the anonymous visitor cookie and the
// client IP. The cookie holds a random id and an HMAC-SHA256 signature
// (WebCrypto: a few microseconds of CPU), http-only, so scripts cannot read
// or forge it. Clearing cookies yields a new visitor; the per-IP and
// whole-site limits bound what that buys.

export const VISITOR_COOKIE = 'opensu_v';
const MAX_AGE = 400 * 86_400;

const keys = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', new TextEncoder().encode(`opensu-visitor:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keys.set(secret, k);
  }
  return k;
}

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** One cookie's value from a Cookie header. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** The client IP as Cloudflare reports it (local runs: "local"). */
export function clientIp(req: Request): string {
  const ip = req.headers.get('cf-connecting-ip')?.trim();
  if (!ip) return 'local';
  // IPv6 clients usually own a whole /64: count them per /64.
  if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':') + '::/64';
  return ip;
}

/** The visitor id of a valid cookie, else null. */
export async function verifyVisitor(req: Request, secret: string): Promise<string | null> {
  const raw = readCookie(req.headers.get('cookie'), VISITOR_COOKIE);
  const m = raw ? /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(raw) : null;
  if (!m) return null;
  const sig = fromB64url(m[2]!);
  if (!sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, new TextEncoder().encode(m[1]!));
  return ok ? m[1]! : null;
}

/** A new visitor id and its Set-Cookie header value. */
export async function newVisitor(req: Request, secret: string): Promise<{ id: string; cookie: string }> {
  const id = b64url(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const sig = b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(id)));
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return { id, cookie: `${VISITOR_COOKIE}=${id}.${sig}; Path=/api; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure}` };
}
