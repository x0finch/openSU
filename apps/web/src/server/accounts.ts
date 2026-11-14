// The sign-in routes and the startup of Better Auth (task 019), kept apart
// from the Worker entry (src/server.ts) so they can be tested in Node.
// Nothing here throws: a broken sign-in must never take the site down.
import { type Auth, lastTestCode, loadAuth, warmUp } from './auth.ts';
import { type AccountEnv, authConfig, isLocalRequest } from './config.ts';

const noStore = { 'cache-control': 'no-store' };

/**
 * Worker startup: build Better Auth and run its routes once without I/O, so
 * that one-time CPU counts against the 1 s startup limit. On any failure it
 * logs one line and returns; the first /api/auth request tries once more.
 */
export async function startAuth(env: AccountEnv): Promise<void> {
  try {
    const auth: Auth | null = await loadAuth(env);
    if (!auth) return;
    try {
      await warmUp(auth, authConfig(env).siteUrl!);
    } catch (e) {
      // The instance works; only the warm-up did not (the first request pays its CPU).
      console.error(`auth: warm-up skipped (${e instanceof Error ? e.message.slice(0, 160) : 'error'})`);
    }
  } catch (e) {
    console.error(`auth: startup failed, will retry on first use (${e instanceof Error ? e.message.slice(0, 160) : 'error'})`);
  }
}

/** Answers /api/auth/* and the local test hook; null for any other path. */
export async function accountRoute(request: Request, env: AccountEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/auth/')) {
    const auth = await loadAuth(env);
    if (!auth) return Response.json({ error: { code: 'auth_off', message: 'Sign-in is not available right now.' } }, { status: 503, headers: noStore });
    try {
      return await auth.handler(request);
    } catch (e) {
      console.error(`auth: request failed (${e instanceof Error ? e.message.slice(0, 160) : 'error'})`);
      return Response.json({ error: { code: 'auth_off', message: 'Sign-in is not available right now.' } }, { status: 503, headers: noStore });
    }
  }
  if (path === '/api/auth-test/code') {
    // Local development and tests only (AUTH_TEST_HOOK=1, requests to localhost).
    if (!authConfig(env).testHook || !isLocalRequest(request)) return new Response('Not found', { status: 404 });
    const email = new URL(request.url).searchParams.get('email') ?? '';
    return Response.json({ code: lastTestCode(email) }, { headers: noStore });
  }
  return null;
}
