// TextSurface: the glass that holds body text (the recent exchange, the pinned conversation).
import { useEffect, useRef, useState } from 'react';
import { coveredBy, subscribeFloating } from './floating';
import { cx, Glass, type GlassProps, useMergedRef } from './surface';
import { GLASS } from './material';

/**
 * A surface that holds body text (the latest exchange, the pinned
 * conversation): denser tint, radius 26. `stepAside`: it fades out and is
 * inert while a floating surface lies over it (the module's one rule for
 * what is under an open surface, floating.ts `coveredBy`).
 */
export function TextSurface({ className, children, stepAside, ref, ...rest }: Omit<GlassProps, 'kind'> & { stepAside?: boolean }) {
  const el = useRef<HTMLElement | null>(null);
  const merged = useMergedRef(el, ref);
  const [aside, setAside] = useState(false);
  useEffect(() => {
    if (!stepAside) return setAside(false);
    const check = () => setAside(!!el.current && coveredBy(el.current));
    check();
    return subscribeFloating(check);
  }, [stepAside]);
  return (
    <Glass ref={merged} kind="text" radius={GLASS.radiusText} className={cx('pointer-events-auto', stepAside && 'lg-step-aside', className)} inert={aside || undefined} data-aside={aside ? '' : undefined} {...rest}>
      {children}
    </Glass>
  );
}
