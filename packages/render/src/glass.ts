// Liquid glass composite pass (task 017). The scene is rendered into a
// multisampled render target only when it changes; this pass then draws it
// to the screen together with the glass shapes of the studio chrome: the
// scene bent at each shape's rim (refraction with a little dispersion),
// frosted, saturated and lifted, tinted, with rim light, bevel, hairline
// and a soft shadow. Shapes close together merge with a smooth union so a
// panel can flow out of its button. A change of the glass alone re-runs
// only this pass.
//
// The look follows the approved prototype (docs/prototypes/liquid-glass.html)
// and, through it, glasswork's material (MIT, see THIRD_PARTY_NOTICES.md).
// No number of the look lives here: every value comes in through
// `GlassMaterial` and `GlassShape` (the web app's glass module owns them).
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  GLSL3,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  RawShaderMaterial,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

/** One glass surface, in CSS pixels relative to the canvas' top-left corner. */
export interface GlassShape {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Corner radius, CSS px (clamped to half the short side). */
  radius: number;
  /** Tint opacity, 0..1 (capsule thin, text surface denser). */
  tint: number;
  /** Frost (blur) radius, CSS px. */
  frost: number;
  /** Overall opacity of the surface, 0..1 (fades for reduced motion). */
  alpha?: number;
  /**
   * 0 = the chrome layer; 1 = a lens on top of it (the selected segment,
   * a slider thumb), drawn over the layer below with its own rim.
   */
  layer?: 0 | 1;
  /** Shapes of the same group (and layer) merge with a smooth union. */
  group?: number;
  /** Magnification inside the shape (1 = none; a lifted lens > 1). */
  magnify?: number;
  /** Extra rim refraction, multiplies the material's (lifted lens > 1). */
  bend?: number;
  /** Extra shadow, multiplies the material's (a lifted lens casts more). */
  lift?: number;
  /** A soft light inside the shape (press), CSS px relative to the canvas; strength 0..1. */
  light?: { x: number; y: number; strength: number };
}

/** The material: every number of the look. */
export interface GlassMaterial {
  /** Tint colour, sRGB 0..1. */
  tint: [number, number, number];
  saturation: number;
  brightness: number;
  /** Rim catch light strength (1 = light glass). */
  catchLight: number;
  /** Bevel band strength. */
  bevel: number;
  /** Shadow opacity (0 4px 16px). */
  shadow: number;
  shadowOffset: number;
  shadowBlur: number;
  /** Outer hairline opacity. */
  hairline: number;
  /** Rim width cap, CSS px, and the divisor of the short side on small shapes. */
  rimMax: number;
  rimDivisor: number;
  /** How far the edge looks inward, in rim widths. */
  edgeOffset: number;
  /** Falloff exponent of the bend: (1 - depth / rim) ^ falloff. */
  falloff: number;
  /** Dispersion: red sampled this share further out, blue this share further in. */
  dispersion: number;
  /** Smooth-union distance, CSS px. */
  merge: number;
  /** Strength of the press light. */
  pressLight: number;
  /** Reduced transparency: an opaque surface in the tint colour. */
  opaque: boolean;
}

export const MAX_GLASS_SHAPES = 16;

const VERT = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0., 1.); }
`;

/** Everywhere away from the glass: the scene as it is. */
const COPY = /* glsl */ `
precision highp float;
uniform sampler2D uScene;
out vec4 o;
void main() { o = vec4(texelFetch(uScene, ivec2(gl_FragCoord.xy), 0).rgb, 1.); }
`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
#define MAXN ${MAX_GLASS_SHAPES}
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uDpr;
uniform float uK;
uniform int uN;
uniform vec4 uA[MAXN]; // x, y, w, h (device px, top-left origin)
uniform vec4 uB[MAXN]; // radius, tint, frost, alpha
uniform vec4 uC[MAXN]; // magnify, layer, group, bend
uniform vec4 uD[MAXN]; // lightX, lightY, lightStrength, lift
uniform vec3 uTint;
uniform float uSat, uBri, uCatch, uBevel, uShadow, uShadowY, uShadowBlur, uHair;
uniform float uRimMax, uRimDiv, uEdge, uFall, uDisp, uPress, uOpaque;
out vec4 o;

vec3 bgL(vec2 p, float lod) {
  vec2 uv = vec2(p.x / uRes.x, 1. - p.y / uRes.y);
  return textureLod(uScene, uv, lod).rgb;
}
float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.) / k; return min(a, b) - h * h * k * .25; }
float sdShape(vec2 p, int i) {
  vec4 R = uA[i];
  float r = min(uB[i].x, min(R.z, R.w) * .5);
  return sdRR(p - (R.xy + R.zw * .5), R.zw * .5, r);
}
// Union of one layer; groups merge smoothly inside, separate groups do not.
float field(vec2 p, float layer, out int idx) {
  float d = 1e5, gd = 1e5, best = 1e5, g = -1.;
  idx = -1;
  for (int i = 0; i < MAXN; i++) {
    if (i >= uN) break;
    if (uC[i].y != layer) continue;
    float di = sdShape(p, i);
    if (uC[i].z != g) { d = min(d, gd); gd = 1e5; g = uC[i].z; }
    gd = smin(gd, di, uK);
    if (di < best) { best = di; idx = i; }
  }
  return min(d, gd);
}
float fieldD(vec2 p, float layer) { int j; return field(p, layer, j); }
vec3 frost(vec2 q, float r) {
  if (r < .5) return bgL(q, 0.);
  float lod = max(log2(r) - .5, 0.);
  vec3 a = bgL(q, lod) * 2.;
  for (int i = 0; i < 4; i++) { float t = float(i) * 1.5708 + .785; a += bgL(q + vec2(cos(t), sin(t)) * r * .7, lod); }
  return a / 6.;
}
vec3 glass(vec2 p, float d, int idx, float layer, float tintA) {
  vec2 e = vec2(uDpr, 0.);
  vec2 n = normalize(vec2(fieldD(p + e.xy, layer) - fieldD(p - e.xy, layer), fieldD(p + e.yx, layer) - fieldD(p - e.yx, layer)) + 1e-5);
  vec4 R = uA[idx];
  float depth = max(-d, 0.);
  float rim = min(uRimMax, min(R.z, R.w) / uRimDiv);
  float amount = uEdge * rim * pow(1. - clamp(depth / rim, 0., 1.), uFall) * uC[idx].w;
  vec2 c = R.xy + R.zw * .5;
  vec2 q = p - n * amount;
  q = c + (q - c) / max(uC[idx].x, .01);
  float fr = uB[idx].z;
  vec3 g;
  if (amount > .3) { g.r = frost(q - n * amount * uDisp, fr).r; g.g = frost(q, fr).g; g.b = frost(q + n * amount * uDisp, fr).b; }
  else g = frost(q, fr);
  float l = dot(g, vec3(.2126, .7152, .0722)); g = mix(vec3(l), g, uSat); g *= uBri;
  g = mix(g, uTint, uOpaque > .5 ? 1. : tintA);
  // Press: a soft light that follows the pointer.
  float ls = uD[idx].z;
  if (ls > 0.) {
    float rr = max(R.z, R.w) * .55;
    vec2 dl = p - uD[idx].xy;
    g = mix(g, vec3(1.), clamp(ls * uPress * exp(-dot(dl, dl) / (rr * rr)), 0., 1.));
  }
  // Rim light: a catch on the top left and the bottom right, a faint even
  // inner line, and soft bevel bands a few px inside the edge.
  float c15 = 1. - smoothstep(0., 1.5 * uDpr, depth);
  float tl = max(dot(n, vec2(-.7071, -.7071)), 0.), br = max(dot(n, vec2(.7071, .7071)), 0.);
  g = mix(g, vec3(1.), c15 * uCatch * clamp(tl * 1.4, 0., 1.) + c15 * uCatch * .6 * clamp(br * 1.4, 0., 1.));
  g = mix(g, vec3(1.), (1. - smoothstep(0., .5 * uDpr, depth)) * .3 * uCatch);
  float bev = 1. - smoothstep(0., 6. * uDpr, depth);
  g = mix(g, vec3(1.), bev * uBevel * (.5 * max(-n.y, 0.) + .22 * max(-n.x, 0.) + .12 * max(n.x, 0.)));
  g *= 1. - bev * uBevel * .12 * max(n.y, 0.);
  return g;
}
// Shadow and hairline of one layer around its union (outside only).
vec3 outside(vec3 col, vec2 p, float d, float layer, int idx) {
  if (d <= 0. || idx < 0) return col;
  float a = uB[idx].w;
  float lift = uD[idx].w;
  float ds = fieldD(p - vec2(0., uShadowY * uDpr * lift), layer);
  col *= 1. - a * uShadow * lift * (1. - smoothstep(-.5 * uShadowBlur * uDpr, uShadowBlur * uDpr * lift, ds));
  col *= 1. - a * uHair * (1. - smoothstep(0., .5 * uDpr, d));
  return col;
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec3 col = bgL(p, 0.);
  int i0; float d0 = field(p, 0., i0);
  col = outside(col, p, d0, 0., i0);
  if (i0 >= 0 && d0 < 1.5 * uDpr) {
    vec3 g = glass(p, d0, i0, 0., uB[i0].y);
    col = mix(col, g, clamp(.5 - d0 / uDpr, 0., 1.) * uB[i0].w);
  }
  int i1; float d1 = field(p, 1., i1);
  if (i1 >= 0) {
    col = outside(col, p, d1, 1., i1);
    if (d1 < 1.5 * uDpr) {
      // A lens on the chrome: its tint adds to the glass under it.
      float tb = (i0 >= 0 && d0 < 0.) ? uB[i0].y : 0.;
      float ta = 1. - (1. - tb) * (1. - uB[i1].y);
      vec3 g = glass(p, d1, i1, 1., ta);
      col = mix(col, g, clamp(.5 - d1 / uDpr, 0., 1.) * uB[i1].w);
    }
  }
  o = vec4(col, 1.);
}
`;

/**
 * Owns the scene's render target and the composite pass. The viewer
 * renders its scene into `target` and calls `composite` afterwards (and
 * alone when only the glass changed).
 */
export class GlassCompositor {
  readonly target: WebGLRenderTarget;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: RawShaderMaterial;
  private readonly mesh: Mesh;
  private readonly copy: Mesh;
  /** One quad per shape (its box, its shadow and merge reach): only there runs the glass shader. */
  private readonly quads = new Float32Array(MAX_GLASS_SHAPES * 6 * 3);
  private width = 1;
  private height = 1;
  private shapes: GlassShape[] = [];
  private mat: GlassMaterial | null = null;
  private pixelRatio = 1;

  constructor(width: number, height: number, samples = 4) {
    this.target = new WebGLRenderTarget(width, height, {
      samples,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
    });
    // The scene is drawn exactly as it would be on the canvas: sRGB-encoded
    // by the shaders, blended and resolved in that space, stored in a plain
    // RGBA8 texture (no hardware decode). three.js only encodes into a
    // render target flagged like the XR one (three.js #23278).
    this.target.texture.colorSpace = SRGBColorSpace;
    this.target.texture.internalFormat = 'RGBA8';
    (this.target as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    const full = new BufferGeometry();
    full.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.quads, 3));
    geo.setDrawRange(0, 0);
    const arr4 = () => Array.from({ length: MAX_GLASS_SHAPES }, () => new Vector4());
    this.material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: this.target.texture },
        uRes: { value: new Vector2(width, height) },
        uDpr: { value: 1 },
        uK: { value: 14 },
        uN: { value: 0 },
        uA: { value: arr4() },
        uB: { value: arr4() },
        uC: { value: arr4() },
        uD: { value: arr4() },
        uTint: { value: new Vector3(1, 1, 1) },
        uSat: { value: 1 },
        uBri: { value: 1 },
        uCatch: { value: 0 },
        uBevel: { value: 0 },
        uShadow: { value: 0 },
        uShadowY: { value: 0 },
        uShadowBlur: { value: 1 },
        uHair: { value: 0 },
        uRimMax: { value: 1 },
        uRimDiv: { value: 1 },
        uEdge: { value: 0 },
        uFall: { value: 1 },
        uDisp: { value: 0 },
        uPress: { value: 0 },
        uOpaque: { value: 0 },
      },
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    // Overlapping quads are harmless: each pixel's colour depends on the
    // scene and the shapes only, so a pixel drawn twice comes out the same.
    this.copy = new Mesh(full, new RawShaderMaterial({ glslVersion: GLSL3, vertexShader: VERT, fragmentShader: COPY, depthTest: false, depthWrite: false, uniforms: { uScene: { value: this.target.texture } } }));
    this.copy.frustumCulled = false;
    this.copy.renderOrder = 0;
    this.scene.add(this.copy, this.mesh);
  }

  /** Drawing-buffer size (device px) and the pixel ratio of the canvas. */
  setSize(width: number, height: number, pixelRatio: number): void {
    this.target.setSize(width, height);
    this.pixelRatio = pixelRatio;
    this.width = width;
    this.height = height;
    (this.material.uniforms.uRes!.value as Vector2).set(width, height);
    this.upload();
  }

  setGlass(shapes: readonly GlassShape[], material: GlassMaterial): void {
    // Layers bottom-up, groups contiguous (the shader merges runs of a group).
    this.shapes = shapes
      .slice(0, MAX_GLASS_SHAPES)
      .map((s, i) => ({ s, i }))
      .sort((a, b) => (a.s.layer ?? 0) - (b.s.layer ?? 0) || (a.s.group ?? 0) - (b.s.group ?? 0) || a.i - b.i)
      .map((x) => x.s);
    this.mat = material;
    this.upload();
  }

  private upload(): void {
    const u = this.material.uniforms;
    const m = this.mat;
    const pr = this.pixelRatio;
    const A = u.uA!.value as Vector4[], B = u.uB!.value as Vector4[], C = u.uC!.value as Vector4[], D = u.uD!.value as Vector4[];
    const pad = m ? m.shadowOffset + m.shadowBlur * 2.5 + m.merge + 4 : 0;
    const q = this.quads;
    const W = this.width, H = this.height;
    this.shapes.forEach((s, i) => {
      A[i]!.set(s.x * pr, s.y * pr, Math.max(0, s.width) * pr, Math.max(0, s.height) * pr);
      B[i]!.set(s.radius * pr, s.tint, s.frost * pr, s.alpha ?? 1);
      C[i]!.set(s.magnify ?? 1, s.layer ?? 0, s.group ?? 0, s.bend ?? 1);
      D[i]!.set((s.light?.x ?? 0) * pr, (s.light?.y ?? 0) * pr, s.light?.strength ?? 0, s.lift ?? 1);
      const lp = pad * Math.max(1, s.lift ?? 1);
      const ax = ((s.x - lp) * pr / W) * 2 - 1, bx = ((s.x + s.width + lp) * pr / W) * 2 - 1;
      const ay = 1 - ((s.y - lp) * pr / H) * 2, by = 1 - ((s.y + s.height + lp) * pr / H) * 2;
      q.set([ax, ay, 0, bx, ay, 0, ax, by, 0, ax, by, 0, bx, ay, 0, bx, by, 0], i * 18);
    });
    u.uN!.value = this.shapes.length;
    const geo = this.mesh.geometry;
    geo.setDrawRange(0, this.shapes.length * 6);
    (geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    u.uDpr!.value = pr;
    if (!m) return;
    u.uK!.value = m.merge * pr;
    (u.uTint!.value as Vector3).set(...m.tint);
    u.uSat!.value = m.saturation;
    u.uBri!.value = m.brightness;
    u.uCatch!.value = m.catchLight;
    u.uBevel!.value = m.bevel;
    u.uShadow!.value = m.shadow;
    u.uShadowY!.value = m.shadowOffset;
    u.uShadowBlur!.value = m.shadowBlur;
    u.uHair!.value = m.hairline;
    u.uRimMax!.value = m.rimMax * pr;
    u.uRimDiv!.value = m.rimDivisor;
    u.uEdge!.value = m.edgeOffset;
    u.uFall!.value = m.falloff;
    u.uDisp!.value = m.dispersion;
    u.uPress!.value = m.pressLight;
    u.uOpaque!.value = m.opaque ? 1 : 0;
  }

  /** Draws the scene texture and the glass to the canvas. */
  composite(renderer: WebGLRenderer): void {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
    (this.copy.material as RawShaderMaterial).dispose();
    this.copy.geometry.dispose();
  }
}
