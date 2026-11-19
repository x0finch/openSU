// The key sheet's content (task 022), loaded on first use or when the page is idle (task 032).
import { type FormEvent, useLayoutEffect, useRef, useState } from 'react';
import { Choice, Field, Input, PopoverAction, PopoverBody, PopoverDescription, PopoverFooter, PopoverHeader, PopoverTitle } from '@opensu/ui';
import { type MessageKey, useT } from '../lib/i18n';
import { useChat } from './chat-store';
import { browserKeyProvider, closeKeySheet, DEFAULT_MODELS, deleteKey, type KeyProvider, type KeySheetMode, markOffered, PROVIDER_NAMES, saveBrowserKey, saveKey, setKeyModel, useKeys } from './keys';

type T = ReturnType<typeof useT>;

const errText = (t: T, code: string) => {
  const k = `keys.err.${code}` as MessageKey;
  return ['bad_key', 'bad_model', 'too_many', 'signed_out'].includes(code) ? t(k) : t('keys.err.other');
};

export default function SheetBody({ sheet }: { sheet: KeySheetMode }) {
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

