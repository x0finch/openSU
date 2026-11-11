// AI connection settings: the site's key, or the user's own (stored in this
// browser only). Slides over the message list.
import { type ReactNode, useState } from 'react';
import { ChevronLeftIcon } from '../components/icons';
import { cx, Segmented } from '../components/ui';
import { useT } from '../lib/i18n';
import { useChat } from './chat-store';
import { type AiSettings, type ProviderId, PROVIDER_BASE, usesOwnKey } from './settings';

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-2xs leading-4 text-ink-3">{hint}</span>}
    </label>
  );
}

const inputCls = 'h-10 w-full rounded-sm border border-hairline bg-white px-3 text-[13.5px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink-3 [&:focus-visible]:outline-none';

export function SettingsSheet() {
  const t = useT();
  const server = useChat((s) => s.server);
  const saved = useChat((s) => s.settings);
  const setSettings = useChat((s) => s.setSettings);
  const close = () => useChat.getState().setSettingsOpen(false);
  const [draft, setDraft] = useState<AiSettings>(() => ({ ...saved, useOwn: saved.useOwn || !!(server && !server.serverKey) }));
  const [flash, setFlash] = useState(false);
  const up = (p: Partial<AiSettings>) => setDraft((d) => ({ ...d, ...p }));
  const save = () => {
    setSettings({ ...draft, key: draft.key.trim(), baseUrl: draft.baseUrl.trim(), model: draft.model.trim() });
    setFlash(true);
    setTimeout(close, 450);
  };
  const clear = () => {
    const next = { ...draft, key: '', useOwn: false };
    setDraft(next);
    setSettings(next);
  };
  const own = draft.useOwn;
  const providerName = (p: string | null) => (p === 'openrouter' ? t('settings.p.openrouter') : p === 'openai' ? t('settings.p.openai') : t('settings.p.compatible'));
  const serverLine = !server ? t('settings.server.unknown') : server.serverKey ? t('settings.server.on', { provider: providerName(server.provider), model: server.model ?? '' }) : t('settings.server.off');

  return (
    <div className="absolute inset-0 z-10 flex animate-[fade-in_140ms_ease-out] flex-col bg-white" role="dialog" aria-label={t('settings.title')} data-testid="settings-sheet">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-hairline px-1.5">
        <button type="button" onClick={close} className="inline-flex h-8 items-center gap-0.5 rounded-[6px] pr-2 pl-1 text-sm text-ink-2 transition-colors hover:bg-wash hover:text-ink">
          <ChevronLeftIcon width={17} height={17} />
          {t('settings.done')}
        </button>
        <h3 className="ml-1 text-sm font-semibold">{t('settings.title')}</h3>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div className="flex items-start gap-2.5 rounded-sm bg-wash px-3 py-2.5">
          <span className={cx('mt-1.5 size-1.5 shrink-0 rounded-full', server?.serverKey ? 'bg-accent' : 'bg-ink-3')} aria-hidden="true" />
          <p className="text-[13px] leading-5 text-ink">{serverLine}</p>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-[13.5px] font-medium text-ink">{t('settings.own')}</span>
          <span className="relative inline-flex">
            <input type="checkbox" className="peer sr-only" checked={own} onChange={(e) => up({ useOwn: e.target.checked })} data-testid="settings-own" />
            <span className="h-6 w-10 rounded-full bg-hairline transition-colors peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink" />
            <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-150 peer-checked:translate-x-4" />
          </span>
        </label>

        <div className={cx('space-y-4 transition-opacity', !own && 'pointer-events-none opacity-40')} inert={!own}>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-ink-2">{t('settings.provider')}</span>
            <Segmented<ProviderId>
              label={t('settings.provider')}
              value={draft.provider}
              onChange={(provider) => up({ provider })}
              className="bg-wash"
              segments={[
                { value: 'openrouter', label: t('settings.p.openrouter') },
                { value: 'openai', label: t('settings.p.openai') },
                { value: 'custom', label: t('settings.p.custom') },
              ]}
            />
          </div>
          <Field label={t('settings.key')} hint={t('settings.keyHint')}>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft.key}
              onChange={(e) => up({ key: e.target.value })}
              placeholder={draft.provider === 'openrouter' ? 'sk-or-…' : 'sk-…'}
              className={inputCls}
              data-testid="settings-key"
            />
          </Field>
          {draft.provider === 'custom' && (
            <Field label={t('settings.baseUrl')}>
              <input type="url" value={draft.baseUrl} onChange={(e) => up({ baseUrl: e.target.value })} placeholder="https://…/v1" className={inputCls} spellCheck={false} />
            </Field>
          )}
          <Field label={t('settings.model')} hint={t('settings.modelHint')}>
            <input
              value={draft.model}
              onChange={(e) => up({ model: e.target.value })}
              placeholder={draft.provider === 'openrouter' ? server?.model ?? 'anthropic/claude-sonnet-5.5' : draft.provider === 'openai' ? 'gpt-6.1-sol' : ''}
              className={inputCls}
              spellCheck={false}
            />
          </Field>
          {draft.provider !== 'custom' && (
            <p className="text-2xs text-ink-3">
              {t('settings.baseUrl')} <span className="font-mono">{PROVIDER_BASE[draft.provider]}</span>
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-hairline px-4 py-3">
        {usesOwnKey(saved) ? (
          <button type="button" onClick={clear} className="h-9 rounded-sm px-2 text-xs text-ink-2 transition-colors hover:bg-wash hover:text-ink">
            {t('settings.clear')}
          </button>
        ) : (
          <span className="text-2xs text-ink-3">{usesOwnKey(saved) ? t('settings.using.own') : server?.serverKey ? t('settings.using.server') : ''}</span>
        )}
        <button type="button" onClick={save} className="h-9 min-w-20 rounded-sm bg-ink px-4 text-sm font-medium text-white transition-opacity hover:opacity-90" data-testid="settings-save">
          {flash ? t('settings.saved') : t('settings.save')}
        </button>
      </div>
    </div>
  );
}
