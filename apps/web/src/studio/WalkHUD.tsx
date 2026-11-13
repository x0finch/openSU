// Walk mode HUD, on the glass primitives (task 017): a hint capsule, level
// chips (tap to take the stairs at once), a mini-map (the floor plan with a
// position and heading marker) on a glass surface, and a touch joystick.
// The tool group's "漫游 ×" exits (Escape too); the sun panel stays
// available, so the sun can move while standing in a room.
import { type CSSProperties, type PointerEvent as RPointerEvent, useEffect, useRef, useState } from 'react';
import { CloseIcon } from '../components/icons';
import { cx } from '../components/ui';
import { Glass, GlassButton } from '../glass';
import { levelName, useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import type { Derived } from './house-data';
import type { PlanDrawing } from './plan-data';
import { useWalkLevel, walkBridge } from './walk-bridge';
import { SunTime } from './tools';
export { WalkIcon } from './walk-icon';

let planMod: Promise<typeof import('./plan-data')> | null = null;

/** The current level's plan, cropped to the plot, with the walker on it. */
function MiniMap({ derived, width }: { derived: Derived; width: number }) {
  const t = useT();
  const level = useWalkLevel() ?? derived.levels[0]?.id ?? null;
  const [plan, setPlan] = useState<PlanDrawing | null>(null);
  const marker = useRef<HTMLDivElement>(null);
  const resolved = derived.resolved;

  useEffect(() => {
    let alive = true;
    if (import.meta.env.SSR || !level) return;
    void (planMod ??= import('./plan-data')).then((m) => {
      if (alive) setPlan(m.planDrawing(resolved, level));
    });
    return () => {
      alive = false;
    };
  }, [resolved, level]);

  // Crop: the plot plus a small margin, in drawing px.
  const pad = 400;
  const [ax, ay] = plan ? plan.px(-pad, resolved.site.depth + pad) : [0, 0];
  const [bx, by] = plan ? plan.px(resolved.site.width + pad, -pad) : [1, 1];
  const k = width / Math.max(1, bx - ax);
  const height = Math.round((by - ay) * k);

  // The marker follows the walker without React renders.
  useEffect(() => {
    if (!plan) return;
    const place = (s: { x: number; y: number; headingDeg: number } | null) => {
      const el = marker.current;
      if (!el || !s) return;
      const [px, py] = plan.px(s.x * 1000, s.y * 1000);
      el.style.transform = `translate(${((px - ax) * k).toFixed(1)}px, ${((py - ay) * k).toFixed(1)}px) rotate(${s.headingDeg.toFixed(1)}deg)`;
    };
    place(walkBridge.state);
    return walkBridge.subscribe(place);
  }, [plan, ax, ay, k]);

  return (
    <div className="relative overflow-hidden rounded-[16px] bg-page" style={{ width, height: plan ? height : Math.round(width * 0.8) }} role="img" aria-label={t('walk.map')}>
      {plan && (
        <div
          className="absolute top-0 left-0 origin-top-left [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          style={{ width: plan.width, height: plan.height, transform: `translate(${-ax * k}px, ${-ay * k}px) scale(${k})` }}
          dangerouslySetInnerHTML={{ __html: plan.svg }}
        />
      )}
      <div ref={marker} className="pointer-events-none absolute top-0 left-0 size-0" data-testid="walk-marker">
        {/* View cone and position dot; heading 0 = up (north). */}
        <svg viewBox="-24 -24 48 48" width={48} height={48} className="absolute -top-6 -left-6 overflow-visible" aria-hidden="true">
          <path d="M0 0 L-13 -21 A 24 24 0 0 1 13 -21 Z" fill="var(--color-accent)" fillOpacity={0.45} />
          <circle r={4.6} fill="var(--color-ink)" stroke="white" strokeWidth={1.6} />
        </svg>
      </div>
    </div>
  );
}

/** Level chips: the walker's level is marked; another one takes the stairs at once. */
function Levels({ derived, size = 'md' }: { derived: Derived; size?: 'md' | 'lg' }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const current = useWalkLevel();
  return (
    <div className="flex gap-1" role="group" aria-label={t('levels.label')}>
      {derived.levels.map((l) => {
        const name = levelName(lang, l.name, l.index, l.isAttic);
        const on = current === l.id;
        return (
          <button
            key={l.id}
            type="button"
            aria-pressed={on}
            aria-label={on ? name : t('walk.goto', { level: name })}
            onClick={() => !on && walkBridge.toLevel(l.id)}
            data-on={on ? '' : undefined}
            className={cx('hit lg-plate min-w-11 px-3 whitespace-nowrap', size === 'lg' ? 'h-11 text-sm' : 'h-8 text-[13px]', on ? 'font-semibold text-ink' : 'font-medium text-ink-2')}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

function ExitWalk({ className }: { className?: string }) {
  const t = useT();
  const setWalk = useStudio((s) => s.setWalk);
  return (
    <GlassButton size={44} glassClassName={className} icon={<CloseIcon width={16} height={16} />} onClick={() => setWalk(false)}>
      {t('walk.exit')}
    </GlassButton>
  );
}

/** Touch joystick: drag the knob; the walker moves while it is held. */
function Joystick({ className, style }: { className?: string; style?: CSSProperties }) {
  const t = useT();
  const R = 52;
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const set = (dx: number, dy: number) => {
    const d = Math.hypot(dx, dy);
    const s = d > R ? R / d : 1;
    const x = dx * s, y = dy * s;
    if (knob.current) knob.current.style.transform = `translate(${x}px, ${y}px)`;
    // A small dead zone keeps a resting thumb still.
    const f = d < 6 ? 0 : -y / R, st = d < 6 ? 0 : x / R;
    walkBridge.move(f, st);
  };
  const down = (e: RPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    active.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    e.currentTarget.setPointerCapture(e.pointerId);
    set(e.clientX - active.current.cx, e.clientY - active.current.cy);
  };
  const move = (e: RPointerEvent<HTMLElement>) => {
    const a = active.current;
    if (a && e.pointerId === a.id) set(e.clientX - a.cx, e.clientY - a.cy);
  };
  const up = (e: RPointerEvent<HTMLElement>) => {
    if (active.current?.id !== e.pointerId) return;
    active.current = null;
    set(0, 0);
  };
  useEffect(() => () => walkBridge.move(0, 0), []);
  return (
    <Glass
      className={cx('pointer-events-auto grid size-[124px] touch-none place-items-center', className)}
      style={style}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      ariaRole="application"
      aria-label={t('walk.joystick')}
      data-testid="walk-joystick"
    >
      <div ref={knob} className="lg-knob size-12" />
    </Glass>
  );
}

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    const mq = matchMedia('(pointer: coarse)');
    const on = () => setCoarse(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return coarse;
}

/** "Walking · level · how to move · how to leave", centred under the mode switch. */
function WalkPill({ derived, touch, className, style }: { derived: Derived; touch: boolean; className?: string; style?: CSSProperties }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const id = useWalkLevel() ?? derived.levels[0]?.id;
  const l = derived.levels.find((x) => x.id === id);
  const level = l ? levelName(lang, l.name, l.index, l.isAttic) : '';
  return (
    <Glass ariaRole="status" className={cx('pointer-events-none truncate px-4 py-2 text-center text-[13px] leading-5 font-medium', className)} style={style} data-testid="walk-pill">
      {touch ? t('walk.pillTouch') : t('walk.pill', { level })}
    </Glass>
  );
}

/** Desktop walk HUD: the hint pill top centre, the map with level chips under the title, a joystick on touch screens. */
export function WalkHUD({ derived, left = 0 }: { derived: Derived | null; left?: number }) {
  const t = useT();
  const coarse = useCoarsePointer();
  if (!derived) return null;
  return (
    <>
      <div className="pointer-events-none absolute top-[76px] right-0 flex justify-center px-6" style={{ left }}>
        <WalkPill derived={derived} touch={false} className="max-w-full" />
      </div>
      <Glass kind="text" radius={26} className="pointer-events-auto absolute top-[84px] w-[244px] p-3" style={{ left: left + 24 }} data-testid="walk-hud">
        <MiniMap derived={derived} width={220} />
        <div className="mt-2 flex items-center justify-between gap-2">
          <Levels derived={derived} />
        </div>
        <p className="mt-1.5 px-1 text-[12px] leading-4 font-medium text-ink-2">{coarse ? t('walk.hintTouch') : t('walk.hint')}</p>
      </Glass>
      {coarse && <Joystick className="absolute right-6 bottom-[100px]" />}
    </>
  );
}

/** Phone walk HUD: the pill under the header, levels and the map below it, the joystick above the input. */
export function MobileWalkHUD({ derived, top, bottom }: { derived: Derived | null; top: string; bottom: number }) {
  if (!derived) return null;
  return (
    <>
      <div className="pointer-events-none absolute inset-x-3 flex flex-col items-center gap-2" style={{ top: `calc(${top} + 4px)` }}>
        <WalkPill derived={derived} touch className="max-w-full" />
        <div className="flex w-full items-start justify-between">
          <Glass className="pointer-events-auto p-1">
            <Levels derived={derived} size="lg" />
          </Glass>
          <Glass kind="text" radius={22} className="pointer-events-auto p-1.5" data-testid="walk-hud">
            <MiniMap derived={derived} width={112} />
          </Glass>
        </div>
      </div>
      <Joystick className="absolute left-4 size-[112px]! transition-[bottom] duration-300 ease-out-soft" style={{ bottom: bottom + 12 }} />
    </>
  );
}

/**
 * Phone held sideways while walking: the room fills the screen. Exit and
 * levels top-left, the mini-map top-right, the joystick bottom-left and the
 * time of day bottom-right; nothing overlaps at 844 x 390.
 */
export function LandscapeWalkHUD({ derived }: { derived: Derived | null }) {
  if (!derived) return null;
  const left = 'max(12px, env(safe-area-inset-left))';
  const right = 'max(12px, env(safe-area-inset-right))';
  return (
    <div className="pointer-events-none absolute inset-0" data-testid="walk-landscape">
      <div className="absolute top-3 flex items-center gap-2" style={{ left }}>
        <ExitWalk />
        <Glass className="pointer-events-auto p-1.5">
          <Levels derived={derived} />
        </Glass>
      </div>
      <Glass kind="text" radius={22} className="pointer-events-auto absolute top-3 p-1.5" style={{ right }} data-testid="walk-hud">
        <MiniMap derived={derived} width={124} />
      </Glass>
      <Joystick className="absolute bottom-3 size-[112px]!" style={{ left }} />
      <Glass kind="text" radius={26} className="pointer-events-auto absolute bottom-3 flex w-[340px] items-center gap-2 py-1.5 pr-4 pl-1.5" style={{ right }}>
        <SunTime className="min-w-0 flex-1" />
      </Glass>
    </div>
  );
}

/** Escape leaves walk mode (desktop keyboards), unless typing in a field. */
export function useEscapeExitsWalk(): void {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const s = useStudio.getState();
      if (s.walk) s.setWalk(false);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}
