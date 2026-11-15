import { createFileRoute } from '@tanstack/react-router';
import type { RelayEnv } from '../../server/chat-relay';

// Saved conversation turns (task 020, see src/server/turns.ts): a size
// check, an id check and one D1 write. Server-only modules are imported
// inside the handlers so the client bundle never sees them.
const load = async () => {
  const [{ env }, turns] = await Promise.all([import('cloudflare:workers'), import('../../server/turns')]);
  return { env: env as RelayEnv, turns };
};

export const Route = createFileRoute('/api/turns')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { env, turns } = await load();
        return turns.saveTurn(request, env);
      },
      PATCH: async ({ request }) => {
        const { env, turns } = await load();
        return turns.flagTurn(request, env);
      },
    },
  },
});
