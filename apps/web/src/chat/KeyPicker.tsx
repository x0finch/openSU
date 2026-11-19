// Which key the assistant uses (task 022): a pop-up menu at the
// conversation's input for choosing (the site's free allowance, each key
// saved with the account, the key held in this browser), and a sheet for
// entering or changing a key. Apple's pattern: a pop-up button shows the
// current choice; choosing switches at once; entering a key is a sheet.
// The menu opens at its button (task 025: the glass module places it).
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { lazyPart } from '../lib/lazy-part';
import { ChevronDownSmallIcon } from '../components/icons';
import { Button, type CloseReason, cx, Menu, Popover, usePhone } from '@opensu/ui';
import { useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import { useChat } from './chat-store';
import { browserKeyProvider, closeKeySheet, currentSource, type KeySheetMode, markOffered, openPicker, PROVIDER_NAMES, useKeys } from './keys';

type T = ReturnType<typeof useT>;

/** What is in use, as the pop-up button reads it. */
function useCurrentLabel(t: T, short = false): string {
  const settings = useChat((s) => s.settings);
  const serverKey = useChat((s) => !!s.server?.serverKey);
  useKeys((s) => `${s.ready}|${s.active}|${s.keys.length}`);
  const src = currentSource(settings);
  if (src.kind === 'account') return PROVIDER_NAMES[src.provider];
  if (src.kind === 'browser') return settings.provider === 'custom' ? (browserKeyProvider(settings) ? PROVIDER_NAMES[browserKeyProvider(settings)!] : t('settings.p.custom')) : PROVIDER_NAMES[settings.provider];
  return serverKey ? (short ? t('keys.freeShort') : t('keys.free')) : t('keys.none');
}

/**
 * The pop-up button and its menu. `variant`: "input" sits in the input's
 * leading slot (the pinned conversation), "header" in the recent strip's
 * header row.
 */
export function KeyPicker({ variant, phone }: { variant: 'input' | 'header'; phone?: boolean }) {
  const t = useT();
  const MenuBody = keyMenuBody.use();
  const id = useId();
  const open = useKeys((s) => s.picker === id || (s.picker === 'any' && variant === 'header') || (s.picker === 'pinned' && variant === 'input'));
  // In the pinned field the short name, so a typed sentence keeps one line (task 023).
  const label = useCurrentLabel(t, variant === 'input');
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement | null>(null);
  // In the pinned field (task 023): as high as send; its ends even (4 px), so its text is 8 px from the
  // field's edge (4 + 4) and the field's ends read even with send's concentric 4 px; no resting plate
  // (a lighter plate costs the label contrast); pt-px: the glyphs' optical centre.
  const size = variant === 'input' ? (phone ? 'h-9 pt-px px-1' : 'h-7 pt-px px-1') : 'h-[32px] pr-2 pl-3';
  return (
    <>
      <Button
        ref={btn}
        variant="plain"
        size="sm"
        onClick={() => openPicker(open ? null : id)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('keys.picker', { name: label })}
        // In the field the open state is the turned chevron, not a lighter plate (it would cost the label contrast).
        selected={open && variant !== 'input'}
        className={cx('max-w-[44%] gap-1', size, variant === 'input' && 'self-end')}
        data-testid="key-picker"
      >
        <span className="truncate" data-testid="key-picker-label">{label}</span>
        <ChevronDownSmallIcon width={14} height={14} className={cx('shrink-0 text-ink-2 transition-transform', open && 'rotate-180')} />
      </Button>
      {/* At the button (Apple's pop-up menu): above it in a field, below it in a header; inside the pinned conversation when it fits. */}
      <Menu
        ref={menu}
        open={open && !!MenuBody}
        anchor={() => btn.current}
        // Base UI closes it (Escape: focus back to the button; a press outside; focus leaving); the button toggles it.
        onClose={() => openPicker(null)}
        placement={variant === 'input' ? 'above-start' : 'below-start'}
        label={t('keys.menu')}
        style={{ width: 'min(300px, calc(100vw - 24px))' }}
        testId={open ? 'key-menu' : undefined}
      >
        {MenuBody && <MenuBody anchor={() => btn.current} />}
      </Menu>
    </>
  );
}

export const keyMenuBody = lazyPart(() => import('./key-menu-body'));
export const keySheetBody = lazyPart(() => import('./key-sheet-body'));

/**
 * Hosts the key sheet. Desktop: a glass panel that grows out of the
 * picker (or the input, for the offer after sign-in) and flows back;
 * phone: the inset bottom sheet.
 */
export function KeySheetHost() {
  const t = useT();
  const SheetBody = keySheetBody.use();
  const phone = usePhone();
  const sheet = useKeys((s) => s.sheet);
  const [shown, setShown] = useState<KeySheetMode | null>(sheet);
  const panel = useRef<HTMLElement>(null);
  const open = !!sheet;
  useLayoutEffect(() => {
    if (sheet) {
      setShown(sheet);
    }
  }, [sheet]);
  if (!shown) return null;
  const close = (reason?: CloseReason) => {
    // A press outside while a key is being checked leaves it open.
    if (reason === 'outside-press' && useKeys.getState().busy) return;
    if (useKeys.getState().sheet?.mode === 'offer') markOffered();
    closeKeySheet();
  };
  const onClosed = () => {
    setShown(null);
    if (!phone) document.querySelector<HTMLElement>('[data-testid=prompt-bar]')?.focus({ preventScroll: true });
  };
  // Above the input (where the draft waits); it grows out of the input's upper edge.
  return (
    <Popover
      ref={panel}
      open={open && !!SheetBody}
      anchor={() => document.querySelector<HTMLElement>('[data-testid=prompt]')}
      placement="above-center"
      size="dialog"
      onClose={close}
      onClosed={onClosed}
      labelledBy="keys-title"
      label={t('keys.menu')}
      testId="keys-sheet"
    >
      {SheetBody && <SheetBody key={`${shown.mode}-${'provider' in shown ? shown.provider : ''}`} sheet={shown} />}
    </Popover>
  );
}

/** The project menu's "AI connection settings" when keys live with the account: the picker opens. */
export function showKeyChoices(): void {
  const st = useStudio.getState();
  if (!st.pinned) st.setRecent(true);
  window.setTimeout(() => openPicker(st.pinned ? 'pinned' : 'any'), 260);
}
