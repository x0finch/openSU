// Edit commands: plain JSON objects discriminated on `op`. These zod schemas
// are the single source for parsing (`applyCommands`) and for the JSON
// Schema handed to an LLM as the `edit_house` tool input. Descriptions are
// written for that LLM author.
import { z } from 'zod';
import {
  At, CellRect, DoorSwing, Gate, OpeningHost, Roof, Side, Skylight, Space, SpaceType,
} from './schema';

const Id = z.string().min(1);
const Length = z.number().finite().positive();
const NonNegative = z.number().finite().nonnegative();
const Axis = z.enum(['x', 'y']);

const optionalAxis = Axis.optional().describe('Only needed when an X and a Y line share this id.');
const newId = (what: string, example: string) =>
  Id.optional().describe(`Id for the new ${what}. Omit it to get a readable generated id (e.g. "${example}"); the result reports it.`);
const cells = z.array(CellRect).min(1).describe('Union of grid-cell rectangles, by grid line ids. Rectangles must touch along edges; every cell belongs to at most one space per level.');

// --- grid ---------------------------------------------------------------

export const AddGridLine = z.strictObject({
  op: z.literal('add_grid_line'),
  axis: Axis.describe('"x": a line at an X position (it runs north-south and bounds cells on their west/east). "y": a line at a Y position (runs west-east, bounds cells on their south/north).'),
  id: newId('grid line', '6a'),
  pos: z.number().finite().optional().describe('Absolute position in mm (x from the west plot edge, y from the south plot edge). Give pos or relativeTo, not both.'),
  relativeTo: z.strictObject({
    line: Id.describe('Existing line of the same axis.'),
    offset: z.number().finite().describe('mm from that line; positive = east (x) or north (y).'),
  }).optional().describe('Position relative to an existing line, e.g. {"line": "6", "offset": 2000}.'),
}).describe('Add a grid line. Nothing else changes: spaces keep the cells they name, so a new line inside a space only becomes useful when you then split or reshape spaces with it.');

export const MoveGridLine = z.strictObject({
  op: z.literal('move_grid_line'),
  line: Id.describe('Grid line id.'),
  axis: optionalAxis,
  by: z.number().finite().optional().describe('Move by this many mm; positive = east (X line) or north (Y line). Give by or to, not both.'),
  to: z.number().finite().optional().describe('New absolute position in mm.'),
}).describe('Move a grid line. This is the main way to resize: every space, wall, roof and opening anchored on the line follows on all levels. The line cannot cross or touch its neighbours.');

export const RemoveGridLine = z.strictObject({
  op: z.literal('remove_grid_line'),
  line: Id.describe('Grid line id.'),
  axis: optionalAxis,
}).describe('Remove an unused grid line. Fails, listing the users, while any space, roof or opening span still names it.');

// --- levels -------------------------------------------------------------

export const AddLevel = z.strictObject({
  op: z.literal('add_level'),
  id: newId('level', 'L4'),
  name: z.string().min(1).describe('Display name, e.g. "三层" or "Level 3".'),
  height: Length.optional().describe('Floor-to-floor height in mm. Default: the copied level\'s height, else 3000.'),
  after: Id.optional().describe('Insert directly above this level. Default: on top of the house.'),
  copyFrom: Id.optional().describe('Copy spaces, openings and stairs from this level (ids are re-prefixed with the new level id, e.g. "l2-bath" -> "l4-bath"). Roofs are not copied.'),
}).describe('Add a storey. Levels are ordered bottom to top; a stair climbs from its level to the next one up.');

export const RemoveLevel = z.strictObject({
  op: z.literal('remove_level'),
  level: Id.describe('Level id.'),
}).describe('Remove a level with its spaces, openings and stairs, and the roofs that sit on it.');

export const UpdateLevel = z.strictObject({
  op: z.literal('update_level'),
  level: Id.describe('Level id.'),
  name: z.string().min(1).optional(),
  height: Length.optional().describe('Floor-to-floor height in mm (attics: wall height at the eaves).'),
}).describe('Rename a level or change its height.');

// --- spaces -------------------------------------------------------------

const spaceFields = {
  nameEn: z.string().min(1).describe('English name when `name` is in another language.'),
  openTo: z.array(Id).describe('Space ids on the same level with no wall between (open plan).'),
  edge: Space.shape.edge.unwrap().describe('Outdoor spaces only: treatment where it meets nothing (balcony rail etc.).'),
  cover: Space.shape.cover.unwrap().describe('Outdoor spaces only: "canopy" puts a flat canopy over the whole space.'),
  surface: Space.shape.surface.unwrap().describe('Outdoor spaces only: floor finish.'),
};

export const AddSpace = z.strictObject({
  op: z.literal('add_space'),
  level: Id.describe('Level id.'),
  id: newId('space', 'l2-bedroom'),
  name: z.string().min(1).describe('Display name (the user\'s language), e.g. "主卧".'),
  nameEn: spaceFields.nameEn.optional(),
  type: SpaceType.describe('Interior: living, dining, kitchen, bedroom, bathroom, study, storage, stair, hall, family, laundry. Outdoor: balcony, terrace, courtyard, garden, carport, porch.'),
  cells,
  openTo: spaceFields.openTo.optional(),
  edge: spaceFields.edge.optional(),
  cover: spaceFields.cover.optional(),
  surface: spaceFields.surface.optional(),
}).describe('Add a room or outdoor space on free grid cells. Walls are derived automatically. Bedrooms, living rooms and kitchens need a window on an exterior wall; every interior space needs a door (or openTo) path from the entrance.');

export const UpdateSpace = z.strictObject({
  op: z.literal('update_space'),
  space: Id.describe('Space id.'),
  name: z.string().min(1).optional(),
  nameEn: spaceFields.nameEn.nullable().optional().describe('English name; null removes it.'),
  type: SpaceType.optional(),
  cells: cells.optional().describe('Replaces all cells. Openings keep their position as long as their span still lies on the same wall line.'),
  openTo: spaceFields.openTo.optional().describe('Replaces the list; [] removes all.'),
  edge: spaceFields.edge.nullable().optional().describe('null removes it.'),
  cover: spaceFields.cover.nullable().optional().describe('null removes it.'),
  surface: spaceFields.surface.nullable().optional().describe('null removes it.'),
}).describe('Change a space. Only the given fields change.');

export const RemoveSpace = z.strictObject({
  op: z.literal('remove_space'),
  space: Id.describe('Space id.'),
}).describe('Remove a space together with its openings and stairs; other spaces\' openTo entries for it are dropped. The result lists everything removed.');

// --- openings -----------------------------------------------------------

const Kind = z.enum(['door', 'sliding-door', 'window', 'void']).describe('door (hinged), sliding-door (also glazed doors onto balconies), window, void (opening with no frame, e.g. across an open-plan boundary).');
const openingFields = {
  at: At.describe('Position along the span: "center" (default) or {"from": "start"|"end", "offset": mm}. start = west end (N/S walls) or south end (E/W walls).'),
  width: Length.describe('Opening width in mm (doors at least 700).'),
  height: Length.describe('Default: door 2100, sliding-door 2400, window 1500, void 2100.'),
  sill: NonNegative.describe('Height of the bottom above the floor. Default: window 900, others 0.'),
  spanLevels: z.number().int().min(1).describe('Tall window continuing through the same wall on the next n-1 levels.'),
  insert: z.literal('wood-panel').describe('Timber infill band (tall windows).'),
  swing: DoorSwing.describe('Doors only: {"into": space id, "hinge": "start"|"end"}. Omit to let the engine choose.'),
  canopy: z.strictObject({ depth: Length, above: NonNegative.optional() }).describe('Doors / sliding doors: small canopy slab over the opening, depth mm out from the wall.'),
  panel: z.enum(['start', 'end']).describe('Timber side panel at the start (west/south) or end of the opening.'),
};

export const AddOpening = z.strictObject({
  op: z.literal('add_opening'),
  id: newId('opening', 'l2-bedroom-w'),
  kind: Kind,
  host: OpeningHost.describe('Where the opening goes: {"space": id, "side": "N"|"S"|"E"|"W", "span"?: {"from": line, "to": line}} for a wall of one space, or {"between": [id, id], "span"?} for the wall shared by two spaces. The level follows from the space. Omit span when the side has a single edge; it is then filled in for you.'),
  at: openingFields.at.optional(),
  width: openingFields.width,
  height: openingFields.height.optional(),
  sill: openingFields.sill.optional(),
  spanLevels: openingFields.spanLevels.optional(),
  insert: openingFields.insert.optional(),
  swing: openingFields.swing.optional(),
  canopy: openingFields.canopy.optional(),
  panel: openingFields.panel.optional(),
}).describe('Add a door, window or void in a wall. It must fit inside one wall segment (a wall is split where the space on either side changes) and keep 200 mm of wall from other openings.');

export const UpdateOpening = z.strictObject({
  op: z.literal('update_opening'),
  opening: Id.describe('Opening id.'),
  kind: Kind.optional(),
  host: OpeningHost.optional().describe('New host (same rules as add_opening). `at` is kept unless you also give it.'),
  at: openingFields.at.optional(),
  move: z.strictObject({
    dir: Side.describe('E or W for an opening in a wall running west-east (N/S side); N or S for one in a wall running south-north (E/W side).'),
    by: Length.describe('mm to move.'),
  }).optional().describe('Slide the opening along its wall, e.g. {"dir": "E", "by": 300}. Cannot be combined with at.'),
  width: openingFields.width.optional(),
  height: openingFields.height.optional(),
  sill: openingFields.sill.optional(),
  spanLevels: openingFields.spanLevels.optional(),
  insert: openingFields.insert.nullable().optional().describe('null removes it.'),
  swing: openingFields.swing.nullable().optional().describe('null removes it (engine chooses).'),
  canopy: openingFields.canopy.nullable().optional().describe('null removes it.'),
  panel: openingFields.panel.nullable().optional().describe('null removes it.'),
}).describe('Change an opening. Only the given fields change. Width changes keep the start edge (or the centre for "center").');

export const RemoveOpening = z.strictObject({
  op: z.literal('remove_opening'),
  opening: Id.describe('Opening id.'),
}).describe('Remove a door, window or void.');

// --- stairs -------------------------------------------------------------

export const AddStair = z.strictObject({
  op: z.literal('add_stair'),
  id: newId('stair', 'stair-l1'),
  space: Id.describe('A space of type "stair" where the flight starts. The level above needs a "stair" space over it (the stairwell).'),
  kind: z.enum(['straight', 'u', 'l']).describe('Flight shape.'),
  up: Side.describe('Direction the first flight climbs.'),
}).describe('Add a stair climbing from the space\'s level to the next level up.');

export const RemoveStair = z.strictObject({
  op: z.literal('remove_stair'),
  stair: Id.describe('Stair id.'),
}).describe('Remove a stair (its spaces stay).');

// --- roofs --------------------------------------------------------------

const roofFields = {
  kind: Roof.shape.kind.describe('flat, mono (single pitch), gable, hip, or canopy (thin flat slab over outdoor space).'),
  pitchDeg: Roof.shape.pitchDeg.unwrap().describe('Pitch in degrees; required for mono, gable, hip.'),
  fall: Side.describe('Mono only: direction of the low edge.'),
  ridge: Roof.shape.ridge.unwrap().describe('Gable / hip only: ridge direction "EW" or "NS".'),
  eaveOffset: NonNegative.describe('Extra wall height under the low edge, mm.'),
  overhang: NonNegative.describe('Eave overhang past the walls, mm. Default: canopy 0, flat 300, pitched 500.'),
  vergeOverhang: NonNegative.describe('Mono / gable side overhang, mm.'),
  height: Length.describe('Canopy only: top of the slab above the floor of onLevel. Default: level height - 300.'),
  skylights: z.array(Skylight).describe('Skylights; `at` is the plan position of the centre [x, y] in mm.'),
};

export const AddRoof = z.strictObject({
  op: z.literal('add_roof'),
  id: newId('roof', 'roof-l2'),
  kind: roofFields.kind,
  cells: cells.describe('Cells the roof covers (by grid line ids).'),
  onLevel: Id.describe('The level the roof sits on top of. Every interior cell with no space above it needs a roof on its level.'),
  pitchDeg: roofFields.pitchDeg.optional(),
  fall: roofFields.fall.optional(),
  ridge: roofFields.ridge.optional(),
  eaveOffset: roofFields.eaveOffset.optional(),
  overhang: roofFields.overhang.optional(),
  vergeOverhang: roofFields.vergeOverhang.optional(),
  height: roofFields.height.optional(),
  skylights: roofFields.skylights.optional(),
}).describe('Add a roof or canopy.');

export const UpdateRoof = z.strictObject({
  op: z.literal('update_roof'),
  roof: Id.describe('Roof id.'),
  kind: roofFields.kind.optional(),
  cells: cells.optional(),
  onLevel: Id.optional(),
  pitchDeg: roofFields.pitchDeg.nullable().optional(),
  fall: roofFields.fall.nullable().optional(),
  ridge: roofFields.ridge.nullable().optional(),
  eaveOffset: roofFields.eaveOffset.nullable().optional(),
  overhang: roofFields.overhang.optional(),
  vergeOverhang: roofFields.vergeOverhang.nullable().optional(),
  height: roofFields.height.nullable().optional(),
  skylights: roofFields.skylights.optional(),
}).describe('Change a roof. Only the given fields change; null removes an optional field.');

export const RemoveRoof = z.strictObject({
  op: z.literal('remove_roof'),
  roof: Id.describe('Roof id.'),
}).describe('Remove a roof or canopy.');

// --- site, style, name --------------------------------------------------

export const UpdateSite = z.strictObject({
  op: z.literal('update_site'),
  width: Length.optional().describe('Plot size along X (west-east), mm.'),
  depth: Length.optional().describe('Plot size along Y (south-north), mm.'),
  northDeg: z.number().finite().optional().describe('True north, degrees clockwise from +Y.'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  utcOffsetHours: z.number().min(-12).max(14).nullable().optional().describe('Local clock offset for the sun study; null = default (8). Used only when timeZone is not set.'),
  timeZone: z.string().min(1).max(64).nullable().optional().describe('IANA time zone of the place, e.g. "Asia/Shanghai", "Europe/Berlin"; null removes it.'),
  placeName: z.string().min(1).max(80).nullable().optional().describe('Name of the place shown to the user, e.g. "成都" or "Berlin"; null removes it.'),
  fence: z.strictObject({ height: Length, gates: z.array(Gate) }).nullable().optional().describe('Plot fence with gates (`at` along the fence side from its west/south end); null removes it.'),
}).describe('Change the plot.');

export const SetStyle = z.strictObject({
  op: z.literal('set_style'),
  style: z.string().min(1).describe('Style preset id, e.g. "modern-pitched".'),
}).describe('Set the style preset.');

export const RenameHouse = z.strictObject({
  op: z.literal('rename_house'),
  name: z.string().min(1),
}).describe('Rename the house.');

export const Command = z.discriminatedUnion('op', [
  AddGridLine, MoveGridLine, RemoveGridLine,
  AddLevel, RemoveLevel, UpdateLevel,
  AddSpace, UpdateSpace, RemoveSpace,
  AddOpening, UpdateOpening, RemoveOpening,
  AddStair, RemoveStair,
  AddRoof, UpdateRoof, RemoveRoof,
  UpdateSite, SetStyle, RenameHouse,
]);
export type Command = z.infer<typeof Command>;
export type CommandOp = Command['op'];
export const COMMAND_OPS = Command.options.map((o) => o.shape.op.value) as CommandOp[];

/** Input of the `edit_house` tool. */
export const EditHouseInput = z.strictObject({
  commands: z.array(Command).min(1).describe('Edits applied in order as one atomic batch: if the result has any error, nothing is kept and the errors are returned. Later commands see the effects of earlier ones (e.g. add a grid line, then use it).'),
});
export type EditHouseInput = z.infer<typeof EditHouseInput>;

export const EDIT_HOUSE_DESCRIPTION = [
  'Edit the house with a batch of commands. Lengths in mm; X = east, Y = north, origin = south-west plot corner.',
  'Spaces occupy grid cells named by grid line ids (never coordinates); walls are derived. To resize, move a grid line; to split a room, add a grid line and reshape spaces.',
  'Openings sit on a space side (N/S/E/W) or between two spaces; `span` names the stretch of that wall between two crossing grid lines and `at` is measured from its west/south end.',
  'The batch is atomic and validated: on any error nothing changes and you get messages naming ids, numbers and valid options. Warnings do not block.',
  'Openings you do not edit never jump to another wall: if a space change would move one, the batch fails until you update or remove it.',
].join(' ');

/** JSON Schema of the `edit_house` tool input (`{ commands: Command[] }`). */
export function commandsJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(EditHouseInput, { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
}

/** Tool definition for an LLM: name, description and input JSON Schema. */
export function editHouseTool(): { name: 'edit_house'; description: string; inputSchema: Record<string, unknown> } {
  return { name: 'edit_house', description: EDIT_HOUSE_DESCRIPTION, inputSchema: commandsJsonSchema() };
}
