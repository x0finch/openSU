// Small pieces of the paper pages built from the base components (src/ui/).
import type { ReactNode } from 'react';
import { useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import { Button } from '../ui';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

export function LangToggle({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const setLang = useStudio((s) => s.setLang);
  return (
    <Button
      variant="paper"
      size={size === 'sm' ? 'sm' : 'md'}
      onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
      className={cx('font-normal text-ink-2', size === 'lg' ? 'h-11 min-w-11 px-2.5' : size === 'md' ? 'min-w-11' : '', className)}
      lang={lang === 'zh' ? 'en' : 'zh-CN'}
    >
      {t('lang.switch')}
    </Button>
  );
}

/** Small caption used above groups of controls. */
export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-2xs font-medium tracking-[0.08em] text-ink-2 uppercase', className)}>{children}</p>;
}
