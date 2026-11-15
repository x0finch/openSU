import { DEFAULT_TEMPLATE, TEMPLATE_META } from '@opensu/agent/templates-meta';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ArrowRightIcon, Mark } from '../components/icons';
import { cx, LangToggle } from '../components/ui';
import { type MessageKey, translate, useT } from '../lib/i18n';
import { restoreLang, useStudio } from '../lib/store';

/** The default house: the studio opens with it, the hero and the link preview show it. */
const HOUSE = TEMPLATE_META.find((t) => t.id === DEFAULT_TEMPLATE)!;
/** Real renders of the default house, made by scripts/hero.mjs. */
const HERO = { src: '/hero-t1.webp', width: 1511, height: 1177 };
const OG = { src: '/og-default.png', width: 1200, height: 630 };
/** Absolute site URL for link previews when the deployment sets one (crawlers want absolute og:image URLs). */
const SITE = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export const Route = createFileRoute('/')({
  head: () => {
    const title = `openSU · ${translate('zh', 'landing.title')}`;
    const description = translate('zh', 'landing.lead');
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'openSU' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:image', content: `${SITE}${OG.src}` },
        { property: 'og:image:width', content: String(OG.width) },
        { property: 'og:image:height', content: String(OG.height) },
        { property: 'og:image:alt', content: HOUSE.name },
        ...(SITE ? [{ property: 'og:url', content: `${SITE}/` }] : []),
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
    };
  },
  component: Landing,
});

const FEATURES: { n: string; title: MessageKey; body: MessageKey }[] = [
  { n: '01', title: 'landing.f1.title', body: 'landing.f1.body' },
  { n: '02', title: 'landing.f2.title', body: 'landing.f2.body' },
  { n: '03', title: 'landing.f3.title', body: 'landing.f3.body' },
];

function Landing() {
  const t = useT();
  const lang = useStudio((st) => st.lang);
  useEffect(restoreLang, []);
  return (
    <div className="flex min-h-dvh flex-col bg-page text-ink">
      <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-5 md:h-20 md:px-10">
        <Link to="/" className="flex items-center gap-2" aria-label="openSU">
          <Mark />
          <span className="text-[15px] font-semibold tracking-tight">openSU</span>
        </Link>
        <nav className="flex items-center gap-1">
          <LangToggle />
          <Link to="/studio" className="ml-1 hidden h-10 items-center rounded-ui px-4 text-sm font-medium hover:bg-wash sm:inline-flex">
            {t('landing.cta')}
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-5 md:px-10">
        <section className="grid flex-1 content-center items-center gap-6 pt-6 pb-14 md:gap-10 md:pt-10 md:pb-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pb-24">
          <div className="max-w-[480px] md:max-w-[620px] lg:max-w-[480px]">
            <p className={cx('text-xs font-medium text-ink-2', lang === 'en' ? 'tracking-[0.16em] uppercase' : 'tracking-[0.06em]')}>{t('brand.tagline')}</p>
            <h1 className="mt-4 text-[34px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance md:text-[48px]">{t('landing.title')}</h1>
            <p className="mt-5 text-[15px] leading-7 text-pretty text-ink-2 md:text-base md:leading-7">{t('landing.lead')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                to="/studio"
                className="group inline-flex h-12 items-center gap-2.5 rounded-ui bg-ink pr-4 pl-5 text-[15px] font-medium text-white transition-[background-color] hover:bg-black"
              >
                {t('landing.cta')}
                <span className="grid size-6 place-items-center rounded-full bg-accent text-ink transition-transform duration-200 ease-out-soft group-hover:translate-x-0.5">
                  <ArrowRightIcon width={14} height={14} strokeWidth={1.8} />
                </span>
              </Link>
              <span className="text-sm text-ink-2">{t('landing.secondary')}</span>
            </div>
          </div>
          <figure className="relative -mx-2 md:mx-0">
            <img
              src={HERO.src}
              width={HERO.width}
              height={HERO.height}
              alt={HOUSE.name}
              fetchPriority="high"
              decoding="async"
              className="mx-auto h-auto w-full max-w-[560px] md:max-w-[680px] lg:max-w-[640px]"
            />
            <figcaption className="mt-2 text-center text-xs text-ink-3">{t('landing.heroCaption', { name: HOUSE.name })}</figcaption>
          </figure>
        </section>

        <section className="grid gap-8 border-t border-hairline pt-8 pb-16 sm:grid-cols-3 sm:gap-10 md:pb-24">
          {FEATURES.map((f) => (
            <div key={f.n}>
              <p className="tnum text-xs text-ink-3">{f.n}</p>
              <h2 className="mt-2 text-base font-semibold">{t(f.title)}</h2>
              <p className="mt-1.5 text-sm leading-6 text-pretty text-ink-2">{t(f.body)}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-[1200px] px-5 pb-10 text-xs text-ink-3 md:px-10">
        {/* Task 020: turn records (src/server/turns.ts). */}
        <p className="mb-2 text-pretty" data-testid="about-records">{t('landing.records')}</p>
        <p>{t('landing.footer')}</p>
      </footer>
    </div>
  );
}
