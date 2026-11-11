# Task 010 - Furniture in 3D, walk mode, cutaway shadow fix

## Goal
Interiors stop being empty and become walkable. This completes the
interaction milestone.

## 1. Shared furnishing
- Move the rule-based furniture placement out of `packages/plan` into a new
  pure package `packages/furnish` (`@opensu/furnish`): input
  `ResolvedHouse` + level, output placements
  `{ kind, x, y, rotation, w, d, h, variant }` in mm. `@opensu/plan` keeps
  its drawings identical (byte-identical SVG for the golden sample).
- Each kind gets a height and a simple 3D massing recipe.

## 2. Furniture in 3D (`packages/kernel` + `packages/render`)
- White-model furniture in the illustration style: simple clean volumes
  with edge lines (bed with mattress, pillows and bedside tables;
  wardrobe; sofa with back and arms; armchairs; coffee table; TV unit;
  round and rectangular dining tables with chairs; kitchen counters with
  sink and hob; island; toilet; basin; shower screen; desk and chair;
  outdoor table set; loungers; planters). Mostly white with a few soft
  accents from new tokens (warm wood for tables, light grey textiles).
  No textures, no gloss.
- Furniture belongs to its level (hidden with it in cutaways), casts and
  receives shadows, and never intersects walls or blocks doors (the
  placement already guarantees this in 2D; assert it in 3D tests).
- Budget: whole scene still < 150k triangles and < 150 draw calls. If the
  foliage budget needs trimming to fit, trim foliage, not furniture.

## 3. Cutaway shadow rule (lead's decision, replaces the earlier one)
In a cutaway with physical sun, the hidden upper parts cast shadows only
onto surfaces inside the house footprint (interior floors, walls,
furniture), never onto the outdoor ground or garden. The large grey shadow
outside the plot made the view top-heavy. Outdoor ground in a cutaway is
lit as if the hidden parts did not exist. With "all levels" shown, real
ground shadows stay.

## 4. Walk mode (`packages/render` + `apps/web`)
- `viewer.enterWalk({ level, position? })` / `exitWalk()`: first-person
  perspective camera at 1.6 m eye height, FOV ~65 deg, physical or
  presentation lighting both allowed.
- Desktop: WASD / arrows to move, drag to look, Shift to go faster.
  Touch: left virtual joystick to move, drag elsewhere to look.
- Collision in 2D against the resolved wall segments of the current level
  (body radius ~250 mm); doors, sliding doors and voids are passable;
  windows are not; furniture blocks; outdoor spaces on the same level are
  walkable; the plot fence bounds the ground level.
- Stairs: walking onto a stair flight moves the camera smoothly up or down
  to the connected level. If the flight geometry makes that unreliable,
  fall back to level buttons in the walk HUD and say so in the report.
- Start position: inside the main entrance looking into the house.
- Walk HUD in the app: exit button, level indicator, mini-map (the plan
  SVG with a position/heading marker), the time slider stays available so
  the sun can be changed while standing in a room.
- Render on demand is preserved when idle; while moving, render
  continuously and stop when input stops.

## Deliverables / shots
- `pnpm shots` adds: `cut-L1-furnished.png`, `cut-L2-furnished.png`,
  `cut-L1-sun-winter-10.png` (furnished, new shadow rule),
  `walk-living.png` (standing in the living room looking at the south
  windows, winter 10:00, sun patches visible), `walk-dining.png`,
  `walk-bedroom.png`, `walk-terrace.png`.
- App screenshots (desktop + phone) of walk mode with HUD and mini-map.
- Playwright checks: walking forward changes the camera position; a wall
  stops it; a door lets it through.

## Acceptance criteria
- Clean checkout: install, build, typecheck, test, all shots scripts pass.
- Plans for the golden sample are byte-identical to before.
- Presentation exterior shots within noise of before (furniture seen
  through glass is acceptable only if glass still reads flat grey: it must;
  glass stays opaque-looking from outside).
- Interiors in cutaway and walk views look furnished, calm and coherent
  with the plans; no furniture through walls, no floating pieces.
- Walk views look good at eye level: verticals vertical-ish, no clipping
  through walls, no see-through seams, ceilings present, glass shows the
  garden outside from inside.
- Budgets hold.

## Notes
`packages/model` must not change. In `apps/web` keep changes localised
(new files for the walk HUD; small edits to shared studio files), because
another agent is adding the chat panel in a different worktree.
