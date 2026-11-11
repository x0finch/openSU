import {
  Color,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Side,
  type Texture,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { entourage, lines, materials as matTokens, shading } from './tokens.js';
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
}

const ILLUSTRATION_PARS = /* glsl */ `
uniform float uSunTone;
uniform float uAwayTone;
uniform float uShadowTone;
uniform float uSunFullAt;
float gSunDot = -1.0;
float gSunVis = 1.0;
void RE_Direct_Illustration( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  gSunDot = dot( geometryNormal, directLight.direction );
  gSunVis = directLight.color.r;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Illustration
`;

const ILLUSTRATION_OUT = /* glsl */ `
{
  float litBand = smoothstep( 0.0, uSunFullAt, gSunDot );
  float sunBand = mix( uShadowTone, uSunTone, gSunVis );
  float tone = mix( uAwayTone, sunBand, litBand );
  outgoingLight = diffuseColor.rgb * tone;
}
#include <envmap_fragment>
`;

/** Converts an sRGB grey hex to the linear value used in the shader. */
function linearGrey(hex: string): number {
  return new Color(hex).r;
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
    polygonOffsetFactor: shading.polygonOffsetFactor,
    polygonOffsetUnits: shading.polygonOffsetUnits,
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
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunTone = { value: linearGrey(tones.sun) };
    shader.uniforms.uAwayTone = { value: linearGrey(tones.away) };
    shader.uniforms.uShadowTone = { value: linearGrey(tones.shadow) };
    shader.uniforms.uSunFullAt = { value: sunFullAt };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>\n${ILLUSTRATION_PARS}`)
      .replace('#include <envmap_fragment>', ILLUSTRATION_OUT);
  };
  mat.customProgramCacheKey = () => `illustration:${tones.sun}:${tones.away}:${tones.shadow}:${sunFullAt}`;
  return mat;
}

/** Unlit flat colour (silhouettes, car glass). */
export function createFlatMaterial(color: string, side: Side = FrontSide): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: new Color(color),
    side,
    polygonOffset: true,
    polygonOffsetFactor: shading.polygonOffsetFactor,
    polygonOffsetUnits: shading.polygonOffsetUnits,
  });
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
    interior: createShadedMaterial(matTokens.interior, { side: DoubleSide }),
    interiorFloor: createShadedMaterial(matTokens.interiorFloor),
    trunk: createShadedMaterial(entourage.trunk),
    leaves: createShadedMaterial(shading.neutralAlbedo, { side: DoubleSide, vertexColors: true, tones: foliageTones, sunFullAt: shading.foliage.sunFullAt }),
    stalk: createShadedMaterial(entourage.bambooStalk, { tones: foliageTones }),
    person: createFlatMaterial(entourage.person, DoubleSide),
    carBody: createShadedMaterial(entourage.carBody),
    carGlass: createFlatMaterial(entourage.carGlass),
    tyre: createFlatMaterial(entourage.carTyre),
    planter: createShadedMaterial(entourage.planter),
    soil: createShadedMaterial(entourage.soil),
    ground: createShadedMaterial(matTokens.wall, { tones: { shadow: shading.groundShadowTone } }),
  };
}

export type Palette = ReturnType<typeof createPalette>;
export type PaletteKey = keyof Palette;
