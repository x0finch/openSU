// The conversation itself (task 015): the recent strip, the pinned column and sheet, the messages. Loaded when the
// page is idle or when the conversation is first shown (task 032: the first paint has only the input).
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState, Suspense } from 'react';
import { ChevronRightIcon, SparkIcon } from '../components/icons';
import { cx } from '../components/ui';
import { useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import { type ChatItem, loadAgent, newChat, retry, send, useChat } from './chat-store';
import { openSignIn } from './account';
import { ChevronDownIcon, ComposeIcon, DockIcon, PlanCheckIcon, RetryIcon, SlidersIcon, UndockIcon } from './icons';
import { accountKeyInUse, openKeySheet, useKeys } from './keys';
import { KeyPicker } from './KeyPicker';
import { Badge, Button, Dot, IconButton, Separator, TextSurface } from '@opensu/ui';
import { Turn, type TurnEntry } from './turn';
import { turnView } from './turn-parts';
import { ChatInput, errorText, liveStep, Note, SettingsSheet, SmallButton, SUGGESTIONS, useOwnKey } from './ChatPanel';

/** Inline **bold**; everything else is plain text (no HTML from the model). */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part));
}

/** Paragraphs and simple "- " / "1. " lists, the only formatting the assistant needs. */
function RichText({ text, caret }: { text: string; caret?: boolean }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/).filter((b) => b.trim());
  return (
    <div className="space-y-2 text-[14.5px] leading-[23px] font-medium break-words text-ink">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        const last = i === blocks.length - 1;
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="space-y-1">
              {lines.map((l, k) => (
                <li key={k} className="relative pl-3.5">
                  <Dot tone="muted" size={4} className="absolute top-[0.7em] left-0.5" />
                  {inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''))}
                  {caret && last && k === lines.length - 1 && <Caret />}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {inline(b)}
            {caret && last && <Caret />}
          </p>
        );
      })}
      {caret && !blocks.length && <Caret />}
    </div>
  );
}

function Caret() {
  return <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-[caret_1s_steps(1)_infinite] bg-ink" aria-hidden="true" />;
}

/**
 * One quiet status line with a sweeping hairline (same language as the
 * loaders). The sweep is a transform on a 32 x 1 px box with its paint
 * contained: cheap to animate even with software GL under it.
 */
function Progress({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-xs text-ink-2" role="status">
      <span className="relative h-px w-8 overflow-hidden bg-hairline [contain:strict]">
        <span className="absolute inset-y-0 left-0 w-2/5 animate-[progress-sweep_1.2s_cubic-bezier(0.6,0,0.4,1)_infinite] bg-ink will-change-transform" />
      </span>
      {label}
    </div>
  );
}

/** What each command did (English validator wording), behind its own small toggle. */
function TechDetails({ item }: { item: ChatItem }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const lines = (item.changes ?? []).flatMap((c) => c.details);
  if (!lines.length) return null;
  return (
    <div className="-mt-1 pb-2">
      <Button variant="link" size="xs" onClick={() => setOpen(!open)} aria-expanded={open} icon={<ChevronRightIcon width={13} height={13} className={cx('transition-transform duration-150', open && 'rotate-90')} />} className="px-0 text-2xs font-normal text-ink-3">
        {t('chat.details')}
      </Button>
      {open && (
        <ul className="max-h-40 space-y-1 overflow-auto pb-0.5 pl-1 font-mono text-[11px] leading-4 text-ink-2" lang="en">
          {lines.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * An assistant turn (task 018) in the compact density (the recent strip:
 * a live line while it runs, then the final text under its changes line)
 * or the full one (the pinned conversation: the timeline).
 */
function AssistantMessage({ item, latest, density }: { item: ChatItem; latest: boolean; density: 'compact' | 'full' }) {
  const t = useT();
  const running = item.phase !== 'done';
  const openSettings = useChat((s) => s.setSettingsOpen);
  const server = useChat((s) => s.server);
  const ownKey = useOwnKey();
  const lang = useStudio((s) => s.lang);
  const compact = density === 'compact';
  /** "Open settings": the saved key in use (its sheet), else the browser's key settings. */
  const openKeySettings = (el: HTMLElement) => {
    const p = accountKeyInUse();
    if (p) openKeySheet({ mode: 'edit', provider: p }, el);
    else openSettings(true);
  };
  const view = turnView(item);
  const changes = item.changes ?? [];
  const undone = item.undo === 'undone' || item.undo === 'can-redo';
  const step = liveStep(t, item);

  let live: ReactNode = null;
  let final: ReactNode = null;
  if (running) {
    if (compact && !view.calledTools && item.text) {
      // No tool called (yet): the reply streams as before.
      final = <RichText text={item.text} caret />;
    } else if (compact) {
      live = <Progress label={step.label} />;
    } else {
      // The timeline fills in: the text streaming now, or the step under way.
      if (view.final) final = <RichText text={view.final} caret={item.phase === 'writing'} />;
      if (item.phase !== 'writing' || !view.final) live = <div className={view.final || view.timeline.length ? 'mt-2.5' : ''}><Progress label={step.label} /></div>;
    }
  } else if (view.final) {
    final = <RichText text={view.final} />;
  }

  const entries: TurnEntry[] = view.structured
    ? view.timeline.map((e) => (e.type === 'text' ? { type: 'text', content: <RichText text={e.text} /> } : { type: 'change', summary: changes[e.change]?.summary ?? '' }))
    : changes.map((c) => ({ type: 'change', summary: c.summary }));
  const label = changes.length ? (changes.length === 1 ? t('chat.steps1') : t('chat.stepsN', { n: changes.length })) : undefined;

  return (
    <div className="animate-[fade-in_200ms_ease-out]" data-testid="assistant-message" data-phase={item.phase}>
      <Turn
        density={density}
        live={live}
        entries={entries}
        changes={changes.map((c) => c.summary)}
        final={final}
        label={label}
        badge={undone ? <Badge>{t('chat.undone')}</Badge> : undefined}
        defaultOpen={!compact && latest}
        undone={undone}
        extra={<TechDetails item={item} />}
      />
      {item.aborted && <p className="mt-2 text-xs text-ink-3">{t('chat.aborted')}</p>}
      {item.gaveUp && (
        // The same words again would fail the same way: no retry, a next step instead.
        <Note>
          {t('chat.gaveUp')}
          {!!item.lastErrors?.length && <Details label={t('chat.gaveUpDetails')} lines={item.lastErrors.slice(0, 3).map(humanizeValidation)} />}
        </Note>
      )}
      {item.error && (
        <Note
          actions={
            <>
              {item.error.kind === 'quota' && !server?.user && server?.quota?.kind === 'anon' && server.quota.reason !== 'site' && !!(server.auth?.email || server.auth?.google) && (
                // The one primary action for an anonymous visitor: the accent, small (like send).
                <Button variant="accent" size="xs" strong onClick={(e) => openSignIn(e.currentTarget, 'input')} className="mr-1 px-3.5" data-testid="quota-signin">
                  {t('account.signIn')}
                </Button>
              )}
              {item.error.kind === 'quota' && !ownKey && (
                <SmallButton
                  onClick={() => (useKeys.getState().ready ? openKeySheet({ mode: 'add' }, document.querySelector<HTMLElement>('[data-testid=prompt]')) : openSettings(true))}
                  icon={<SlidersIcon width={14} height={14} />}
                >
                  {t('quota.useOwnKey')}
                </SmallButton>
              )}
              {(item.error.kind === 'no-key' || item.error.kind === 'auth') && (
                <SmallButton onClick={() => openKeySettings(document.querySelector<HTMLElement>('[data-testid=prompt]') ?? document.body)} icon={<SlidersIcon width={14} height={14} />}>{t('chat.err.openSettings')}</SmallButton>
              )}
              {/* Retrying cannot help until a key is set, or while no credit is left. */}
              {latest && item.error.kind !== 'no-key' && item.error.kind !== 'auth' && (item.error.kind !== 'quota' || (item.error.code !== 'quota_turn_limit' && (ownKey || (server?.quota?.remaining ?? 0) > 0))) && (
                <SmallButton onClick={() => retry(item.id)} icon={<RetryIcon width={14} height={14} />}>{t('chat.retry')}</SmallButton>
              )}
            </>
          }
        >
          <span data-testid={item.error.kind === 'quota' ? 'quota-note' : undefined}>{errorText(t, item, server, lang)}</span>
        </Note>
      )}
    </div>
  );
}

/** Technical detail behind a disclosure (validator wording, kept out of the main message). */
function Details({ label, lines }: { label: string; lines: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="mt-1 -ml-1 block">
      <Button variant="link" size="xs" onClick={() => setOpen(!open)} aria-expanded={open} icon={<ChevronRightIcon width={13} height={13} className={cx('transition-transform duration-150', open && 'rotate-90')} />} className="px-1 font-normal">
        {label}
      </Button>
      {open && (
        <span className="mt-0.5 block space-y-1 pl-1 text-xs leading-[18px] text-ink-2" lang="en">
          {lines.map((l, i) => (
            <span key={i} className="block">
              {l}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** Validator text without rule codes and quoted internal ids. */
function humanizeValidation(e: string): string {
  return e
    .replace(/^[a-z-]+: /, '')
    .replace(/"[a-z0-9]+(?:[-:][a-z0-9]+)+"/gi, 'it')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Long messages fold after a few lines; a toggle shows the rest. */
const LONG_MESSAGE = 280;

function UserMessage({ item }: { item: ChatItem }) {
  const t = useT();
  const long = item.text.length > LONG_MESSAGE || item.text.split('\n').length > 6;
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start">
      {/* On glass the user's words are a quiet line above the answer (no bubble: no box inside glass). */}
      <p className="text-[14.5px] leading-[23px] font-medium break-words whitespace-pre-wrap text-ink-2" data-testid="user-message">
        {/* Clamped inside the padding, so no half line peeks out. */}
        <span className={cx(long && !open && 'line-clamp-5')}>{item.text}</span>
      </p>
      {long && (
        <Button variant="link" size="xs" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 px-1.5 font-normal">
          {open ? t('chat.showLess') : t('chat.showMore')}
        </Button>
      )}
    </div>
  );
}

function EmptyState({ compact }: { compact?: boolean }) {
  const t = useT();
  const server = useChat((s) => s.server);
  const own = useOwnKey();
  const setSettingsOpen = useChat((s) => s.setSettingsOpen);
  const noKey = server && !server.serverKey && !own;
  return (
    <div className={cx('flex flex-col', compact ? 'gap-3' : 'gap-4 pt-1')}>
      <p className="text-[14.5px] leading-[23px] font-medium text-ink-2">{t('chat.intro')}</p>
      {noKey && (
        <div className="-mt-1">
          <Note actions={<SmallButton onClick={() => setSettingsOpen(true)} icon={<SlidersIcon width={14} height={14} />}>{t('chat.err.openSettings')}</SmallButton>}>{t('chat.err.noKey')}</Note>
        </div>
      )}
      <div>
        <p className="mb-2 text-2xs font-medium tracking-[0.08em] text-ink-3 uppercase">{t('chat.try')}</p>
        <div className="flex flex-col items-start gap-1.5" data-testid="suggestions">
          {SUGGESTIONS.map((k) => (
            <Button key={k} variant="plain" size="sm" onClick={() => void send(t(k))} icon={<SparkIcon width={14} height={14} className="shrink-0 text-ink-3" />} className="h-auto max-w-full justify-start gap-2 py-1.5 pr-3 pl-2.5 text-left text-[13.5px] leading-5">
              <span className="truncate">{t(k)}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}


/** A change the user made in the studio (place, orientation, template): a quiet line with undo. */
function ManualEdit({ item }: { item: ChatItem }) {
  const c = item.changes?.[0];
  if (!c) return null;
  const undone = item.undo === 'undone' || item.undo === 'can-redo';
  return (
    <div className="flex items-center justify-center gap-1 text-xs text-ink-2" data-testid="manual-edit">
      <PlanCheckIcon width={14} height={14} className={undone ? 'text-ink-3' : 'text-ink'} />
      <span className={cx('truncate', undone && 'line-through decoration-ink-3')}>{c.summary}</span>
    </div>
  );
}

/** The conversation (from item `from`); `spacer` leaves room under the newest message so it can sit at the top. */
function MessageList({ className, from = 0, spacer = true, density }: { className?: string; from?: number; spacer?: boolean; density: 'compact' | 'full' }) {
  const all = useChat((s) => s.items);
  const items = from ? all.slice(from) : all;
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const users = useRef(-1);
  // A new message of the user moves to the top of the list (never under the
  // header) and the reply grows below it; otherwise follow the stream while
  // the user is at the bottom.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const n = items.filter((i) => i.role === 'user').length;
    const first = users.current < 0;
    const fresh = !first && n > users.current;
    users.current = n;
    if (first) {
      // Opened (strip, pinned sheet): the last exchange is read from its
      // start, never with its first message cut under the header.
      const msgs = el.querySelectorAll<HTMLElement>('[data-testid=user-message]');
      const last = msgs[msgs.length - 1]?.closest<HTMLElement>('[data-msg]');
      el.scrollTop = last ? Math.max(0, last.offsetTop - 12) : 0;
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      return;
    }
    if (fresh) {
      const msgs = el.querySelectorAll<HTMLElement>('[data-testid=user-message]');
      const last = msgs[msgs.length - 1]?.closest<HTMLElement>('[data-msg]');
      if (last) {
        el.scrollTop = Math.max(0, last.offsetTop - 16);
        stick.current = false;
        return;
      }
    }
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [items]);
  const lastAssistant = [...items].reverse().find((i) => i.role === 'assistant' && !i.manual)?.id;
  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className={cx('relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-4', className)}
      tabIndex={-1}
      aria-live="polite"
      data-testid="messages"
    >
      {!items.length ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((it) => (
            <div key={it.id} data-msg className="scroll-mt-4">
              {it.role === 'user' ? <UserMessage item={it} /> : it.manual ? <ManualEdit item={it} /> : <AssistantMessage item={it} latest={it.id === lastAssistant} density={density} />}
            </div>
          ))}
          {/* Room below the newest message, so it can sit at the top while the reply arrives. */}
          {spacer && <div className="h-[30vh] shrink-0" aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The input                                                           */
/* ------------------------------------------------------------------ */

/** Index of the last exchange: from the last message of the user (or the last few studio edits). */
function lastExchangeStart(items: ChatItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) if (items[i]!.role === 'user') return i;
  return Math.max(0, items.length - 3);
}

function LinkButton({ onClick, icon, children, testId, className }: { onClick: () => void; icon?: ReactNode; children: ReactNode; testId?: string; className?: string }) {
  return (
    <Button variant="plain" size="sm" onClick={onClick} icon={icon} data-testid={testId} className={cx('gap-[5px]', className)}>
      {children}
    </Button>
  );
}

/**
 * The last exchange and its changes card (with undo), translucent above the
 * input: 80% white, no blur, at most ~35% of the screen height. "See all"
 * pins the conversation.
 */
export function RecentStrip({ phone, className }: { phone?: boolean; className?: string }) {
  const t = useT();
  const items = useChat((s) => s.items);
  const setRecent = useStudio((s) => s.setRecent);
  const setPinned = useStudio((s) => s.setPinned);
  const rounds = items.filter((i) => i.role === 'user').length;
  useEffect(() => {
    void loadAgent();
  }, []);
  return (
    <TextSurface
      as="section"
      id="recent-strip"
      aria-label={t('chat.recent')}
      className={cx('flex animate-[strip-rise_220ms_cubic-bezier(0.22,0.8,0.24,1)] flex-col overflow-hidden', phone ? 'max-h-[42vh]' : 'max-h-[35vh]', className)}
      data-testid="recent-strip"
    >
      <header className="flex h-[46px] shrink-0 items-center gap-1.5 pr-2 pl-5">
        <h2 className="text-[13px] font-semibold text-ink-2">{t('chat.recent')}</h2>
        <span className="flex-1" />
        <KeyPicker variant="header" phone={phone} />
        <LinkButton onClick={() => setPinned(true)} icon={<DockIcon width={14} height={14} />} testId="chat-pin">
          {phone ? t('chat.pinPhone') : t('chat.pin')}
        </LinkButton>
        <Button variant="quiet" size="sm" onClick={() => setRecent(false)} label={t('chat.historyClose')} icon={<ChevronDownIcon width={16} height={16} />} />
      </header>
      <MessageList density="compact" from={items.length ? lastExchangeStart(items) : 0} spacer={false} className="px-5 pt-0.5 pb-4" />
      {rounds > 1 && (
        <div className="shrink-0 px-2.5 pb-2.5">
          <LinkButton onClick={() => setPinned(true)} testId="chat-view-all">
            {t('chat.viewAll', { n: rounds })}
            <ChevronRightIcon width={14} height={14} />
          </LinkButton>
        </div>
      )}
    </TextSurface>
  );
}

/* ------------------------------------------------------------------ */
/* Pinned conversation                                                 */
/* ------------------------------------------------------------------ */

function ConversationHeader({ phone }: { phone?: boolean }) {
  const t = useT();
  const hasItems = useChat((s) => s.items.length > 0);
  const setPinned = useStudio((s) => s.setPinned);
  return (
    <header className={cx('flex shrink-0 items-center gap-1.5', phone ? 'h-10 pr-2 pl-4' : 'h-11 pr-2 pl-6')}>
      <SparkIcon accent width={15} height={15} className="shrink-0" />
      <h2 className="truncate text-[13px] font-medium">{t('chat.title')}</h2>
      <span className="flex-1" />
      {hasItems && (
        <IconButton label={t('chat.newChat')} onClick={newChat}>
          <ComposeIcon width={16} height={16} />
        </IconButton>
      )}
      <LinkButton onClick={() => setPinned(false)} icon={<UndockIcon width={16} height={16} />} testId="chat-unpin">
        {t('chat.unpin')}
      </LinkButton>
    </header>
  );
}

/**
 * Desktop: the conversation pinned as a column on the left, hanging under
 * the house name (the studio places it), with the input at its foot. A
 * menu or panel opened over it makes it step aside (fades out, inert), the
 * glass module's one rule for what lies under an open surface.
 */
export function PinnedColumn({ style }: { style: CSSProperties }) {
  const t = useT();
  const settingsOpen = useChat((s) => s.settingsOpen);
  useEffect(() => {
    void loadAgent();
  }, []);
  return (
    <TextSurface
      as="aside"
      aria-label={t('chat.title')}
      className="absolute flex animate-[fade-in_200ms_ease-out] flex-col overflow-hidden"
      style={style}
      stepAside
      data-testid="chat-panel"
    >
      {settingsOpen ? (
        <Suspense fallback={null}>
          <SettingsSheet />
        </Suspense>
      ) : (
        <>
          <ConversationHeader />
          {/* The module's hairline, inset from both edges (task 023), not a rule across the glass. */}
          <div className="shrink-0 px-3">
            <Separator />
          </div>
          <MessageList density="full" className="px-6 pt-4" />
          <div className="shrink-0 p-2">
            <ChatInput pinned />
          </div>
        </>
      )}
    </TextSurface>
  );
}

/** Phone: the pinned conversation as the content of the half-height sheet (the input inside it). */
export function PinnedChat() {
  const t = useT();
  useEffect(() => {
    void loadAgent();
  }, []);
  return (
    <section aria-label={t('chat.title')} className="flex min-h-0 flex-1 flex-col" data-testid="chat-panel">
      <ConversationHeader phone />
      <MessageList density="full" className="px-4 pt-1" spacer={false} />
      <div className="shrink-0 px-3 pt-1.5 pb-[max(12px,env(safe-area-inset-bottom))]">
        <ChatInput phone pinned />
      </div>
    </section>
  );
}
