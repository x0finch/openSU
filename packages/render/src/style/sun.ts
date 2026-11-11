import { type Box3, Color, DirectionalLight, Matrix4, Object3D, Vector3 } from 'three';
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

/** One directional sun with a shadow frustum fitted tightly to the scene. */
export class Sun {
  readonly light: DirectionalLight;
  readonly target = new Object3D();
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
  }

  setDirection(azimuthDeg: number, elevationDeg: number = sunTokens.elevationDeg): void {
    this.azimuthDeg = azimuthDeg;
    this.elevationDeg = elevationDeg;
  }

  /** Place the light and fit its orthographic shadow camera around `bounds`. */
  fit(bounds: Box3): void {
    const center = bounds.getCenter(new Vector3());
    const radius = bounds.getSize(new Vector3()).length() * 0.5 + sunTokens.shadowMargin;
    const dir = sunDirection(this.azimuthDeg, this.elevationDeg);
    this.light.position.copy(center).addScaledVector(dir, radius * 2);
    this.target.position.copy(center);
    this.light.updateMatrixWorld();
    this.target.updateMatrixWorld();

    const cam = this.light.shadow.camera;
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
    this.light.shadow.needsUpdate = true;
  }
}
