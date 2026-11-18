// AI connection settings: the site's key, or the user's own (stored in this
// browser only). Slides over the message list.
import { useState } from 'react';
import { ChevronLeftIcon } from '../components/icons';
import { cx } from '../components/ui';
import { Button, Choice, Dot, Field, Input, Switch } from '../ui';
import { useT } from '../lib/i18n';
import { DEFAULT_MODELS } from '../lib/providers';
import { useChat } from './chat-store';
import { type AiSettings, type ProviderId, PROVIDER_BASE, usesOwnKey } from './settings';

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
    <div className="flex min-h-0 flex-1 animate-[fade-in_140ms_ease-out] flex-col" role="dialog" aria-label={t('settings.title')} data-testid="settings-sheet">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-hairline px-1.5">
        <Button variant="quiet" size="sm" onClick={close} icon={<ChevronLeftIcon width={17} height={17} />} className="gap-0.5 pr-2.5 pl-1.5 text-sm font-normal">
          {t('settings.done')}
        </Button>
        <h3 className="ml-1 text-sm font-semibold">{t('settings.title')}</h3>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* The site's key: a line with its status dot (no box inside the surface). */}
        <div className="flex items-start gap-2.5">
          <Dot tone={server?.serverKey ? 'accent' : 'muted'} className="mt-1.5" />
          <p className="text-[13px] leading-5 text-ink">{serverLine}</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="settings-own" className="cursor-pointer text-[13.5px] font-medium text-ink">{t('settings.own')}</label>
          <Switch id="settings-own" checked={own} onChange={(v) => up({ useOwn: v })} data-testid="settings-own" />
        </div>

        <div className={cx('space-y-4 transition-opacity', !own && 'pointer-events-none opacity-40')} inert={!own}>
          <Field label={t('settings.provider')}>
            <Choice<ProviderId>
              label={t('settings.provider')}
              value={draft.provider}
              onChange={(provider) => up({ provider })}
              options={[
                { value: 'openrouter', label: t('settings.p.openrouter') },
                { value: 'openai', label: t('settings.p.openai') },
                { value: 'custom', label: t('settings.p.custom') },
              ]}
            />
          </Field>
          <Field label={t('settings.key')} hint={t('settings.keyHint')}>
            <Input
              size="sm"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft.key}
              onChange={(e) => up({ key: e.target.value })}
              placeholder={draft.provider === 'openrouter' ? 'sk-or-…' : 'sk-…'}
              aria-label={t('settings.key')}
              data-testid="settings-key"
            />
          </Field>
          {draft.provider === 'custom' && (
            <Field label={t('settings.baseUrl')}>
              <Input size="sm" type="url" value={draft.baseUrl} onChange={(e) => up({ baseUrl: e.target.value })} placeholder="https://…/v1" aria-label={t('settings.baseUrl')} spellCheck={false} />
            </Field>
          )}
          <Field label={t('settings.model')} hint={t('settings.modelHint')}>
            <Input
              size="sm"
              value={draft.model}
              onChange={(e) => up({ model: e.target.value })}
              placeholder={draft.provider === 'openrouter' ? server?.model ?? DEFAULT_MODELS.openrouter : draft.provider === 'openai' ? DEFAULT_MODELS.openai : ''}
              aria-label={t('settings.model')}
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
          <Button variant="quiet" size="sm" onClick={clear} className="h-9 text-xs font-normal">
            {t('settings.clear')}
          </Button>
        ) : (
          <span className="text-2xs text-ink-3">{usesOwnKey(saved) ? t('settings.using.own') : server?.serverKey ? t('settings.using.server') : ''}</span>
        )}
        <Button variant="ink" size="md" onClick={save} className="h-9 min-w-20 text-sm" data-testid="settings-save">
          {flash ? t('settings.saved') : t('settings.save')}
        </Button>
      </div>
    </div>
  );
}
