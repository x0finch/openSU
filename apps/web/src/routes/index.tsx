import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { HouseSketch } from '../components/HouseSketch';
import { ArrowRightIcon, Mark } from '../components/icons';
import { LangToggle } from '../components/ui';
import { type MessageKey, useT } from '../lib/i18n';
import { restoreLang } from '../lib/store';

export const Route = createFileRoute('/')({
  component: Landing,
});

const FEATURES: { n: string; title: MessageKey; body: MessageKey }[] = [
  { n: '01', title: 'landing.f1.title', body: 'landing.f1.body' },
  { n: '02', title: 'landing.f2.title', body: 'landing.f2.body' },
  { n: '03', title: 'landing.f3.title', body: 'landing.f3.body' },
];

function Landing() {
  const t = useT();
  useEffect(restoreLang, []);
  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 md:h-20 md:px-10">
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

      <main className="mx-auto max-w-[1200px] px-5 md:px-10">
        <section className="grid items-center gap-6 pt-6 pb-14 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-10 md:pt-10 md:pb-24">
          <div className="max-w-[480px]">
            <p className="text-xs font-medium tracking-[0.2em] text-ink-2 uppercase">{t('brand.tagline')}</p>
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
          <div className="relative -mx-2 md:mx-0">
            <HouseSketch className="mx-auto h-auto w-full max-w-[640px]" />
          </div>
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

      <footer className="mx-auto max-w-[1200px] px-5 pb-10 text-xs text-ink-3 md:px-10">{t('landing.footer')}</footer>
    </div>
  );
}
