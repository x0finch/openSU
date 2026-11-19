// Toast: a short message in a small capsule that leaves by itself, on Base UI's Toast (task 033): one manager for
// the app (`showToast`), the latest wins (limit 1), a hover or focus keeps it, a swipe or Escape dismisses it, and
// screen readers hear it. The app places the viewport (above the input in the studio, at the foot of /projects). The
// viewport's Base UI tree is in toast-base.tsx and loads when the page is idle.
import { Toast as BaseToast } from '@base-ui/react/toast';
import { lazy, type ReactNode, Suspense, useSyncExternalStore } from 'react';

export type ToastData = { testId?: string; action?: { label: ReactNode; onClick: () => void; testId?: string } };

/** The app's one toast manager. */
export const toastManager = BaseToast.createToastManager();

/** Shows a message (the latest replaces any other); `action`: one button at its end, concentric with it. */
export function showToast(o: { title: ReactNode; testId?: string; timeout?: number; action?: ToastData['action'] }): string {
  void preloadToast();
  return toastManager.add<ToastData>({ title: o.title, timeout: o.timeout, data: { testId: o.testId, action: o.action } });
}

/** Closes a message (or all). */
export function closeToast(id?: string): void {
  toastManager.close(id);
}

let count = 0;
const listeners = new Set<() => void>();
/** Set by the viewport (toast-base.tsx). */
export function setToastCount(n: number): void {
  count = n;
  for (const f of listeners) f();
}

/** How many messages are showing (the studio's invitation takes their place when none). */
export function useToastCount(): number {
  return useSyncExternalStore((f) => (listeners.add(f), () => listeners.delete(f)), () => count, () => 0);
}

let loading: Promise<unknown> | null = null;
/** Fetches the viewport's code (the glass layer calls it when the page is idle). */
export function preloadToast(): Promise<unknown> {
  return (loading ??= import('./toast-base'));
}

const Base = lazy(() => import('./toast-base'));

/** Where messages show: a centred row; each one a glass capsule. */
export function ToastViewport(props: { className?: string; maxWidth?: string }) {
  return (
    <Suspense fallback={null}>
      <Base {...props} />
    </Suspense>
  );
}
