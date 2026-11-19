// Dialog: a modal surface on Base UI's Dialog (task 033): a scrim, focus kept inside, Escape and a press on the scrim
// close it, focus returns to what opened it. Desktop: centred; phones: an inset sheet from the bottom. Its Base UI
// tree (dialog-base.tsx) loads on first use or when the page is idle.
import { lazy, type ReactNode, Suspense } from 'react';

const Base = lazy(() => import('./dialog-base'));

export function Dialog(props: { open: boolean; onClose: () => void; label: string; phone?: boolean; children: ReactNode; testId?: string }) {
  if (!props.open) return null;
  return (
    <Suspense fallback={null}>
      <Base {...props} />
    </Suspense>
  );
}
