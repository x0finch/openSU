// Walk mode HUD: exit, level indicator (tap to take the stairs at once),
// a mini-map (the floor plan with a position and heading marker), a short
// hint, and a touch joystick on phones. The time slider of the scene dock
// stays available, so the sun can move while standing in a room.
import { type CSSProperties, type PointerEvent as RPointerEvent, type SVGProps, useEffect, useRef, useState } from 'react';
import { CloseIcon } from '../components/icons';
import { cx, IconButton } from '../components/ui';
import { levelName, useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import type { Derived } from './house-data';
import type { PlanDrawing } from './plan-data';
import { useWalkLevel, walkBridge } from './walk-bridge';
import { SunTime, SunToggle } from './chrome';

let planMod: Promise<typeof import('./plan-data')> | null = null;

/** A walking figure (24 px grid, like the other line icons). */
export function WalkIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx={13} cy={4.6} r={1.7} fill="currentColor" stroke="none" />
      <path d="M12.2 8.2 10.4 13l2.9 2.6.9 5" />
      <path d="M10.4 13 8.6 20.4" />
      <path d="M12.2 8.2 15.4 11.6l2.6.6" />
      <path d="M12.2 8.2 9 9.8 7.4 12.4" />
    </svg>
  );
}

/** Enters walk mode (view rail on desktop, the sheet on phones). */
export function WalkButton({ variant = 'rail' }: { variant?: 'rail' | 'tile' }) {
  const t = useT();
  const walk = useStudio((s) => s.walk);
  const setWalk = useStudio((s) => s.setWalk);
  if (variant === 'tile') {
    return (
      <button
        type="button"
        aria-pressed={walk}
        aria-label={t('walk.enterLong')}
        onClick={() => setWalk(!walk)}
        className={cx('flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-sm transition-colors', walk ? 'bg-ink text-white' : 'bg-wash text-ink')}
      >
        <WalkIcon width={18} height={18} />
        <span className={cx('text-2xs', walk ? 'text-white/80' : 'text-ink-2')}>{t('walk.enter')}</span>
      </button>
    );
  }
  return (
    <IconButton label={t('walk.enterLong')} active={walk} aria-pressed={walk} onClick={() => setWalk(!walk)}>
      <WalkIcon width={22} height={22} />
    </IconButton>
  );
}

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
    <div className="relative overflow-hidden rounded-sm bg-white" style={{ width, height: plan ? height : Math.round(width * 0.8) }} role="img" aria-label={t('walk.map')}>
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
            className={cx(
              'rounded-[6px] px-2.5 font-medium whitespace-nowrap transition-colors',
              size === 'lg' ? 'h-9 text-sm' : 'h-7 text-xs',
              on ? 'bg-ink text-white' : 'bg-wash text-ink-2 hover:text-ink',
            )}
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
    <button
      type="button"
      onClick={() => setWalk(false)}
      className={cx('glass pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full pr-3.5 pl-2.5 text-sm font-medium text-ink', className)}
    >
      <CloseIcon width={16} height={16} />
      {t('walk.exit')}
    </button>
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
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    active.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    e.currentTarget.setPointerCapture(e.pointerId);
    set(e.clientX - active.current.cx, e.clientY - active.current.cy);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const a = active.current;
    if (a && e.pointerId === a.id) set(e.clientX - a.cx, e.clientY - a.cy);
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (active.current?.id !== e.pointerId) return;
    active.current = null;
    set(0, 0);
  };
  useEffect(() => () => walkBridge.move(0, 0), []);
  return (
    <div
      className={cx('glass pointer-events-auto grid size-[124px] touch-none place-items-center rounded-full', className)}
      style={style}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="application"
      aria-label={t('walk.joystick')}
      data-testid="walk-joystick"
    >
      <div ref={knob} className="size-12 rounded-full bg-ink/85 shadow-float" />
    </div>
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

/** Desktop walk HUD: a card bottom-left (map, levels, hint) and the exit button top centre. */
export function WalkHUD({ derived }: { derived: Derived | null }) {
  const t = useT();
  const coarse = useCoarsePointer();
  if (!derived) return null;
  return (
    <>
      <div className="absolute top-[72px] left-1/2 -translate-x-1/2">
        <ExitWalk />
      </div>
      <div className="glass pointer-events-auto absolute bottom-6 left-6 w-[252px] rounded-ui p-2" data-testid="walk-hud">
        <MiniMap derived={derived} width={236} />
        <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
          <Levels derived={derived} />
        </div>
        <p className="mt-1.5 px-0.5 text-2xs leading-4 text-ink-3">{coarse ? t('walk.hintTouch') : t('walk.hint')}</p>
      </div>
      {coarse && <Joystick className="absolute bottom-6 left-[296px]" />}
    </>
  );
}

/** Phone walk HUD: exit and map under the header, joystick above the sheet. */
export function MobileWalkHUD({ derived, top, bottom }: { derived: Derived | null; top: string; bottom: number }) {
  if (!derived) return null;
  return (
    <>
      <div className="pointer-events-none absolute inset-x-3 flex items-start justify-between" style={{ top: `calc(${top} + 8px)` }}>
        <div className="flex flex-col items-start gap-2">
          <ExitWalk />
          <div className="glass pointer-events-auto rounded-ui p-1">
            <Levels derived={derived} size="lg" />
          </div>
        </div>
        <div className="glass pointer-events-auto rounded-ui p-1" data-testid="walk-hud">
          <MiniMap derived={derived} width={128} />
        </div>
      </div>
      <Joystick className="absolute left-4 transition-[bottom] duration-300 ease-out-soft" style={{ bottom: bottom + 16 }} />
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
        <div className="glass pointer-events-auto rounded-ui p-1">
          <Levels derived={derived} />
        </div>
      </div>
      <div className="glass pointer-events-auto absolute top-3 rounded-ui p-1" style={{ right }} data-testid="walk-hud">
        <MiniMap derived={derived} width={124} />
      </div>
      <Joystick className="absolute bottom-3 size-[112px]!" style={{ left }} />
      <div className="glass pointer-events-auto absolute bottom-3 flex w-[340px] items-center gap-2 rounded-ui py-1.5 pr-3 pl-1.5" style={{ right }}>
        <SunToggle iconOnly />
        <SunTime className="min-w-0 flex-1" />
      </div>
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
