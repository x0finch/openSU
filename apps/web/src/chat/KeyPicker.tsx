// Which key the assistant uses (task 022): a pop-up menu at the
// conversation's input for choosing (the site's free allowance, each key
// saved with the account, the key held in this browser), and a sheet for
// entering or changing a key. Apple's pattern: a pop-up button shows the
// current choice; choosing switches at once; entering a key is a sheet.
// The menu opens at its button (task 025: the glass module places it).
import { type FormEvent, type KeyboardEvent as RKeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDownSmallIcon, CheckIcon, PlusIcon } from '../components/icons';
import { Button, Choice, cx, Field, Input, Menu, MenuItem, MenuLabel, Popover, PopoverAction, PopoverBody, PopoverDescription, PopoverFooter, PopoverHeader, PopoverTitle, Separator, usePhone } from '@opensu/ui';
import { type MessageKey, useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import { useChat } from './chat-store';
import { InfoIcon, KeyIcon } from './icons';
import {
  browserKeyProvider, choose, closeKeySheet, currentSource, DEFAULT_MODELS, deleteKey, type KeyProvider, type KeySheetMode, markOffered, modelOf, openKeySheet, openPicker, PROVIDER_NAMES, saveBrowserKey, saveKey, setKeyModel, useKeys,
} from './keys';

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
  const id = useId();
  const open = useKeys((s) => s.picker === id || (s.picker === 'any' && variant === 'header') || (s.picker === 'pinned' && variant === 'input'));
  // In the pinned field the short name, so a typed sentence keeps one line (task 023).
  const label = useCurrentLabel(t, variant === 'input');
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement | null>(null);
  // A press outside closes it; Escape closes it and returns to the button.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const n = e.target as Node;
      if (menu.current?.contains(n) || btn.current?.contains(n)) return;
      openPicker(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      openPicker(null);
      btn.current?.focus({ preventScroll: true });
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    menu.current?.querySelector<HTMLElement>('[role=menuitemradio], [role=menuitem]')?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
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
        open={open}
        anchor={() => btn.current}
        placement={variant === 'input' ? 'above-start' : 'below-start'}
        label={t('keys.menu')}
        style={{ width: 'min(300px, calc(100vw - 24px))' }}
        data-testid={open ? 'key-menu' : undefined}
      >
        <KeyMenuBody anchor={() => btn.current} />
      </Menu>
    </>
  );
}

function Check({ on }: { on: boolean }) {
  return on ? <CheckIcon width={16} height={16} className="text-ink" /> : <span className="size-4" />;
}

/**
 * The free allowance's trailing text (task 023: the hint left the input):
 * what is left today once 3 or fewer (task 019's threshold), "used up"
 * at none, else where it comes from.
 */
function FreeDetail() {
  const t = useT();
  const left = useChat((s) => (s.server?.serverKey && s.server.quota ? s.server.quota.remaining : null));
  if (left === null || left > 3) return <>{t('keys.freeDetail')}</>;
  return (
    <span className="tnum" data-testid="quota-left">
      {left > 0 ? t('quota.left', { n: left }) : t('quota.usedUp')}
    </span>
  );
}

function KeyMenuBody({ anchor }: { anchor: () => HTMLElement | null }) {
  const t = useT();
  const settings = useChat((s) => s.settings);
  const server = useChat((s) => s.server);
  const keys = useKeys((s) => s.keys);
  const ready = useKeys((s) => s.ready);
  useKeys((s) => s.active);
  const src = currentSource(settings);
  const pick = (fn: () => Promise<void>) => {
    openPicker(null);
    void fn();
  };
  const onKey = (e: RKeyboardEvent) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const items = [...((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=menuitemradio], [role=menuitem]'))];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + d + items.length) % items.length]?.focus();
  };
  const browserKey = settings.key.trim() ? (settings.provider === 'custom' ? (browserKeyProvider(settings) ? PROVIDER_NAMES[browserKeyProvider(settings)!] : t('settings.p.custom')) : PROVIDER_NAMES[settings.provider]) : null;
  return (
    <div onKeyDown={onKey} className="flex flex-col">
      {server?.serverKey && (
        <MenuItem role="menuitemradio" aria-checked={src.kind === 'site'} icon={<Check on={src.kind === 'site'} />} detail={<FreeDetail />} onClick={() => pick(() => choose({ kind: 'site' }))} data-testid="key-free">
          {t('keys.free')}
        </MenuItem>
      )}
      {keys.map((k) => {
        const on = src.kind === 'account' && src.provider === k.provider;
        return (
          <div key={k.provider} className="flex items-center gap-0.5">
            <MenuItem
              role="menuitemradio"
              aria-checked={on}
              icon={<Check on={on} />}
              onClick={() => pick(() => choose({ kind: 'account', provider: k.provider }))}
              className="h-auto min-h-12 min-w-0 flex-1 py-1.5"
              data-testid={`key-${k.provider}`}
            >
              <span className="block truncate">{PROVIDER_NAMES[k.provider]}</span>
              <span className="tnum block truncate text-[12px] leading-4 font-normal text-ink-2">{`••${k.hint} · ${modelOf(k)}`}</span>
            </MenuItem>
            <Button
              variant="quiet"
              size="md"
              role="menuitem"
              tabIndex={-1}
              label={t('keys.edit', { name: PROVIDER_NAMES[k.provider] })}
              icon={<InfoIcon width={18} height={18} />}
              onClick={() => openKeySheet({ mode: 'edit', provider: k.provider }, anchor())}
              data-testid={`key-edit-${k.provider}`}
            />
          </div>
        );
      })}
      {browserKey && (
        <MenuItem role="menuitemradio" aria-checked={src.kind === 'browser'} icon={<Check on={src.kind === 'browser'} />} detail={browserKey} onClick={() => pick(() => choose({ kind: 'browser' }))} data-testid="key-browser">
          {t('keys.browser')}
        </MenuItem>
      )}
      <Separator />
      {ready ? (
        <MenuItem icon={<PlusIcon width={16} height={16} />} onClick={() => openKeySheet({ mode: 'add' }, anchor())} data-testid="key-add">
          {t('keys.add')}
        </MenuItem>
      ) : (
        <MenuItem
          icon={<KeyIcon width={16} height={16} />}
          onClick={() => {
            openPicker(null);
            useChat.getState().setSettingsOpen(true);
          }}
          data-testid="key-own"
        >
          {t('keys.addOwn')}
        </MenuItem>
      )}
      {ready && <MenuLabel small={t('keys.where')} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The key sheet                                                       */
/* ------------------------------------------------------------------ */


const errText = (t: T, code: string) => {
  const k = `keys.err.${code}` as MessageKey;
  return ['bad_key', 'bad_model', 'too_many', 'signed_out'].includes(code) ? t(k) : t('keys.err.other');
};

function SheetBody({ sheet }: { sheet: KeySheetMode }) {
  const t = useT();
  const keys = useKeys((s) => s.keys);
  const busy = useKeys((s) => s.busy);
  const error = useKeys((s) => s.error);
  const settings = useChat((s) => s.settings);
  const editing = sheet.mode === 'edit' ? keys.find((k) => k.provider === sheet.provider) : undefined;
  const [provider, setProvider] = useState<KeyProvider>(sheet.mode === 'edit' ? sheet.provider : sheet.mode === 'add' ? (sheet.provider ?? 'openrouter') : 'openrouter');
  const [key, setKey] = useState('');
  const [model, setModel] = useState(editing?.model ?? '');
  const [confirm, setConfirm] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (sheet.mode === 'offer') return;
    const focus = () => first.current?.focus({ preventScroll: true });
    focus();
    const ids = [60, 150, 300, 600].map((ms) => window.setTimeout(() => document.activeElement !== first.current && focus(), ms));
    return () => ids.forEach(clearTimeout);
  }, [sheet.mode]);
  const run = async (fn: () => Promise<string | null>) => {
    useKeys.setState({ busy: true, error: null });
    const err = await fn();
    if (err) useKeys.setState({ busy: false, error: errText(t, err) });
    else closeKeySheet();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (sheet.mode === 'add') void run(() => saveKey(provider, key, model));
    else if (sheet.mode === 'edit') void run(() => (key.trim() ? saveKey(provider, key, model, false) : setKeyModel(provider, model)));
    else {
      markOffered();
      void run(saveBrowserKey);
    }
  };
  const close = () => {
    if (sheet.mode === 'offer') markOffered();
    closeKeySheet();
  };
  const head = (title: string) => (
    <PopoverHeader onClose={close} closeLabel={t('keys.close')} closeTestId="keys-close">
      <PopoverTitle id="keys-title">{title}</PopoverTitle>
    </PopoverHeader>
  );
  const errorLine = error && (
    <p className="text-[13.5px] leading-5 text-ink" role="alert" data-testid="keys-error">
      {error}
    </p>
  );
  const where = <span data-testid="keys-where">{t('keys.where')}</span>;

  if (sheet.mode === 'offer') {
    const p = browserKeyProvider(settings);
    return (
      <form onSubmit={submit} className="contents" data-testid="keys-offer">
        {head(t('keys.offerTitle'))}
        <PopoverDescription>{t('keys.offerBody', { name: p ? PROVIDER_NAMES[p] : '', hint: settings.key.trim().slice(-4) })}</PopoverDescription>
        {errorLine}
        <PopoverFooter note={errorLine ? undefined : where}>
          <PopoverAction busy={busy} data-testid="keys-offer-save">{t('keys.offerSave')}</PopoverAction>
          <PopoverAction kind="secondary" onClick={close} data-testid="keys-offer-later">
            {t('keys.offerLater')}
          </PopoverAction>
        </PopoverFooter>
      </form>
    );
  }

  const title = sheet.mode === 'edit' ? PROVIDER_NAMES[sheet.provider] : t('keys.addTitle');
  const placeholder = provider === 'openrouter' ? 'sk-or-…' : provider === 'anthropic' ? 'sk-ant-…' : 'sk-…';
  return (
    <form onSubmit={submit} className="contents" data-testid={`keys-${sheet.mode}`} noValidate>
      {head(title)}
      {sheet.mode === 'edit' && editing && (
        <PopoverDescription>
          <span className="tnum">{t('keys.endsWith', { hint: editing.hint })}</span>
        </PopoverDescription>
      )}
      <PopoverBody>
        {sheet.mode === 'add' && (
          <Field label={t('keys.provider')}>
            <Choice<KeyProvider>
              label={t('keys.provider')}
              value={provider}
              onChange={setProvider}
              testId="keys-provider"
              options={(['openrouter', 'openai', 'anthropic'] as const).map((p) => ({ value: p, label: PROVIDER_NAMES[p] }))}
            />
          </Field>
        )}
        <Field label={sheet.mode === 'edit' ? t('keys.keyReplace') : t('keys.key')} hint={sheet.mode === 'edit' ? t('keys.keyReplaceHint') : undefined}>
          <Input ref={sheet.mode === 'add' ? first : undefined} size="lg" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder={placeholder} aria-label={sheet.mode === 'edit' ? t('keys.keyReplace') : t('keys.key')} data-testid="keys-key" />
        </Field>
        <Field label={t('keys.model')}>
          <Input ref={sheet.mode === 'edit' ? first : undefined} size="lg" value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODELS[provider]} autoCapitalize="none" spellCheck={false} aria-label={t('keys.model')} data-testid="keys-model" />
        </Field>
        {errorLine}
      </PopoverBody>
      <PopoverFooter note={errorLine ? undefined : where}>
        <PopoverAction busy={busy} disabled={sheet.mode === 'add' && !key.trim()} data-testid="keys-save">{t('keys.save')}</PopoverAction>
        {sheet.mode === 'edit' && (
          <PopoverAction kind="secondary" danger={confirm} onClick={() => (confirm ? void run(() => deleteKey(provider)) : setConfirm(true))} data-testid="keys-delete">
            {confirm ? t('keys.deleteConfirm') : t('keys.delete')}
          </PopoverAction>
        )}
      </PopoverFooter>
    </form>
  );
}

/**
 * Hosts the key sheet. Desktop: a glass panel that grows out of the
 * picker (or the input, for the offer after sign-in) and flows back;
 * phone: the inset bottom sheet.
 */
export function KeySheetHost() {
  const t = useT();
  const phone = usePhone();
  const sheet = useKeys((s) => s.sheet);
  const from = useKeys((s) => s.anchor);
  const [shown, setShown] = useState<KeySheetMode | null>(sheet);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const panel = useRef<HTMLElement>(null);
  const open = !!sheet;
  useLayoutEffect(() => {
    if (sheet) {
      setShown(sheet);
      setRect(from?.isConnected ? from.getBoundingClientRect() : null);
    }
  }, [sheet, from]);
  useEffect(() => {
    if (!open || phone) return;
    const down = (e: PointerEvent) => {
      if (panel.current?.contains(e.target as Node) || useKeys.getState().busy) return;
      if (useKeys.getState().sheet?.mode === 'offer') markOffered();
      closeKeySheet();
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [open, phone]);
  if (!shown) return null;
  const close = () => {
    if (useKeys.getState().sheet?.mode === 'offer') markOffered();
    closeKeySheet();
  };
  const onClosed = () => {
    setShown(null);
    if (!phone) document.querySelector<HTMLElement>('[data-testid=prompt-bar]')?.focus({ preventScroll: true });
  };
  // Above the input (where the draft waits), grown out of the control that opened it (its box: a menu row closes with its menu).
  return (
    <Popover
      ref={panel}
      open={open}
      anchor={() => document.querySelector<HTMLElement>('[data-testid=prompt]')}
      placement="above-center"
      from={() => (open && rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : from?.isConnected ? from : document.querySelector<HTMLElement>('[data-testid=prompt]'))}
      size="dialog"
      onClose={close}
      onClosed={onClosed}
      labelledBy="keys-title"
      label={t('keys.menu')}
      testId="keys-sheet"
    >
      <SheetBody key={`${shown.mode}-${'provider' in shown ? shown.provider : ''}`} sheet={shown} />
    </Popover>
  );
}

/** The project menu's "AI connection settings" when keys live with the account: the picker opens. */
export function showKeyChoices(): void {
  const st = useStudio.getState();
  if (!st.pinned) st.setRecent(true);
  window.setTimeout(() => openPicker(st.pinned ? 'pinned' : 'any'), 260);
}
