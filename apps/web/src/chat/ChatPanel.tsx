// The AI assistant (task 015): one input at the bottom centre; its history
// button opens the translucent "recent" strip above it (the last exchange
// with undo); pinned, the conversation is a column on the left (desktop) or
// a half-height sheet (phone, see PhoneDock).
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { ChevronRightIcon, SendIcon, SparkIcon } from '../components/icons';
import { cx, IconButton } from '../components/ui';
import { type MessageKey, useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import { type ChatItem, fetchServerStatus, loadAgent, newChat, redoTurn, retry, send, stop, undoTurn, useChat } from './chat-store';
import { ChevronDownIcon, ComposeIcon, DockIcon, HistoryIcon, NoteIcon, PlanCheckIcon, RedoIcon, RetryIcon, SlidersIcon, StopIcon, UndockIcon, UndoIcon } from './icons';
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

/** What the assistant is doing right now, in words. */
function phaseLabel(t: ReturnType<typeof useT>, phase: ChatItem['phase']): string {
  if (phase === 'repairing') return t('chat.repairing');
  if (phase === 'working') return t('chat.working');
  if (phase === 'writing') return t('chat.writing');
  return t('chat.thinking');
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

function ChangesCard({ item, translucent }: { item: ChatItem; translucent?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const changes = item.changes ?? [];
  if (!changes.length) return null;
  const undone = item.undo === 'undone' || item.undo === 'can-redo';
  return (
    <div className={cx('mt-2 overflow-hidden rounded-[10px] border border-black/10', translucent ? 'bg-white/60' : 'bg-white', undone && 'opacity-70')} data-testid="changes-card">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-black/[0.07] pr-1.5 pl-3">
        <p className="flex items-center gap-1.5 text-xs text-ink-2">
          <PlanCheckIcon width={14} height={14} className={undone ? 'text-ink-3' : 'text-ink-2'} />
          {t('chat.changedN', { n: changes.length })}
          {undone && <span className="rounded-[5px] bg-wash px-1.5 py-px text-2xs font-normal text-ink-2">{t('chat.undone')}</span>}
        </p>
        <div className="flex items-center">
          {item.undo === 'can-undo' && (
            <SmallButton onClick={() => undoTurn(item.id)} icon={<UndoIcon width={14} height={14} />} className="h-[26px] bg-white px-[9px] shadow-[inset_0_0_0_1px_#e2e2e2] hover:bg-wash">
              {t('chat.undo')}
            </SmallButton>
          )}
          {item.undo === 'can-redo' && (
            <SmallButton onClick={() => redoTurn(item.id)} icon={<RedoIcon width={14} height={14} />} className="h-[26px] bg-white px-[9px] shadow-[inset_0_0_0_1px_#e2e2e2] hover:bg-wash">
              {t('chat.redo')}
            </SmallButton>
          )}
        </div>
      </div>
      <ul className="px-3 py-2">
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
      className={cx('hit inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-xs font-medium text-ink transition-colors hover:bg-wash', className)}
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

function AssistantMessage({ item, latest, translucent }: { item: ChatItem; latest: boolean; translucent?: boolean }) {
  const t = useT();
  const running = item.phase !== 'done';
  const openSettings = useChat((s) => s.setSettingsOpen);
  const progress = phaseLabel(t, item.phase);
  return (
    <div className="animate-[fade-in_200ms_ease-out]" data-testid="assistant-message" data-phase={item.phase}>
      {(item.text || running) && <RichText text={item.text} caret={running && !!item.text} />}
      {/* While the reply streams, its caret is the indicator. */}
      {running && item.phase !== 'writing' && (!item.text || item.phase !== 'thinking') && <div className={item.text ? 'mt-2.5' : ''}><Progress label={progress} /></div>}
      <ChangesCard item={item} translucent={translucent} />
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
      <p className="max-w-[86%] rounded-[12px] rounded-br-[4px] bg-ink px-3 py-[7px] text-[13.5px] leading-[1.5] break-words whitespace-pre-wrap text-white" data-testid="user-message">
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
              className="hit group inline-flex max-w-full items-center gap-2 rounded-full border border-hairline bg-white py-1.5 pr-3 pl-2.5 text-left text-[13px] leading-5 text-ink transition-colors hover:border-ink-3 hover:bg-wash"
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

/** The conversation (from item `from`); `spacer` leaves room under the newest message so it can sit at the top. */
function MessageList({ className, from = 0, spacer = true, translucent }: { className?: string; from?: number; spacer?: boolean; translucent?: boolean }) {
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
              {it.role === 'user' ? <UserMessage item={it} /> : it.manual ? <ManualEdit item={it} /> : <AssistantMessage item={it} latest={it.id === lastAssistant} translucent={translucent} />}
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

/** How many conversation items the user has seen (the recent strip or the pinned conversation was open). */
const useSeen = create<{ seen: number }>(() => ({ seen: 0 }));

function useMarkSeen(): void {
  useEffect(() => {
    const mark = () => {
      const st = useStudio.getState();
      if (st.recent || st.pinned) useSeen.setState({ seen: useChat.getState().items.length });
    };
    mark();
    const a = useStudio.subscribe(mark);
    const b = useChat.subscribe(mark);
    return () => {
      a();
      b();
    };
  }, []);
}

/** Each status phrase stays at least this long, so a quick phase can still be read. */
const MIN_PHASE_MS = 1100;

/**
 * The newest assistant turn that is under way and the phase its status
 * phrase shows. The phrase follows the store's phases in order, each held
 * for MIN_PHASE_MS: a fast turn still reads "正在思考… / 正在修改房子… /
 * 正在回复…" (text streamed just before an edit gives way to the edit).
 */
function useWorking(): { phase: ChatItem['phase']; prompt: string } | null {
  const live = useChat((s) => {
    if (!s.running) return null;
    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i]!;
      if (it.role === 'assistant' && !it.manual) return `${it.id}|${it.phase ?? 'thinking'}`;
    }
    return '|thinking';
  });
  const prompt = useChat((s) => {
    for (let i = s.items.length - 1; i >= 0; i--) if (s.items[i]!.role === 'user') return s.items[i]!.text;
    return '';
  });
  const [shown, setShown] = useState<{ id: string; phase: ChatItem['phase'] } | null>(null);
  const queue = useRef<ChatItem['phase'][]>([]);
  const since = useRef(0);
  const timer = useRef(0);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  useEffect(() => {
    const show = (v: { id: string; phase: ChatItem['phase'] } | null) => {
      since.current = performance.now();
      setShown(v);
    };
    const pump = () => {
      clearTimeout(timer.current);
      const cur = shownRef.current;
      if (!cur || !queue.current.length) return;
      const wait = MIN_PHASE_MS - (performance.now() - since.current);
      if (wait > 0) {
        timer.current = window.setTimeout(pump, wait);
        return;
      }
      const next = queue.current.shift()!;
      shownRef.current = { id: cur.id, phase: next };
      show(shownRef.current);
      if (queue.current.length) timer.current = window.setTimeout(pump, MIN_PHASE_MS);
    };
    if (!live) {
      clearTimeout(timer.current);
      queue.current = [];
      shownRef.current = null;
      show(null);
      return;
    }
    const [id, phase] = live.split('|') as [string, ChatItem['phase']];
    const cur = shownRef.current;
    if (!cur || cur.id !== id) {
      clearTimeout(timer.current);
      queue.current = [];
      shownRef.current = { id, phase };
      show(shownRef.current);
      return;
    }
    const q = queue.current;
    const last = q.length ? q[q.length - 1] : cur.phase;
    if (phase === last) return;
    // Text streamed just before an edit is part of the edit: it gives way.
    if (q.length && q[q.length - 1] === 'writing' && (phase === 'working' || phase === 'repairing')) q[q.length - 1] = phase;
    else q.push(phase);
    pump();
  }, [live]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return shown ? { phase: shown.phase, prompt } : null;
}

function statusKey(phase: ChatItem['phase']): MessageKey {
  if (phase === 'working') return 'chat.status.working';
  if (phase === 'repairing') return 'chat.status.repairing';
  if (phase === 'writing') return 'chat.status.writing';
  return 'chat.status.thinking';
}

/**
 * The conversation's one input, bottom centre. While the assistant works a
 * soft light travels round its rim and the placeholder gives way to what is
 * happening ("正在修改房子…"). The history button opens the recent strip;
 * pinned, a spark stands in its place. Enter sends (not while an IME is
 * composing), Shift+Enter breaks the line, Escape gives the drawing back.
 */
export function ChatInput({ phone, pinned, className }: { phone?: boolean; pinned?: boolean; className?: string }) {
  const t = useT();
  const running = useChat((s) => s.running);
  const text = useChat((s) => s.draft);
  const setText = useChat((s) => s.setDraft);
  const unseen = useChat((s) => s.items.length) > useSeen((s) => s.seen);
  const recent = useStudio((s) => s.recent);
  const setRecent = useStudio((s) => s.setRecent);
  const working = useWorking();
  const note = useChangeNote();
  const box = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useMarkSeen();
  useEffect(() => {
    void fetchServerStatus();
  }, []);
  // The rotating light covers the whole input whatever its size.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const set = () => el.style.setProperty('--d', `${Math.ceil(Math.hypot(el.offsetWidth, el.offsetHeight)) + 4}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [text]);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (running || !text.trim()) return;
    void send(text);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (recent) setRecent(false);
      ref.current?.blur();
    }
  };
  const can = !!text.trim() && !running;
  const btn = phone ? 'size-[34px]' : 'size-[34px]';
  return (
    <div ref={box} className={cx('ai-input pointer-events-auto', className)} data-working={working ? '' : undefined} data-testid="prompt">
      <div className="ai-halo" aria-hidden="true" />
      <div className="ai-rim" aria-hidden="true">
        <div className="ai-spin" />
      </div>
      <form
        onSubmit={submit}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            ref.current?.focus();
          }
        }}
        className={cx('ai-face flex cursor-text items-end gap-2 px-[7px]', phone ? 'py-[7px]' : 'py-2')}
      >
        {pinned ? (
          <span className={cx('grid shrink-0 place-items-center', btn)}>
            <SparkIcon accent width={17} height={17} />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setRecent(!recent)}
            aria-label={recent ? t('chat.historyClose') : t('chat.history')}
            aria-expanded={recent}
            aria-controls="recent-strip"
            className={cx('hit relative grid shrink-0 place-items-center rounded-full transition-colors', btn, recent ? 'bg-ink text-white' : 'text-ink-2 hover:bg-wash hover:text-ink')}
            data-testid="chat-history"
          >
            <HistoryIcon width={17} height={17} />
            {unseen && !recent && !running && <span className="absolute top-[5px] right-[5px] size-[7px] rounded-full bg-accent shadow-[0_0_0_2px_white]" aria-hidden="true" />}
          </button>
        )}
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={ref}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder={working || (note.item && !pinned) ? '' : t('prompt.placeholder')}
            aria-label={t('chat.placeholder')}
            className="block max-h-[120px] min-h-[34px] w-full resize-none bg-transparent py-[7px] text-[14px] leading-5 outline-none placeholder:text-ink-3 [&:focus-visible]:outline-none"
            data-testid="prompt-bar"
          />
          {!working && !text && note.item && !pinned && <ChangeNote item={note.item} hold={note.hold} />}
          {working && !text && (
            <p className="pointer-events-none absolute inset-0 flex items-center truncate text-[14px] text-ink" role="status" data-testid="chat-status" data-phase={working.phase}>
              <span className="truncate">
                {t(statusKey(working.phase))}
                <span className="text-accent-ink">…</span>
                {!phone && working.prompt && <span className="ml-1 text-ink-3">{`“${working.prompt.replace(/\s+/g, ' ')}”`}</span>}
              </span>
            </p>
          )}
        </div>
        {running ? (
          <button type="button" onClick={stop} aria-label={t('chat.stop')} className={cx('hit grid shrink-0 place-items-center rounded-full bg-ink text-white transition-opacity hover:opacity-85', btn)}>
            <StopIcon width={16} height={16} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!can}
            aria-label={t('chat.send')}
            className={cx('hit grid shrink-0 place-items-center rounded-full transition-colors duration-150', btn, can ? 'bg-accent text-ink hover:brightness-95' : 'bg-wash text-ink-2')}
            data-testid="chat-send"
          >
            <SendIcon width={16} height={16} />
          </button>
        )}
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recent strip                                                        */
/* ------------------------------------------------------------------ */

/** Index of the last exchange: from the last message of the user (or the last few studio edits). */
function lastExchangeStart(items: ChatItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) if (items[i]!.role === 'user') return i;
  return Math.max(0, items.length - 3);
}

function LinkButton({ onClick, icon, children, testId, className }: { onClick: () => void; icon?: ReactNode; children: ReactNode; testId?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className={cx('hit inline-flex h-[30px] shrink-0 items-center gap-[5px] rounded-[7px] px-2 text-[12.5px] whitespace-nowrap text-ink transition-colors hover:bg-black/5', className)}>
      {icon}
      {children}
    </button>
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
    <section
      id="recent-strip"
      aria-label={t('chat.recent')}
      className={cx('pointer-events-auto flex animate-[strip-rise_220ms_cubic-bezier(0.22,0.8,0.24,1)] flex-col overflow-hidden rounded-[16px] bg-veil shadow-[0_8px_30px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.07)]', phone ? 'max-h-[42vh]' : 'max-h-[35vh]', className)}
      data-testid="recent-strip"
    >
      <header className="flex h-[42px] shrink-0 items-center gap-1.5 pr-1.5 pl-4">
        <h2 className="text-[13px] font-medium">{t('chat.recent')}</h2>
        <span className="flex-1" />
        <LinkButton onClick={() => setPinned(true)} icon={<DockIcon width={14} height={14} />} testId="chat-pin">
          {phone ? t('chat.pinPhone') : t('chat.pin')}
        </LinkButton>
        <button type="button" onClick={() => setRecent(false)} aria-label={t('chat.historyClose')} className="hit grid size-[30px] place-items-center rounded-[8px] text-ink-2 transition-colors hover:bg-black/5 hover:text-ink">
          <ChevronDownIcon width={16} height={16} />
        </button>
      </header>
      <MessageList from={items.length ? lastExchangeStart(items) : 0} spacer={false} className="px-4 pt-0.5 pb-3" translucent />
      {rounds > 1 && (
        <div className="shrink-0 px-2.5 pb-2.5">
          <LinkButton onClick={() => setPinned(true)} testId="chat-view-all">
            {t('chat.viewAll', { n: rounds })}
            <ChevronRightIcon width={14} height={14} />
          </LinkButton>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pinned conversation                                                 */
/* ------------------------------------------------------------------ */

function ConversationHeader({ phone }: { phone?: boolean }) {
  const t = useT();
  const hasItems = useChat((s) => s.items.length > 0);
  const setSettingsOpen = useChat((s) => s.setSettingsOpen);
  const setPinned = useStudio((s) => s.setPinned);
  return (
    <header className={cx('flex shrink-0 items-center gap-1.5', phone ? 'h-10 pr-2 pl-4' : 'h-11 border-y border-hairline pr-2 pl-6')}>
      <SparkIcon accent width={15} height={15} className="shrink-0" />
      <h2 className="truncate text-[13px] font-medium">{t('chat.title')}</h2>
      <span className="flex-1" />
      {hasItems && (
        <IconButton label={t('chat.newChat')} tipSide="bottom" onClick={newChat} className="hit size-8 text-ink-2">
          <ComposeIcon width={16} height={16} />
        </IconButton>
      )}
      <IconButton label={t('chat.settings')} tipSide="bottom" onClick={() => setSettingsOpen(true)} className="hit size-8 text-ink-2" data-testid="chat-settings">
        <SlidersIcon width={16} height={16} />
      </IconButton>
      <LinkButton onClick={() => setPinned(false)} icon={<UndockIcon width={16} height={16} />} testId="chat-unpin">
        {t('chat.unpin')}
      </LinkButton>
    </header>
  );
}

/** Desktop: the conversation pinned as a 360 px column on the left, with the title on top and the input at its foot. */
export function PinnedColumn({ title }: { title: ReactNode }) {
  const t = useT();
  const settingsOpen = useChat((s) => s.settingsOpen);
  useEffect(() => {
    void loadAgent();
  }, []);
  return (
    <aside aria-label={t('chat.title')} className="pointer-events-auto absolute inset-y-0 left-0 flex w-[360px] animate-[fade-in_200ms_ease-out] flex-col border-r border-hairline bg-white" data-testid="chat-panel">
      <div className="shrink-0 px-6 pt-4 pb-3">{title}</div>
      <ConversationHeader />
      <MessageList className="px-6 pt-4" />
      <div className="shrink-0 px-4 pt-2 pb-6">
        <ChatInput pinned />
      </div>
      {settingsOpen && <SettingsSheet />}
    </aside>
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
      <MessageList className="px-4 pt-1" spacer={false} />
      <div className="shrink-0 px-3 pt-1.5 pb-[max(12px,env(safe-area-inset-bottom))]">
        <ChatInput phone pinned />
      </div>
    </section>
  );
}

/** The key settings over the drawing, when the conversation is not pinned (desktop) or always (phone). */
export function SettingsHost({ phone }: { phone?: boolean }) {
  const open = useChat((s) => s.settingsOpen);
  const pinnedColumn = useStudio((s) => s.pinned && s.mode !== 'sheet') && !phone;
  const close = () => useChat.getState().setSettingsOpen(false);
  if (!open || pinnedColumn) return null;
  return (
    <>
      <div className="pointer-events-auto absolute inset-0 z-40 animate-[fade-in_160ms_ease-out] bg-black/10" onClick={close} aria-hidden="true" />
      <div
        className={cx(
          'pointer-events-auto absolute z-50 overflow-hidden bg-white shadow-[0_8px_30px_rgba(0,0,0,0.14)]',
          phone ? 'inset-x-0 bottom-0 h-[86%] rounded-t-[18px] land:inset-x-auto land:top-2 land:right-2 land:bottom-2 land:h-auto land:w-[400px] land:rounded-[16px]' : 'top-1/2 left-1/2 h-[min(600px,calc(100%-120px))] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[16px]',
        )}
      >
        <SettingsSheet />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* After a turn: a short note with undo                                */
/* ------------------------------------------------------------------ */

/**
 * When a turn (or a change made in the studio) completes while the
 * conversation is out of sight: the item to sum up in the input bar
 * ("已修改：… 撤销") for a few seconds; problems offer "查看" (the recent
 * strip). Hovering or focusing the note keeps it.
 */
function useChangeNote(): { item: ChatItem | null; hold: (on: boolean) => void } {
  const [id, setId] = useState<string | null>(null);
  const item = useChat((s) => (id ? s.items.find((i) => i.id === id) : undefined));
  const hidden = useStudio((s) => s.recent || s.pinned);
  const hover = useRef(false);
  const timer = useRef(0);
  useEffect(() => {
    const arm = () => {
      clearTimeout(timer.current);
      timer.current = window.setTimeout(function tick() {
        if (hover.current) timer.current = window.setTimeout(tick, 1000);
        else setId(null);
      }, 5000);
    };
    const unsub = useChat.subscribe((s, p) => {
      const last = s.items[s.items.length - 1];
      if (p.running && !s.running) {
        const a = [...s.items].reverse().find((i) => i.role === 'assistant' && !i.manual);
        if (a && (a.changes?.length || a.error || a.gaveUp)) {
          setId(a.id);
          arm();
        }
      } else if (s.items.length > p.items.length && last?.manual && last.changes?.length) {
        setId(last.id);
        arm();
      } else if (s.running && !p.running) setId(null);
    });
    return () => {
      unsub();
      clearTimeout(timer.current);
    };
  }, []);
  return { item: !id || !item || hidden ? null : item, hold: (on) => (hover.current = on) };
}

/**
 * The after-turn note inside the input bar (task 016: one calm line with
 * undo in the bar, never a separate element over the house). It takes the
 * placeholder's place; typing hides it.
 */
function ChangeNote({ item, hold }: { item: ChatItem; hold: (on: boolean) => void }) {
  const t = useT();
  const n = item.changes?.length ?? 0;
  const undone = item.undo === 'undone' || item.undo === 'can-redo';
  const problem = !n && (item.error || item.gaveUp);
  const btn = 'pointer-events-auto h-7 shrink-0 rounded-full bg-wash hover:bg-hairline';
  return (
    <div
      className="pointer-events-none absolute inset-0 flex animate-[fade-in_200ms_ease-out] items-center gap-2 text-[14px] whitespace-nowrap"
      role="status"
      data-testid="change-toast"
      onPointerEnter={() => hold(true)}
      onPointerLeave={() => hold(false)}
      onFocus={() => hold(true)}
      onBlur={() => hold(false)}
    >
      {problem ? (
        <>
          <NoteIcon width={15} height={15} className="shrink-0 text-ink-2" />
          <span className="min-w-0 truncate text-ink-2">{item.gaveUp ? t('chat.gaveUp') : errorText(t, item)}</span>
          <SmallButton onClick={() => useStudio.getState().setRecent(true)} className={btn}>{t('chat.show')}</SmallButton>
        </>
      ) : (
        <>
          <PlanCheckIcon width={15} height={15} className={cx('shrink-0', undone ? 'text-ink-3' : 'text-ink')} />
          <span className={cx('min-w-0 truncate', undone ? 'text-ink-2 line-through decoration-ink-3' : 'text-ink')} data-testid="change-note-text">
            {t('chat.changed', { s: item.changes![n - 1]!.summary })}
          </span>
          {n > 1 && <span className="tnum shrink-0 text-ink-3">+{n - 1}</span>}
          {item.undo === 'can-undo' && (
            <SmallButton onClick={() => undoTurn(item.id)} icon={<UndoIcon width={14} height={14} />} className={btn}>
              {t('chat.undo')}
            </SmallButton>
          )}
          {item.undo === 'can-redo' && (
            <SmallButton onClick={() => redoTurn(item.id)} icon={<RedoIcon width={14} height={14} />} className={btn}>
              {t('chat.redo')}
            </SmallButton>
          )}
        </>
      )}
    </div>
  );
}
