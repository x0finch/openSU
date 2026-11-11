import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { isTemplateId, TEMPLATE_META } from '@opensu/agent/templates-meta';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestUrl } from '@tanstack/react-start/server';
import { useEffect } from 'react';
import { Mark } from '../../components/icons';
import { useT } from '../../lib/i18n';
import { restoreLang } from '../../lib/store';

const ID = /^[A-Za-z0-9_-]{4,32}$/;

const origin = createIsomorphicFn()
  .server(() => getRequestUrl().origin)
  .client(() => window.location.origin);

/**
 * Share page stub. `ssr: 'data-only'`: the Worker runs only the (trivial)
 * loader so the HTML head carries preview metadata; the body renders on the
 * client.
 */
export const Route = createFileRoute('/s/$id')({
  ssr: 'data-only',
  loader: ({ params }) => {
    if (!ID.test(params.id) && !isTemplateId(params.id)) throw notFound();
    // Placeholder until sharing exists: no storage lookup yet. A template id
    // names that template; any other id is a design we do not have, shown
    // as a neutral "not found" page (never as some other house).
    const house = TEMPLATE_META.find((t) => t.id === params.id) ?? null;
    return { id: params.id, title: house?.name ?? null, origin: origin() };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const title = loaderData.title ? `${loaderData.title} · openSU` : '没有找到这个设计 · openSU';
    const description = loaderData.title ? '用 openSU 设计的自建房：轴测图、平面图与日照。' : '这个分享链接没有对应的设计。用 openSU 设计你自己的自建房：轴测图、平面图与日照。';
    const url = `${loaderData.origin}/s/${loaderData.id}`;
    const image = `${loaderData.origin}/og-default.png`;
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'openSU' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { property: 'og:image', content: image },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' },
        ...(loaderData.title ? [] : [{ name: 'robots', content: 'noindex' }]),
      ],
      links: [{ rel: 'canonical', href: url }],
    };
  },
  component: SharePage,
  pendingComponent: () => <div className="min-h-dvh bg-page" />,
});

function SharePage() {
  const { id, title } = Route.useLoaderData();
  const t = useT();
  useEffect(restoreLang, []);
  if (!title) return <NotFound id={id} />;
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center px-6 py-16">
      <Link to="/" className="flex items-center gap-2 text-ink" aria-label="openSU">
        <Mark />
        <span className="text-sm font-semibold tracking-tight">openSU</span>
      </Link>
      <p className="mt-14 text-xs tracking-[0.18em] text-ink-2 uppercase">{t('share.title')}</p>
      <h1 className="mt-2 text-[28px] leading-9 font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-base text-ink-2">{t('share.body')}</p>
      <p className="tnum mt-6 text-xs text-ink-3">
        {t('share.id')} · {id}
      </p>
      {/* A full page load: the studio reads ?sample= once, at start. */}
      <a
        href={isTemplateId(id) ? `/studio?sample=${id}` : '/studio'}
        className="mt-10 inline-flex h-11 w-fit items-center gap-2 rounded-ui bg-ink px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        {t('share.open')}
      </a>
    </main>
  );
}

/** A share id we have no design for: say so plainly and offer the studio. */
function NotFound({ id }: { id: string }) {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center px-6 py-16" data-testid="share-not-found">
      <Link to="/" className="flex items-center gap-2 text-ink" aria-label="openSU">
        <Mark />
        <span className="text-sm font-semibold tracking-tight">openSU</span>
      </Link>
      <h1 className="mt-14 text-[28px] leading-9 font-semibold tracking-tight">{t('share.missing')}</h1>
      <p className="mt-3 text-base text-ink-2">{t('share.missingBody')}</p>
      <p className="tnum mt-6 text-xs text-ink-3">
        {t('share.id')} · {id}
      </p>
      <a href="/studio" className="mt-10 inline-flex h-11 w-fit items-center gap-2 rounded-ui bg-ink px-5 text-sm font-medium text-white transition-opacity hover:opacity-90">
        {t('share.start')}
      </a>
    </main>
  );
}
