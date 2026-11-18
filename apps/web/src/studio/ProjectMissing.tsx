// An address of a project (`/studio?p=<id>`, task 027) this browser cannot
// open: deleted, another account's, or nobody signed in. A plain page with
// the way home, as Figma and Google Docs answer an address without access.
import { Mark } from '../components/icons';
import { openSignIn } from '../chat/account';
import { useChat } from '../chat/chat-store';
import { useT } from '../lib/i18n';
import { useUrlMissing } from '../lib/projects';

export function ProjectMissing() {
  const t = useT();
  const missing = useUrlMissing();
  const signedIn = useChat((s) => !!s.server?.user);
  const authOn = useChat((s) => !!(s.server?.auth?.email || s.server?.auth?.google));
  if (!missing) return null;
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 grid place-items-center bg-page px-6 text-ink" role="alert" data-testid="project-missing">
      <div className="flex max-w-[360px] flex-col items-center text-center">
        <Mark width={34} height={34} className="text-ink-3" />
        <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">{t('projects.notFound')}</h1>
        <p className="mt-2 text-[14px] leading-6 text-ink-2">{t('projects.notFoundWhy')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a href="/projects" className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-white" data-testid="project-missing-home">
            {t('projects.backHome')}
          </a>
          {!signedIn && authOn && (
            <button type="button" onClick={() => openSignIn(document.querySelector<HTMLElement>('[data-account-button]'), 'account')} className="inline-flex h-10 items-center rounded-full bg-wash px-5 text-[14px] font-medium" data-testid="project-missing-signin">
              {t('account.signIn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
