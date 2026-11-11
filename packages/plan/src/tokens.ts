// Plan drawing tokens: the only place for colours, stroke widths, font sizes
// and spacing of the SVG floor plans. Lengths are SVG px at the nominal
// drawing size (1 px = 1 / SCALE mm on paper); model lengths stay in mm.
//
// Line-weight hierarchy (VISUAL_SPEC): wall outline > furniture > dimensions.

/** px per mm of the model. 15 m of plot -> 1200 px. */
export const SCALE = 0.08;

export const color = {
  page: '#FFFFFF',
  ink: '#2E2E2E',
  wallFill: '#A3A3A3',
  wallLine: '#383838',
  wallOuter: '#232323',
  floor: '#DCD9D4',
  floorWet: '#D6D6D3',
  /** Outdoor ground fills by kind. */
  paving: '#E3DBCD',
  pavingLight: '#ECE7DE',
  deck: '#DDD2C1',
  deckLine: '#CBBCA6',
  lawn: '#E1EADA',
  lawnDot: '#B9CCAD',
  ground: '#EEF1EB',
  carBay: '#FAFAF8',
  canopyBelow: '#FFFFFF',
  canopyLine: '#B9B9B9',
  window: '#FFFFFF',
  windowLine: '#4A4A4A',
  glassLine: '#7D858C',
  glassRailFill: '#E3E9EC',
  metalRail: '#2E3033',
  doorLeaf: '#3F3F3F',
  doorArc: '#6E6E6E',
  furnitureFill: '#FFFFFF',
  furnitureLine: '#8C8C8C',
  furnitureDetail: '#B4B4B4',
  fixtureFill: '#CBD3DC',
  fixtureLine: '#7F8B97',
  rugFill: '#FFFFFF',
  rugLine: '#CDCAC4',
  woodFill: '#E9DCCB',
  woodLine: '#B79E80',
  accentFill: '#F2E6D8',
  treeFill: '#BFD8A6',
  treeLine: '#7FA369',
  treeVein: '#93B57E',
  shrubFill: '#D3E4C3',
  stairLine: '#5A5A5A',
  stairArrow: '#2E2E2E',
  labelCn: '#333333',
  labelEn: '#7A7A7A',
  dimLine: '#6A6A6A',
  dimTick: '#2E2E2E',
  dimText: '#3A3A3A',
  title: '#222222',
  subtitle: '#8A8A8A',
  north: '#2E2E2E',
  shadow: '#000000',
} as const;

export const stroke = {
  wallOutline: 1.25,
  wallOuter: 2.1,
  window: 0.7,
  glass: 0.5,
  doorLeaf: 1.0,
  doorArc: 0.6,
  rail: 0.6,
  furniture: 0.75,
  furnitureDetail: 0.5,
  rug: 0.6,
  tree: 0.6,
  stair: 0.6,
  stairArrow: 0.8,
  canopy: 0.6,
  dim: 0.5,
  dimExt: 0.5,
  dimTick: 1.4,
  north: 0.9,
} as const;

export const font = {
  cjk: '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei","WenQuanYi Zen Hei",sans-serif',
  latin: 'Inter,"Helvetica Neue",Helvetica,Arial,"Liberation Sans",sans-serif',
  cnSize: 16,
  cnSizeSmall: 13,
  enSize: 7.4,
  enSizeSmall: 6.4,
  enTracking: 0.14,
  labelGap: 2.5,
  labelPad: 4,
  dimSize: 15,
  dimSizeSmall: 12,
  stairSize: 11,
  titleSize: 26,
  titleTracking: 0.12,
  subtitleSize: 8.5,
  subtitleTracking: 0.3,
  northSize: 10,
} as const;

export const layout = {
  /** White margin around everything. */
  margin: 44,
  /** Distance from the plan extent to the first (segment) dimension line. */
  dimOffset1: 46,
  /** Distance between the two dimension tiers. */
  dimTierGap: 30,
  /** Extension line overshoot past a dimension line. */
  dimExtOver: 5,
  /** Extension lines start this far beyond the plan extent. */
  dimExtGap: 14,
  dimTickLen: 7,
  /** Number baseline above its dimension line. */
  dimTextGap: 4,
  /** Space between the bottom dimension chain and the title. */
  titleGap: 40,
  northRadius: 17,
  furnitureShadowDy: 1.2,
  furnitureShadowBlur: 1.3,
  furnitureShadowOpacity: 0.17,
} as const;

/** Plan-space sizes in mm (drawn things that live in the building). */
export const mm = {
  fence: 160,
  parapet: 120,
  railInset: 50,
  glassRail: 50,
  metalRail: 40,
  doorLeaf: 40,
  slidingPanel: 40,
  tread: 260,
  stairGap: 120,
  stairRail: 50,
} as const;
