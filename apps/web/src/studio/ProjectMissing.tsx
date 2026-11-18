// An address the studio cannot open, as Figma and Google Docs answer one: a
// plain page with the way home. A project's address (`/studio?p=<id>`, task
// 027) that this browser cannot open (deleted, another account's, nobody
// signed in), or a share link (`/studio?s=<token>`, task 028) that is
// turned off, unknown, or cannot be read right now.
import { Mark } from '../components/icons';
import { openSignIn } from '../chat/account';
import { useChat } from '../chat/chat-store';
import { type MessageKey, useT } from '../lib/i18n';
import { useUrlMissing } from '../lib/projects';
import { useShared } from '../lib/view-only';

export function ProjectMissing() {
  const t = useT();
  const missing = useUrlMissing();
  const shared = useShared((s) => (s.token && (s.status === 'gone' || s.status === 'error') ? s.status : null));
  const signedIn = useChat((s) => !!s.server?.user);
  const authOn = useChat((s) => !!(s.server?.auth?.email || s.server?.auth?.google));
  if (!missing && !shared) return null;
  const [title, why]: [MessageKey, MessageKey] = shared === 'gone' ? ['share.gone', 'share.goneWhy'] : shared === 'error' ? ['share.error', 'share.errorWhy'] : ['projects.notFound', 'projects.notFoundWhy'];
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 grid place-items-center bg-page px-6 text-ink" role="alert" data-testid="project-missing" data-share={shared ?? undefined}>
      <div className="flex max-w-[360px] flex-col items-center text-center">
        <Mark width={34} height={34} className="text-ink-3" />
        <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">{t(title)}</h1>
        <p className="mt-2 text-[14px] leading-6 text-ink-2">{t(why)}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {/* A link's visitor may have no projects: the studio is their way in (their own house, as before). */}
          <a href={shared ? '/studio' : '/projects'} className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-white" data-testid="project-missing-home">
            {shared ? t('share.goneHome') : t('projects.backHome')}
          </a>
          {!shared && !signedIn && authOn && (
            <button type="button" onClick={() => openSignIn(document.querySelector<HTMLElement>('[data-account-button]'), 'account')} className="inline-flex h-10 items-center rounded-full bg-wash px-5 text-[14px] font-medium" data-testid="project-missing-signin">
              {t('account.signIn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
