import { createFileRoute } from '@tanstack/react-router';
import type { RelayEnv } from '../../server/chat-relay';

// A project's thumbnail (task 027, see src/server/projects.ts `thumbRoute`).
const handle = async ({ request, params }: { request: Request; params: { id: string } }) => {
  const [{ env }, projects] = await Promise.all([import('cloudflare:workers'), import('../../server/projects')]);
  return projects.thumbRoute(request, env as RelayEnv, params.id);
};

export const Route = createFileRoute('/api/projects/$id/thumb')({
  server: {
    handlers: { GET: handle, PUT: handle },
  },
});
