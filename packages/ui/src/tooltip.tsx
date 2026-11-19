// Tooltip: the one tooltip.
import { type ReactNode } from 'react';
import { cx } from './surface';

/**
 * When a tooltip may show (task 026): on hover, once the pointer has moved
 * over its control (`data-tip-hover`), and on keyboard focus, when focus
 * arrived by Tab or an arrow key (`data-tip-focus`). Focus the code moves
 * there (a surface closing returns focus to its button) shows nothing, nor
 * does a control that appears under a resting pointer. One set of listeners
 * for every `.lg-tipped`; glass.css reads the two attributes.
 */
function installTipIntent(): void {
  if (typeof document === 'undefined' || (document as Document & { __lgTips?: boolean }).__lgTips) return;
  (document as Document & { __lgTips?: boolean }).__lgTips = true;
  let navKeyAt = -1e9;
  let hovered: Element | null = null;
  const tipped = (t: EventTarget | null) => (t instanceof Element ? t.closest('.lg-tipped') : null);
  const setHover = (el: Element | null) => {
    if (el === hovered) return;
    hovered?.removeAttribute('data-tip-hover');
    hovered = el;
    el?.setAttribute('data-tip-hover', '');
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) navKeyAt = performance.now();
  }, true);
  document.addEventListener('focusin', (e) => {
    const el = tipped(e.target);
    if (el && performance.now() - navKeyAt < 400) el.setAttribute('data-tip-focus', '');
  }, true);
  document.addEventListener('focusout', (e) => tipped(e.target)?.removeAttribute('data-tip-focus'), true);
  document.addEventListener('pointermove', (e) => setHover(e.pointerType === 'mouse' ? tipped(e.target) : null), { capture: true, passive: true });
  document.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget || !hovered?.contains(e.relatedTarget as Node)) setHover(null);
  }, true);
}
installTipIntent();

/**
 * The one tooltip (task 025): the name of a control, below it, after one
 * delay, on its own plate and ink (readable on paper, on glass and inside
 * dark panels: it never takes the panel's ink). Visual only: the control
 * keeps its own accessible name.
 */
export function Tooltip({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cx('lg-tipped relative inline-flex', className)}>
      {children}
      <span className="lg-tip" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
