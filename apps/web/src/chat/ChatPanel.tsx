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
import { type ChatItem, fetchServerStatus, loadAgent, newChat, redoTurn, retry, send, type ServerStatus, stop, undoTurn, useChat } from './chat-store';
import { openSignIn } from './account';
import type { Lang } from '../lib/i18n';
import { ChevronDownIcon, ComposeIcon, DockIcon, HistoryIcon, NoteIcon, PlanCheckIcon, RedoIcon, RetryIcon, SlidersIcon, StopIcon, UndockIcon, UndoIcon } from './icons';
import { usesOwnKey } from './settings';
import { GlassInputBar, GlassTextSurface, GlassTurn, type GlassTurnEntry } from '../glass';
import { turnView } from './turn-parts';
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
    <div className="space-y-2 text-[14.5px] leading-[23px] font-medium break-words text-ink">
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

/** The live step of a running turn, in words: the edit being sent or just applied, else the phase. */
function liveStep(t: ReturnType<typeof useT>, item: ChatItem): { label: string; pending: boolean } {
  const n = item.changes?.length ?? 0;
  if (item.phase !== 'repairing' && item.live) {
    return item.live.applied
      ? { label: t('chat.step.done', { n, s: item.live.summary }), pending: false }
      : { label: t('chat.step.doing', { n: n + 1, s: item.live.summary }), pending: true };
  }
  return { label: phaseLabel(t, item.phase), pending: true };
}

/** What each command did (English validator wording), behind its own small toggle. */
function TechDetails({ item }: { item: ChatItem }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const lines = (item.changes ?? []).flatMap((c) => c.details);
  if (!lines.length) return null;
  return (
    <div className="-mt-1 pb-2">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-7 items-center gap-1 text-2xs text-ink-3 transition-colors hover:text-ink-2">
        <ChevronRightIcon width={13} height={13} className={cx('transition-transform duration-150', open && 'rotate-90')} />
        {t('chat.details')}
      </button>
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

/** Undo / redo of a turn's changes, at the end of its changes line. */
function UndoButtons({ item }: { item: ChatItem }) {
  const t = useT();
  if (item.undo === 'can-undo') {
    return (
      <SmallButton onClick={() => undoTurn(item.id)} icon={<UndoIcon width={14} height={14} />} className="lg-plate h-[28px] px-2.5">
        {t('chat.undo')}
      </SmallButton>
    );
  }
  if (item.undo === 'can-redo') {
    return (
      <SmallButton onClick={() => redoTurn(item.id)} icon={<RedoIcon width={14} height={14} />} className="lg-plate h-[28px] px-2.5">
        {t('chat.redo')}
      </SmallButton>
    );
  }
  return null;
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

/** When the credits come back, in this browser's clock: "明天 0:00 " / "tomorrow at 0:00". */
function resetText(t: ReturnType<typeof useT>, lang: Lang, iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const time = d.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-GB', { hour: 'numeric', minute: '2-digit' });
  return new Date().toDateString() === d.toDateString() ? t('quota.today', { t: time }) : t('quota.tomorrow', { t: time });
}

/** The calm sentence for a turn refused by the daily credits (task 019): what happened and what to do. */
function quotaText(t: ReturnType<typeof useT>, lang: Lang, code: string | undefined, server: ServerStatus | null): string {
  if (code === 'quota_unavailable') return t('quota.out.unavailable');
  if (code === 'quota_turn_limit') return t('quota.out.turn');
  const q = server?.quota;
  const time = resetText(t, lang, q?.resetAt);
  const n = q?.limit ?? 0;
  switch (q?.reason) {
    case 'site': return t('quota.out.site', { time });
    case 'ip': return t('quota.out.ip', { time });
    case 'user': return t('quota.out.user', { n, time });
    default: {
      if (q?.kind === 'user') return t('quota.out.user', { n, time });
      const account = !!(server?.auth?.email || server?.auth?.google);
      return account ? t('quota.out.anon', { n, m: server?.limits?.user ?? 10 }) : t('quota.out.anonNoAccount', { n, time });
    }
  }
}

function errorText(t: ReturnType<typeof useT>, item: ChatItem, server: ServerStatus | null = null, lang: Lang = 'zh'): string {
  const e = item.error!;
  switch (e.kind) {
    case 'quota': return quotaText(t, lang, e.code, server);
    case 'no-key': return t('chat.err.noKey');
    case 'auth': return t('chat.err.auth');
    case 'rate-limit': return t('chat.err.rateLimit');
    case 'upstream': return t('chat.err.upstream', { status: e.status ?? '?' });
    default: return t('chat.err.network');
  }
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
  const ownKey = useChat((s) => usesOwnKey(s.settings));
  const lang = useStudio((s) => s.lang);
  const compact = density === 'compact';
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

  const entries: GlassTurnEntry[] = view.structured
    ? view.timeline.map((e) => (e.type === 'text' ? { type: 'text', content: <RichText text={e.text} /> } : { type: 'change', summary: changes[e.change]?.summary ?? '' }))
    : changes.map((c) => ({ type: 'change', summary: c.summary }));
  const label = changes.length ? (changes.length === 1 ? t('chat.steps1') : t('chat.stepsN', { n: changes.length })) : undefined;

  return (
    <div className="animate-[fade-in_200ms_ease-out]" data-testid="assistant-message" data-phase={item.phase}>
      <GlassTurn
        density={density}
        live={live}
        entries={entries}
        changes={changes.map((c) => c.summary)}
        final={final}
        label={label}
        badge={undone ? <span className="rounded-[5px] bg-wash px-1.5 py-px text-2xs font-normal text-ink-2">{t('chat.undone')}</span> : undefined}
        trailing={<UndoButtons item={item} />}
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
                <button type="button" onClick={(e) => openSignIn(e.currentTarget, 'input')} className="hit inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-xs font-semibold text-ink transition-colors hover:bg-wash" data-testid="quota-signin">
                  {t('account.signIn')}
                </button>
              )}
              {item.error.kind === 'quota' && !ownKey && (
                <SmallButton onClick={() => openSettings(true)} icon={<SlidersIcon width={14} height={14} />}>{t('quota.useOwnKey')}</SmallButton>
              )}
              {(item.error.kind === 'no-key' || item.error.kind === 'auth') && (
                <SmallButton onClick={() => openSettings(true)} icon={<SlidersIcon width={14} height={14} />}>{t('chat.err.openSettings')}</SmallButton>
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
    <div className="flex flex-col items-start">
      {/* On glass the user's words are a quiet line above the answer (no bubble: no box inside glass). */}
      <p className="text-[14.5px] leading-[23px] font-medium break-words whitespace-pre-wrap text-ink-2" data-testid="user-message">
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
            <button
              key={k}
              type="button"
              onClick={() => void send(t(k))}
              className="hit group lg-plate inline-flex max-w-full items-center gap-2 py-1.5 pr-3 pl-2.5 text-left text-[13.5px] leading-5 font-medium text-ink"
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
  // The step under way (task 018), when the turn has one; else the phase phrase.
  const step = useChat((s) => {
    if (!s.running) return null;
    const it = [...s.items].reverse().find((i) => i.role === 'assistant' && !i.manual);
    if (!it?.live || it.phase === 'repairing') return null;
    const r = liveStep(t, it);
    return `${r.pending ? 1 : 0}${r.label}`;
  });
  const note = useChangeNote();
  const box = useRef<HTMLElement>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useMarkSeen();
  useEffect(() => {
    void fetchServerStatus();
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
  const btn = phone ? 'size-[36px]' : 'size-[40px]';
  // Credits on the site's key, shown only when 3 or fewer are left (task 019).
  const left = useChat((s) => (!usesOwnKey(s.settings) && s.server?.serverKey && s.server.quota && s.server.quota.remaining <= 3 ? s.server.quota.remaining : null));
  return (
    <GlassInputBar ref={box} working={!!working} className={className} data-testid="prompt">
      <form
        onSubmit={submit}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            ref.current?.focus();
          }
        }}
        className={cx('relative flex cursor-text items-end gap-2', phone ? 'min-h-12 px-1.5 py-1.5' : 'min-h-14 px-2 py-2')}
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
            data-on={recent ? '' : undefined}
            className={cx('hit lg-plate relative grid shrink-0 place-items-center text-ink-2 hover:text-ink', btn, recent && 'text-ink')}
            data-testid="chat-history"
          >
            <HistoryIcon width={17} height={17} />
            {unseen && !recent && !running && <span className="absolute top-[7px] right-[7px] size-[7px] rounded-full bg-accent" aria-hidden="true" />}
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
            className={cx('block max-h-[120px] w-full resize-none bg-transparent text-[15px] leading-5 font-medium outline-none placeholder:text-ink-2 [&:focus-visible]:outline-none', phone ? 'min-h-9 py-2' : 'min-h-10 py-2.5')}
            data-testid="prompt-bar"
          />
          {!working && !text && note.item && !pinned && <ChangeNote item={note.item} hold={note.hold} />}
          {working && !text && (
            <p className="pointer-events-none absolute inset-0 flex items-center truncate text-[15px] font-medium text-ink" role="status" data-testid="chat-status" data-phase={working.phase}>
              <span className="truncate" data-testid="chat-status-text">
                {step ? step.slice(1) : t(statusKey(working.phase))}
                {(!step || step[0] === '1') && <span className="text-accent-ink">…</span>}
                {!phone && working.prompt && <span className="ml-1 text-ink-3">{`“${working.prompt.replace(/\s+/g, ' ')}”`}</span>}
              </span>
            </p>
          )}
        </div>
        {left !== null && !running && (
          <span className={cx('tnum shrink-0 self-center text-ink-2', phone ? 'text-[12px]' : 'text-[12.5px]')} data-testid="quota-left" aria-live="polite">
            {phone ? t('quota.leftShort', { n: left }) : t('quota.left', { n: left })}
          </span>
        )}
        {running ? (
          <button type="button" onClick={stop} aria-label={t('chat.stop')} className={cx('hit lg-focus grid shrink-0 place-items-center rounded-full bg-ink text-on-ink transition-opacity hover:opacity-85', btn)}>
            <StopIcon width={16} height={16} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!can}
            aria-label={t('chat.send')}
            className={cx('hit lg-focus grid shrink-0 place-items-center rounded-full text-on-accent transition-[filter,opacity] duration-150', btn, 'bg-accent', can ? 'hover:brightness-95' : '[&>svg]:opacity-40')}
            data-testid="chat-send"
          >
            <SendIcon width={16} height={16} />
          </button>
        )}
      </form>
    </GlassInputBar>
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
    <button type="button" onClick={onClick} data-testid={testId} className={cx('hit lg-plate inline-flex h-[32px] shrink-0 items-center gap-[5px] px-3 text-[13px] font-medium whitespace-nowrap text-ink', className)}>
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
    <GlassTextSurface
      as="section"
      id="recent-strip"
      aria-label={t('chat.recent')}
      className={cx('flex animate-[strip-rise_220ms_cubic-bezier(0.22,0.8,0.24,1)] flex-col overflow-hidden', phone ? 'max-h-[42vh]' : 'max-h-[35vh]', className)}
      data-testid="recent-strip"
    >
      <header className="flex h-[46px] shrink-0 items-center gap-1.5 pr-2 pl-5">
        <h2 className="text-[13px] font-semibold text-ink-2">{t('chat.recent')}</h2>
        <span className="flex-1" />
        <LinkButton onClick={() => setPinned(true)} icon={<DockIcon width={14} height={14} />} testId="chat-pin">
          {phone ? t('chat.pinPhone') : t('chat.pin')}
        </LinkButton>
        <button type="button" onClick={() => setRecent(false)} aria-label={t('chat.historyClose')} className="hit lg-plate grid size-[32px] place-items-center text-ink-2 hover:text-ink">
          <ChevronDownIcon width={16} height={16} />
        </button>
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
    </GlassTextSurface>
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
    <GlassTextSurface as="aside" aria-label={t('chat.title')} className="absolute top-3 bottom-3 left-3 flex w-[360px] animate-[fade-in_200ms_ease-out] flex-col overflow-hidden" data-testid="chat-panel">
      {settingsOpen ? (
        <SettingsSheet />
      ) : (
        <>
          <div className="shrink-0 px-6 pt-4 pb-3">{title}</div>
          <ConversationHeader />
          <MessageList density="full" className="px-6 pt-4" />
          <div className="shrink-0 px-3 pt-2 pb-3">
            <ChatInput pinned />
          </div>
        </>
      )}
    </GlassTextSurface>
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

/** The key settings over the drawing, when the conversation is not pinned (desktop) or always (phone). */
export function SettingsHost({ phone }: { phone?: boolean }) {
  const open = useChat((s) => s.settingsOpen);
  const pinnedColumn = useStudio((s) => s.pinned && s.mode !== 'sheet') && !phone;
  const close = () => useChat.getState().setSettingsOpen(false);
  if (!open || pinnedColumn) return null;
  return (
    <>
      <div className="pointer-events-auto absolute inset-0 z-40 animate-[fade-in_160ms_ease-out] bg-black/10" onClick={close} aria-hidden="true" />
      <GlassTextSurface
        radius={phone ? 34 : 30}
        className={cx(
          'absolute z-50 flex flex-col overflow-hidden',
          phone ? 'inset-x-2 bottom-2 h-[86%] land:inset-x-auto land:top-2 land:right-2 land:bottom-2 land:h-auto land:w-[400px]' : 'top-1/2 left-1/2 h-[min(600px,calc(100%-120px))] w-[420px] -translate-x-1/2 -translate-y-1/2',
        )}
      >
        <SettingsSheet />
      </GlassTextSurface>
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
  const server = useChat((s) => s.server);
  const lang = useStudio((s) => s.lang);
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
          <span className="min-w-0 truncate text-ink-2">{item.gaveUp ? t('chat.gaveUp') : errorText(t, item, server, lang)}</span>
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
