// Which key the assistant uses (task 022): a pop-up menu at the
// conversation's input for choosing (the site's free allowance, each key
// saved with the account, the key held in this browser), and a sheet for
// entering or changing a key. Apple's pattern: a pop-up button shows the
// current choice; choosing switches at once; entering a key is a sheet.
// The menu opens just outside the glass surface it belongs to (beside the
// pinned column, above the recent strip or the phone sheet), so glass
// never sits on glass.
import { type FormEvent, type KeyboardEvent as RKeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownSmallIcon, CheckIcon, CloseIcon, PlusIcon } from '../components/icons';
import { cx, GlassChoice, GlassMenu, GlassMenuItem, GlassPopover, GlassSep, GlassSheet } from '../glass';
import { type MessageKey, useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import { useChat } from './chat-store';
import { InfoIcon, KeyIcon } from './icons';
import {
  browserKeyProvider, choose, closeKeySheet, currentSource, DEFAULT_MODELS, deleteKey, type KeyProvider, type KeySheetMode, markOffered, modelOf, openKeySheet, openPicker, PROVIDER_NAMES, saveBrowserKey, saveKey, setKeyModel, useKeys,
} from './keys';

type T = ReturnType<typeof useT>;

/** What is in use, as the pop-up button reads it. */
function useCurrentLabel(t: T): string {
  const settings = useChat((s) => s.settings);
  const serverKey = useChat((s) => !!s.server?.serverKey);
  useKeys((s) => `${s.ready}|${s.active}|${s.keys.length}`);
  const src = currentSource(settings);
  if (src.kind === 'account') return PROVIDER_NAMES[src.provider];
  if (src.kind === 'browser') return settings.provider === 'custom' ? (browserKeyProvider(settings) ? PROVIDER_NAMES[browserKeyProvider(settings)!] : t('settings.p.custom')) : PROVIDER_NAMES[settings.provider];
  return serverKey ? t('keys.free') : t('keys.none');
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
  const label = useCurrentLabel(t);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement | null>(null);
  const desktop = !phone;
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  // Where the menu stands: beside the pinned column (desktop), else above the surface holding the button.
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const b = btn.current.getBoundingClientRect();
    const surface = btn.current.closest<HTMLElement>('[data-testid=chat-panel], [data-testid=recent-strip]') ?? btn.current.closest<HTMLElement>('[data-testid=prompt]');
    const s = (surface ?? btn.current).getBoundingClientRect();
    const W = Math.min(300, innerWidth - 24);
    if (desktop && surface?.dataset.testid === 'chat-panel') setPos({ left: s.right + 12, bottom: innerHeight - b.bottom });
    else {
      // A toolbar riding on the surface's top edge (the phone's pinned sheet): above that too.
      let top = s.top;
      for (const tb of document.querySelectorAll<HTMLElement>('[role=toolbar]')) {
        const r = tb.getBoundingClientRect();
        if (r.width && r.bottom <= s.top + 1 && r.bottom >= s.top - 48) top = Math.min(top, r.top);
      }
      setPos({ left: Math.max(12, Math.min(b.left, innerWidth - W - 12)), bottom: innerHeight - top + 8 });
    }
  }, [open, desktop]);
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
  // In the pinned field (task 023): a quiet plate at rest (a pop-up button reads as one), as high as send.
  const size = variant === 'input' ? (phone ? 'h-9 bg-wash' : 'h-7 bg-wash') : 'h-[32px]';
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => openPicker(open ? null : id)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('keys.picker', { name: label })}
        data-on={open ? '' : undefined}
        className={cx('hit lg-plate inline-flex max-w-[44%] shrink-0 items-center gap-1 pr-2 pl-3 text-[13px] font-medium whitespace-nowrap text-ink', size, variant === 'input' && 'self-end')}
        data-testid="key-picker"
      >
        <span className="truncate" data-testid="key-picker-label">{label}</span>
        <ChevronDownSmallIcon width={14} height={14} className={cx('shrink-0 text-ink-2 transition-transform', open && 'rotate-180')} />
      </button>
      {(open || pos) &&
        createPortal(
        <GlassMenu
          ref={menu}
          open={open}
          anchor={() => btn.current}
          label={t('keys.menu')}
          onClosed={() => setPos(null)}
          className="fixed z-50"
          style={{ left: pos?.left ?? 12, bottom: pos?.bottom ?? 96, width: Math.min(300, (typeof window === 'undefined' ? 390 : innerWidth) - 24) }}
          data-testid={open ? 'key-menu' : undefined}
        >
          <KeyMenuBody anchor={() => btn.current} />
        </GlassMenu>,
          // Out of the surface the button sits in (a transformed glass panel), still inside the glass layer's custom properties.
          document.querySelector('[data-glass-tone]') ?? document.body,
        )}
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
        <GlassMenuItem role="menuitemradio" aria-checked={src.kind === 'site'} icon={<Check on={src.kind === 'site'} />} detail={<FreeDetail />} onClick={() => pick(() => choose({ kind: 'site' }))} data-testid="key-free">
          {t('keys.free')}
        </GlassMenuItem>
      )}
      {keys.map((k) => {
        const on = src.kind === 'account' && src.provider === k.provider;
        return (
          <div key={k.provider} className="flex items-center gap-0.5">
            <GlassMenuItem
              role="menuitemradio"
              aria-checked={on}
              icon={<Check on={on} />}
              onClick={() => pick(() => choose({ kind: 'account', provider: k.provider }))}
              className="h-auto min-h-12 min-w-0 flex-1 py-1.5"
              data-testid={`key-${k.provider}`}
            >
              <span className="block truncate">{PROVIDER_NAMES[k.provider]}</span>
              <span className="tnum block truncate text-[12px] leading-4 font-normal text-ink-2">{`••${k.hint} · ${modelOf(k)}`}</span>
            </GlassMenuItem>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-label={t('keys.edit', { name: PROVIDER_NAMES[k.provider] })}
              onClick={() => openKeySheet({ mode: 'edit', provider: k.provider }, anchor())}
              className="lg-plate grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink focus-visible:outline-none"
              data-testid={`key-edit-${k.provider}`}
            >
              <InfoIcon width={18} height={18} />
            </button>
          </div>
        );
      })}
      {browserKey && (
        <GlassMenuItem role="menuitemradio" aria-checked={src.kind === 'browser'} icon={<Check on={src.kind === 'browser'} />} detail={browserKey} onClick={() => pick(() => choose({ kind: 'browser' }))} data-testid="key-browser">
          {t('keys.browser')}
        </GlassMenuItem>
      )}
      <GlassSep />
      {ready ? (
        <GlassMenuItem icon={<PlusIcon width={16} height={16} />} onClick={() => openKeySheet({ mode: 'add' }, anchor())} data-testid="key-add">
          {t('keys.add')}
        </GlassMenuItem>
      ) : (
        <GlassMenuItem
          icon={<KeyIcon width={16} height={16} />}
          onClick={() => {
            openPicker(null);
            useChat.getState().setSettingsOpen(true);
          }}
          data-testid="key-own"
        >
          {t('keys.addOwn')}
        </GlassMenuItem>
      )}
      {ready && <p className="px-3 pt-1 pb-1.5 text-[12px] leading-4 text-ink-2">{t('keys.where')}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The key sheet                                                       */
/* ------------------------------------------------------------------ */

function Spinner() {
  return <span className="inline-block size-4 animate-[lg-spin_0.8s_linear_infinite] rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />;
}

function Primary({ children, busy, disabled, testId }: { children: string; busy?: boolean; disabled?: boolean; testId?: string }) {
  return (
    <button type="submit" disabled={disabled || busy} className={cx('hit lg-focus flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent transition-[filter,opacity] duration-150', disabled ? 'opacity-50' : 'hover:brightness-95')} data-testid={testId}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-ink-2">{label}</span>
      <span className="lg-field flex h-12 items-center px-4">{children}</span>
      {hint && <span className="mt-1.5 block text-[12px] leading-4 text-ink-2">{hint}</span>}
    </label>
  );
}

const inputCls = 'h-full w-full bg-transparent text-[16px] font-medium text-ink outline-none placeholder:text-ink-2 [&:focus-visible]:outline-none';

const errText = (t: T, code: string) => {
  const k = `keys.err.${code}` as MessageKey;
  return ['bad_key', 'bad_model', 'too_many', 'signed_out'].includes(code) ? t(k) : t('keys.err.other');
};

function SheetBody({ sheet, phone }: { sheet: KeySheetMode; phone?: boolean }) {
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
  const head = (title: string) => (
    <div className="flex items-center gap-1">
      <h2 className="min-w-0 flex-1 text-[19px] leading-6 font-semibold tracking-[-0.01em]" id="keys-title">{title}</h2>
      <button
        type="button"
        onClick={() => {
          if (sheet.mode === 'offer') markOffered();
          closeKeySheet();
        }}
        aria-label={t('keys.close')}
        className="hit lg-plate -mr-1.5 grid size-8 shrink-0 place-items-center self-start rounded-full text-ink-2 hover:text-ink"
        data-testid="keys-close"
      >
        <CloseIcon width={16} height={16} />
      </button>
    </div>
  );
  const pad = phone ? 'px-5 pt-1 pb-6' : 'p-[22px]';
  const errorLine = error && (
    <p className="text-[13.5px] leading-5 text-ink" role="alert" data-testid="keys-error">
      {error}
    </p>
  );
  const where = <p className="text-[13px] leading-5 text-ink-2" data-testid="keys-where">{t('keys.where')}</p>;

  if (sheet.mode === 'offer') {
    const p = browserKeyProvider(settings);
    return (
      <form onSubmit={submit} className={cx('flex flex-col gap-4', pad)} data-testid="keys-offer">
        {head(t('keys.offerTitle'))}
        <p className="-mt-2 text-[14px] leading-5 text-ink">{t('keys.offerBody', { name: p ? PROVIDER_NAMES[p] : '', hint: settings.key.trim().slice(-4) })}</p>
        {errorLine || where}
        <Primary busy={busy} testId="keys-offer-save">{t('keys.offerSave')}</Primary>
        <button
          type="button"
          onClick={() => {
            markOffered();
            closeKeySheet();
          }}
          className="hit lg-plate -mt-2 h-10 rounded-full text-[14px] font-medium text-ink"
          data-testid="keys-offer-later"
        >
          {t('keys.offerLater')}
        </button>
      </form>
    );
  }

  const title = sheet.mode === 'edit' ? PROVIDER_NAMES[sheet.provider] : t('keys.addTitle');
  const placeholder = provider === 'openrouter' ? 'sk-or-…' : provider === 'anthropic' ? 'sk-ant-…' : 'sk-…';
  return (
    <form onSubmit={submit} className={cx('flex flex-col gap-4', pad)} data-testid={`keys-${sheet.mode}`} noValidate>
      {head(title)}
      {sheet.mode === 'edit' && editing && <p className="tnum -mt-3 text-[13.5px] leading-5 text-ink-2">{t('keys.endsWith', { hint: editing.hint })}</p>}
      {sheet.mode === 'add' && (
        <div>
          <span className="mb-1.5 block text-[12px] font-medium text-ink-2">{t('keys.provider')}</span>
          <GlassChoice<KeyProvider>
            label={t('keys.provider')}
            value={provider}
            onChange={setProvider}
            testId="keys-provider"
            options={(['openrouter', 'openai', 'anthropic'] as const).map((p) => ({ value: p, label: PROVIDER_NAMES[p] }))}
          />
        </div>
      )}
      <Field label={sheet.mode === 'edit' ? t('keys.keyReplace') : t('keys.key')} hint={sheet.mode === 'edit' ? t('keys.keyReplaceHint') : undefined}>
        <input ref={sheet.mode === 'add' ? first : undefined} type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder={placeholder} className={inputCls} data-testid="keys-key" />
      </Field>
      <Field label={t('keys.model')}>
        <input ref={sheet.mode === 'edit' ? first : undefined} value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODELS[provider]} autoCapitalize="none" spellCheck={false} className={inputCls} data-testid="keys-model" />
      </Field>
      {errorLine || where}
      <Primary busy={busy} disabled={sheet.mode === 'add' && !key.trim()} testId="keys-save">{t('keys.save')}</Primary>
      {sheet.mode === 'edit' && (
        <button
          type="button"
          onClick={() => (confirm ? void run(() => deleteKey(provider)) : setConfirm(true))}
          className={cx('hit lg-plate -mt-2 h-10 rounded-full text-[14px] font-medium', confirm ? 'text-[#c0392b]' : 'text-ink')}
          data-testid="keys-delete"
        >
          {confirm ? t('keys.deleteConfirm') : t('keys.delete')}
        </button>
      )}
    </form>
  );
}

/**
 * Hosts the key sheet. Desktop: a glass panel that grows out of the
 * picker (or the input, for the offer after sign-in) and flows back;
 * phone: the inset bottom sheet.
 */
export function KeySheetHost({ phone }: { phone?: boolean }) {
  const t = useT();
  const sheet = useKeys((s) => s.sheet);
  const from = useKeys((s) => s.anchor);
  const [shown, setShown] = useState<KeySheetMode | null>(sheet);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
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
  const body = <SheetBody key={`${shown.mode}-${'provider' in shown ? shown.provider : ''}`} sheet={shown} phone={phone} />;
  if (phone) {
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    return (
      <>
        <div className={cx('pointer-events-auto absolute inset-0 z-40 bg-black/10 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')} onClick={close} aria-hidden="true" />
        <GlassSheet open={open} large={Math.round(vh * 0.92)} onClose={close} onClosed={onClosed} ariaLabel={t('keys.menu')} testId="keys-sheet" className="z-50" style={{ left: 8, right: 8, bottom: 'max(8px, env(safe-area-inset-bottom))' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="keys-title">
            {body}
          </div>
        </GlassSheet>
      </>
    );
  }
  const width = 380;
  return (
    <>
      {rect && <div ref={ghost} className="pointer-events-none fixed" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} aria-hidden="true" />}
      <GlassPopover
        ref={panel}
        open={open}
        anchor={() => (open ? ghost.current : from?.isConnected ? from : document.querySelector<HTMLElement>('[data-testid=prompt]'))}
        kind="text"
        onClosed={onClosed}
        ariaRole="dialog"
        aria-modal="true"
        aria-labelledby="keys-title"
        className="absolute z-50"
        style={{ bottom: 96, left: `calc(50% - ${width / 2}px)`, width }}
        data-testid="keys-sheet"
      >
        {body}
      </GlassPopover>
    </>
  );
}

/** The project menu's "AI connection settings" when keys live with the account: the picker opens. */
export function showKeyChoices(): void {
  const st = useStudio.getState();
  if (!st.pinned) st.setRecent(true);
  window.setTimeout(() => openPicker(st.pinned ? 'pinned' : 'any'), 260);
}
