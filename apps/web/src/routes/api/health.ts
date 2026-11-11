import { createFileRoute } from '@tanstack/react-router';

// Proves the Worker runs. Trivial on purpose (10 ms CPU budget).
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => Response.json({ ok: true, service: 'opensu-web', time: new Date().toISOString() }, { headers: { 'cache-control': 'no-store' } }),
    },
  },
});
