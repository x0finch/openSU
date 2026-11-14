// The Worker's entry (TanStack Start picks up `src/server.ts`). It answers
// the sign-in routes itself and hands everything else to Start.
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
import type { AccountEnv } from './server/config';

const accountEnv = env as AccountEnv;
await startAuth(accountEnv);

export default createServerEntry({
  async fetch(request, opts) {
    if (new URL(request.url).pathname.startsWith('/api/auth')) {
      const res = await accountRoute(request, accountEnv);
      if (res) return res;
    }
    return handler.fetch(request, opts);
  },
});
