// The share surface's content (task 028), loaded on first use or when the page is idle (task 032).
import { useEffect, useRef, useState } from 'react';
import { Input, PopoverAction, PopoverBody, PopoverDescription, PopoverFooter, PopoverHeader, PopoverTitle, Switch, usePhone } from '@opensu/ui';
import { useT } from '../lib/i18n';
import { projectName, useHouseName, useProjects } from '../lib/projects';
import { closeShare, copyLink, setShared, shareUrl, useShareUi } from '../lib/share';
import { useStudio } from '../lib/store';
import { openSignIn } from '../chat/account';
import { useChat } from '../chat/chat-store';
import { SHARE_OPENER } from './Share';


export default function ShareBody() {
  const t = useT();
  const phone = usePhone();
  const lang = useStudio((s) => s.lang);
  const ui = useShareUi();
  const user = useChat((s) => s.server?.user ?? null);
  const openId = useProjects((s) => s.openId);
  const id = ui.project ?? openId;
  const meta = useProjects((s) => s.projects.find((p) => p.id === id) ?? null);
  const studioName = useHouseName();
  const name = meta ? projectName(lang, meta) : studioName;
  const field = useRef<HTMLInputElement>(null);
  const shared = !!meta?.share;
  // While the switch is on its way, it shows where it is going.
  const [want, setWant] = useState<boolean | null>(null);
  useEffect(() => {
    if (!ui.busy) setWant(null);
  }, [ui.busy]);
  const on = want ?? shared;
  const url = meta?.share ? shareUrl(meta.share) : '';
  const canSend = phone && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const head = (
    <PopoverHeader onClose={closeShare} closeLabel={t('account.close')} closeTestId="share-close">
      <PopoverTitle id="share-title">{meta ? t('share.titleOf', { name }) : t('share.button')}</PopoverTitle>
    </PopoverHeader>
  );

  if (!user || !meta) {
    // Signed out, or this house is not (yet) a project of the account.
    return (
      <div className="contents" data-testid="share-need-account">
          {head}
          <PopoverDescription>{user ? t('share.notKept') : t('share.needAccount')}</PopoverDescription>
          {!user && (
            <PopoverFooter>
              <PopoverAction
                onClick={() => {
                  // Under the name's row, as the share surface was (it grows out of and back into the share button).
                  useShareUi.setState({ open: false, afterSignIn: true });
                  openSignIn(document.querySelector<HTMLElement>(SHARE_OPENER), 'menu');
                }}
                data-testid="share-signin"
              >
                {t('account.signIn')}
              </PopoverAction>
            </PopoverFooter>
          )}
      </div>
    );
  }

  return (
    <div className="contents" data-testid="share-surface-body" data-shared={shared ? '' : undefined}>
      {head}
      <PopoverBody>
        <div className="flex items-center gap-3">
          <label htmlFor="share-switch" className="min-w-0 flex-1 cursor-pointer text-[14.5px] leading-5 font-medium">
            {t('share.anyone')}
          </label>
          <Switch
            id="share-switch"
            checked={on}
            disabled={ui.busy}
            onChange={(v) => {
              setWant(v);
              void setShared(meta.id, v);
            }}
            data-testid="share-switch"
          />
        </div>
        {ui.failed && (
          <p className="text-[13.5px] leading-5 text-ink" role="alert" data-testid="share-failed">
            {t('share.failed')}
          </p>
        )}
        {shared && !ui.busy && <Input ref={field} readOnly mono size="md" aria-label={t('share.link')} value={url} onFocus={(e) => e.target.select()} data-testid="share-link" />}
      </PopoverBody>
      <PopoverFooter note={<span data-testid="share-note">{t('share.viewersCannot')}</span>}>
        {shared && !ui.busy && (
          <PopoverAction onClick={() => void copyLink(url, t('share.copied'), { title: name, send: canSend, field: field.current })} data-testid="share-copy">
            {canSend ? t('share.send') : t('share.copy')}
          </PopoverAction>
        )}
      </PopoverFooter>
    </div>
  );
}

