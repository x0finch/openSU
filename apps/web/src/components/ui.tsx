// Small hand-built UI pieces for paper pages (the landing page). Controls
// on glass, their hover state and tooltips live in src/glass/ (task 025).
import type { ReactNode } from 'react';
import { useT } from '../lib/i18n';
import { useStudio } from '../lib/store';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

export function LangToggle({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const setLang = useStudio((s) => s.setLang);
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
      className={cx(
        'inline-flex items-center justify-center text-sm text-ink-2 transition-colors hover:bg-wash hover:text-ink',
        size === 'sm' ? 'h-8 rounded-sm px-3' : size === 'lg' ? 'h-11 min-w-11 rounded-ui px-2.5' : 'h-10 min-w-11 rounded-ui px-3',
        className,
      )}
      lang={lang === 'zh' ? 'en' : 'zh-CN'}
    >
      {t('lang.switch')}
    </button>
  );
}

/** Small caption used above groups of controls. */
export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-2xs font-medium tracking-[0.08em] text-ink-2 uppercase', className)}>{children}</p>;
}
