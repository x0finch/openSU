import { createFileRoute } from '@tanstack/react-router';
import type { RelayEnv } from '../../server/chat-relay';

// One project kept with the account (task 027, see src/server/projects.ts):
// read, save, rename, delete.
const handle = async ({ request, params }: { request: Request; params: { id: string } }) => {
  const [{ env }, projects] = await Promise.all([import('cloudflare:workers'), import('../../server/projects')]);
  return projects.projectsRoute(request, env as RelayEnv, params.id);
};

export const Route = createFileRoute('/api/projects/$id')({
  server: {
    handlers: { GET: handle, PUT: handle, PATCH: handle, DELETE: handle },
  },
});
