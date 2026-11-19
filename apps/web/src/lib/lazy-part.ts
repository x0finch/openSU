// A component whose code loads on demand (task 032), without Suspense: null until its module has arrived, then the
// component itself, for good. A surface waits for it before opening, so its open motion starts with its content
// (a Suspense fallback would open it empty and grow it mid-motion).
import { type ComponentType, useEffect, useState } from 'react';

export function lazyPart<P>(load: () => Promise<{ default: ComponentType<P> }>): { preload: () => Promise<ComponentType<P>>; use: (want?: boolean) => ComponentType<P> | null } {
  let ready: ComponentType<P> | null = null;
  let loading: Promise<ComponentType<P>> | null = null;
  const preload = () => (loading ??= load().then((m) => (ready = m.default)));
  const use = (want = true) => {
    const [C, setC] = useState<ComponentType<P> | null>(() => ready);
    useEffect(() => {
      if (C || !want) return;
      let alive = true;
      void preload().then((c) => alive && setC(() => c));
      return () => {
        alive = false;
      };
    }, [C, want]);
    return C ?? ready;
  };
  return { preload, use };
}
