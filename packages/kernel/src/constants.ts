// Construction defaults of the kernel (millimetres). These are building
// dimensions, not visual tokens (colours and line widths live in
// packages/render/src/style/tokens.ts).

/** Interior floor slab thickness. */
export const FLOOR_SLAB = 200;
/** Ground-floor floor finish (sits below grade, its top is the floor). */
export const GROUND_FLOOR = 100;
/** Cutaway section height above each level's floor (plan cut). */
export const CUT_HEIGHT = 1250;
/** Default local clock offset from UTC, hours, when the site has none. */
export const DEFAULT_UTC_OFFSET = 8;
/** Balcony / terrace slab: thickness and projection past the wall line. */
export const OUTDOOR_SLAB = 180;
export const OUTDOOR_SLAB_OUT = 180;
/** Kerb along balcony / terrace edges (width = OUTDOOR_SLAB_OUT). */
export const KERB_HEIGHT = 90;
/** Balustrade / railing top above the floor. */
export const RAIL_HEIGHT = 1100;
export const RAIL_BAR = 40;
/** Metal railing bars. */
export const BAR_SIZE = 20;
export const BAR_SPACING = 110;
/** Decking thickness on balconies and terraces. */
export const DECK = 30;

/** Window / door frames. */
export const FRAME_WIDTH = 50;
export const FRAME_DEPTH = 60;
/** Frame front face behind the outer wall face. */
export const FRAME_SETBACK = 110;
/** Widest single glazed unit before mullions are added. */
export const MAX_PANE = 1300;
export const PANE_TARGET = 1250;
/** Timber band of tall windows around a floor level: below / above it. */
export const BAND_BELOW = 400;
export const BAND_ABOVE = 450;

/** Pitched roofs: total vertical depth and the tiled top part of it. */
export const ROOF_DEPTH = 200;
export const TILE_EDGE = 45;
/** Side overhang at verges of pitched roofs (when the roof has overhangs). */
export const VERGE = 300;
/** Flat roof slab thickness. */
export const FLAT_ROOF = 200;
/** Canopy slab thickness. */
export const CANOPY = 120;
export const POST = 100;
/** Canopy over a single door: thickness, default gap above the head, side extension. */
export const DOOR_CANOPY = 100;
export const DOOR_CANOPY_ABOVE = 150;
export const DOOR_CANOPY_SIDE = 300;

/** Site. */
export const FENCE_THICKNESS = 200;
export const COPING = 60;
export const COPING_OUT = 25;
export const PAVING = 25;
/** Timber deck on the ground (raised platform). */
export const GROUND_DECK = 120;
export const FENCE_HOLE = 320;
export const PIER_LENGTH = 600;
export const PIER_DEPTH = 450;

/** Stairs: target riser and step slab thickness. */
export const RISER = 170;
export const STEP_SLAB = 160;
