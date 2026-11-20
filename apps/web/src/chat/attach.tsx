// Images in the compose field and the conversation (task 038): the attach
// button, paste and drop, the strip of attachments above the text, the
// "@" picker that inserts "图N", and a sent message's images.
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Glass, GLASS, showToast, usePortalHost } from '@opensu/ui';
import { useShallow } from 'zustand/react/shallow';
import { cx } from '../components/ui';
import { useT } from '../lib/i18n';
import { type ChatItem, useChat } from './chat-store';
import { CloseIcon } from '../components/icons';
import { ImageIcon } from './icons';
import { type ChatImage, MAX_IMAGES, type PendingImage } from './images';
import { prepareImage, useImage } from './image-data';

/** Adds image files to the compose field's attachments (up to MAX_IMAGES). */
export async function addFiles(files: readonly File[], t: (k: 'chat.attachLimit' | 'chat.attachFailed', v?: Record<string, string | number>) => string): Promise<void> {
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  const have = useChat.getState().attachments.length;
  const room = MAX_IMAGES - have;
  if (images.length > room) showToast({ title: t('chat.attachLimit', { n: MAX_IMAGES }) });
  for (const f of images.slice(0, Math.max(0, room))) {
    try {
      const p = await prepareImage(f);
      const cur = useChat.getState().attachments;
      if (cur.length < MAX_IMAGES) useChat.getState().setAttachments([...cur, p]);
    } catch {
      showToast({ title: t('chat.attachFailed') });
    }
  }
}

/** The attachments above the text: each a thumbnail with its future name and a remove button. */
export function AttachStrip() {
  const t = useT();
  const items = useChat((s) => s.attachments);
  const base = useChat((s) => s.items.flatMap((it) => it.images ?? []).reduce((m, im) => Math.max(m, im.n), 0) + 1);
  if (!items.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto px-1 pt-1.5 pb-1" data-testid="chat-attachments">
      {items.map((p, i) => (
        <div key={p.id} className="relative shrink-0" data-testid="chat-attachment">
          <img src={p.dataUrl} alt={`图${base + i}`} className="size-14 rounded-[12px] object-cover shadow-[inset_0_0_0_0.5px_var(--lg-separator)]" draggable={false} />
          <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 text-[10.5px] leading-4 font-semibold text-white">{`图${base + i}`}</span>
          <button
            type="button"
            className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-[var(--lg-ink)] text-[var(--lg-on-ink)]"
            aria-label={t('chat.attachRemove', { name: `图${base + i}` })}
            onClick={() => useChat.getState().setAttachments(items.filter((q) => q.id !== p.id))}
            data-testid="chat-attachment-remove"
          >
            <CloseIcon width={11} height={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** One image of the conversation or the compose field, small (the picker's rows). */
function Thumb({ id, dataUrl, size = 28 }: { id?: string; dataUrl?: string; size?: number }) {
  const stored = useImage(id ?? '');
  const src = dataUrl ?? stored ?? undefined;
  return src ? <img src={src} alt="" className="rounded-[6px] object-cover" style={{ width: size, height: size }} /> : <span className="rounded-[6px] bg-[var(--lg-row-active)]" style={{ width: size, height: size }} />;
}

/** The "@" choices: the conversation's images, then the attached ones (numbered as they will be). */
export function useMentionOptions(): { n: number; id: string; dataUrl?: string; pending: boolean }[] {
  const sent = useChat(useShallow((s) => s.items.flatMap((it) => it.images ?? [])));
  const pending = useChat((s) => s.attachments);
  const next = sent.reduce((m, im) => Math.max(m, im.n), 0) + 1;
  return [...sent.map((im) => ({ n: im.n, id: im.id, pending: false })), ...pending.map((p, i) => ({ n: next + i, id: p.id, dataUrl: p.dataUrl, pending: true }))];
}

/**
 * The "@" list (task 038): a small glass list above the compose field that
 * leaves the focus in the text (typing goes on; arrows and Enter choose,
 * Escape closes; a press chooses too).
 */
export function MentionPicker({ active, onChoose, anchor }: { active: number; onChoose: (n: number) => void; anchor: () => HTMLElement | null }) {
  const t = useT();
  const options = useMentionOptions();
  const host = usePortalHost();
  // Over the drawing, not inside the compose capsule (no glass on glass): in the glass layer's portal, above the capsule's text.
  const [box, setBox] = useState<{ left: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    const a = anchor();
    const cap = a?.closest<HTMLElement>('[data-testid=prompt]') ?? a;
    if (!a || !cap) return;
    const r = a.getBoundingClientRect(), c = cap.getBoundingClientRect();
    setBox({ left: Math.max(12, Math.min(r.left, innerWidth - 252)), bottom: innerHeight - c.top + 8 });
  }, [anchor]);
  if (!box || !host) return null;
  return createPortal(
    <Glass kind="text" radius={GLASS.radiusMenu} className="pointer-events-auto fixed z-50 flex max-h-[260px] w-[240px] flex-col overflow-y-auto p-1.5" style={{ left: box.left, bottom: box.bottom }} ariaRole="listbox" aria-label={t('chat.mention')} data-testid="chat-mention">
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          role="option"
          aria-selected={i === active}
          tabIndex={-1}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onChoose(o.n)}
          className={cx('lg-plate flex min-h-10 items-center gap-2.5 rounded-[14px] px-2 text-left text-[14px]', i === active && 'bg-[var(--lg-row-active)]')}
          data-testid={`chat-mention-${o.n}`}
        >
          <Thumb id={o.pending ? undefined : o.id} dataUrl={o.dataUrl} />
          <span className="flex-1">{`图${o.n}`}</span>
          {o.pending && <span className="text-[12px] text-ink-2">{t('chat.mentionPending')}</span>}
        </button>
      ))}
    </Glass>,
    host,
  );
}

/** A sent message's images: thumbnails with their names (or a note when they stayed on another device). */
export function MessageImages({ item }: { item: ChatItem }) {
  const t = useT();
  if (!item.images?.length) return null;
  return (
    <div className="mb-1.5 flex flex-wrap gap-2" data-testid="user-images">
      {item.images.map((im) => (
        <MessageImage key={im.id} image={im} missing={t('chat.imageElsewhere')} />
      ))}
    </div>
  );
}

function MessageImage({ image, missing }: { image: ChatImage; missing: string }) {
  const src = useImage(image.id);
  const h = 72, w = Math.round(Math.min(144, Math.max(48, (h * image.w) / Math.max(1, image.h))));
  return (
    <figure className="relative m-0" style={{ width: w, height: h }} title={src === null ? missing : undefined} data-testid="user-image">
      {src ? (
        <img src={src} alt={`图${image.n}`} className="size-full rounded-[12px] object-cover shadow-[inset_0_0_0_0.5px_var(--lg-separator)]" draggable={false} />
      ) : (
        <span className={cx('grid size-full place-items-center rounded-[12px] bg-[var(--lg-row-hover)] text-ink-3')}>
          <ImageIcon width={18} height={18} />
        </span>
      )}
      <figcaption className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 text-[10.5px] leading-4 font-semibold text-white">{`图${image.n}`}</figcaption>
    </figure>
  );
}
