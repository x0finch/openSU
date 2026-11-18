// Notice: one capsule above the input holding a line and its actions (the
// sign-in invitation, the view-only bar). Text 12 px from the start, the
// 32 px actions concentric at the end (8 px); on phones the line may take
// up to three lines (the capsule grows; the narrowest phones in English).
import type { ReactNode } from 'react';
import { CloseGlyph } from './glyphs';
import { Button } from './button';
import { cx, Glass } from './surface';

export function Notice({ children, actions, onClose, closeLabel, phone, wide, testId, textTestId, role = 'status' }: { children: ReactNode; actions?: ReactNode; onClose?: () => void; closeLabel?: string; phone?: boolean; wide?: boolean; testId?: string; textTestId?: string; role?: string }) {
  return (
    <div className="pointer-events-none flex w-full animate-[fade-in_200ms_ease-out] justify-center">
      {/* Phones: a sentence on up to three lines, so the text surface's tint, and the 48 px capsule's radius when it grows (as the input bar keeps its radius, after Messages). */}
      <Glass ariaRole={role} kind={phone ? 'text' : 'control'} radius={phone ? 24 : 'capsule'} className={cx('pointer-events-auto flex min-h-12 min-w-0 items-center gap-3 pr-2 pl-3', phone ? 'py-1.5' : 'h-12', phone || wide ? 'w-full' : 'max-w-full')} data-testid={testId}>
        <span className={cx('min-w-0 flex-1 font-medium', phone ? 'line-clamp-3 text-[13px] leading-4' : 'truncate text-[14px]')} data-testid={textTestId}>
          {children}
        </span>
        {actions}
        {onClose && <Button variant="quiet" size="sm" icon={<CloseGlyph size={14} />} label={closeLabel} onClick={onClose} className="-ml-2" data-testid={testId ? `${testId}-close` : undefined} />}
      </Glass>
    </div>
  );
}

/** An action of a notice: a 32 px button (`filled`: the one to take). */
export function NoticeAction({ filled, ...rest }: Parameters<typeof Button>[0] & { filled?: boolean }) {
  return <Button variant={filled ? 'tinted' : 'plain'} size="sm" strong {...rest} />;
}
