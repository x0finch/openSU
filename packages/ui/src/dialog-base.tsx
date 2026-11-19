// Dialog's Base UI tree (loaded on first use or when idle): a modal surface on Base UI's Dialog (task 033): a scrim, focus kept inside, Escape and a press on the scrim
// close it, focus returns to what opened it. Desktop: centred; phones: an inset sheet from the bottom (landscape: at
// the right).
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type { ReactNode } from 'react';
import { cx, Glass, usePortalHost } from './surface';
import { GLASS } from './material';

export default function DialogBase({ open, onClose, label, phone, children, testId }: { open: boolean; onClose: () => void; label: string; phone?: boolean; children: ReactNode; testId?: string }) {
  const host = usePortalHost();
  return (
    <BaseDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <BaseDialog.Portal container={host ?? undefined}>
        <BaseDialog.Backdrop className="lg-scrim pointer-events-auto fixed inset-0 z-40" data-testid={testId ? `${testId}-scrim` : undefined} />
        <BaseDialog.Popup
          aria-label={label}
          data-testid={testId}
          render={(props) => {
            const { role: _role, ...rest } = props as typeof props & { role?: string };
            return (
              <Glass
                {...rest}
                ariaRole="dialog"
                kind="text"
                radius={phone ? 34 : GLASS.radiusText + 4}
                className={cx(
                  'pointer-events-auto fixed z-50 flex animate-[fade-in_160ms_ease-out] flex-col overflow-hidden outline-none',
                  phone ? 'inset-x-2 bottom-2 h-[86%] land:inset-x-auto land:top-2 land:right-2 land:bottom-2 land:h-auto land:w-[400px]' : 'inset-0 m-auto h-[min(600px,calc(100%-120px))] w-[420px]',
                )}
              />
            );
          }}
        >
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
