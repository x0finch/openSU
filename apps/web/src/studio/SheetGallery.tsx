// 图册: the shareable sheet set, rendered in the browser. Thumbnails appear
// as each sheet is ready; tap one for the large preview; download one or
// all; share through the Web Share API (files) where the browser has it.
// Lazy chunk (it pulls in @opensu/sheet and with it three.js).
import { levelHeroViews, VIEWS_SHEET_VIEWS } from '@opensu/sheet';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, DownloadIcon, ShareIcon } from '../components/icons';
import { cx, IconButton } from '../components/ui';
import { levelName, type MessageKey, useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import type { Derived } from './house-data';
import { type SheetFile, sheetJob, type SheetSnapshot } from './sheet-data';

/**
 * Header of the sheets: the house's own name (Chinese like the posts they
 * are made for; facts and plans are Chinese too). The internal golden
 * benchmark gets a generic title.
 */
export function sheetTitle(name: string): string {
  return name.startsWith('Golden sample') ? '自建房' : name;
}

interface SheetMeta {
  title: string;
  sub: string;
  file: string;
}

declare global {
  interface Window {
    __sheets?: SheetSnapshot;
  }
}

function useSheets(derived: Derived): SheetSnapshot {
  const job = useMemo(() => sheetJob(derived.resolved, sheetTitle(derived.resolved.name)), [derived.resolved]);
  const snap = useSyncExternalStore(job.subscribe, job.snapshot, job.snapshot);
  useEffect(() => {
    window.__sheets = snap;
  }, [snap]);
  return snap;
}

/** A file-name-safe form of a name (no path or reserved characters, no spaces). */
export function fileStem(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'opensu';
}

function downloadFile(f: SheetFile, name: string): void {
  const a = document.createElement('a');
  a.href = f.url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Files share where the browser supports it (phones, some desktops). */
function canShareFiles(): boolean {
  try {
    const probe = new File([new Blob([''], { type: 'image/png' })], 'probe.png', { type: 'image/png' });
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

async function share(files: { f: SheetFile; name: string }[], title: string): Promise<boolean> {
  const list = files.map(({ f, name }) => new File([f.blob], name, { type: 'image/png' }));
  if (!navigator.canShare?.({ files: list })) return false;
  try {
    await navigator.share({ files: list, title });
  } catch (e) {
    // The user closing the share sheet is not an error.
    if ((e as DOMException)?.name !== 'AbortError') console.warn(e);
  }
  return true;
}

export default function SheetGallery({ derived, desktop }: { derived: Derived; desktop: boolean }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const snap = useSheets(derived);
  const [preview, setPreview] = useState<number | null>(null);
  const shareable = useMemo(canShareFiles, []);

  const metas: SheetMeta[] = useMemo(() => {
    const view = (id: string) => t(`view.${id}` as MessageKey);
    const heroes = levelHeroViews(derived.resolved);
    // Files carry the house's name: "白墙坡顶小院-1-一层.png".
    const stem = fileStem(sheetTitle(derived.resolved.name));
    const out = derived.levels.map((l, i) => {
      const level = levelName(lang, l.name, l.index, l.isAttic);
      return { title: t('sheets.level', { level }), sub: view(heroes[i % heroes.length]!), file: `${stem}-${i + 1}-${fileStem(level)}.png` };
    });
    out.push({ title: t('sheets.views'), sub: VIEWS_SHEET_VIEWS.map(view).join(' · '), file: `${stem}-${out.length + 1}-${fileStem(t('sheets.views'))}.png` });
    return out;
  }, [derived.levels, derived.resolved, lang, t]);

  const ready = snap.files.filter(Boolean).length;
  const all = snap.files.flatMap((f, i) => (f ? [{ f, name: metas[i]!.file }] : []));
  const title = sheetTitle(derived.resolved.name);

  const downloadAll = async () => {
    for (const [i, x] of all.entries()) {
      if (i) await new Promise((r) => setTimeout(r, 300));
      downloadFile(x.f, x.name);
    }
  };
  const shareAll = async () => {
    if (!(await share(all, title))) void downloadAll();
  };

  return (
    <div className="absolute inset-0" data-testid="sheets">
      <div className="absolute inset-0 overflow-y-auto">
      <div className={cx('mx-auto flex min-h-full flex-col', desktop ? 'max-w-[1600px] px-12 pt-24 pb-44' : 'px-4 pt-[84px] pb-36')}>
        <ul
          className={cx(desktop ? 'flex flex-1 flex-wrap content-center items-start justify-center gap-6' : 'grid flex-1 grid-cols-2 content-center gap-x-3 gap-y-4')}
          aria-label={t('sheets.label')}
          // Desktop: one row of cards as large as the free area allows (right of
          // the title block, between the top bar and the dock), centred in it.
          style={desktop ? { ['--n' as string]: metas.length } : undefined}
        >
          {metas.map((m, i) => (
            <SheetCard key={m.file} index={i} meta={m} file={snap.files[i]} desktop={desktop} onOpen={() => setPreview(i)} />
          ))}
        </ul>
      </div>
      </div>

      {/* Above the conversation input, which stays at the bottom. */}
      <div className={cx('pointer-events-none absolute inset-x-0 flex justify-center', desktop ? 'bottom-[96px]' : 'bottom-[80px]')}>
        <div className="glass pointer-events-auto flex items-center gap-1 rounded-ui p-1 pl-4" role="group" aria-label={t('sheets.label')}>
          <p className="tnum mr-3 text-xs whitespace-nowrap text-ink-2" aria-live="polite">
            {snap.error ? t('sheets.error') : snap.done ? t('sheets.ready', { n: ready }) : t('sheets.generating', { n: Math.min(ready + 1, snap.count), total: snap.count })}
          </p>
          {!snap.done && <Spinner />}
          <button
            type="button"
            disabled={!snap.done || !!snap.error}
            onClick={() => void downloadAll()}
            className="inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-ink transition-colors hover:bg-wash disabled:text-ink-3 disabled:hover:bg-transparent"
          >
            <DownloadIcon width={17} height={17} />
            {t('sheets.downloadAll')}
          </button>
          {shareable && (
            <button
              type="button"
              disabled={!snap.done || !!snap.error}
              onClick={() => void shareAll()}
              className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-ink px-3.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <ShareIcon width={17} height={17} />
              {t('sheets.share')}
            </button>
          )}
        </div>
      </div>

      {preview !== null && (
        <Preview
          metas={metas}
          files={snap.files}
          index={preview}
          onIndex={setPreview}
          onClose={() => setPreview(null)}
          shareable={shareable}
          title={title}
          desktop={desktop}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span className="mr-2 inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-hairline border-t-ink" aria-hidden="true" />
  );
}

function SheetCard({ index, meta, file, desktop, onOpen }: { index: number; meta: SheetMeta; file: SheetFile | undefined; desktop: boolean; onOpen: () => void }) {
  const t = useT();
  return (
    <li
      className="group flex min-w-0 flex-col"
      style={desktop ? { width: 'min(calc((100vw - 96px - (var(--n) - 1) * 24px) / var(--n)), calc((100dvh - 96px - 112px - 52px) * 0.75), 420px)' } : undefined}
    >
      <div className="relative">
        <button
          type="button"
          disabled={!file}
          onClick={onOpen}
          aria-label={`${meta.title} · ${t('sheets.open')}`}
          className={cx(
            'relative block aspect-[3/4] w-full overflow-hidden rounded-[6px] bg-white shadow-hair transition-[box-shadow,transform] duration-300 ease-out-soft',
            file && 'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_28px_rgba(0,0,0,0.07)] hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_14px_36px_rgba(0,0,0,0.10)]',
          )}
        >
          {file ? (
            <img src={file.url} alt={meta.title} className="absolute inset-0 size-full animate-[fade-in_400ms_ease-out] object-cover" draggable={false} />
          ) : (
            <SheetSkeleton />
          )}
        </button>
        {file && desktop && (
          <span className="absolute top-2 right-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
            <IconButton label={t('sheets.download')} tipSide="top" className="glass size-8" onClick={() => downloadFile(file, meta.file)}>
              <DownloadIcon width={16} height={16} />
            </IconButton>
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-baseline gap-2 px-0.5">
        <span className="tnum text-2xs text-ink-3">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{meta.title}</p>
          <p className="truncate text-2xs text-ink-2">{meta.sub}</p>
        </div>
      </div>
    </li>
  );
}

/** Placeholder in the shape of a sheet: a hero block, a hairline, a plan block. */
function SheetSkeleton() {
  return (
    <span className="absolute inset-0 flex flex-col p-[9%]" aria-hidden="true">
      <span className="h-[4%] w-[28%] rounded-[2px] bg-wash" />
      <span className="mx-auto mt-[6%] h-[30%] w-[62%] rounded-[3px] bg-wash" />
      <span className="mt-[7%] h-px w-full bg-hairline" />
      <span className="mx-auto mt-[8%] h-[34%] w-[66%] rounded-[3px] bg-wash" />
      <span className="absolute inset-x-0 bottom-0 h-px overflow-hidden bg-hairline">
        <span className="absolute inset-y-0 left-0 w-2/5 animate-[progress-sweep_1.2s_cubic-bezier(0.6,0,0.4,1)_infinite] bg-ink" />
      </span>
    </span>
  );
}

function Preview({
  metas, files, index, onIndex, onClose, shareable, title, desktop,
}: {
  metas: SheetMeta[];
  files: (SheetFile | undefined)[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  shareable: boolean;
  title: string;
  desktop: boolean;
}) {
  const t = useT();
  const n = metas.length;
  const ref = useRef<HTMLDivElement>(null);
  const go = useCallback((d: number) => onIndex((index + d + n) % n), [index, n, onIndex]);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);
  // Swipe left / right on phones.
  const touch = useRef<number | null>(null);
  const meta = metas[index]!;
  const file = files[index];
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
      className="fixed inset-0 z-40 flex animate-[fade-in_160ms_ease-out] flex-col bg-wash outline-none"
      onTouchStart={(e) => (touch.current = e.touches[0]!.clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0]!.clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <header className={cx('flex shrink-0 items-center justify-between', desktop ? 'h-16 px-6' : 'h-14 px-3 pt-[env(safe-area-inset-top)]')}>
        <div className="min-w-0 pl-1">
          <p className="truncate text-sm font-medium text-ink">{meta.title}</p>
          <p className="tnum truncate text-2xs text-ink-2">
            {index + 1} / {n} · {meta.sub}
            {file ? ` · ${file.width} × ${file.height}` : ''}
          </p>
        </div>
        <IconButton label={t('sheets.close')} tip={false} onClick={onClose} className="size-11">
          <CloseIcon width={20} height={20} />
        </IconButton>
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        {file ? (
          <img
            key={file.url}
            src={file.url}
            alt={meta.title}
            className="max-h-full max-w-full animate-[fade-in_200ms_ease-out] rounded-[4px] bg-white object-contain shadow-[0_2px_6px_rgba(0,0,0,0.06),0_24px_60px_rgba(0,0,0,0.12)]"
            draggable={false}
          />
        ) : (
          <div className="aspect-[3/4] h-full max-h-full rounded-[4px] bg-white">
            <SheetSkeleton />
          </div>
        )}
        {desktop && (
          <>
            <div className="absolute top-1/2 left-6 -translate-y-1/2">
              <IconButton label={t('sheets.prev')} tipSide="right" onClick={() => go(-1)} className="size-11 rounded-full bg-white shadow-float hover:bg-white">
                <ChevronLeftIcon width={22} height={22} />
              </IconButton>
            </div>
            <div className="absolute top-1/2 right-6 -translate-y-1/2">
              <IconButton label={t('sheets.next')} tipSide="left" onClick={() => go(1)} className="size-11 rounded-full bg-white shadow-float hover:bg-white">
                <ChevronRightIcon width={22} height={22} />
              </IconButton>
            </div>
          </>
        )}
      </div>
      <footer className={cx('flex shrink-0 items-center justify-center gap-2', desktop ? 'h-20' : 'h-[72px] pb-[env(safe-area-inset-bottom)]')}>
        {!desktop && (
          <div className="mr-auto ml-3 flex gap-1.5" aria-hidden="true">
            {metas.map((m, i) => (
              <span key={m.file} className={cx('h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-ink' : 'w-1.5 bg-hairline')} />
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={!file}
          onClick={() => file && downloadFile(file, meta.file)}
          className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-hairline bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-wash disabled:text-ink-3"
        >
          <DownloadIcon width={17} height={17} />
          {t('sheets.download')}
        </button>
        {shareable && (
          <button
            type="button"
            disabled={!file}
            onClick={() => file && void share([{ f: file, name: meta.file }], title)}
            className={cx('inline-flex h-10 items-center gap-1.5 rounded-sm bg-ink px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40', !desktop && 'mr-3')}
          >
            <ShareIcon width={17} height={17} />
            {t('sheets.share')}
          </button>
        )}
        {!shareable && !desktop && <span className="mr-3" />}
      </footer>
    </div>
  );
}
