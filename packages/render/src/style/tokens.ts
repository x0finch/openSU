/**
 * Visual tokens: the single source of truth for every colour, line width,
 * light and shadow value used by the renderer. Nothing else in the codebase
 * may hard-code these values (see docs/VISUAL_SPEC.md).
 *
 * Colours are sRGB hex strings. Tones are sRGB grey levels applied to the
 * albedo (1 = untouched albedo).
 */

export const stage = {
  background: '#FFFFFF',
  /** Maximum device pixel ratio used by the renderer. */
  maxPixelRatio: 2,
  /** MSAA samples requested for the main render. */
  msaaSamples: 4,
} as const;

/**
 * Illustration shading model. Each surface ends up in one of three tone
 * bands: sunlit, turned away from the sun, or in a cast shadow.
 */
export const shading = {
  /** Wall tone in full sun (white walls stay #FFFFFF). */
  sunTone: '#FFFFFF',
  /** Tone of faces turned away from the sun. */
  awayTone: '#D2D2D2',
  /** Tone of sun-facing faces that lie in a cast shadow. */
  shadowTone: '#A6A6A6',
  /** Tone of cast shadows on the (otherwise invisible) ground. */
  groundShadowTone: '#AEAEAE',
  /**
   * N.L at which a face counts as fully sunlit. Faces between 0 and this
   * value blend from the "away" tone to the sun tone, which keeps grazing
   * faces from flickering between bands.
   */
  sunFullAt: 0.1,
  /** Polygon offset that pushes faces behind their own edge lines. */
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 2,
} as const;

export const sun = {
  /** Default sun elevation above the horizon, degrees. */
  elevationDeg: 48,
  /** Shadow map resolution (square). */
  shadowMapSize: 4096,
  /** PCF radius in shadow-map texels (softens edges by ~1-2 px). */
  shadowRadius: 1.6,
  /** Depth bias in normalised shadow depth. */
  shadowBias: -0.00025,
  /** Normal bias in world metres. */
  shadowNormalBias: 0.012,
  /** Extra margin around the fitted scene bounds, metres. */
  shadowMargin: 1.0,
} as const;

export const lines = {
  color: '#2A2A2A',
  /** Feature edge width in CSS pixels. */
  width: 1.25,
  /** Outer profile (silhouette) width in CSS pixels. */
  profileWidth: 2.1,
  /** Floor-level marker line width in CSS pixels. */
  floorLineWidth: 1.0,
  /** Floor line colour (slightly lighter than feature edges). */
  floorLineColor: '#6E6E6E',
  /**
   * Pull lines towards the camera so they win against the faces they lie
   * on: fraction of the view distance in perspective, x25 metres in
   * parallel projection.
   */
  depthBias: 0.0006,
  /** Dihedral angle (degrees) above which a mesh edge counts as a feature. */
  featureAngleDeg: 25,
} as const;

/** Architectural materials (flat colours). */
export const materials = {
  wall: '#FFFFFF',
  roofTile: '#4B4845',
  roofTileLine: '#2B2928',
  roofTileHighlight: '#5E5A55',
  fascia: '#A46A42',
  wood: '#A9703F',
  woodLine: '#8E5A31',
  woodHighlight: '#B67D4B',
  frame: '#34373A',
  glass: '#8B9196',
  glassOpacity: 0.55,
  slab: '#55585B',
  balustradeGlass: '#70767B',
  balustradeOpacity: 0.45,
  metal: '#2E3033',
  paving: '#E9E7E3',
  /** Interior surfaces seen through glazing. */
  interior: '#8F8F8D',
  interiorFloor: '#7F7B75',
  gravel: '#DCDAD5',
} as const;

/** Entourage: trees, people, cars. */
export const entourage = {
  ginkgo: '#F2D40F',
  ginkgoDeep: '#D9A80B',
  redMaple: '#E12A1C',
  redMapleDeep: '#B5160F',
  greenMaple: '#6DB23A',
  greenMapleDeep: '#4E8E26',
  bamboo: '#5C9C3A',
  bambooDeep: '#3F7A26',
  bambooStalk: '#7FAE55',
  trunk: '#DCD8D0',
  /** Leaves facing away from the sun are mixed toward the deep tone. */
  leafShadeMix: 0.55,
  /** Per-leaf random brightness variation (0..1). */
  leafJitter: 0.12,
  person: '#141414',
  carBody: '#FFFFFF',
  carGlass: '#141516',
  carTyre: '#1C1C1C',
  planter: '#55585B',
  soil: '#6B5A48',
} as const;

export const cameras = {
  /** Axonometric elevation angle, degrees. */
  axoElevationDeg: 35,
  /** Eye-level vertical field of view, degrees. */
  eyeFovDeg: 35,
  /** Fraction of the frame left as white margin around the subject. */
  margin: 0.12,
} as const;

export const tokens = { stage, shading, sun, lines, materials, entourage, cameras } as const;
export type Tokens = typeof tokens;
