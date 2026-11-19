// While a floating surface is open: its box (for the caller's layout, `onBox`)
// and its entry in the module's list of open surfaces (`coveredBy`). Give the
// returned ref to the element that stands where the surface rests (Base UI's
// positioner: the popup inside it is transformed while it opens and closes).
import { useCallback, useLayoutEffect, useRef } from 'react';
import { registerFloating } from './floating';

export type Box = { left: number; top: number; right: number; bottom: number };

export function useFloatingBox(open: boolean, anchor: () => HTMLElement | null, menu: boolean, onBox?: (b: Box | null) => void): (el: HTMLElement | null) => void {
  const node = useRef<HTMLElement | null>(null);
  const cb = useRef({ anchor, onBox });
  cb.current = { anchor, onBox };
  const watch = useRef<((el: HTMLElement | null) => void) | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      cb.current.onBox?.(null);
      return;
    }
    let last = '';
    let seen: HTMLElement | null = null;
    const reg = registerFloating({ rect: () => node.current?.getBoundingClientRect() ?? null, anchor: () => cb.current.anchor(), menu });
    const report = () => {
      const e = node.current;
      if (!e) return;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const b = { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) };
      const key = `${b.left},${b.top},${b.right},${b.bottom}`;
      if (key === last) return;
      last = key;
      cb.current.onBox?.(b);
      reg.update();
    };
    const ro = new ResizeObserver(report);
    // Base UI writes the position into the positioner's style.
    const mo = new MutationObserver(report);
    const attach = (e: HTMLElement | null) => {
      if (!e || e === seen) return;
      if (seen) {
        ro.unobserve(seen);
        mo.disconnect();
      }
      seen = e;
      ro.observe(e);
      mo.observe(e, { attributes: true, attributeFilter: ['style'] });
      report();
    };
    watch.current = attach;
    attach(node.current);
    window.addEventListener('resize', report);
    return () => {
      watch.current = null;
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', report);
      reg.remove();
    };
  }, [open, menu]);
  return useCallback((el: HTMLElement | null) => {
    node.current = el;
    watch.current?.(el);
  }, []);
}
