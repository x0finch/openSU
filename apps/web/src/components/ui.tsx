// Small hand-built UI primitives. No UI kit: each is a few lines, keyboard
// accessible, and styled only through the tokens in styles.css.
import { type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, useRef } from 'react';
import { useT } from '../lib/i18n';
import { useStudio } from '../lib/store';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

type Side = 'left' | 'right' | 'top' | 'bottom';

const tipSide: Record<Side, string> = {
  left: 'right-full top-1/2 mr-2.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2.5 -translate-y-1/2',
  top: 'bottom-full left-1/2 mb-2.5 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2.5 -translate-x-1/2',
};

/** Hover / keyboard-focus label. The trigger keeps its own aria-label. */
export function Tip({ label, side = 'left', children, className }: { label: ReactNode; side?: Side; children: ReactNode; className?: string }) {
  return (
    <span className={cx('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="presentation"
        className={cx(
          'pointer-events-none absolute z-50 rounded-sm bg-ink px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow-float transition-opacity duration-150',
          'group-hover/tip:opacity-100 group-hover/tip:delay-300 group-has-[:focus-visible]/tip:opacity-100',
          tipSide[side],
        )}
      >
        {label}
      </span>
    </span>
  );
}

export function IconButton({ label, active, className, children, tip, tipSide: side = 'left', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; tip?: boolean; tipSide?: Side }) {
  const btn = (
    <button
      type="button"
      aria-label={label}
      className={cx(
        'grid size-10 place-items-center rounded-sm text-ink transition-colors duration-150',
        active ? 'bg-ink text-white' : 'hover:bg-wash disabled:text-ink-3 disabled:hover:bg-transparent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
  return tip === false ? btn : <Tip label={label} side={side}>{btn}</Tip>;
}

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  hint?: string;
}

/** Radio-group segmented control with arrow-key navigation. */
export function Segmented<T extends string>({ value, onChange, segments, label, size = 'md', className }: { value: T; onChange: (v: T) => void; segments: Segment<T>[]; label: string; size?: 'md' | 'lg'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = segments.filter((s) => !s.disabled);
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = enabled.findIndex((s) => s.value === value);
    const next = enabled[(i + d + enabled.length) % enabled.length]!;
    onChange(next.value);
    ref.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={label} onKeyDown={onKey} className={cx('flex gap-0.5 rounded-ui p-1', className)}>
      {segments.map((s) => {
        const on = s.value === value;
        const btn = (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={s.disabled || undefined}
            disabled={s.disabled}
            tabIndex={on ? 0 : -1}
            data-value={s.value}
            onClick={() => !s.disabled && onChange(s.value)}
            className={cx(
              'relative flex flex-1 items-center justify-center gap-1.5 rounded-sm font-medium whitespace-nowrap transition-colors duration-150',
              size === 'lg' ? 'h-11 px-4 text-sm' : 'h-8 px-3.5 text-sm',
              on ? 'bg-ink text-white' : s.disabled ? 'text-ink-3' : 'text-ink-2 hover:bg-wash hover:text-ink',
            )}
          >
            {s.label}
          </button>
        );
        return s.hint ? (
          <Tip key={s.value} label={s.hint} side="bottom" className="flex flex-1">
            {btn}
          </Tip>
        ) : (
          btn
        );
      })}
    </div>
  );
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
