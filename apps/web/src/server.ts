// The Worker's entry (TanStack Start picks up `src/server.ts`). It answers
// the sign-in routes itself and hands everything else to Start.
//
// Better Auth is built here, in the global scope, when sign-in is
// configured, and its routes are run once without touching the database:
// building it and the first pass through its routes cost tens of
// milliseconds of CPU (schemas, endpoints, JIT), which Cloudflare counts
// against the 1 s startup limit instead of the 10 ms of the request that
// happens to arrive first. See scripts/auth-check.ts for the numbers.
import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { env } from 'cloudflare:workers';
import { getAuth, lastTestCode, warmUp } from './server/auth';
import { type AccountEnv, authConfig, isLocalRequest } from './server/config';

const accountEnv = env as AccountEnv;
const auth = getAuth(accountEnv);
// No I/O happens here (no queries until a request), so this settles at startup.
if (auth) {
  await auth.$context;
  await warmUp(auth, authConfig(accountEnv).siteUrl!);
}

const noStore = { 'cache-control': 'no-store' };

async function accounts(request: Request, path: string): Promise<Response | null> {
  if (path.startsWith('/api/auth/')) {
    if (!auth) return Response.json({ error: { code: 'auth_off', message: 'Sign-in is not available on this server.' } }, { status: 404, headers: noStore });
    return auth.handler(request);
  }
  if (path === '/api/auth-test/code') {
    // Local development and tests only (AUTH_TEST_HOOK=1, requests to localhost).
    if (!authConfig(accountEnv).testHook || !isLocalRequest(request)) return new Response('Not found', { status: 404 });
    const email = new URL(request.url).searchParams.get('email') ?? '';
    return Response.json({ code: lastTestCode(email) }, { headers: noStore });
  }
  return null;
}

export default createServerEntry({
  async fetch(request, opts) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/auth')) {
      const res = await accounts(request, path);
      if (res) return res;
    }
    return handler.fetch(request, opts);
  },
});
