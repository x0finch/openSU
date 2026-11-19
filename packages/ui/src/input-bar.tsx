// InputBar and InputField: the compose capsule and the pinned conversation field.
import { type TextareaHTMLAttributes, type HTMLAttributes, type Ref, useLayoutEffect, useRef } from 'react';
import { cx, Glass, type GlassProps, useMergedRef } from './surface';

/** The input capsule (Apple's compose field). `working`: the yellow light travels round its edge. */
export function InputBar({ working, radius = 28, className, children, ref, ...rest }: Omit<GlassProps, 'kind' | 'radius'> & { working?: boolean; radius?: number }) {
  const el = useRef<HTMLElement | null>(null);
  const merged = useMergedRef(el, ref);
  useLayoutEffect(() => {
    const e = el.current;
    if (!e) return;
    const set = () => e.style.setProperty('--d', `${Math.ceil(Math.hypot(e.offsetWidth, e.offsetHeight)) + 4}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(e);
    return () => ro.disconnect();
  }, []);
  return (
    <Glass ref={merged} kind="control" radius={radius} className={cx('pointer-events-auto', className)} data-working={working ? '' : undefined} {...rest}>
      <span className="lg-halo" aria-hidden="true" />
      <span className="lg-glow" aria-hidden="true">
        <i />
      </span>
      {children}
    </Glass>
  );
}

/**
 * The compose field inside a glass surface (the pinned conversation): a
 * field of that surface, not a second glass (`.lg-field`: a quiet well,
 * no shadow). `radius`: concentric with the surface corner it sits in;
 * with one line it is a capsule. `working`: the same yellow light round
 * its edge as the input capsule.
 */
export function InputField({ working, radius, plain, className, style, children, ref, ...rest }: Omit<HTMLAttributes<HTMLDivElement>, 'ref'> & { working?: boolean; radius: number; plain?: boolean; ref?: Ref<HTMLDivElement> }) {
  const el = useRef<HTMLDivElement | null>(null);
  const merged = useMergedRef(el, ref);
  useLayoutEffect(() => {
    const e = el.current;
    if (!e) return;
    const set = () => e.style.setProperty('--d', `${Math.ceil(Math.hypot(e.offsetWidth, e.offsetHeight)) + 4}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(e);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={merged} className={cx('lg-field relative', className)} style={{ borderRadius: radius, ...style }} data-working={working ? '' : undefined} data-plain={plain ? '' : undefined} {...rest}>
      <span className="lg-halo" aria-hidden="true" />
      <span className="lg-glow" aria-hidden="true">
        <i />
      </span>
      {children}
    </div>
  );
}

/** The prompt's text field inside InputBar or InputField: no ring of its own (the bar is the field); the placeholder reads clearly dimmer than what is typed. */
export function PromptText({ className, ref, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} {...rest} className={cx('block max-h-[120px] w-full resize-none bg-transparent leading-5 font-medium outline-none placeholder:font-normal placeholder:text-ink-2/70 [&:focus-visible]:outline-none', className)} />;
}
