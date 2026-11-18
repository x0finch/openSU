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

const accountEnv = env as AccountEnv;
/** The static assets (wrangler.jsonc `assets.binding`). */
const assets = (env as { ASSETS?: { fetch(req: Request): Promise<Response> } }).ASSETS;
/** The prerendered pages wrangler.jsonc sends through the Worker first (`assets.run_worker_first`). */
const PAGES = new Set(['/', '/index.html', '/studio', '/studio.html', '/projects', '/projects.html', '/auth-done', '/auth-done.html']);
await startAuth(accountEnv);

export default createServerEntry({
  async fetch(request, opts) {
    // One canonical host (task 026), before anything else runs.
    const canonical = canonicalRedirect(request.url, accountEnv);
    if (canonical) return new Response(null, { status: 308, headers: { location: canonical } });
    const path = new URL(request.url).pathname;
    // On the canonical host a page is the static asset, as it was before it came through here
    // (while prerendering builds it there is none yet: Start renders it).
    if (assets && PAGES.has(path)) {
      const res = await assets.fetch(request);
      if (res.status !== 404) return res;
    }
    if (new URL(request.url).pathname.startsWith('/api/auth')) {
      const res = await accountRoute(request, accountEnv);
      if (res) return res;
    }
    return handler.fetch(request, opts);
  },
});
