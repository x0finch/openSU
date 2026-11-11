import { createFileRoute } from '@tanstack/react-router';
import { useT } from '../lib/i18n';
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
  // Coming from the landing page: show the loading state at once, not a blank page.
  pendingMs: 0,
  pendingMinMs: 0,
});

function StudioFallback() {
  const t = useT();
  return (
    <div className="fixed inset-0 grid place-items-center bg-page" role="status">
      <div className="flex w-40 flex-col items-center gap-3">
        <div className="relative h-px w-full overflow-hidden bg-hairline">
          <div className="absolute inset-y-0 left-0 w-2/5 animate-[progress-sweep_1.2s_cubic-bezier(0.6,0,0.4,1)_infinite] bg-ink" />
        </div>
        <p className="text-xs text-ink-2">{t('loading.studio')}</p>
      </div>
    </div>
  );
}
