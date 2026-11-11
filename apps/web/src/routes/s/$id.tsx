import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { DEFAULT_TEMPLATE, TEMPLATE_META } from '@opensu/agent/templates-meta';
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
    if (!ID.test(params.id)) throw notFound();
    // Placeholder until sharing exists: no storage lookup yet. The title is
    // the shared house's own name: a template id names that template, any
    // other id shows the default house (the one the studio opens with).
    const house = TEMPLATE_META.find((t) => t.id === params.id) ?? TEMPLATE_META.find((t) => t.id === DEFAULT_TEMPLATE)!;
    return { id: params.id, title: house.name, origin: origin() };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const title = `${loaderData.title} · openSU`;
    const description = '用 openSU 设计的自建房：轴测图、平面图与日照。';
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
      <Link
        to="/studio"
        className="mt-10 inline-flex h-11 w-fit items-center gap-2 rounded-ui bg-ink px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        {t('share.open')}
      </Link>
    </main>
  );
}
