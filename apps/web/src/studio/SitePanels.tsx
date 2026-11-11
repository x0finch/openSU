// Where the house is and which way it faces: the location picker (city
// search, "use my location", manual latitude / longitude) and the
// orientation dial. Both edit the site through `update_site` commands
// (validated, one undo step, autosaved). They show in the tool panel's
// place (desktop card, phone sheet; see tools.tsx). No network service is
// called: the city list is a lazy chunk of this app, and geolocation is
// asked for only on a tap.
import { type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownSmallIcon, CloseIcon, LocateIcon, PinIcon, SearchIcon } from '../components/icons';
import { cx } from '../components/ui';
import { applyEdit } from '../chat/chat-store';
import { useT } from '../lib/i18n';
import type { Place } from '../lib/places';
import {
  bearingText, coordText, frontBearing, isDefaultPlace, loadPlaces, northForBearing, placeName, placeRegion, placeText, sunnyBearing,
} from '../lib/site';
import { type SitePanel, useStudio } from '../lib/store';

type PlacesModule = Awaited<ReturnType<typeof loadPlaces>>;

function usePlaces(): PlacesModule | null {
  const [m, setM] = useState<PlacesModule | null>(null);
  useEffect(() => {
    let alive = true;
    void loadPlaces().then((x) => alive && setM(x));
    return () => {
      alive = false;
    };
  }, []);
  return m;
}

function PanelHead({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  const t = useT();
  return (
    <header className="flex shrink-0 items-start justify-between gap-2 pt-3.5 pr-2 pl-4">
      <div className="min-w-0 pt-0.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-xs leading-[18px] text-ink-2">{sub}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label={t('panel.done')} className="hit grid size-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-wash hover:text-ink">
        <CloseIcon width={18} height={18} />
      </button>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Location                                                            */
/* ------------------------------------------------------------------ */

const round2 = (v: number) => Math.round(v * 100) / 100;

async function setPlace(p: { lat: number; lon: number; tz: string; name: string }, summary: string): Promise<boolean> {
  return applyEdit([{ op: 'update_site', latitude: round2(p.lat), longitude: round2(p.lon), timeZone: p.tz, placeName: p.name }], summary);
}

export function LocationPanel({ panel, desktop, onClose }: { panel: SitePanel; desktop: boolean; onClose: () => void }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const site = useStudio((s) => s.house?.site);
  const setPanel = useStudio((s) => s.setSitePanel);
  const places = usePlaces();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<'locating' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const results = useMemo(() => (places && q.trim() ? places.searchPlaces(q, 8) : []), [places, q]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (desktop) input.current?.focus({ preventScroll: true });
  }, [desktop]);
  // A note ("could not get your location") is about the last attempt only:
  // a new search or another place clears it.
  useEffect(() => setNote(null), [q, site?.latitude, site?.longitude]);
  useEffect(() => setQ(''), [site?.latitude, site?.longitude]);

  const choose = async (p: Place) => {
    const name = placeName(p, lang);
    if (await setPlace({ lat: p.lat, lon: p.lon, tz: p.tz, name }, t('loc.edit', { name }))) setPanel(null);
  };

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setNote(t('loc.denied'));
      return;
    }
    setBusy('locating');
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // Rounded at once: nothing finer than 0.01 deg is kept anywhere.
        const lat = round2(pos.coords.latitude);
        const lon = round2(pos.coords.longitude);
        const m = places ?? (await loadPlaces());
        const near = m.nearestPlace(lat, lon).place;
        const name = t('loc.near', { name: placeName(near, lang) });
        setBusy(null);
        if (await setPlace({ lat, lon, tz: near.tz, name }, t('loc.edit', { name }))) setPanel(null);
      },
      () => {
        setBusy(null);
        setNote(t('loc.denied'));
      },
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 15000 },
    );
  };

  return (
    <>
      <PanelHead title={panel.intro ? t('loc.newHouse') : t('loc.title')} sub={t('loc.intro')} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4">
        {site && (
          <div className="mb-3 flex items-center gap-2.5 rounded-[10px] bg-wash px-3 py-2" data-testid="loc-current">
            <PinIcon width={17} height={17} className="shrink-0 text-ink-2" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{placeText(site, lang)}</p>
              <p className="tnum truncate text-2xs text-ink-2">
                {coordText(site.latitude, site.longitude)} · {site.timeZone ?? `UTC+${site.utcOffsetHours ?? 8}`}
              </p>
            </div>
          </div>
        )}
        <label className="flex h-11 items-center gap-2 rounded-[11px] border border-hairline bg-white px-3 transition-colors focus-within:border-ink-3">
          <SearchIcon width={17} height={17} className="shrink-0 text-ink-3" />
          <input
            ref={input}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) void choose(results[0]);
            }}
            placeholder={t('loc.search')}
            aria-label={t('loc.search')}
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3 [&:focus-visible]:outline-none"
            data-testid="loc-search"
            enterKeyHint="search"
          />
        </label>
        {q.trim() && (
          <ul className="mt-1.5 flex flex-col" aria-label={t('loc.search')} data-testid="loc-results">
            {!places && <li className="px-1 py-2 text-xs text-ink-3">{t('loc.loading')}</li>}
            {places && !results.length && <li className="px-1 py-2 text-xs leading-5 text-ink-2">{t('loc.none')}</li>}
            {results.map((p, i) => (
              <li key={`${p.en}-${p.lat}-${p.lon}-${i}`}>
                <button type="button" onClick={() => void choose(p)} className="flex w-full items-center gap-3 rounded-[9px] px-2 py-2 text-left transition-colors hover:bg-wash focus-visible:bg-wash">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">
                      {placeName(p, lang)}
                      {lang === 'zh' && p.zh && p.cc !== 'CN' && <span className="ml-1.5 font-normal text-ink-3">{p.en}</span>}
                    </span>
                    <span className="block truncate text-xs text-ink-2">{placeRegion(p, lang)}</span>
                  </span>
                  <span className="tnum shrink-0 text-2xs text-ink-3">{coordText(p.lat, p.lon)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 border-t border-hairline pt-3">
          <button
            type="button"
            onClick={locate}
            disabled={busy === 'locating'}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-wash text-[13px] font-medium text-ink transition-colors hover:bg-hairline disabled:opacity-70"
            data-testid="loc-mine"
          >
            <LocateIcon width={17} height={17} />
            {busy === 'locating' ? t('loc.locating') : t('loc.mine')}
          </button>
          <p className="mt-1.5 text-2xs leading-4 text-ink-3">{t('loc.mineNote')}</p>
          {note && <p className="mt-2 rounded-[8px] bg-wash px-2.5 py-2 text-xs leading-5 text-ink-2" role="status">{note}</p>}
        </div>

        <div className="mt-3 border-t border-hairline pt-1">
          <button type="button" onClick={() => setManual(!manual)} aria-expanded={manual} className="flex h-9 w-full items-center gap-1 text-left text-xs font-medium text-ink-2 transition-colors hover:text-ink">
            <ChevronDownSmallIcon width={15} height={15} className={cx('transition-transform', !manual && '-rotate-90')} />
            {t('loc.manual')}
          </button>
          {manual && site && <ManualCoords places={places} initial={site} />}
        </div>

        {panel.intro && (
          <button type="button" onClick={() => setPanel(null)} className="mt-3 h-10 w-full rounded-[11px] border border-hairline text-[13px] text-ink-2 transition-colors hover:bg-wash hover:text-ink" data-testid="loc-skip">
            {site && isDefaultPlace(site) ? t('loc.skip') : t('panel.done')}
          </button>
        )}
        <p className="mt-3 text-[10px] leading-4 text-ink-3">{t('loc.source')}</p>
      </div>
    </>
  );
}

function ManualCoords({ places, initial }: { places: PlacesModule | null; initial: { latitude: number; longitude: number } }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const setPanel = useStudio((s) => s.setSitePanel);
  const [lat, setLat] = useState(String(initial.latitude));
  const [lon, setLon] = useState(String(initial.longitude));
  const la = Number(lat), lo = Number(lon);
  const valid = lat.trim() !== '' && lon.trim() !== '' && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180;
  const near = valid && places ? places.nearestPlace(la, lo).place : null;
  const field = (label: string, value: string, set: (v: string) => void, testId: string) => (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-2xs text-ink-2">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => set(e.target.value.replace(/[^\d.\-]/g, ''))}
        className="tnum h-10 rounded-[9px] border border-hairline px-2.5 text-[14px] outline-none focus:border-ink-3 [&:focus-visible]:outline-none"
        data-testid={testId}
      />
    </label>
  );
  return (
    <div className="pb-1">
      <div className="flex gap-2">
        {field(t('loc.lat'), lat, setLat, 'loc-lat')}
        {field(t('loc.lon'), lon, setLon, 'loc-lon')}
      </div>
      <p className="mt-1.5 min-h-4 text-2xs leading-4 text-ink-3">{!valid ? t('loc.invalid') : near ? t('loc.tz', { tz: near.tz, name: placeName(near, lang) }) : ''}</p>
      <button
        type="button"
        disabled={!valid || !near}
        onClick={async () => {
          if (!near) return;
          const name = t('loc.near', { name: placeName(near, lang) });
          if (await setPlace({ lat: la, lon: lo, tz: near.tz, name }, t('loc.edit', { name: coordText(round2(la), round2(lo)) }))) setPanel(null);
        }}
        className="mt-2 h-10 w-full rounded-[11px] bg-ink text-[13px] font-medium text-white transition-opacity disabled:opacity-40"
        data-testid="loc-apply"
      >
        {t('loc.apply')}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Orientation                                                         */
/* ------------------------------------------------------------------ */

const snap = (deg: number, step = 5) => {
  let d = Math.round(deg / step) * step;
  d = ((((d + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};

const SUN_DIR: Record<'zh' | 'en', [string, string]> = { zh: ['南', '北'], en: ['south', 'north'] };

export function OrientationPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const site = useStudio((s) => s.house?.site);
  const [north, setNorth] = useState(site?.northDeg ?? 0);
  const committed = useRef(site?.northDeg ?? 0);
  useEffect(() => {
    if (site) {
      setNorth(site.northDeg);
      committed.current = site.northDeg;
    }
  }, [site?.northDeg]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!site) return null;
  const commit = (n: number) => {
    if (n === committed.current) return;
    committed.current = n;
    const dir = bearingText(frontBearing(n), lang);
    void applyEdit([{ op: 'update_site', northDeg: n }], t('ori.edit', { dir }));
  };
  const sunny = sunnyBearing(site.latitude);
  // Compass-relative presets, the sunny side first (computed from the latitude).
  const presets = [0, -15, 15, -30, 30].map((d) => sunny + d).concat([90, 270, (sunny + 180) % 360]);
  const sun = SUN_DIR[lang][site.latitude >= 0 ? 0 : 1];
  return (
    <>
      <PanelHead title={t('ori.title')} sub={t('ori.drag')} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
        <Dial north={north} onChange={setNorth} onCommit={commit} />
        <p className="mt-1 text-center text-[15px] font-semibold" data-testid="ori-text">
          {t('ori.front', { dir: bearingText(frontBearing(north), lang) })}
        </p>
        <p className="mt-1 text-center text-xs leading-5 text-ink-2">{t('ori.sunny', { sun })}</p>
        <p className="mt-4 mb-1.5 text-2xs font-medium tracking-[0.06em] text-ink-3 uppercase">{t('ori.presets')}</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('ori.presets')}>
          {presets.map((b) => {
            const n = northForBearing(b);
            const on = snap(north) === n;
            return (
              <button
                key={b}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setNorth(n);
                  commit(n);
                }}
                className={cx('h-8 rounded-full px-3 text-xs font-medium transition-colors', on ? 'bg-ink text-white' : 'bg-wash text-ink hover:bg-hairline')}
              >
                {bearingText(b, lang)}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

const LETTERS: Record<'zh' | 'en', string[]> = { zh: ['北', '东', '南', '西'], en: ['N', 'E', 'S', 'W'] };

/**
 * The plot stays as on the plan (front at the bottom); the compass ring
 * turns. Drag anywhere on the dial to aim north (snaps to 5 deg); arrow
 * keys turn by 5 deg (Shift: 1 deg).
 */
function Dial({ north, onChange, onCommit }: { north: number; onChange: (n: number) => void; onCommit: (n: number) => void }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef(false);
  const last = useRef(north);
  last.current = north;
  const angleAt = (e: RPointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return (Math.atan2(dx, -dy) * 180) / Math.PI;
  };
  const down = (e: RPointerEvent<SVGSVGElement>) => {
    drag.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(snap(angleAt(e)));
  };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    if (drag.current) onChange(snap(angleAt(e)));
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = false;
    onCommit(last.current);
  };
  const key = (e: RKeyboardEvent) => {
    const step = e.shiftKey ? 1 : 5;
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
    if (!d) return;
    e.preventDefault();
    const n = snap(north + d, step);
    onChange(n);
    onCommit(n);
  };
  const R = 96;
  const ticks: ReactNode[] = [];
  for (let a = 0; a < 360; a += 15) {
    const major = a % 90 === 0;
    ticks.push(<line key={a} x1={0} y1={-R} x2={0} y2={-R + (major ? 9 : 5)} stroke={major ? 'var(--color-ink)' : 'var(--color-ink-3)'} strokeWidth={major ? 1.4 : 1} transform={`rotate(${a})`} />);
  }
  const letters = LETTERS[lang];
  return (
    <svg
      ref={svg}
      viewBox="-120 -120 240 240"
      className="mx-auto block size-[228px] cursor-grab touch-none select-none active:cursor-grabbing"
      role="slider"
      tabIndex={0}
      aria-label={t('ori.dial')}
      aria-valuemin={-180}
      aria-valuemax={180}
      aria-valuenow={north}
      aria-valuetext={t('ori.front', { dir: bearingText(frontBearing(north), lang) })}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      data-testid="ori-dial"
    >
      <circle r={R + 14} fill="var(--color-wash)" />
      <circle r={R} fill="white" stroke="var(--color-hairline)" />
      {/* The plot, as drawn on the plan: the front is its bottom edge. */}
      <g>
        <rect x={-34} y={-34} width={68} height={68} fill="var(--color-wash)" stroke="var(--color-ink-3)" strokeWidth={1} />
        <path d="M-34 34H34" stroke="var(--color-ink)" strokeWidth={3} />
        <text y={52} textAnchor="middle" fontSize={10} fill="var(--color-ink-2)">{lang === 'zh' ? '正面' : 'front'}</text>
      </g>
      <g transform={`rotate(${north})`} style={{ transition: drag.current ? 'none' : 'transform 160ms ease' }}>
        {ticks}
        {letters.map((l, i) => (
          <text key={l} x={0} y={-R + 22} textAnchor="middle" dominantBaseline="central" fontSize={i === 0 ? 13 : 11} fontWeight={i === 0 ? 700 : 500} fill={i === 0 ? 'var(--color-ink)' : 'var(--color-ink-2)'} transform={`rotate(${i * 90}) rotate(${-north - i * 90} 0 ${-R + 22})`}>
            {l}
          </text>
        ))}
        {/* North needle. */}
        <path d="M0 -58 7 -38 0 -42 -7 -38Z" fill="var(--color-ink)" />
        <path d="M0 -58 0 -42 -7 -38Z" fill="var(--color-accent)" />
        <circle cx={0} cy={-R - 7} r={6} fill="var(--color-accent)" stroke="white" strokeWidth={2} />
      </g>
    </svg>
  );
}

