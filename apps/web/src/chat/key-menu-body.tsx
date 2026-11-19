// The key menu's rows (task 022), loaded on first use or when the page is idle (task 032).
import { CheckIcon, PlusIcon } from '../components/icons';
import { Button, MenuItem, MenuLabel, Separator } from '@opensu/ui';
import { useT } from '../lib/i18n';
import { useChat } from './chat-store';
import { InfoIcon, KeyIcon } from './icons';
import { browserKeyProvider, choose, currentSource, modelOf, openKeySheet, openPicker, PROVIDER_NAMES, useKeys } from './keys';


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

export default function KeyMenuBody({ anchor }: { anchor: () => HTMLElement | null }) {
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
  const browserKey = settings.key.trim() ? (settings.provider === 'custom' ? (browserKeyProvider(settings) ? PROVIDER_NAMES[browserKeyProvider(settings)!] : t('settings.p.custom')) : PROVIDER_NAMES[settings.provider]) : null;
  return (
    <div className="flex flex-col">
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


