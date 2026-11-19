// Choice: radio chips inside a panel (the chosen one carries a plate), on
// Base UI's RadioGroup and Radio (arrow keys, one tab stop).
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { type ReactNode } from 'react';
import { cx } from './surface';

/** Radio chips inside a panel (no box: the chosen one carries a plate). */
export function Choice<T extends string>({ value, onChange, options, label, className, testId }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string; ariaLabel?: string }[]; label: string; className?: string; testId?: string }) {
  return (
    <RadioGroup value={value} onValueChange={(v) => v !== value && onChange(v as T)} aria-label={label} className={cx('flex gap-0.5', className)} data-testid={testId}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Radio.Root
            key={o.value}
            value={o.value}
            nativeButton
            render={<button type="button" aria-label={o.ariaLabel} title={o.title} data-value={o.value} data-on={on ? '' : undefined} />}
            className={cx('lg-plate h-8 flex-auto px-1 text-[13px] whitespace-nowrap', on ? 'font-semibold text-ink' : 'font-medium text-ink-2')}
          >
            {o.label}
          </Radio.Root>
        );
      })}
    </RadioGroup>
  );
}
