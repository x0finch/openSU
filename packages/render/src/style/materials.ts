import {
  Color,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Material,
  type Side,
  type Texture,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { entourage, furniture as furnTokens, lines, materials as matTokens, shading } from './tokens.js';
import { createRoofTileTexture, createWoodTexture } from './textures.js';

/** Grey-level tones for the three shading bands, as sRGB hex strings. */
export interface ToneBands {
  sun: string;
  away: string;
  shadow: string;
}

export interface ShadedOptions {
  map?: Texture;
  side?: Side;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  tones?: Partial<ToneBands>;
  vertexColors?: boolean;
  /** Override for N.L at which a face counts as fully lit. */
  sunFullAt?: number;
  /** Override for N.L below which a face counts as turned away. */
  awayBelow?: number;
  /** Overrides for the polygon offset. */
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
}

const ILLUSTRATION_PARS = /* glsl */ `
uniform vec3 uSunTone;
uniform vec3 uAwayTone;
uniform vec3 uShadowTone;
uniform float uSunFullAt;
uniform float uAwayBelow;
uniform int uShadowLight;
float gSunDot = -1.0;
float gSunVis = 1.0;
int gLightIndex = 0;
void RE_Direct_Illustration( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  // The sun may come as two lights with the same direction but different
  // shadow casters (level cutaway): the material picks whose shadows it takes.
  if ( gLightIndex == 0 || gLightIndex == uShadowLight ) {
    gSunDot = dot( geometryNormal, directLight.direction );
    gSunVis = directLight.color.r;
  }
  gLightIndex ++;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Illustration
`;

const ILLUSTRATION_OUT = /* glsl */ `
{
  float litBand = smoothstep( uAwayBelow, uSunFullAt, gSunDot );
  vec3 sunBand = mix( uShadowTone, uSunTone, gSunVis );
  vec3 tone = mix( uAwayTone, sunBand, litBand );
  outgoingLight = diffuseColor.rgb * tone;
}
#include <envmap_fragment>
`;

/** Converts an sRGB hex to the linear colour used in the shader. */
function linearTone(hex: string): Color {
  return new Color(hex);
}

/** Linear tone factors of a material's three bands (shared with its clipping twins). */
interface ToneUniforms {
  uSunTone: { value: Color };
  uAwayTone: { value: Color };
  uShadowTone: { value: Color };
  /** The bands the material was created with. */
  base: { sun: Color; away: Color; shadow: Color };
}

const toneUniforms = new WeakMap<Material, ToneUniforms>();
const shadowLights = new WeakMap<Material, { value: number }>();

/**
 * Which sun light's shadows a shaded material receives when the sun comes
 * as two lights (0 = the interior sun, whose shadows include parts hidden
 * by a cutaway; 1 = the outdoor sun, whose do not). With one light every
 * material uses it. Takes effect without a recompile.
 */
export function setShadowLight(mat: Material, index: 0 | 1): void {
  let u = shadowLights.get(mat);
  if (!u) shadowLights.set(mat, (u = { value: index }));
  u.value = index;
}

function shadowLightUniform(mat: Material): { value: number } {
  let u = shadowLights.get(mat);
  // Materials of the site (palette originals) take the outdoor sun.
  if (!u) shadowLights.set(mat, (u = { value: 1 }));
  return u;
}

/**
 * Tone bands as colour factors (linear), for `setToneFactors`. A factor is
 * what the albedo is multiplied by; `toneToward(albedo, target)` gives the
 * factor that turns an albedo into a target colour.
 */
export interface ToneFactors {
  sun?: Color;
  away?: Color;
  shadow?: Color;
}

/** Linear factor that turns `albedo` into `target` (both sRGB hex). */
export function toneToward(albedo: string, target: string): Color {
  const a = new Color(albedo), t = new Color(target);
  return new Color(t.r / Math.max(1e-4, a.r), t.g / Math.max(1e-4, a.g), t.b / Math.max(1e-4, a.b));
}

/** Linear factor of an sRGB tone hex. */
export function toneFactor(hex: string): Color {
  return linearTone(hex);
}

/**
 * Overrides the tone bands of a shaded material (and its clipping twins)
 * without recompiling; omitted bands return to the material's own.
 */
export function setToneFactors(mat: Material, f: ToneFactors | null): void {
  const u = toneUniforms.get(mat);
  if (!u) return;
  u.uSunTone.value.copy(f?.sun ?? u.base.sun);
  u.uAwayTone.value.copy(f?.away ?? u.base.away);
  u.uShadowTone.value.copy(f?.shadow ?? u.base.shadow);
}

/**
 * The illustration material: flat, matte, three tone bands (sunlit, turned
 * away, cast shadow). Built on MeshLambertMaterial so three.js handles the
 * shadow map, instancing and vertex colours; only the final light
 * composition is replaced.
 */
export function createShadedMaterial(color: string, opts: ShadedOptions = {}): MeshLambertMaterial {
  const mat = new MeshLambertMaterial({
    color: new Color(color),
    side: opts.side ?? FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.depthWrite ?? true,
    vertexColors: opts.vertexColors ?? false,
    polygonOffset: true,
    polygonOffsetFactor: opts.polygonOffsetFactor ?? shading.polygonOffsetFactor,
    polygonOffsetUnits: opts.polygonOffsetUnits ?? shading.polygonOffsetUnits,
  });
  if (opts.map) mat.map = opts.map;
  // Both sides cast: single-sided facade pieces then never leave light leaks
  // along shared edges. Acne is handled by the sun's normal bias.
  mat.shadowSide = DoubleSide;
  const tones: ToneBands = {
    sun: opts.tones?.sun ?? shading.sunTone,
    away: opts.tones?.away ?? shading.awayTone,
    shadow: opts.tones?.shadow ?? shading.shadowTone,
  };
  const sunFullAt = opts.sunFullAt ?? shading.sunFullAt;
  const awayBelow = opts.awayBelow ?? shading.awayBelow;
  const base = { sun: linearTone(tones.sun), away: linearTone(tones.away), shadow: linearTone(tones.shadow) };
  const uniforms: ToneUniforms = {
    uSunTone: { value: base.sun.clone() },
    uAwayTone: { value: base.away.clone() },
    uShadowTone: { value: base.shadow.clone() },
    base,
  };
  toneUniforms.set(mat, uniforms);
  mat.onBeforeCompile = function (this: Material, shader) {
    // Shared uniform objects: tone overrides reach every twin without a recompile.
    shader.uniforms.uShadowLight = shadowLightUniform(this);
    shader.uniforms.uSunTone = uniforms.uSunTone;
    shader.uniforms.uAwayTone = uniforms.uAwayTone;
    shader.uniforms.uShadowTone = uniforms.uShadowTone;
    shader.uniforms.uSunFullAt = { value: sunFullAt };
    shader.uniforms.uAwayBelow = { value: awayBelow };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>\n${ILLUSTRATION_PARS}`)
      .replace('#include <envmap_fragment>', ILLUSTRATION_OUT);
  };
  mat.customProgramCacheKey = () => `illustration:${tones.sun}:${tones.away}:${tones.shadow}:${sunFullAt}:${awayBelow}`;
  return mat;
}

/** Unlit flat colour (silhouettes, car glass). */
export function createFlatMaterial(color: string, side: Side = FrontSide): MeshBasicMaterial {
  const mat = new MeshBasicMaterial({
    color: new Color(color),
    side,
    polygonOffset: true,
    polygonOffsetFactor: shading.polygonOffsetFactor,
    polygonOffsetUnits: shading.polygonOffsetUnits,
  });
  mat.shadowSide = DoubleSide;
  return mat;
}

function createGlassMaterial(color: string, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: new Color(color),
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: shading.polygonOffsetFactor,
    polygonOffsetUnits: shading.polygonOffsetUnits,
  });
}

/**
 * Screen-space constant-width lines. Segments carry the normals of their two
 * adjacent faces; where one face looks at the camera and the other looks
 * away the segment is an outer profile and is drawn at `profileWidth`.
 */
export function createLineMaterial(color: string = lines.color, width: number = lines.width, profileWidth: number = width): LineMaterial {
  const mat = new LineMaterial({
    color: new Color(color).getHex(),
    linewidth: width,
    worldUnits: false,
    transparent: false,
  });
  const profileScale = profileWidth / width;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uProfileScale = { value: profileScale };
    shader.uniforms.uDepthBias = { value: lines.depthBias };
    shader.vertexShader = shader.vertexShader
      .replace('attribute vec3 instanceEnd;', 'attribute vec3 instanceEnd;\nattribute vec3 instanceN1;\nattribute vec3 instanceN2;\nuniform float uProfileScale;')
      .replace(
        'offset *= linewidth;',
        `{
          vec3 eyeDir = perspective ? normalize( - ( start.xyz + end.xyz ) * 0.5 ) : vec3( 0.0, 0.0, 1.0 );
          float f1 = dot( normalize( mat3( viewMatrix ) * instanceN1 + 1e-6 ), eyeDir );
          float f2 = dot( normalize( mat3( viewMatrix ) * instanceN2 + 1e-6 ), eyeDir );
          bool profile = dot( instanceN1, instanceN1 ) > 0.5 && f1 * f2 < 0.0;
          offset *= linewidth * ( profile ? uProfileScale : 1.0 );
        }`,
      )
      .replace(
        'vec4 clipStart = projectionMatrix * start;',
        // Pull the segment slightly towards the camera (view space) so it
        // wins against the faces it lies on, at any distance.
        `if ( perspective ) { start.xyz *= 1.0 - uDepthBias; end.xyz *= 1.0 - uDepthBias; }
         else { start.z += uDepthBias * 25.0; end.z += uDepthBias * 25.0; }
         vec4 clipStart = projectionMatrix * start;`,
      )
      .replace('uniform float uProfileScale;', 'uniform float uProfileScale;\nuniform float uDepthBias;');
  };
  mat.customProgramCacheKey = () => `profile-lines:${profileScale}`;
  return mat;
}

/**
 * A copy of a style material (shaded, flat or line) that can take its own
 * clipping planes. The shader patch and its cache key are carried over, so
 * the twin renders exactly like the original.
 */
export function twinMaterial<T extends Material>(m: T): T {
  const t = m.clone() as T;
  t.onBeforeCompile = m.onBeforeCompile;
  t.customProgramCacheKey = m.customProgramCacheKey;
  t.name = m.name ? `${m.name}:clip` : 'clip';
  const u = toneUniforms.get(m);
  if (u) toneUniforms.set(t, u);
  return t;
}

/** Tone bands used for foliage: lighter shading keeps leaves saturated. */
const foliageTones: ToneBands = { sun: shading.foliage.sun, away: shading.foliage.away, shadow: shading.foliage.shadow };

/**
 * The full palette of style materials. Create one per renderer; the batcher
 * merges geometry per material instance, so sharing them keeps draw calls low.
 */
export function createPalette() {
  const roofTex = createRoofTileTexture();
  const woodTex = createWoodTexture(false);
  const deckTex = createWoodTexture(true);
  const textured = (map: Texture) => createShadedMaterial(shading.neutralAlbedo, { map });
  return {
    wall: createShadedMaterial(matTokens.wall),
    roofTile: textured(roofTex),
    fascia: createShadedMaterial(matTokens.fascia),
    wood: textured(woodTex),
    deck: textured(deckTex),
    frame: createShadedMaterial(matTokens.frame),
    glass: createGlassMaterial(matTokens.glass, matTokens.glassOpacity),
    balustrade: createGlassMaterial(matTokens.balustradeGlass, matTokens.balustradeOpacity),
    slab: createShadedMaterial(matTokens.slab),
    metal: createShadedMaterial(matTokens.metal, { side: DoubleSide }),
    paving: createShadedMaterial(matTokens.paving),
    gravel: createShadedMaterial(matTokens.gravel),
    floor: createShadedMaterial(matTokens.floor, { tones: { shadow: shading.floorShadowTone } }),
    cut: createFlatMaterial(matTokens.cut),
    furniture: createShadedMaterial(furnTokens.body),
    furnitureWood: createShadedMaterial(furnTokens.wood),
    textile: createShadedMaterial(furnTokens.textile),
    fixture: createShadedMaterial(furnTokens.fixture),
    furnitureDark: createShadedMaterial(furnTokens.dark),
    glassBacking: createFlatMaterial(matTokens.glassBacking),
    recess: createFlatMaterial(matTokens.recess),
    trunk: createShadedMaterial(entourage.trunk),
    leaves: createShadedMaterial(shading.neutralAlbedo, { side: DoubleSide, vertexColors: true, tones: foliageTones, sunFullAt: shading.foliage.sunFullAt, awayBelow: shading.foliage.awayBelow }),
    stalk: createShadedMaterial(entourage.bambooStalk, { tones: foliageTones }),
    person: createFlatMaterial(entourage.person, DoubleSide),
    carBody: createShadedMaterial(entourage.carBody),
    carGlass: createFlatMaterial(entourage.carGlass),
    tyre: createFlatMaterial(entourage.carTyre),
    planter: createShadedMaterial(entourage.planter),
    soil: createShadedMaterial(entourage.soil),
    ground: createShadedMaterial(matTokens.wall, { tones: { shadow: shading.groundShadowTone }, polygonOffsetFactor: shading.groundPolygonOffsetFactor, polygonOffsetUnits: shading.groundPolygonOffsetUnits }),
  };
}

export type Palette = ReturnType<typeof createPalette>;
export type PaletteKey = keyof Palette;
