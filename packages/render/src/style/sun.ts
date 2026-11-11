import { Box3, Color, DirectionalLight, Matrix4, Object3D, Vector3 } from 'three';
import { sun as sunTokens } from './tokens.js';

/**
 * Unit vector pointing from the scene towards the sun, in scene axes.
 * Azimuth is a compass bearing (0 = north, 90 = east), elevation in degrees.
 */
export function sunDirection(azimuthDeg: number, elevationDeg: number): Vector3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  // Model: x east, y north, z up -> scene: x, z_up, -y.
  return new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

/**
 * One directional sun with a shadow frustum fitted tightly to the scene.
 * In a level cutaway with the physical sun it comes as two identical lights
 * that differ only in what casts their shadows: `light` sees the whole house
 * (the light inside stays true), `outdoor` does not see the parts hidden by
 * the cutaway (the garden is lit as if they were not there). Materials pick
 * one with `setShadowLight`.
 */
export class Sun {
  readonly light: DirectionalLight;
  readonly target = new Object3D();
  readonly outdoor: DirectionalLight;
  azimuthDeg = 210;
  elevationDeg: number = sunTokens.elevationDeg;

  constructor() {
    this.light = new DirectionalLight(new Color(sunTokens.color), sunTokens.intensity);
    this.light.castShadow = true;
    this.light.target = this.target;
    const s = this.light.shadow;
    s.mapSize.set(sunTokens.shadowMapSize, sunTokens.shadowMapSize);
    s.radius = sunTokens.shadowRadius;
    s.bias = sunTokens.shadowBias;
    s.normalBias = sunTokens.shadowNormalBias;
    this.outdoor = new DirectionalLight(new Color(sunTokens.color), sunTokens.intensity);
    this.outdoor.castShadow = true;
    this.outdoor.target = this.target;
    this.outdoor.visible = false;
    const o = this.outdoor.shadow;
    o.mapSize.set(sunTokens.shadowMapSize, sunTokens.shadowMapSize);
    o.radius = sunTokens.shadowRadius;
    o.bias = sunTokens.shadowBias;
    o.normalBias = sunTokens.shadowNormalBias;
  }

  setDirection(azimuthDeg: number, elevationDeg: number = sunTokens.elevationDeg): void {
    this.azimuthDeg = azimuthDeg;
    this.elevationDeg = elevationDeg;
  }

  /**
   * Place the light and fit its orthographic shadow camera around `bounds`.
   * With `reach` (metres), the frustum also covers the ground where the
   * scene's shadows fall, up to that far beyond the bounds (low sun).
   */
  fit(sceneBounds: Box3, reach = 0): void {
    const bounds = reach > 0 ? withShadowReach(sceneBounds, sunDirection(this.azimuthDeg, this.elevationDeg), reach) : sceneBounds;
    const center = bounds.getCenter(new Vector3());
    const radius = bounds.getSize(new Vector3()).length() * 0.5 + sunTokens.shadowMargin;
    const dir = sunDirection(this.azimuthDeg, this.elevationDeg);
    this.light.position.copy(center).addScaledVector(dir, radius * 2);
    this.outdoor.position.copy(this.light.position);
    this.target.position.copy(center);
    this.light.updateMatrixWorld();
    this.outdoor.updateMatrixWorld();
    this.target.updateMatrixWorld();
    this.fitCamera(this.light, bounds, center, radius);
    this.fitCamera(this.outdoor, bounds, center, radius);
  }

  private fitCamera(light: DirectionalLight, bounds: Box3, center: Vector3, radius: number): void {
    const cam = light.shadow.camera;
    cam.position.copy(this.light.position);
    cam.lookAt(center);
    cam.updateMatrixWorld();
    const view = new Matrix4().copy(cam.matrixWorld).invert();
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    const p = new Vector3();
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).applyMatrix4(view);
      min.min(p);
      max.max(p);
    }
    const m = sunTokens.shadowMargin;
    cam.left = min.x - m;
    cam.right = max.x + m;
    cam.bottom = min.y - m;
    cam.top = max.y + m;
    cam.near = Math.max(0.01, -max.z - m);
    // Shadows land on the ground beyond the bounds: extend the far plane.
    cam.far = -min.z + m + radius * 2;
    cam.updateProjectionMatrix();
    light.shadow.needsUpdate = true;
  }
}

/** Bounds grown by the ground footprint of their shadows (capped at `reach` metres). */
function withShadowReach(bounds: Box3, toSun: Vector3, reach: number): Box3 {
  const out = bounds.clone();
  if (toSun.y <= 1e-4) return out;
  const p = new Vector3();
  for (let i = 0; i < 4; i++) {
    p.set(i & 1 ? bounds.max.x : bounds.min.x, bounds.max.y, i & 2 ? bounds.max.z : bounds.min.z);
    const h = Math.max(0, p.y - Math.max(0, bounds.min.y));
    const t = Math.min(h / toSun.y, reach / Math.max(1e-4, Math.hypot(toSun.x, toSun.z)));
    p.x -= toSun.x * t;
    p.z -= toSun.z * t;
    p.y = Math.max(0, bounds.min.y);
    out.expandByPoint(p);
  }
  return out;
}
