// The Worker's entry (TanStack Start picks up `src/server.ts`). It sends
// other hosts to SITE_URL (task 026), answers the sign-in routes itself and
// hands everything else to Start.
//
// Better Auth is built here, in the global scope, when sign-in is
// configured, and its routes are run once without touching the database:
// building it and the first pass through its routes cost tens of
// milliseconds of CPU (schemas, endpoints, JIT), which Cloudflare counts
// against the 1 s startup limit instead of the 10 ms of the request that
// happens to arrive first. See scripts/auth-check.ts for the numbers.
// `startAuth` never throws: if sign-in cannot start, the drawing, the
// share pages and the assistant keep working (everyone is anonymous).
import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { env } from 'cloudflare:workers';
import { accountRoute, startAuth } from './server/accounts';
import { type AccountEnv, canonicalRedirect } from './server/config';
import { sharePreview, sharePreviewHtml } from './server/share';

const accountEnv = env as AccountEnv;
/** The static assets (wrangler.jsonc `assets.binding`). */
const assets = (env as { ASSETS?: { fetch(req: Request): Promise<Response> } }).ASSETS;
/** The prerendered pages wrangler.jsonc sends through the Worker first (`assets.run_worker_first`). */
const PAGES = new Set(['/', '/index.html', '/studio', '/studio.html', '/projects', '/projects.html', '/auth-done', '/auth-done.html']);
await startAuth(accountEnv);

/** The studio page of a shared address, with its link preview (src/server/share.ts); the page as it is when that fails. */
async function sharedPage(request: Request, url: URL, res: Response): Promise<Response> {
  try {
    const lang = /^en\b/i.test(request.headers.get('accept-language') ?? '') ? 'en' : 'zh';
    const preview = await sharePreview(accountEnv, url, lang);
    if (!preview) return res;
    const html = sharePreviewHtml(await res.text(), preview, url.origin);
    const headers = new Headers(res.headers);
    // The page now depends on the token and the project: no validator of the static file, no stored copy.
    headers.delete('etag');
    headers.delete('content-length');
    headers.set('cache-control', 'no-cache');
    return new Response(html, { status: res.status, headers });
  } catch {
    return res;
  }
}

export default createServerEntry({
  async fetch(request, opts) {
    // One canonical host (task 026), before anything else runs.
    const canonical = canonicalRedirect(request.url, accountEnv);
    if (canonical) return new Response(null, { status: 308, headers: { location: canonical } });
    const url = new URL(request.url);
    const path = url.pathname;
    // On the canonical host a page is the static asset, as it was before it came through here
    // (while prerendering builds it there is none yet: Start renders it).
    if (assets && PAGES.has(path)) {
      const res = await assets.fetch(request);
      if (res.status !== 404) {
        // A shared address (task 028, `/studio?s=<token>`): the same page with the shared project's
        // title, description and preview image, from one indexed read.
        if (res.ok && (path === '/studio' || path === '/studio.html') && url.searchParams.has('s')) return sharedPage(request, url, res);
        return res;
      }
    }
    if (path.startsWith('/api/auth')) {
      const res = await accountRoute(request, accountEnv);
      if (res) return res;
    }
    return handler.fetch(request, opts);
  },
});
