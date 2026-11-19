// The toast's Base UI tree (task 033): the provider bound to the app's manager and the viewport. Loaded when the page
// is idle (the first paint does not need it); messages added before it arrives show once it has.
import { Toast as BaseToast } from '@base-ui/react/toast';
import { useEffect } from 'react';
import { cx, Glass } from './surface';
import { setToastCount, type ToastData, toastManager } from './toast';

function Count() {
  const n = BaseToast.useToastManager().toasts.length;
  useEffect(() => setToastCount(n), [n]);
  return null;
}

/** Where messages show: a centred row; each one a glass capsule. */
export default function ToastViewportBase({ className, maxWidth = 'min(480px,calc(100vw-56px))' }: { className?: string; maxWidth?: string }) {
  return (
    <BaseToast.Provider toastManager={toastManager} limit={1} timeout={5200}>
      <Count />
      <Viewport className={className} maxWidth={maxWidth} />
    </BaseToast.Provider>
  );
}

function Viewport({ className, maxWidth }: { className?: string; maxWidth: string }) {
  const { toasts } = BaseToast.useToastManager();
  return (
    <BaseToast.Viewport className={cx('pointer-events-none flex justify-center outline-none', className)} data-slot="toast-viewport">
      {toasts.map((t) => {
        const data = (t.data ?? {}) as ToastData;
        return (
          <BaseToast.Root
            key={t.id}
            toast={t}
            data-testid={data.testId}
            render={(props) => {
              const { role: _role, ...rest } = props as typeof props & { role?: string };
              return <Glass {...rest} ariaRole="status" className={cx('lg-toast pointer-events-auto inline-flex h-10 items-center text-[13px] font-medium', data.action ? 'gap-3 pr-1.5 pl-4' : 'px-4')} />;
            }}
          >
            <BaseToast.Title className="truncate" style={{ maxWidth }} />
            {data.action && (
              <BaseToast.Action
                onClick={data.action.onClick}
                data-testid={data.action.testId}
                className="hit lg-plate inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold"
              >
                {data.action.label}
              </BaseToast.Action>
            )}
          </BaseToast.Root>
        );
      })}
    </BaseToast.Viewport>
  );
}
