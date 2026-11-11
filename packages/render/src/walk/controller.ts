// First-person walk controller: a perspective camera at eye height that
// moves through the house with collisions (see world.ts). Keyboard (WASD /
// arrows, Shift to run), drag to look; `setMove` takes an analogue input
// (the app's touch joystick). Renders continuously only while something
// moves and stops when input stops.
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
const KEYS_LEFT = new Set(['KeyA']);
const KEYS_RIGHT = new Set(['KeyD']);
const KEYS_TURN_LEFT = new Set(['ArrowLeft', 'KeyQ']);
const KEYS_TURN_RIGHT = new Set(['ArrowRight', 'KeyE']);

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
  private raf = 0;
  private last = 0;
  private dom: HTMLElement | null = null;
  private drag: { id: number; x: number; y: number } | null = null;
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
    this.camera.fov = Math.min(90, Math.max(walkTokens.fovDeg, vForH));
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Puts the walker somewhere (snapped to a free spot nearby). */
  teleport(x: number, y: number, z: number, headingDeg?: number): void {
    const p = this.world.settle(x, y, z);
    if (!p) return;
    this.pose = p;
    this.eyeZ = p.z + walkTokens.eyeHeight;
    if (headingDeg !== undefined) this.heading = headingDeg;
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
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      dom.setPointerCapture?.(e.pointerId);
    });
    on(dom, 'pointermove', (e: PointerEvent) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      // Drag the view: the scene follows the pointer.
      this.look(-dx * walkTokens.lookDegPerPx, dy * walkTokens.lookDegPerPx);
    });
    const end = (e: PointerEvent) => {
      if (this.drag && e.pointerId === this.drag.id) this.drag = null;
    };
    on(dom, 'pointerup', end);
    on(dom, 'pointercancel', end);
  }

  detach(): void {
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
    return keysOn || analogOn || settling;
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
      const dt = Math.min(0.1, (now - this.last) / 1000);
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
    if (turn) this.heading += turn * walkTokens.turnSpeedDeg * dt;
    const len = Math.hypot(fwd, str);
    if (len > 1) {
      fwd /= len;
      str /= len;
    }
    const speed = this.run ? walkTokens.fastSpeed : walkTokens.speed;
    if (fwd || str) {
      const a = MathUtils.degToRad(this.heading);
      const fx = Math.sin(a), fy = Math.cos(a);
      const d = speed * dt;
      const before = this.pose;
      this.pose = this.world.move(this.pose, (fx * fwd + fy * str) * d, (fy * fwd - fx * str) * d);
      if (before.x !== this.pose.x || before.y !== this.pose.y || before.z !== this.pose.z) this.changed();
    }
    if (turn) this.changed();
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
    const pos = new Vector3(this.pose.x, this.eyeZ, -this.pose.y);
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
