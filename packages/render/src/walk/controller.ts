// First-person walk controller: a perspective camera at eye height that
// moves through the house with collisions (see world.ts). Keyboard (WASD /
// arrows to walk and step sideways, Q / E to turn, Shift to run, Space to
// jump; `jump()` for a touch button); looking
// round by a drag, or on a desktop by the locked pointer (a click on the
// view locks it, Esc frees it); the view turns the way the hand moves, as a
// head does. `setMove` takes an analogue input (the app's touch joystick).
// Walking and turning ease in and out. Renders continuously only while
// something moves and stops when input stops.
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { walk as walkTokens } from '../style/tokens.js';
import { WalkWorld, type WalkPose } from './world.js';

export interface WalkState {
  /** Plan position, metres (model axes). */
  x: number;
  y: number;
  /** Floor height under the feet, metres. */
  z: number;
  /** Bearing the camera looks towards (degrees, 0 = model +Y / north, 90 = east). */
  headingDeg: number;
  pitchDeg: number;
  /** Storey the walker is on. */
  level: string | null;
}

export interface WalkHost {
  /** Draw one frame now. */
  renderNow(): void;
  /** Draw one frame soon (coalesced: many look events, one frame). */
  requestRender(): void;
  readonly levels: readonly { id: string; elevation: number }[];
}

const KEYS_FORWARD = new Set(['KeyW', 'ArrowUp']);
const KEYS_BACK = new Set(['KeyS', 'ArrowDown']);
const KEYS_LEFT = new Set(['KeyA', 'ArrowLeft']);
const KEYS_RIGHT = new Set(['KeyD', 'ArrowRight']);
const KEYS_TURN_LEFT = new Set(['KeyQ']);
const KEYS_TURN_RIGHT = new Set(['KeyE']);
const KEYS_JUMP = new Set(['Space']);
/** A pointer that moves less than this (CSS px) between down and up is a click (it locks the pointer). */
const CLICK_SLOP = 4;

export class WalkController {
  readonly camera: PerspectiveCamera;
  readonly world: WalkWorld;
  private pose: WalkPose;
  private heading: number;
  private pitch: number;
  /** Eye height above the model origin, smoothed over stair steps. */
  private eyeZ: number;
  private readonly keys = new Set<string>();
  private run = false;
  private analog = { forward: 0, strafe: 0 };
  /** A jump: height of the feet above the floor and their vertical speed. */
  private air = 0;
  private vz = 0;
  /** The eased walk (forward, strafe, -1..1) and turn (-1..1) that follow the input. */
  private vel = { forward: 0, strafe: 0, turn: 0 };
  private raf = 0;
  private last = 0;
  private dom: HTMLElement | null = null;
  private drag: { id: number; x: number; y: number; touch: boolean; travel: number } | null = null;
  private readonly cleanup: (() => void)[] = [];
  /** Called whenever the position, heading or level changes. */
  onChange: ((s: WalkState) => void) | null = null;

  constructor(private readonly host: WalkHost, world: WalkWorld, start: { x: number; y: number; z: number; headingDeg: number; pitchDeg?: number }) {
    this.world = world;
    this.camera = new PerspectiveCamera(walkTokens.fovDeg, 1, walkTokens.near, walkTokens.far);
    this.pose = world.settle(start.x, start.y, start.z) ?? { x: start.x, y: start.y, z: start.z };
    this.heading = start.headingDeg;
    this.pitch = start.pitchDeg ?? 0;
    this.eyeZ = this.pose.z + walkTokens.eyeHeight;
    this.updateCamera();
  }

  get state(): WalkState {
    return { x: this.pose.x, y: this.pose.y, z: this.pose.z, headingDeg: ((this.heading % 360) + 360) % 360, pitchDeg: this.pitch, level: this.world.levelAt(this.pose.z, this.host.levels) };
  }

  /** Field of view for an aspect: wide on landscape, never too narrow on portrait. */
  setAspect(aspect: number): void {
    const minH = MathUtils.degToRad(walkTokens.minHorizontalFovDeg);
    const vForH = MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / aspect));
    // Portrait screens widen the view, up to a cap so it never looks stretched.
    this.camera.fov = Math.min(walkTokens.maxFovDeg, Math.max(walkTokens.fovDeg, vForH));
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Puts the walker somewhere (snapped to a free spot nearby). With
   * `faceRoom`, the heading turns towards open floor if a wall is close ahead.
   */
  teleport(x: number, y: number, z: number, headingDeg?: number, opts: { faceRoom?: boolean } = {}): void {
    const p = this.world.settle(x, y, z);
    if (!p) return;
    this.pose = p;
    this.eyeZ = p.z + walkTokens.eyeHeight;
    if (headingDeg !== undefined) this.heading = opts.faceRoom ? this.world.openHeading(p, headingDeg) : headingDeg;
    if (opts.faceRoom) this.pitch = 0;
    this.updateCamera();
    this.changed();
    this.host.renderNow();
  }

  /** Looks around by a delta (degrees). */
  look(dHeadingDeg: number, dPitchDeg: number): void {
    this.heading += dHeadingDeg;
    this.pitch = MathUtils.clamp(this.pitch + dPitchDeg, -walkTokens.maxPitchDeg, walkTokens.maxPitchDeg);
    this.updateCamera();
    this.changed();
    this.wake();
  }

  /**
   * Analogue movement, each in -1..1: forward / back and strafe right /
   * left (a touch joystick). Zero stops.
   */
  setMove(forward: number, strafe: number, fast = false): void {
    this.analog = { forward: MathUtils.clamp(forward, -1, 1), strafe: MathUtils.clamp(strafe, -1, 1) };
    this.run = fast;
    this.wake();
  }

  /** Moves straight by a distance (metres) along the heading; for tests and scripted shots. */
  step(forward: number, strafe = 0): void {
    const a = MathUtils.degToRad(this.heading);
    const fx = Math.sin(a), fy = Math.cos(a);
    this.pose = this.world.move(this.pose, fx * forward + fy * strafe, fy * forward - fx * strafe);
    this.eyeZ = this.pose.z + walkTokens.eyeHeight;
    this.updateCamera();
    this.changed();
  }

  /** Jumps (when standing on a floor): the eye rises about half a metre and falls back. */
  jump(): void {
    if (this.air > 0 || this.vz !== 0) return;
    this.vz = walkTokens.jumpSpeed;
    this.wake();
  }

  /** Keyboard and pointer input on a DOM element (the canvas). */
  attach(dom: HTMLElement): void {
    this.detach();
    this.dom = dom;
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    const editable = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && (t as HTMLInputElement).type !== 'range');
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (editable(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (KEYS_JUMP.has(e.code)) {
        // Not a press of the focused button, nor a page scroll.
        e.preventDefault();
        if (!e.repeat) this.jump();
        return;
      }
      const all = [KEYS_FORWARD, KEYS_BACK, KEYS_LEFT, KEYS_RIGHT, KEYS_TURN_LEFT, KEYS_TURN_RIGHT];
      this.run = e.shiftKey;
      if (all.some((s) => s.has(e.code))) {
        this.keys.add(e.code);
        e.preventDefault();
        this.wake();
      }
    });
    on(window, 'keyup', (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      this.run = e.shiftKey;
    });
    on(window, 'blur', () => this.keys.clear());
    on(dom, 'pointerdown', (e: PointerEvent) => {
      if (this.drag) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', travel: 0 };
      dom.setPointerCapture?.(e.pointerId);
    });
    on(dom, 'pointermove', (e: PointerEvent) => {
      if (!this.drag || e.pointerId !== this.drag.id || this.locked()) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.drag.travel += Math.abs(dx) + Math.abs(dy);
      // The view turns the way the hand moves (a head turning), by a fixed angle per pixel.
      const k = this.drag.touch ? walkTokens.touchLookDegPerPx : walkTokens.lookDegPerPx;
      this.look(dx * k, -dy * k);
    });
    const end = (e: PointerEvent) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const click = e.type === 'pointerup' && e.pointerType === 'mouse' && e.button === 0 && this.drag.travel < CLICK_SLOP;
      this.drag = null;
      // A click on the view (not a drag) locks the pointer: the mouse then looks round without a button held.
      if (click && !this.locked()) dom.requestPointerLock?.()?.catch?.(() => {});
    };
    on(dom, 'pointerup', end);
    on(dom, 'pointercancel', end);
    // A two-finger sideways swipe on a Mac trackpad would go back a page (the browser's history swipe): the view
    // takes the wheel while walking.
    on(dom, 'wheel', (e: WheelEvent) => e.preventDefault(), { passive: false });
    on(document, 'mousemove', (e: MouseEvent) => {
      if (!this.locked()) return;
      const k = walkTokens.lookDegPerPx;
      this.look(e.movementX * k, -e.movementY * k);
    });
  }

  /** Whether the pointer is locked to the view (a desktop look without a button held). */
  private locked(): boolean {
    return !!this.dom && typeof document !== 'undefined' && document.pointerLockElement === this.dom;
  }

  detach(): void {
    if (this.locked()) document.exitPointerLock?.();
    for (const f of this.cleanup.splice(0)) f();
    this.dom = null;
    this.keys.clear();
    this.drag = null;
  }

  dispose(): void {
    this.detach();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onChange = null;
  }

  private moving(): boolean {
    const k = this.keys;
    const keysOn = [...k].length > 0;
    const analogOn = this.analog.forward !== 0 || this.analog.strafe !== 0;
    const settling = Math.abs(this.eyeZ - (this.pose.z + walkTokens.eyeHeight)) > 0.002;
    const easing = Math.abs(this.vel.forward) + Math.abs(this.vel.strafe) + Math.abs(this.vel.turn) > 0.001;
    const jumping = this.air > 0 || this.vz !== 0;
    return keysOn || analogOn || settling || easing || jumping;
  }

  /** Starts the frame loop if something moves; it stops by itself. */
  private wake(): void {
    if (this.raf) return;
    if (!this.moving()) {
      this.host.requestRender();
      return;
    }
    this.last = performance.now();
    const tick = (now: number) => {
      // A frame's timestamp can be earlier than the moment the loop was woken (it is the frame's start): never a
      // negative step (it would end a jump at once).
      const dt = MathUtils.clamp((now - this.last) / 1000, 0, 0.1);
      this.last = now;
      this.update(dt);
      this.host.renderNow();
      this.raf = this.moving() ? requestAnimationFrame(tick) : 0;
    };
    this.raf = requestAnimationFrame(tick);
  }

  private update(dt: number): void {
    const k = this.keys;
    const has = (s: Set<string>) => [...s].some((c) => k.has(c));
    let fwd = (has(KEYS_FORWARD) ? 1 : 0) - (has(KEYS_BACK) ? 1 : 0) + this.analog.forward;
    let str = (has(KEYS_RIGHT) ? 1 : 0) - (has(KEYS_LEFT) ? 1 : 0) + this.analog.strafe;
    const turn = (has(KEYS_TURN_RIGHT) ? 1 : 0) - (has(KEYS_TURN_LEFT) ? 1 : 0);
    const len = Math.hypot(fwd, str);
    if (len > 1) {
      fwd /= len;
      str /= len;
    }
    // Ease towards the input: no instant start or stop.
    const e = 1 - Math.exp(-dt / Math.max(1e-3, walkTokens.moveEase));
    const v = this.vel;
    v.forward += (fwd - v.forward) * e;
    v.strafe += (str - v.strafe) * e;
    v.turn += (turn - v.turn) * e;
    for (const key of ['forward', 'strafe', 'turn'] as const) if (Math.abs(v[key]) < 0.001 && !(key === 'turn' ? turn : key === 'forward' ? fwd : str)) v[key] = 0;
    if (v.turn) {
      this.heading += v.turn * walkTokens.turnSpeedDeg * dt;
      this.changed();
    }
    const speed = this.run ? walkTokens.fastSpeed : walkTokens.speed;
    if (v.forward || v.strafe) {
      const a = MathUtils.degToRad(this.heading);
      const fx = Math.sin(a), fy = Math.cos(a);
      const d = speed * dt;
      const before = this.pose;
      this.pose = this.world.move(this.pose, (fx * v.forward + fy * v.strafe) * d, (fy * v.forward - fx * v.strafe) * d);
      if (before.x !== this.pose.x || before.y !== this.pose.y || before.z !== this.pose.z) this.changed();
    }
    // A jump: up and back down onto the floor (which may have changed under the feet).
    if (this.air > 0 || this.vz !== 0) {
      this.vz -= walkTokens.gravity * dt;
      this.air += this.vz * dt;
      // Landed: back at the floor on the way down (a frame of no time leaves a take-off as it is).
      if (this.air <= 0 && this.vz < 0) {
        this.air = 0;
        this.vz = 0;
      }
    }
    // The eye follows the floor smoothly (stairs, the step onto a deck).
    const target = this.pose.z + walkTokens.eyeHeight;
    const t = 1 - Math.exp(-dt / Math.max(1e-3, walkTokens.heightSmoothing));
    this.eyeZ += (target - this.eyeZ) * t;
    if (Math.abs(target - this.eyeZ) < 0.002) this.eyeZ = target;
    this.updateCamera();
  }

  private updateCamera(): void {
    const a = MathUtils.degToRad(this.heading), p = MathUtils.degToRad(this.pitch);
    // Model (x east, y north, z up) -> scene (x, z, -y).
    const pos = new Vector3(this.pose.x, this.eyeZ + this.air, -this.pose.y);
    const dir = new Vector3(Math.sin(a) * Math.cos(p), Math.sin(p), -Math.cos(a) * Math.cos(p));
    this.camera.position.copy(pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(pos.add(dir));
    this.camera.updateMatrixWorld();
  }

  private changed(): void {
    this.onChange?.(this.state);
  }
}
