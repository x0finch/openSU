import { createFileRoute } from '@tanstack/react-router';
import type { RelayEnv } from '../../server/chat-relay';

// A shared project, read by its token without a session (task 028, see src/server/share.ts).
const handle = async ({ request, params }: { request: Request; params: { token: string } }) => {
  const [{ env }, share] = await Promise.all([import('cloudflare:workers'), import('../../server/share')]);
  return share.sharedRoute(request, env as RelayEnv, params.token, 'house');
};

export const Route = createFileRoute('/api/share/$token')({
  server: {
    handlers: { GET: handle },
  },
});
