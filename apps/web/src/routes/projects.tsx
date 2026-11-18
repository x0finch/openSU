import { createFileRoute } from '@tanstack/react-router';
import { ProjectsPage } from '../projects/ProjectsPage';

/**
 * "My projects" (task 027): the file browser. `ssr: false` and prerendered
 * like /studio: the Worker never renders it; the list comes from
 * /api/projects in the browser.
 */
export const Route = createFileRoute('/projects')({
  ssr: false,
  head: () => ({
    meta: [{ title: '我的项目 · openSU' }, { name: 'robots', content: 'noindex' }],
  }),
  component: ProjectsPage,
  pendingComponent: () => <div className="min-h-dvh bg-page" />,
  pendingMs: 0,
  pendingMinMs: 0,
});
