// The AI assistant. The prompt bar at the bottom is the studio's primary
// action; the conversation opens from it: a panel on the left (desktop), a
// sheet above the bar (phone).
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRightIcon, SendIcon, SparkIcon } from '../components/icons';
import { cx, IconButton } from '../components/ui';
import { type MessageKey, useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import { type ChatItem, fetchServerStatus, loadAgent, newChat, redoTurn, retry, send, stop, undoTurn, useChat } from './chat-store';
import { ChevronDownIcon, ComposeIcon, NoteIcon, PlanCheckIcon, RedoIcon, RetryIcon, SlidersIcon, StopIcon, UndoIcon } from './icons';
import { usesOwnKey } from './settings';
import { SettingsSheet } from './SettingsSheet';

const SUGGESTIONS: MessageKey[] = ['chat.s1', 'chat.s2', 'chat.s3', 'chat.s4'];

/* ------------------------------------------------------------------ */
/* Message content                                                     */
/* ------------------------------------------------------------------ */

/** Inline **bold**; everything else is plain text (no HTML from the model). */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part));
}

/** Paragraphs and simple "- " / "1. " lists, the only formatting the assistant needs. */
function RichText({ text, caret }: { text: string; caret?: boolean }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/).filter((b) => b.trim());
  return (
    <div className="space-y-2 text-[13.5px] leading-[1.6] break-words text-ink">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        const last = i === blocks.length - 1;
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="space-y-1">
              {lines.map((l, k) => (
                <li key={k} className="relative pl-3.5 before:absolute before:top-[0.7em] before:left-0.5 before:size-1 before:rounded-full before:bg-ink-3">
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

/** One quiet status line with a sweeping hairline (same language as the loaders). */
function Progress({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-xs text-ink-2" role="status">
      <span className="relative h-px w-8 overflow-hidden bg-hairline">
        <span className="absolute inset-y-0 left-0 w-2/5 animate-[progress-sweep_1.2s_cubic-bezier(0.6,0,0.4,1)_infinite] bg-ink" />
      </span>
      {label}
    </div>
  );
}

function ChangesCard({ item }: { item: ChatItem }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const changes = item.changes ?? [];
  if (!changes.length) return null;
  const undone = item.undo === 'undone' || item.undo === 'can-redo';
  return (
    <div className={cx('mt-3 overflow-hidden rounded-sm border border-hairline bg-white', undone && 'opacity-70')} data-testid="changes-card">
      <div className="flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
          <PlanCheckIcon width={15} height={15} className={undone ? 'text-ink-3' : 'text-ink'} />
          {t('chat.changes')}
          <span className="tnum text-ink-3">{changes.length}</span>
          {undone && <span className="rounded-[5px] bg-wash px-1.5 py-px text-2xs font-normal text-ink-2">{t('chat.undone')}</span>}
        </p>
        <div className="flex items-center">
          {item.undo === 'can-undo' && (
            <SmallButton onClick={() => undoTurn(item.id)} icon={<UndoIcon width={15} height={15} />}>
              {t('chat.undo')}
            </SmallButton>
          )}
          {item.undo === 'can-redo' && (
            <SmallButton onClick={() => redoTurn(item.id)} icon={<RedoIcon width={15} height={15} />}>
              {t('chat.redo')}
            </SmallButton>
          )}
        </div>
      </div>
      <ul className="border-t border-hairline px-3 py-2">
        {changes.map((c, i) => (
          <li key={i} className={cx('relative py-0.5 pl-3.5 text-[13px] leading-5', undone ? 'text-ink-2 line-through decoration-ink-3' : 'text-ink')}>
            <span className="absolute top-[9px] left-0.5 size-1.5 rounded-full bg-accent" aria-hidden="true" />
            {c.summary}
          </li>
        ))}
      </ul>
      {changes.some((c) => c.details.length) && (
        <div className="border-t border-hairline">
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-7 w-full items-center gap-1 px-3 text-2xs text-ink-3 transition-colors hover:text-ink-2">
            <ChevronRightIcon width={13} height={13} className={cx('transition-transform duration-150', open && 'rotate-90')} />
            {t('chat.details')}
          </button>
          {open && (
            <ul className="max-h-40 space-y-1 overflow-auto px-3 pb-2.5 font-mono text-[11px] leading-4 text-ink-2" lang="en">
              {changes.flatMap((c) => c.details).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SmallButton({ onClick, icon, children, className }: { onClick: () => void; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-xs font-medium text-ink transition-colors hover:bg-wash', className)}
    >
      {icon}
      {children}
    </button>
  );
}

/** Calm inline note for errors and the give-up case, with the next step. */
function Note({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mt-3 rounded-sm bg-wash px-3 py-2.5" role="note">
      <p className="flex gap-2 text-[13px] leading-5 text-ink">
        <NoteIcon width={16} height={16} className="mt-0.5 shrink-0 text-ink-2" />
        <span>{children}</span>
      </p>
      {actions && <div className="mt-1.5 -mb-1 ml-5 flex flex-wrap gap-1">{actions}</div>}
    </div>
  );
}

function errorText(t: ReturnType<typeof useT>, item: ChatItem): string {
  const e = item.error!;
  switch (e.kind) {
    case 'no-key': return t('chat.err.noKey');
    case 'auth': return t('chat.err.auth');
    case 'rate-limit': return t('chat.err.rateLimit');
    case 'upstream': return t('chat.err.upstream', { status: e.status ?? '?' });
    default: return t('chat.err.network');
  }
}

function AssistantMessage({ item, latest }: { item: ChatItem; latest: boolean }) {
  const t = useT();
  const running = item.phase !== 'done';
  const openSettings = useChat((s) => s.setSettingsOpen);
  const progress = item.phase === 'repairing' ? t('chat.repairing') : item.phase === 'working' ? t('chat.working') : t('chat.thinking');
  return (
    <div className="animate-[fade-in_200ms_ease-out]" data-testid="assistant-message" data-phase={item.phase}>
      {(item.text || running) && <RichText text={item.text} caret={running && !!item.text} />}
      {running && (!item.text || item.phase !== 'thinking') && <div className={item.text ? 'mt-2.5' : ''}><Progress label={progress} /></div>}
      <ChangesCard item={item} />
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
              {(item.error.kind === 'no-key' || item.error.kind === 'auth') && (
                <SmallButton onClick={() => openSettings(true)} icon={<SlidersIcon width={14} height={14} />}>{t('chat.err.openSettings')}</SmallButton>
              )}
              {/* Retrying cannot help until a key is set. */}
              {latest && item.error.kind !== 'no-key' && item.error.kind !== 'auth' && (
                <SmallButton onClick={() => retry(item.id)} icon={<RetryIcon width={14} height={14} />}>{t('chat.retry')}</SmallButton>
              )}
            </>
          }
        >
          {errorText(t, item)}
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
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1 rounded-[6px] px-1 text-xs text-ink-2 transition-colors hover:text-ink"
      >
        <ChevronRightIcon width={13} height={13} className={cx('transition-transform duration-150', open && 'rotate-90')} />
        {label}
      </button>
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
    <div className="flex flex-col items-end">
      <p className="max-w-[85%] rounded-[12px] rounded-br-[4px] bg-ink px-3 py-2 text-[13.5px] leading-[1.5] break-words whitespace-pre-wrap text-white" data-testid="user-message">
        {/* Clamped inside the padding, so no half line peeks out. */}
        <span className={cx(long && !open && 'line-clamp-5')}>{item.text}</span>
      </p>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 h-7 rounded-[6px] px-1.5 text-xs text-ink-2 transition-colors hover:text-ink">
          {open ? t('chat.showLess') : t('chat.showMore')}
        </button>
      )}
    </div>
  );
}

function EmptyState({ compact }: { compact?: boolean }) {
  const t = useT();
  const server = useChat((s) => s.server);
  const settings = useChat((s) => s.settings);
  const setSettingsOpen = useChat((s) => s.setSettingsOpen);
  const noKey = server && !server.serverKey && !usesOwnKey(settings);
  return (
    <div className={cx('flex flex-col', compact ? 'gap-3' : 'gap-4 pt-1')}>
      <p className="text-[13.5px] leading-[1.6] text-ink-2">{t('chat.intro')}</p>
      {noKey && (
        <div className="-mt-1">
          <Note actions={<SmallButton onClick={() => setSettingsOpen(true)} icon={<SlidersIcon width={14} height={14} />}>{t('chat.err.openSettings')}</SmallButton>}>{t('chat.err.noKey')}</Note>
        </div>
      )}
      <div>
        <p className="mb-2 text-2xs font-medium tracking-[0.08em] text-ink-3 uppercase">{t('chat.try')}</p>
        <div className="flex flex-col items-start gap-1.5" data-testid="suggestions">
          {SUGGESTIONS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => void send(t(k))}
              className="group inline-flex max-w-full items-center gap-2 rounded-full border border-hairline bg-white py-1.5 pr-3 pl-2.5 text-left text-[13px] leading-5 text-ink transition-colors hover:border-ink-3 hover:bg-wash"
            >
              <SparkIcon width={14} height={14} className="shrink-0 text-ink-3 transition-colors group-hover:text-ink" />
              <span className="truncate">{t(k)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


/** A change the user made in the studio (place, orientation, template): a quiet line with undo. */
function ManualEdit({ item }: { item: ChatItem }) {
  const t = useT();
  const c = item.changes?.[0];
  if (!c) return null;
  const undone = item.undo === 'undone' || item.undo === 'can-redo';
  return (
    <div className="flex items-center justify-center gap-1 text-xs text-ink-2" data-testid="manual-edit">
      <PlanCheckIcon width={14} height={14} className={undone ? 'text-ink-3' : 'text-ink'} />
      <span className={cx('truncate', undone && 'line-through decoration-ink-3')}>{c.summary}</span>
      {item.undo === 'can-undo' && <SmallButton onClick={() => undoTurn(item.id)} icon={<UndoIcon width={14} height={14} />}>{t('chat.undo')}</SmallButton>}
      {item.undo === 'can-redo' && <SmallButton onClick={() => redoTurn(item.id)} icon={<RedoIcon width={14} height={14} />}>{t('chat.redo')}</SmallButton>}
    </div>
  );
}

function MessageList({ className }: { className?: string }) {
  const items = useChat((s) => s.items);
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
    const fresh = users.current >= 0 && n > users.current;
    users.current = n;
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
      aria-live="polite"
      data-testid="messages"
    >
      {!items.length ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((it) => (
            <div key={it.id} data-msg className="scroll-mt-4">
              {it.role === 'user' ? <UserMessage item={it} /> : it.manual ? <ManualEdit item={it} /> : <AssistantMessage item={it} latest={it.id === lastAssistant} />}
            </div>
          ))}
          {/* Room below the newest message, so it can sit at the top while the reply arrives. */}
          <div className="h-[30vh] shrink-0" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/**
 * The prompt: Enter sends (not while an IME is composing), Shift+Enter breaks
 * the line, Escape gives the drawing back. The text lives in the chat store,
 * so it survives the move between the bar and the panel.
 */
function Composer({ autoFocus, onSent, onEscape, onFocus, className, bar, testId = 'chat-input' }: {
  autoFocus?: boolean; onSent?: () => void; onEscape?: () => void; onFocus?: () => void; className?: string; bar?: boolean; testId?: string;
}) {
  const t = useT();
  const running = useChat((s) => s.running);
  const text = useChat((s) => s.draft);
  const setText = useChat((s) => s.setDraft);
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [text]);
  useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    el?.focus({ preventScroll: true });
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (running || !text.trim()) return;
    void send(text);
    setText('');
    onSent?.();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      onEscape();
    }
  };
  const can = !!text.trim() && !running;
  return (
    <form
      onSubmit={submit}
      className={cx(
        'flex items-end gap-2 bg-white transition-[border-color,box-shadow] duration-150',
        bar ? 'min-h-12 rounded-[24px] py-[7px] pr-[7px] pl-4' : 'rounded-[16px] border border-hairline py-1.5 pr-1.5 pl-3 focus-within:border-ink-3',
        className,
      )}
    >
      {bar && <SparkIcon accent width={19} height={19} className="mb-[7px] shrink-0" />}
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onFocus={onFocus}
        placeholder={t('prompt.placeholder')}
        aria-label={t('chat.placeholder')}
        className="max-h-[120px] min-h-[34px] flex-1 resize-none bg-transparent py-[7px] text-[15px] leading-5 outline-none placeholder:text-ink-3 [&:focus-visible]:outline-none"
        data-testid={testId}
      />
      {running ? (
        <button type="button" onClick={stop} aria-label={t('chat.stop')} className="grid size-[34px] shrink-0 place-items-center rounded-full bg-ink text-white transition-opacity hover:opacity-85">
          <StopIcon width={16} height={16} />
        </button>
      ) : (
        (can || !bar) && (
          <button
            type="submit"
            disabled={!can}
            aria-label={t('chat.send')}
            className={cx('grid size-[34px] shrink-0 animate-[fade-in_120ms_ease-out] place-items-center rounded-full transition-colors duration-150', can ? 'bg-accent text-ink hover:brightness-95' : 'bg-wash text-ink-3')}
            data-testid="chat-send"
          >
            <SendIcon width={17} height={17} />
          </button>
        )
      )}
    </form>
  );
}

function useStatusOnOpen() {
  useEffect(() => {
    void fetchServerStatus();
    // Warm the agent chunk while the user types.
    void loadAgent();
  }, []);
}

function PanelHeader({ onClose, closeLabel, closeIcon, leading }: { onClose: () => void; closeLabel: string; closeIcon: ReactNode; leading?: ReactNode }) {
  const t = useT();
  const hasItems = useChat((s) => s.items.length > 0);
  const setSettingsOpen = useChat((s) => s.setSettingsOpen);
  return (
    <header className="flex h-12 shrink-0 items-center justify-between pr-1.5 pl-4">
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        <SparkIcon accent width={18} height={18} className="shrink-0" />
        <h2 className="truncate text-sm font-semibold">{t('chat.title')}</h2>
      </div>
      <div className="flex items-center">
        {hasItems && (
          <IconButton label={t('chat.newChat')} tipSide="bottom" onClick={newChat} className="size-9">
            <ComposeIcon width={18} height={18} />
          </IconButton>
        )}
        <IconButton label={t('chat.settings')} tipSide="bottom" onClick={() => setSettingsOpen(true)} className="size-9" data-testid="chat-settings">
          <SlidersIcon width={18} height={18} />
        </IconButton>
        <IconButton label={closeLabel} tipSide="bottom" onClick={onClose} className="size-9" data-testid="chat-collapse">
          {closeIcon}
        </IconButton>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* The prompt bar (collapsed conversation)                             */
/* ------------------------------------------------------------------ */

/** The newest assistant turn or studio edit. */
function useLast(): ChatItem | undefined {
  return useChat((s) => {
    for (let i = s.items.length - 1; i >= 0; i--) if (s.items[i]!.role === 'assistant') return s.items[i];
    return undefined;
  });
}

/** One line about the latest turn: progress, the last change with undo / redo, or the problem. */
function BarSummary({ item, onOpen }: { item: ChatItem; onOpen: () => void }) {
  const t = useT();
  const running = item.phase !== 'done';
  const n = item.changes?.length ?? 0;
  const undone = item.undo === 'undone' || item.undo === 'can-redo';
  let line: ReactNode = null;
  if (running) line = <Progress label={item.phase === 'repairing' ? t('chat.repairing') : item.phase === 'working' ? t('chat.working') : t('chat.thinking')} />;
  else if (item.error || item.gaveUp) line = <span className="truncate text-ink-2">{item.gaveUp ? t('chat.gaveUp') : errorText(t, item)}</span>;
  else if (n) {
    line = (
      <span className="flex min-w-0 items-center gap-1.5">
        <PlanCheckIcon width={16} height={16} className={cx('shrink-0', undone ? 'text-ink-3' : 'text-ink')} />
        <span className={cx('truncate', undone ? 'text-ink-2 line-through decoration-ink-3' : 'text-ink')}>{item.changes![n - 1]!.summary}</span>
        {n > 1 && <span className="tnum shrink-0 text-ink-3">+{n - 1}</span>}
      </span>
    );
  } else if (item.text) line = <span className="truncate text-ink-2">{item.text.replace(/\*\*/g, '').split('\n')[0]}</span>;
  if (!line) return null;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1" data-testid="bar-summary">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-2 text-left text-[14px]" aria-label={t('chat.peek')}>
        {line}
      </button>
      {!running && item.undo === 'can-undo' && (
        <SmallButton onClick={() => undoTurn(item.id)} icon={<UndoIcon width={15} height={15} />} className="h-[34px] rounded-full px-3">
          {t('chat.undo')}
        </SmallButton>
      )}
      {!running && item.undo === 'can-redo' && (
        <SmallButton onClick={() => redoTurn(item.id)} icon={<RedoIcon width={15} height={15} />} className="h-[34px] rounded-full px-3">
          {t('chat.redo')}
        </SmallButton>
      )}
      {running && (
        <button type="button" onClick={stop} aria-label={t('chat.stop')} className="grid size-[34px] shrink-0 place-items-center rounded-full bg-ink text-white">
          <StopIcon width={16} height={16} />
        </button>
      )}
    </div>
  );
}

/**
 * The primary action: a calm bar at the bottom. Focusing it opens the
 * conversation (desktop: the panel on the left, which takes the prompt
 * along; phone: a sheet above the bar, which stays the input). Collapsed,
 * it shows a one-line summary of the last change with undo.
 */
export function PromptBar({ compact, className }: { compact?: boolean; className?: string }) {
  const open = useStudio((s) => s.chatOpen);
  const setOpen = useStudio((s) => s.setChatOpen);
  const draft = useChat((s) => s.draft);
  const last = useLast();
  const [typing, setTyping] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  // While collapsed with an empty prompt, the bar recaps the last turn.
  const recap = !!last && !draft && !typing && !(compact && open) && (last.phase !== 'done' || !!last.changes?.length || !!last.error || !!last.gaveUp);
  const openChat = () => {
    setOpen(true);
    if (compact) setTyping(true);
  };
  useEffect(() => {
    if (!typing || !compact) return;
    wrap.current?.querySelector('textarea')?.focus({ preventScroll: true });
  }, [typing, compact]);
  return (
    <div
      ref={wrap}
      className={cx('pointer-events-auto relative rounded-[24px] bg-white shadow-[0_10px_34px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] transition-shadow focus-within:shadow-[0_10px_34px_rgba(0,0,0,0.14),0_0_0_1.5px_var(--color-ink-3)]', className)}
      data-testid="prompt"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setTyping(false);
      }}
    >
      {recap ? (
        <div className="flex min-h-12 items-center gap-2 py-[7px] pr-[7px] pl-4">
          <SparkIcon accent width={19} height={19} className="shrink-0" />
          <BarSummary item={last!} onOpen={openChat} />
        </div>
      ) : (
        <Composer
          bar
          testId="prompt-bar"
          onFocus={() => {
            setTyping(true);
            // Desktop: the panel takes the prompt along (and its focus).
            if (!open) setOpen(true);
          }}
          onEscape={() => {
            setOpen(false);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
          onSent={() => {
            // Phone: give the drawing back so the house can be seen growing.
            if (compact) {
              setOpen(false);
              setTyping(false);
              (document.activeElement as HTMLElement | null)?.blur();
            }
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop                                                             */
/* ------------------------------------------------------------------ */

/** The conversation, docked on the left; the prompt bar moves into its foot. */
export function DesktopChat() {
  const t = useT();
  const open = useStudio((s) => s.chatOpen);
  const setOpen = useStudio((s) => s.setChatOpen);
  const settingsOpen = useChat((s) => s.settingsOpen);
  if (!open) return null;
  return <DesktopPanel onClose={() => setOpen(false)} settingsOpen={settingsOpen} label={t('chat.title')} />;
}

function DesktopPanel({ onClose, settingsOpen, label }: { onClose: () => void; settingsOpen: boolean; label: string }) {
  const t = useT();
  useStatusOnOpen();
  return (
    <section
      aria-label={label}
      className="glass-solid pointer-events-auto absolute top-[92px] bottom-6 left-6 flex w-[380px] animate-[tray-in_180ms_cubic-bezier(0.22,0.8,0.24,1)] flex-col overflow-hidden rounded-[16px]"
      data-testid="chat-panel"
    >
      <PanelHeader onClose={onClose} closeLabel={t('prompt.collapse')} closeIcon={<ChevronDownIcon width={19} height={19} />} />
      <div className="h-px shrink-0 bg-hairline" />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <MessageList />
        <div className="shrink-0 px-3 pb-3">
          <Composer autoFocus onEscape={onClose} />
          <p className="mt-1.5 text-center text-2xs text-ink-3">{t('chat.footer')}</p>
        </div>
        {settingsOpen && <SettingsSheet />}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Phone                                                               */
/* ------------------------------------------------------------------ */

/** The conversation as a sheet above the prompt bar (which stays the input). */
export function MobileChat({ top, bottom }: { top: string; bottom: number }) {
  const t = useT();
  const open = useStudio((s) => s.chatOpen);
  const setOpen = useStudio((s) => s.setChatOpen);
  const settingsOpen = useChat((s) => s.settingsOpen);
  // Sending (a suggestion, or the bar) gives the drawing back: the house is seen changing, the bar shows progress.
  useEffect(
    () =>
      useChat.subscribe((s, p) => {
        if (s.running && !p.running) useStudio.getState().setChatOpen(false);
      }),
    [],
  );
  if (!open) return null;
  return (
    <>
      <div className="absolute inset-0 z-20 animate-[fade-in_160ms_ease-out] bg-black/10" onClick={() => setOpen(false)} aria-hidden="true" />
      <MobileStatus />
      <section
        aria-label={t('chat.title')}
        data-testid="chat-panel"
        className="absolute inset-x-2 z-30 flex animate-[tray-in_180ms_cubic-bezier(0.22,0.8,0.24,1)] flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        style={{ top, bottom }}
      >
        <PanelHeader onClose={() => setOpen(false)} closeLabel={t('prompt.collapse')} closeIcon={<ChevronDownIcon width={19} height={19} />} />
        <div className="h-px shrink-0 bg-hairline" />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <MessageList />
          {settingsOpen && <SettingsSheet />}
        </div>
      </section>
    </>
  );
}

/** Loads the relay status once the phone chat opens. */
function MobileStatus() {
  useStatusOnOpen();
  return null;
}
