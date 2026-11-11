import { createFileRoute } from '@tanstack/react-router';
import type { RelayEnv } from '../../server/chat-relay';

// The AI relay (see src/server/chat-relay.ts). Waiting on the provider is
// network time, not CPU: the Worker only picks the key and the model.
// Server-only modules are imported inside the handlers so the client
// bundle never sees them.
const load = async () => {
  const [{ env }, relay] = await Promise.all([import('cloudflare:workers'), import('../../server/chat-relay')]);
  return { env: env as RelayEnv, relay };
};

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      GET: async () => {
        const { env, relay } = await load();
        return relay.relayStatus(env);
      },
      POST: async ({ request }) => {
        const { env, relay } = await load();
        return relay.relayChat(request, env);
      },
    },
  },
});
