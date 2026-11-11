// Model-level construction defaults (not visual tokens). One place only.

/** Wall thickness where an interior space meets outdoors or nothing. */
export const EXTERIOR_WALL_THICKNESS = 240;
/** Wall thickness between two interior spaces. */
export const INTERIOR_WALL_THICKNESS = 120;

/** Default canopy top below the next floor (canopy height = level height - this). */
export const CANOPY_DROP = 300;

/** Minimum sizes checked by `validate` (mm). */
export const MIN_BEDROOM_SHORT_SIDE = 2700;
export const MIN_BATHROOM_SHORT_SIDE = 1500;
export const MIN_STAIR_WIDTH = 900;
export const MIN_DOOR_WIDTH = 700;
/** Minimum wall between two openings on the same wall segment. */
export const MIN_OPENING_GAP = 200;

/** Space types that must have at least one exterior window. */
export const NEEDS_EXTERIOR_WINDOW = ['bedroom', 'living', 'kitchen'] as const;
