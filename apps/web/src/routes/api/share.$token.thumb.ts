import { createFileRoute } from '@tanstack/react-router';
import type { RelayEnv } from '../../server/chat-relay';

// A shared project's thumbnail, by its token (task 028: the link preview's image; see src/server/share.ts).
const handle = async ({ request, params }: { request: Request; params: { token: string } }) => {
  const [{ env }, share] = await Promise.all([import('cloudflare:workers'), import('../../server/share')]);
  return share.sharedRoute(request, env as RelayEnv, params.token, 'thumb');
};

export const Route = createFileRoute('/api/share/$token/thumb')({
  server: {
    handlers: { GET: handle },
  },
});
