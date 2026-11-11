// The AI assistant: docked panel in the left rail (desktop), full-height
// sheet with a peek state over the drawing (phone).
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRightIcon, CloseIcon, SendIcon, SparkIcon } from '../components/icons';
import { cx, IconButton } from '../components/ui';
import { type MessageKey, useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import { type ChatItem, fetchServerStatus, loadAgent, newChat, redoTurn, retry, send, stop, undoTurn, useChat } from './chat-store';
import { ChevronUpIcon, ComposeIcon, NoteIcon, PlanCheckIcon, RedoIcon, RetryIcon, SlidersIcon, StopIcon, UndoIcon } from './icons';
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

function MessageList({ className }: { className?: string }) {
  const items = useChat((s) => s.items);
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // Follow the stream while the user is at the bottom.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items]);
  const lastAssistant = [...items].reverse().find((i) => i.role === 'assistant')?.id;
  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4', className)}
      aria-live="polite"
      data-testid="messages"
    >
      {!items.length ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((it) => (it.role === 'user' ? <UserMessage key={it.id} item={it} /> : <AssistantMessage key={it.id} item={it} latest={it.id === lastAssistant} />))}
        </div>
      )}
    </div>
  );
}

/** Message box: Enter sends (not while an IME is composing), Shift+Enter breaks the line. */
function Composer({ autoFocus, onSent, className }: { autoFocus?: boolean; onSent?: () => void; className?: string }) {
  const t = useT();
  const running = useChat((s) => s.running);
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [text]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
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
    }
  };
  const can = !!text.trim() && !running;
  return (
    <form onSubmit={submit} className={cx('flex items-end gap-2 rounded-[12px] border border-hairline bg-white py-1.5 pr-1.5 pl-3 transition-colors focus-within:border-ink-3', className)}>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder={t('chat.placeholder')}
        aria-label={t('chat.placeholder')}
        className="max-h-[120px] min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[14px] leading-5 outline-none placeholder:text-ink-3 [&:focus-visible]:outline-none"
        data-testid="chat-input"
      />
      {running ? (
        <button type="button" onClick={stop} aria-label={t('chat.stop')} className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-ink text-white transition-opacity hover:opacity-85">
          <StopIcon width={16} height={16} />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!can}
          aria-label={t('chat.send')}
          className={cx('grid size-8 shrink-0 place-items-center rounded-[8px] transition-colors duration-150', can ? 'bg-accent text-ink hover:brightness-95' : 'bg-wash text-ink-3')}
          data-testid="chat-send"
        >
          <SendIcon width={17} height={17} />
        </button>
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
        <IconButton label={closeLabel} tipSide="bottom" onClick={onClose} className="size-9">
          {closeIcon}
        </IconButton>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop                                                             */
/* ------------------------------------------------------------------ */

function DesktopPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const settingsOpen = useChat((s) => s.settingsOpen);
  useStatusOnOpen();
  return (
    <section
      aria-label={t('chat.title')}
      className="glass-solid pointer-events-auto absolute top-[184px] bottom-[92px] left-6 flex w-[360px] animate-[fade-in_160ms_ease-out] flex-col overflow-hidden rounded-ui"
      data-testid="chat-panel"
    >
      <PanelHeader onClose={onClose} closeLabel={t('chat.close')} closeIcon={<CloseIcon width={18} height={18} />} />
      <div className="h-px shrink-0 bg-hairline" />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <MessageList />
        <div className="shrink-0 px-3 pb-3">
          <Composer autoFocus />
          <p className="mt-1.5 text-center text-2xs text-ink-3">{t('chat.footer')}</p>
        </div>
        {settingsOpen && <SettingsSheet />}
      </div>
    </section>
  );
}

export function ChatRail() {
  const t = useT();
  const open = useStudio((s) => s.chatOpen);
  const setOpen = useStudio((s) => s.setChatOpen);
  if (open) return <DesktopPanel onClose={() => setOpen(false)} />;
  return (
    <div className="absolute top-1/2 left-6 -translate-y-1/2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('chat.open')}
        aria-expanded={false}
        className="glass group pointer-events-auto flex w-[52px] flex-col items-center gap-1.5 rounded-ui pt-3.5 pb-3 text-ink transition-colors hover:bg-white"
      >
        <SparkIcon accent width={22} height={22} className="transition-transform duration-300 ease-out-soft group-hover:rotate-12" />
        <span className="text-xs font-medium text-ink-2 group-hover:text-ink">{t('chat.rail')}</span>
        <ChevronRightIcon width={16} height={16} className="mt-1 text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Phone                                                               */
/* ------------------------------------------------------------------ */

const lastParagraph = (text: string) => text.replace(/\*\*/g, '').trim().split(/\n{2,}/).pop() ?? '';

/** Undo / redo of the latest turn, for the peek strip. */
function PeekUndo() {
  const t = useT();
  const items = useChat((s) => s.items);
  const running = useChat((s) => s.running);
  const last = [...items].reverse().find((i) => i.role === 'assistant');
  if (!last || running) return null;
  if (last.undo === 'can-undo') return <SmallButton onClick={() => undoTurn(last.id)} icon={<UndoIcon width={15} height={15} />} className="h-9">{t('chat.undo')}</SmallButton>;
  if (last.undo === 'can-redo') return <SmallButton onClick={() => redoTurn(last.id)} icon={<RedoIcon width={15} height={15} />} className="h-9">{t('chat.redo')}</SmallButton>;
  return null;
}

/** Latest assistant line for the peek strip. */
function PeekLine() {
  const t = useT();
  const items = useChat((s) => s.items);
  const last = [...items].reverse().find((i) => i.role === 'assistant');
  if (!last) return <p className="truncate text-[13px] text-ink-2">{t('chat.intro')}</p>;
  const running = last.phase !== 'done';
  const n = last.changes?.length ?? 0;
  return (
    <div className="min-w-0 space-y-1.5">
      {running && <Progress label={last.phase === 'repairing' ? t('chat.repairing') : last.phase === 'working' ? t('chat.working') : t('chat.thinking')} />}
      {last.text && <p className="line-clamp-2 text-[13px] leading-5 text-ink">{lastParagraph(last.text)}</p>}
      {!running && n > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-ink-2">
          <PlanCheckIcon width={14} height={14} className="text-ink" />
          {last.changes![n - 1]!.summary}
          {n > 1 && <span className="tnum text-ink-3">+{n - 1}</span>}
          {(last.undo === 'undone' || last.undo === 'can-redo') && <span className="rounded-[5px] bg-wash px-1.5 py-px text-2xs">{t('chat.undone')}</span>}
        </p>
      )}
      {!running && (last.error || last.gaveUp) && <p className="truncate text-xs text-ink-2">{last.gaveUp ? t('chat.gaveUp') : errorText(t, last)}</p>}
    </div>
  );
}

export function MobileChat() {
  const t = useT();
  const open = useStudio((s) => s.chatOpen);
  const setOpen = useStudio((s) => s.setChatOpen);
  const sheet = useChat((s) => s.sheet);
  const setSheet = useChat((s) => s.setSheet);
  const settingsOpen = useChat((s) => s.settingsOpen);
  if (!open) return null;
  const full = sheet === 'full';
  return (
    <>
      {full && <div className="absolute inset-0 z-30 animate-[fade-in_160ms_ease-out] bg-black/10" onClick={() => setSheet('peek')} aria-hidden="true" />}
      <MobileStatus />
      <section
        aria-label={t('chat.title')}
        data-testid="chat-panel"
        data-sheet={sheet}
        className={cx(
          'absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[14px] border-t border-hairline bg-white shadow-[0_-6px_24px_rgba(0,0,0,0.08)]',
          full ? 'top-[calc(max(4px,env(safe-area-inset-top))+40px)]' : '',
        )}
      >
        <button
          type="button"
          onClick={() => setSheet(full ? 'peek' : 'full')}
          aria-label={full ? t('chat.collapse') : t('chat.peek')}
          aria-expanded={full}
          className="flex h-5 w-full shrink-0 touch-none items-start justify-center pt-2"
        >
          <span className="h-1 w-9 rounded-full bg-hairline" />
        </button>
        {full ? (
          <>
            <PanelHeader onClose={() => setOpen(false)} closeLabel={t('chat.close')} closeIcon={<CloseIcon width={19} height={19} />} />
            <div className="h-px shrink-0 bg-hairline" />
            <div className="relative flex min-h-0 flex-1 flex-col">
              <MessageList />
              <div className="shrink-0 px-3 pt-1 pb-[max(10px,env(safe-area-inset-bottom))]">
                <Composer onSent={() => setSheet('peek')} />
              </div>
              {settingsOpen && <SettingsSheet />}
            </div>
          </>
        ) : (
          <div className="px-4 pb-[max(10px,env(safe-area-inset-bottom))]">
            <div className="flex items-start gap-2">
              <button type="button" onClick={() => setSheet('full')} className="min-w-0 flex-1 py-1 text-left" aria-label={t('chat.peek')}>
                <PeekLine />
              </button>
              <PeekUndo />
              <IconButton label={t('chat.peek')} tip={false} onClick={() => setSheet('full')} className="size-9 shrink-0">
                <ChevronUpIcon width={18} height={18} />
              </IconButton>
              <IconButton label={t('chat.close')} tip={false} onClick={() => setOpen(false)} className="-mr-2 size-9 shrink-0">
                <CloseIcon width={18} height={18} />
              </IconButton>
            </div>
            <Composer className="mt-2" />
          </div>
        )}
      </section>
    </>
  );
}

/** Loads the relay status once the phone chat opens. */
function MobileStatus() {
  useStatusOnOpen();
  return null;
}
