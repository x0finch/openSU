import { createFileRoute } from '@tanstack/react-router';
import { Studio } from '../studio/Studio';

/**
 * The editor. `ssr: false`: the Worker never renders it. At build time the
 * prerenderer writes the HTML shell (head + the pending fallback below) as a
 * static asset, so a request for /studio is answered from static assets.
 */
export const Route = createFileRoute('/studio')({
  ssr: false,
  head: () => ({
    meta: [{ title: '工作室 · openSU' }, { name: 'robots', content: 'noindex' }],
  }),
  component: Studio,
  pendingComponent: StudioFallback,
});

function StudioFallback() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-page" role="status">
      <div className="relative h-px w-40 overflow-hidden bg-hairline">
        <div className="absolute inset-y-0 left-0 w-2/5 animate-[progress-sweep_1.2s_cubic-bezier(0.6,0,0.4,1)_infinite] bg-ink" />
      </div>
    </div>
  );
}
