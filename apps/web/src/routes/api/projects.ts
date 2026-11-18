import { createFileRoute } from '@tanstack/react-router';
import type { RelayEnv } from '../../server/chat-relay';

// Projects kept with the account (task 027, see src/server/projects.ts):
// the list and create / duplicate. Server-only modules are imported inside
// the handlers so the client bundle never sees them.
const handle = async ({ request }: { request: Request }) => {
  const [{ env }, projects] = await Promise.all([import('cloudflare:workers'), import('../../server/projects')]);
  return projects.projectsRoute(request, env as RelayEnv);
};

export const Route = createFileRoute('/api/projects')({
  server: {
    handlers: { GET: handle, POST: handle },
  },
});
