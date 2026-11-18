// Choice: radio chips inside a panel (the chosen one carries a plate).
import { type KeyboardEvent as RKeyboardEvent, type ReactNode, useRef } from 'react';
import { cx } from './surface';

/** Radio chips inside a panel (no box: the chosen one carries a plate). */
export function Choice<T extends string>({ value, onChange, options, label, className, testId }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string; ariaLabel?: string }[]; label: string; className?: string; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: RKeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + d + options.length) % options.length]!;
    onChange(next.value);
    ref.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={label} onKeyDown={onKey} className={cx('flex gap-0.5', className)} data-testid={testId}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} aria-label={o.ariaLabel} title={o.title} tabIndex={on ? 0 : -1} data-value={o.value} data-on={on ? '' : undefined} onClick={() => onChange(o.value)} className={cx('lg-plate h-8 flex-auto px-1 text-[13px] whitespace-nowrap', on ? 'font-semibold text-ink' : 'font-medium text-ink-2')}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
