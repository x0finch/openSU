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
  groundShadowTone: '#D6D6D6',
  /**
   * Tone of cast shadows on interior floors: a lift over the wall shadow
   * tone, so a cutaway interior in the sun study stays readable (not a dark
   * cave) while sun patches still stand out clearly.
   */
  floorShadowTone: '#BEBEBE',
  /**
   * N.L at which a face counts as fully sunlit. Faces between 0 and this
   * value blend from the "away" tone to the sun tone, which keeps grazing
   * faces from flickering between bands.
   */
  sunFullAt: 0.12,
  /** N.L below which a face counts as turned away (grazing faces read as shaded). */
  awayBelow: 0.06,
  /** Neutral albedo for textured and vertex-coloured materials. */
  neutralAlbedo: '#FFFFFF',
  /** Lighter tone bands for foliage so leaves stay saturated. */
  foliage: { sun: '#FFFFFF', away: '#D4D4D4', shadow: '#B4B4B4', awayBelow: 0.0, sunFullAt: 0.05 },
  /** Polygon offset that pushes faces behind their own edge lines. */
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 2,
  /**
   * Extra polygon offset of the invisible ground: the ground-floor finish
   * lies on it, and the ground (two huge triangles) must lose there.
   */
  groundPolygonOffsetFactor: 2,
  groundPolygonOffsetUnits: 40,
} as const;

/** Presentation lighting rule (sun relative to the camera). */
export const lighting = {
  /** Sun bearing offset from the camera bearing (behind the viewer, to one side). */
  presentationOffsetDeg: 40,
  /** Sun elevation for axonometric views. */
  presentationAxoElevationDeg: 60,
  /** Sun elevation for eye-level views and elevations. */
  presentationLowElevationDeg: 45,
} as const;

export const sun = {
  color: '#FFFFFF',
  /** Keep at 1: the illustration shader reads shadow visibility from the light colour. */
  intensity: 1,
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
  roofTileLine: '#2E2C2A',
  roofTileHighlight: '#5F5A55',
  roofTileShade: '#46433F',
  fascia: '#A46A42',
  wood: '#A9703F',
  woodLine: '#8E5A31',
  woodHighlight: '#B67D4B',
  frame: '#34373A',
  glass: '#8B9196',
  glassOpacity: 0.55,
  slab: '#55585B',
  /** Reads as ~130 grey over white: clearly visible, lighter than windows. */
  balustradeGlass: '#6A7075',
  balustradeOpacity: 0.85,
  metal: '#2E3033',
  paving: '#E9E7E3',
  /** Flat backing behind glazing: glass reads as one flat grey. */
  glassBacking: '#5E6266',
  /** Back of blind recesses (small wall openings). */
  recess: '#6F7376',
  gravel: '#DCDAD5',
  /** Interior floor finish (warm light grey, as the plan's room floor). */
  floor: '#DAD7D2',
  /** Cut wall tops in a level cutaway (as the plan's wall fill). */
  cut: '#9A9A9A',
} as const;

/** Level cutaway (dollhouse view). */
export const cutaway = {
  /** The clip plane sits this far above the section caps (metres). */
  clipAbove: 0.002,
} as const;

/** Physical sun study. */
export const physical = {
  /** Lowest sun elevation used for lighting (degrees); keeps faces from flickering at sunrise. */
  minElevationDeg: 0.5,
  /**
   * How far (metres) the shadow frustum extends beyond the scene along the
   * sun's ground direction, so long low-sun shadows are not cut off.
   */
  shadowReach: 30,
  /**
   * Low sun: below `lowSunFromDeg` (fully at `lowSunFullDeg`) the long
   * shadows on the ground fade out between `shadowFadeStart` and
   * `shadowFadeEnd` metres outside the scene bounds, so they never cover
   * the viewport, and shadows on the plot's paving, gravel and decks lift
   * towards `shading.groundShadowTone` (whole house shown).
   */
  lowSunFromDeg: 15,
  lowSunFullDeg: 4,
  shadowFadeStart: 0.5,
  shadowFadeEnd: 7,
} as const;

/**
 * Physical sun study with a level cutaway: the interior reads light and calm
 * so sun patches are the hero. Applied only while both are active; every
 * other mode keeps the bands of `shading`.
 * - interior floors in shade show `floorShade`; sunlit floor patches are
 *   `floorSunBase` with the warm `floorSunTint` multiplied over it;
 * - walls in a cast shadow use the "turned away" tone (`shading.awayTone`),
 *   not the darker cast-shadow tone;
 * - outdoor surfaces (paving, gravel, decks) in a cast shadow use the light
 *   ground-shadow tone (`shading.groundShadowTone`).
 */
export const cutawayLight = {
  /** Interior floor in shade (final colour). */
  floorShade: '#CBC8C3',
  /** Sunlit interior floor before the warm tint (final colour = base x tint). */
  floorSunBase: '#F5F3EF',
  /** Warm tint multiplied over sunlit interior floor. */
  floorSunTint: '#FFF3D9',
} as const;

/**
 * Procedural surface patterns. Canvas units: one texture covers 1 m x 1 m
 * on a 512 px canvas.
 */
export const patterns = {
  textureSize: 512,
  anisotropy: 8,
  roofTile: {
    rows: 6,
    cols: 6,
    /** Gap between neighbouring tiles (px). */
    gap: 3,
    /** Corner radius of the rounded tile end, as a fraction of the tile width. */
    cornerRadius: 0.42,
    /** Tile length as a fraction of the row height (overlap onto the row below). */
    length: 1.18,
    /** Lighter exposed lower part: start (fraction of row) and opacity. */
    highlightFrom: 0.55,
    highlightAlpha: 0.7,
    /** Fraction of tiles drawn in the shade colour. */
    shadeShare: 0.25,
    outlineWidth: 5,
  },
  wood: {
    panelBoards: 5,
    deckBoards: 8,
    boardAlpha: 0.3,
    grainAlpha: 0.12,
    grainWidth: 2,
    grainPerBoard: 4,
    /** Grain waviness (px). */
    grainWave: 8,
    /** Deck joint width (px). */
    jointWidth: 5,
  },
} as const;

/**
 * Furniture (white model): mostly white volumes with a few soft accents.
 * No textures, no gloss; the same tone bands as the architecture.
 */
export const furniture = {
  /** Bodies, cabinets, beds, sanitary ware. */
  body: '#FFFFFF',
  /** Table tops, headboards, shelves accents: warm light oak. */
  wood: '#C9A27B',
  /** Sofas, armchairs, throws, rugs: light warm grey textile. */
  textile: '#E2DED8',
  /** Worktops, basins, shower trays: light cool grey. */
  fixture: '#D5D9DC',
  /** Screens, hobs, plinths, chair frames, lamp stems. */
  dark: '#3C3E41',
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
  /** Eye-level camera height, metres. */
  eyeHeight: 1.6,
  /** Eye-level vertical field of view, degrees. */
  eyeFovDeg: 35,
  /** Fraction of the frame left as white margin around the subject. */
  margin: 0.12,
} as const;

/** Walk mode: a first-person camera inside the house. */
export const walk = {
  /** Eye height above the floor, metres. */
  eyeHeight: 1.6,
  /** Vertical field of view on landscape screens, degrees. */
  fovDeg: 65,
  /** On portrait screens the vertical field grows until the horizontal one reaches this. */
  minHorizontalFovDeg: 58,
  /** Cap on the vertical field (portrait phones), degrees. */
  maxFovDeg: 78,
  /** Near plane, metres (the body keeps ~0.25 m from walls). */
  near: 0.05,
  far: 400,
  /** Body radius for collisions, metres. */
  bodyRadius: 0.25,
  /** Walking and running (Shift) speed, metres per second. */
  speed: 1.5,
  fastSpeed: 3.4,
  /** Turning speed with the arrow keys, degrees per second. */
  turnSpeedDeg: 95,
  /** Highest step up or down taken without a stair, metres. */
  stepUp: 0.45,
  /** Look sensitivity, degrees per CSS pixel of drag. */
  lookDegPerPx: 0.22,
  /** Touch look: degrees turned by a swipe across the whole screen width. */
  touchLookDegPerScreen: 200,
  /** Pitch limits (degrees): verticals stay close to vertical. */
  maxPitchDeg: 40,
  /** Seconds the eye takes to settle onto a new floor height (stairs). */
  heightSmoothing: 0.12,
  /** Window glass seen from inside: light enough to show the garden. */
  glassOpacity: 0.18,
  /** Glass balustrades from inside. */
  balustradeOpacity: 0.4,
} as const;

/**
 * Interior tone bands in walk mode: a calm, light interior where sun
 * patches are the accent. Final colours of white surfaces (walls, ceilings,
 * white furniture) out of the sun; floors use the cutaway floor tones.
 */
export const walkLight = {
  /** White surfaces turned away from the sun or in shade. */
  wallShade: '#E6E4E0',
  /** White surfaces facing the sun but in a cast shadow. */
  wallShadow: '#DEDCD8',
  /** Interior floor in shade (final colour). */
  floorShade: '#D2CEC8',
  /** Ceilings (white surfaces facing down). */
  ceiling: '#EEECE8',
} as const;

export const tokens = { stage, shading, lighting, sun, lines, materials, furniture, patterns, entourage, cameras, cutaway, physical, cutawayLight, walk, walkLight } as const;
export type Tokens = typeof tokens;
