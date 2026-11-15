import { createFileRoute } from '@tanstack/react-router';
import type { RelayEnv } from '../../server/chat-relay';

// API keys saved with the account (task 022, see src/server/keys.ts): one
// D1 statement and, for a save, one AES-GCM encryption. Server-only modules
// are imported inside the handlers so the client bundle never sees them.
const load = async () => {
  const [{ env }, keys] = await Promise.all([import('cloudflare:workers'), import('../../server/keys')]);
  return { env: env as RelayEnv, keys };
};
const handle = async ({ request }: { request: Request }) => {
  const { env, keys } = await load();
  return keys.keysRoute(request, env);
};

export const Route = createFileRoute('/api/keys')({
  server: {
    handlers: { GET: handle, PUT: handle, PATCH: handle, DELETE: handle },
  },
});
