import { createFileRoute } from '@tanstack/react-router';
import type { RelayEnv } from '../../server/chat-relay';

// Sharing a project kept with the account (task 028, see src/server/projects.ts `shareRoute`): on, off.
const handle = async ({ request, params }: { request: Request; params: { id: string } }) => {
  const [{ env }, projects] = await Promise.all([import('cloudflare:workers'), import('../../server/projects')]);
  return projects.shareRoute(request, env as RelayEnv, params.id);
};

export const Route = createFileRoute('/api/projects/$id/share')({
  server: {
    handlers: { POST: handle, DELETE: handle },
  },
});
