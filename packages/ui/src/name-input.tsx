// NameInput: the rename-in-place field (the house name, a project card). A plain input (task 032): it stands in no
// Field, so Base UI's Input added nothing but its code to the first paint.
import { type InputHTMLAttributes, type Ref } from 'react';
import { cx } from './surface';

/** A name typed in place on paper (the house name in the studio, a card's name on /projects). */
export function NameInput({ className, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...rest} className={cx('min-w-0 rounded-[8px] bg-page px-1.5 font-semibold outline outline-1 outline-ink-3 focus:outline-2 focus:outline-ink', className)} />;
}
