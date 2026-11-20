// The AI assistant (task 015): one input at the bottom centre; its history
// button opens the translucent "recent" strip above it (the last exchange
// with undo); pinned, the conversation is a column on the left (desktop) or
// a half-height sheet (phone, see PhoneDock).
import { type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState, lazy, Suspense } from 'react';
import { create } from 'zustand';
import { SendIcon } from '../components/icons';
import { cx } from '../components/ui';
import { type MessageKey, useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import { useViewOnly } from '../lib/view-only';
import { ViewOnlyBar } from '../studio/Share';
import { type ChatItem, fetchServerStatus, outOfCredits, ownKeyInUse, redoTurn, send, type ServerStatus, stop, undoTurn, useChat } from './chat-store';
import type { Lang } from '../lib/i18n';
import { HistoryIcon, NoteIcon, PlanCheckIcon, RedoIcon, StopIcon, UndoIcon } from './icons';
import { useKeys } from './keys';
import { KeyPicker } from './KeyPicker';
import { AttachButton, AttachStrip, useImageDrop, useMention } from './attach-light';
import { Button, Dialog, Dot, InputBar, InputField, PromptText } from '@opensu/ui';

// The conversation (messages, the recent strip, the pinned column and sheet) loads when needed (task 032).
const LazyRecentStrip = lazy(() => import('./conversation').then((m) => ({ default: m.RecentStrip })));
const LazyPinnedColumn = lazy(() => import('./conversation').then((m) => ({ default: m.PinnedColumn })));
const LazyPinnedChat = lazy(() => import('./conversation').then((m) => ({ default: m.PinnedChat })));
/** Fetches the conversation's code ahead of its first showing. */
export function preloadConversation(): void {
  void import('./conversation');
}
export function RecentStrip(props: { phone?: boolean; className?: string }) {
  return <Suspense fallback={null}><LazyRecentStrip {...props} /></Suspense>;
}
export function PinnedColumn(props: { style: CSSProperties }) {
  return <Suspense fallback={null}><LazyPinnedColumn {...props} /></Suspense>;
}
export function PinnedChat() {
  return <Suspense fallback={null}><LazyPinnedChat /></Suspense>;
}

// The browser-key settings load on first use (task 032).
export const SettingsSheet = lazy(() => import('./SettingsSheet').then((m) => ({ default: m.SettingsSheet })));

export const SUGGESTIONS: MessageKey[] = ['chat.s1', 'chat.s2', 'chat.s3', 'chat.s4'];

/** True while turns go out on the user's own key (in this browser or saved with the account). */
export function useOwnKey(): boolean {
  const settings = useChat((s) => s.settings);
  useKeys((s) => `${s.ready}|${s.active}|${s.keys.length}`);
  return ownKeyInUse(settings);
}

/* ------------------------------------------------------------------ */
/* Message content                                                     */
/* ------------------------------------------------------------------ */

/** What the assistant is doing right now, in words. */
export function phaseLabel(t: ReturnType<typeof useT>, phase: ChatItem['phase']): string {
  if (phase === 'repairing') return t('chat.repairing');
  if (phase === 'working') return t('chat.working');
  if (phase === 'writing') return t('chat.writing');
  return t('chat.thinking');
}

/** The live step of a running turn, in words: the edit being sent or just applied, else the phase. */
export function liveStep(t: ReturnType<typeof useT>, item: ChatItem): { label: string; pending: boolean } {
  const n = item.changes?.length ?? 0;
  if (item.phase !== 'repairing' && item.live) {
    return item.live.applied
      ? { label: t('chat.step.done', { n, s: item.live.summary }), pending: false }
      : { label: t('chat.step.doing', { n: n + 1, s: item.live.summary }), pending: true };
  }
  return { label: phaseLabel(t, item.phase), pending: true };
}

/** A small text action on glass: the module's plate (`filled`: resting on a wash). */
export function SmallButton({ onClick, icon, children, className, filled }: { onClick: () => void; icon?: ReactNode; children: ReactNode; className?: string; filled?: boolean }) {
  return (
    <Button variant={filled ? 'tinted' : 'plain'} size="xs" onClick={onClick} icon={icon} className={cx('gap-1 px-2', className)}>
      {children}
    </Button>
  );
}

/** Calm inline note for errors and the give-up case, with the next step. */
export function Note({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    // Plain text in the panel's flow: no plate inside the glass (UI_STYLE rule 3).
    <div className="mt-3" role="note">
      <p className="flex gap-2 text-[13px] leading-5 text-ink">
        <NoteIcon width={16} height={16} className="mt-0.5 shrink-0 text-ink-2" />
        <span>{children}</span>
      </p>
      {actions && <div className="mt-2 ml-6 flex flex-wrap items-center gap-1">{actions}</div>}
    </div>
  );
}

/** When the credits come back, in this browser's clock: "明天 0:00 " / "tomorrow at 0:00". */
export function resetText(t: ReturnType<typeof useT>, lang: Lang, iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const time = d.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-GB', { hour: 'numeric', minute: '2-digit' });
  return new Date().toDateString() === d.toDateString() ? t('quota.today', { t: time }) : t('quota.tomorrow', { t: time });
}

/** The calm sentence for a turn refused by the daily credits (task 019): what happened and what to do. */
export function quotaText(t: ReturnType<typeof useT>, lang: Lang, code: string | undefined, server: ServerStatus | null): string {
  if (code === 'quota_unavailable') return t('quota.out.unavailable');
  if (code === 'quota_turn_limit') return t('quota.out.turn');
  const q = server?.quota;
  const time = resetText(t, lang, q?.resetAt);
  // The owner's wording: no counts, promise little (the reset time stays).
  switch (q?.reason) {
    case 'site': return t('quota.out.site', { time });
    case 'ip': return t('quota.out.ip', { time });
    case 'user': return t('quota.out.user', { time });
    default: {
      if (q?.kind === 'user') return t('quota.out.user', { time });
      const account = !!(server?.auth?.email || server?.auth?.google);
      return account ? t('quota.out.anon') : t('quota.out.anonNoAccount', { time });
    }
  }
}

export function errorText(t: ReturnType<typeof useT>, item: ChatItem, server: ServerStatus | null = null, lang: Lang = 'zh'): string {
  const e = item.error!;
  // A key saved with the account that cannot be used (task 022).
  if (e.code === 'account_key_signed_out') return t('keys.err.signedOutTurn');
  if (e.code?.startsWith('account_key_')) return t('keys.err.unusable');
  switch (e.kind) {
    case 'quota': return quotaText(t, lang, e.code, server);
    case 'no-key': return t('chat.err.noKey');
    case 'auth': return t('chat.err.auth');
    case 'rate-limit': return t('chat.err.rateLimit');
    case 'upstream': return t('chat.err.upstream', { status: e.status ?? '?' });
    default: return t('chat.err.network');
  }
}

/** How many conversation items the user has seen (the recent strip or the pinned conversation was open). */
const useSeen = create<{ seen: number }>(() => ({ seen: 0 }));

export function useMarkSeen(): void {
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
/**
 * The prompt. Viewing a shared project (task 028, the one view-only flag)
 * its place holds the view-only bar instead: one place for desktop, phone,
 * the sheets view and landscape.
 */
export function ChatInput(props: { phone?: boolean; pinned?: boolean; className?: string }) {
  const viewOnly = useViewOnly();
  return viewOnly ? <ViewOnlyBar phone={props.phone} /> : <PromptInput {...props} />;
}

function PromptInput({ phone, pinned, className }: { phone?: boolean; pinned?: boolean; className?: string }) {
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
  const attachments = useChat((s) => s.attachments.length);
  const mention = useMention(text, setText, ref);
  const drop = useImageDrop();
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (running || (!text.trim() && !attachments)) return;
    void send(text);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // The "@" list is open: it takes the arrows, Enter and Escape.
    if (mention.onKey(e)) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (recent) setRecent(false);
      ref.current?.blur();
    }
  };
  // Out of today's free credits (the site's key): the field says so instead
  // of inviting a message, and send rests until there is text (sending then
  // shows the calm note with sign-in and the own-key offer).
  useOwnKey();
  const out = useChat((s) => !s.running && outOfCredits());
  const can = (!!text.trim() || attachments > 0) && !running;
  // Pinned (task 023): a field of the sidebar, concentric with its bottom
  // corner (desktop: 26 - 8, phone sheet: 34 - 12), one line high; its
  // children (picker, text, send) share one centre line, 4 px from the edge.
  const field = !!pinned;
  const dim = field ? (phone ? 36 : 28) : phone ? 36 : 40;
  const placeholder = working || (note.item && !pinned) ? '' : out ? t('quota.placeholder') : pinned ? t('chat.placeholder') : t('prompt.placeholder');
  const form = (
    <form
      onSubmit={submit}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          ref.current?.focus();
        }
      }}
      onPaste={drop.onPaste}
      onDragOver={drop.onDragOver}
      onDrop={drop.onDrop}
      className={cx('relative flex cursor-text items-end', field ? 'gap-1 p-1' : cx('gap-2', phone ? 'min-h-12 px-1.5 py-1.5' : 'min-h-14 px-2 py-2'))}
    >
      {pinned ? (
        // Task 022: which key the conversation uses, a pop-up button where the spark stood.
        <KeyPicker variant="input" phone={phone} />
      ) : (
        <Button
          variant="quiet"
          onClick={() => setRecent(!recent)}
          label={recent ? t('chat.historyClose') : t('chat.history')}
          aria-expanded={recent}
          aria-controls="recent-strip"
          selected={recent}
          dim={dim}
          className={cx('relative', recent && 'text-ink')}
          icon={<HistoryIcon width={17} height={17} />}
          data-testid="chat-history"
        >
          {unseen && !recent && !running && <Dot size={7} className="absolute top-[7px] right-[7px]" />}
        </Button>
      )}
      <AttachButton dim={dim} disabled={running} />
      <div className={cx('relative min-w-0 flex-1', field && 'pl-1')}>
        <AttachStrip />
        <PromptText
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => {
            mention.onInput(e.target.value, e.target.selectionStart ?? e.target.value.length);
            setText(e.target.value);
          }}
          onKeyDown={onKey}
          placeholder={placeholder}
          aria-label={t('chat.placeholder')}
          className={cx(
            // In the sidebar, the conversation's text size (UI_STYLE: 14.5); the capsule over the drawing keeps 15.
            field ? 'text-[14.5px]' : 'text-[15px]',
            field ? (phone ? 'min-h-9 py-2' : 'min-h-7 py-1') : phone ? 'min-h-9 py-2' : 'min-h-10 py-2.5',
          )}
          data-testid="prompt-bar"
          data-out={out ? '' : undefined}
        />
        {!working && !text && !attachments && note.item && !pinned && <ChangeNote item={note.item} hold={note.hold} />}
        {mention.picker}
        {working && !text && (
          <p className="pointer-events-none absolute inset-0 flex items-center truncate text-[15px] font-medium text-ink" role="status" data-testid="chat-status" data-phase={working.phase}>
            <span className="truncate" data-testid="chat-status-text">
              {step ? step.slice(1) : t(statusKey(working.phase))}
              {(!step || step[0] === '1') && <span>…</span>}
              {!phone && working.prompt && <span className="ml-1 text-ink-3">{`“${working.prompt.replace(/\s+/g, ' ')}”`}</span>}
            </span>
          </p>
        )}
      </div>
      {running ? (
        <Button variant="ink" onClick={stop} label={t('chat.stop')} dim={dim} icon={<StopIcon width={field && !phone ? 14 : 16} height={field && !phone ? 14 : 16} />} />
      ) : (
        <Button
          type="submit"
          variant={can ? 'accent' : 'tinted'}
          disabled={!can}
          label={t('chat.send')}
          // Ready: the accent. Nothing to send: a quiet plate, the arrow dimmed (it cannot act).
          dim={dim}
          className={cx(!can && 'text-ink-3')}
          icon={<SendIcon width={field && !phone ? 14 : 16} height={field && !phone ? 14 : 16} />}
          data-testid="chat-send"
        />
      )}
    </form>
  );
  return field ? (
    // A hairline field (no lighter well): the picker's label and the text keep the panel's contrast (task 023 review).
    <InputField ref={box as React.Ref<HTMLDivElement>} working={!!working} radius={phone ? 22 : 18} plain className={className} data-testid="prompt">
      {form}
    </InputField>
  ) : (
    // A capsule at one line (phone 48 high, desktop 56); grown, it keeps that radius (a rounded field, as Messages does).
    <InputBar ref={box} working={!!working} radius={phone ? 24 : 28} className={className} data-testid="prompt">
      {form}
    </InputBar>
  );
}

/* ------------------------------------------------------------------ */
/* Recent strip                                                        */
/* ------------------------------------------------------------------ */

/** The key settings over the drawing, when the conversation is not pinned (desktop) or always (phone). */
export function SettingsHost({ phone }: { phone?: boolean }) {
  const t = useT();
  const open = useChat((s) => s.settingsOpen);
  const pinnedColumn = useStudio((s) => s.pinned && s.mode !== 'sheet') && !phone;
  const close = () => useChat.getState().setSettingsOpen(false);
  // Task 033: a modal on Base UI's Dialog (the pinned column shows the same settings inside itself).
  return (
    <Dialog open={open && !pinnedColumn} onClose={close} label={t('settings.title')} phone={phone}>
      <Suspense fallback={null}>
        <SettingsSheet />
      </Suspense>
    </Dialog>
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
  const btn = 'pointer-events-auto h-7 shrink-0';
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
          <SmallButton onClick={() => useStudio.getState().setRecent(true)} className={btn} filled>{t('chat.show')}</SmallButton>
        </>
      ) : (
        <>
          <PlanCheckIcon width={15} height={15} className={cx('shrink-0', undone ? 'text-ink-3' : 'text-ink')} />
          <span className={cx('min-w-0 truncate', undone ? 'text-ink-2 line-through decoration-ink-3' : 'text-ink')} data-testid="change-note-text">
            {t('chat.changed', { s: item.changes![n - 1]!.summary })}
          </span>
          {n > 1 && <span className="tnum shrink-0 text-ink-3">+{n - 1}</span>}
          {item.undo === 'can-undo' && (
            <SmallButton onClick={() => undoTurn(item.id)} icon={<UndoIcon width={14} height={14} />} className={btn} filled>
              {t('chat.undo')}
            </SmallButton>
          )}
          {item.undo === 'can-redo' && (
            <SmallButton onClick={() => redoTurn(item.id)} icon={<RedoIcon width={14} height={14} />} className={btn} filled>
              {t('chat.redo')}
            </SmallButton>
          )}
        </>
      )}
    </div>
  );
}
